begin;

create function public.prepare_mtn_momo_payment(
  p_checkout_id uuid,
  p_buyer_user_id uuid,
  p_guest_token_hash text,
  p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  checkout_row public.checkout_sessions%rowtype;
  payment_row public.payments%rowtype;
  payment_id uuid;
  payment_reference uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'server-side payment service required'; end if;
  select * into checkout_row from public.checkout_sessions
    where id = p_checkout_id
      and (
        (p_buyer_user_id is not null and buyer_user_id = p_buyer_user_id)
        or (p_buyer_user_id is null and guest_access_token_hash = p_guest_token_hash
          and guest_access_expires_at > now())
      )
    for update;
  if checkout_row.id is null then raise exception 'order access could not be verified'; end if;
  if checkout_row.payment_status in ('paid', 'cancelled', 'refunded') then raise exception 'order cannot accept payment'; end if;
  if checkout_row.gross_order_value_pesewas <= 0 then raise exception 'order amount must be positive'; end if;

  select * into payment_row from public.payments where idempotency_key = p_idempotency_key;
  if payment_row.id is not null then
    if payment_row.checkout_session_id <> p_checkout_id or payment_row.provider <> 'mtn_momo' then
      raise exception 'payment idempotency key conflict';
    end if;
    if payment_row.status in ('paid', 'cancelled', 'refunded', 'partially_refunded') then
      raise exception 'payment attempt is already final';
    end if;
    return jsonb_build_object(
      'payment_id', payment_row.id,
      'reference', payment_row.provider_reference,
      'amount_pesewas', payment_row.amount_pesewas,
      'phone', checkout_row.buyer_phone
    );
  end if;

  payment_reference := extensions.gen_random_uuid();
  insert into public.payments (
    checkout_session_id, provider, provider_reference, idempotency_key, amount_pesewas
  ) values (
    p_checkout_id, 'mtn_momo', payment_reference::text, p_idempotency_key, checkout_row.gross_order_value_pesewas
  ) returning id into payment_id;
  insert into public.payment_allocations (payment_id, order_id, store_id, amount_pesewas)
    select payment_id, id, store_id, subtotal_pesewas + delivery_fee_pesewas
    from public.orders where checkout_session_id = p_checkout_id;
  update public.checkout_sessions set payment_status = 'processing' where id = p_checkout_id;
  return jsonb_build_object(
    'payment_id', payment_id,
    'reference', payment_reference,
    'amount_pesewas', checkout_row.gross_order_value_pesewas,
    'phone', checkout_row.buyer_phone
  );
end;
$$;

create function public.mark_mtn_momo_payment_initialized(p_payment_id uuid, p_provider_reference text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'server-side payment service required'; end if;
  update public.payments set initialized_at = coalesce(initialized_at, now())
    where id = p_payment_id and provider = 'mtn_momo' and provider_reference = p_provider_reference;
  if not found then raise exception 'payment initialization reference mismatch'; end if;
end;
$$;

create function public.get_mtn_momo_payment_context(
  p_checkout_id uuid,
  p_buyer_user_id uuid,
  p_guest_token_hash text,
  p_provider_reference text
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare result jsonb;
begin
  if auth.role() <> 'service_role' then raise exception 'server-side payment service required'; end if;
  select jsonb_build_object(
    'payment_id', p.id,
    'reference', p.provider_reference,
    'amount_pesewas', p.amount_pesewas,
    'status', p.status
  ) into result
  from public.payments p
  join public.checkout_sessions c on c.id = p.checkout_session_id
  where p.checkout_session_id = p_checkout_id
    and p.provider = 'mtn_momo'
    and p.provider_reference = p_provider_reference
    and (
      (p_buyer_user_id is not null and c.buyer_user_id = p_buyer_user_id)
      or (p_buyer_user_id is null and c.guest_access_token_hash = p_guest_token_hash
        and c.guest_access_expires_at > now())
    );
  if result is null then raise exception 'payment access could not be verified'; end if;
  return result;
end;
$$;

create function public.apply_mtn_momo_payment_status(
  p_provider_event_id text,
  p_provider_reference text,
  p_verified_status public.payment_status,
  p_amount_pesewas bigint,
  p_provider_transaction_id text,
  p_redacted_event jsonb
) returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  payment_row public.payments%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'payment verification service required'; end if;
  select * into payment_row from public.payments
    where provider = 'mtn_momo' and provider_reference = p_provider_reference for update;
  if payment_row.id is null then raise exception 'payment reference not found'; end if;
  if p_verified_status not in ('paid', 'failed') then raise exception 'unsupported provider payment transition'; end if;
  if p_amount_pesewas <> payment_row.amount_pesewas then raise exception 'verified payment amount does not match'; end if;
  insert into public.payment_events (payment_id, provider, provider_event_id, event_type, verified, payload_redacted)
    values (payment_row.id, 'mtn_momo', p_provider_event_id, 'status.' || p_verified_status::text, true, p_redacted_event)
    on conflict (provider, provider_event_id) do nothing;
  if not found then return false; end if;
  if payment_row.status in ('cancelled', 'refunded', 'partially_refunded') then
    raise exception 'payment cannot transition from its final state';
  end if;
  if p_verified_status = 'failed' and payment_row.status not in ('pending', 'processing', 'failed') then
    raise exception 'invalid failed-payment transition';
  end if;
  if payment_row.status <> 'paid' then
    update public.payments set status = p_verified_status,
      provider_transaction_id = p_provider_transaction_id,
      confirmed_at = case when p_verified_status = 'paid' then now() else confirmed_at end
      where id = payment_row.id;
    update public.checkout_sessions set payment_status = p_verified_status
      where id = payment_row.checkout_session_id and payment_status not in ('paid', 'refunded');
    if p_verified_status = 'paid' then
      update public.payment_allocations set status = 'paid'
        where payment_id = payment_row.id and status = 'pending';
      update public.vendor_transactions set status = 'available'
        where order_id in (
          select id from public.orders where checkout_session_id = payment_row.checkout_session_id
        ) and transaction_type = 'sale' and status = 'pending';
    end if;
  end if;
  return true;
end;
$$;

revoke all on function public.prepare_mtn_momo_payment(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.prepare_mtn_momo_payment(uuid, uuid, text, uuid) to service_role;
revoke all on function public.mark_mtn_momo_payment_initialized(uuid, text) from public, anon, authenticated;
grant execute on function public.mark_mtn_momo_payment_initialized(uuid, text) to service_role;
revoke all on function public.get_mtn_momo_payment_context(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.get_mtn_momo_payment_context(uuid, uuid, text, text) to service_role;
revoke all on function public.apply_mtn_momo_payment_status(text, text, public.payment_status, bigint, text, jsonb) from public, anon, authenticated;
grant execute on function public.apply_mtn_momo_payment_status(text, text, public.payment_status, bigint, text, jsonb) to service_role;

commit;
