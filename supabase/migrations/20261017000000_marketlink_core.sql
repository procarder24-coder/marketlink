begin;

create extension if not exists pgcrypto with schema extensions;

create type public.vendor_verification_status as enum (
  'submitted', 'awaiting_verification', 'processing',
  'needs_additional_information', 'manual_review_required',
  'approved', 'rejected'
);
create type public.vendor_application_status as enum (
  'draft', 'submitted', 'under_review', 'approved', 'rejected', 'needs_information'
);
create type public.store_publication_status as enum (
  'draft', 'pending_publication', 'published', 'suspended', 'archived'
);
create type public.product_status as enum ('draft', 'published', 'archived', 'removed');
create type public.payment_status as enum ('pending', 'processing', 'paid', 'failed', 'cancelled', 'refunded', 'partially_refunded');
create type public.fulfilment_status as enum ('pending', 'confirmed', 'preparing', 'in_transit', 'delivered', 'cancelled', 'returned');
create type public.review_decision as enum ('approved', 'rejected', 'request_information', 'manual_review');

create function public.is_platform_admin()
returns boolean
language sql stable
set search_path = ''
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role' = 'super_admin', false)
    and coalesce(auth.jwt() ->> 'aal' = 'aal2', false);
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (length(full_name) between 1 and 160),
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.vendor_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete restrict,
  business_type text not null check (business_type in ('individual', 'registered_business')),
  business_name text not null check (length(business_name) between 2 and 140),
  category_id uuid not null references public.categories(id) on delete restrict,
  region text not null,
  location text not null,
  business_role text not null,
  registration_number text,
  application_status public.vendor_application_status not null default 'draft',
  verification_status public.vendor_verification_status not null default 'submitted',
  action_required_message text,
  terms_accepted_at timestamptz not null default now(),
  terms_version text not null default 'marketlink-terms-v1',
  verification_submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (business_type = 'registered_business' or registration_number is null)
);

create table public.vendor_stores (
  id uuid primary key default gen_random_uuid(),
  vendor_application_id uuid not null unique references public.vendor_applications(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  name text not null check (length(name) between 2 and 100),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  logo_path text,
  banner_path text,
  description text not null default '' check (length(description) <= 2000),
  contact_phone text,
  whatsapp_phone text,
  business_hours jsonb not null default '{}'::jsonb,
  delivery_options jsonb not null default '[]'::jsonb,
  return_policy text not null default '' check (length(return_policy) <= 3000),
  social_links jsonb not null default '{}'::jsonb,
  brand_color text not null default '#064E3B' check (brand_color in ('#064E3B', '#123C35', '#16A34A', '#8B5E3C', '#3B5C85')),
  publication_status public.store_publication_status not null default 'draft',
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.kyc_verification_sessions (
  id uuid primary key default gen_random_uuid(),
  vendor_application_id uuid not null references public.vendor_applications(id) on delete restrict,
  provider text not null,
  provider_case_reference text,
  status text not null check (status in ('submitted', 'awaiting_verification', 'processing', 'needs_additional_information', 'manual_review_required', 'approved', 'rejected', 'failed')),
  document_check_result text,
  liveness_result text,
  name_match_result text,
  masked_identifier text,
  provider_review_flags jsonb not null default '[]'::jsonb,
  initiated_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.kyc_review_events (
  id uuid primary key default gen_random_uuid(),
  vendor_application_id uuid not null references public.vendor_applications(id) on delete restrict,
  verification_session_id uuid references public.kyc_verification_sessions(id) on delete set null,
  reviewer_id uuid references auth.users(id) on delete set null,
  decision public.review_decision not null,
  reason text not null check (length(reason) between 8 and 1000),
  vendor_message text,
  created_at timestamptz not null default now()
);

create table public.kyc_consent_events (
  id uuid primary key default gen_random_uuid(),
  vendor_application_id uuid not null references public.vendor_applications(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  policy_version text not null,
  consented_at timestamptz not null default now(),
  withdrawn_at timestamptz
);

create table public.rate_limit_buckets (
  key_hash text not null,
  scope text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  primary key(key_hash, scope, window_started_at)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.vendor_stores(id) on delete restrict,
  category_id uuid not null references public.categories(id) on delete restrict,
  name text not null check (length(name) between 2 and 160),
  slug text not null,
  description text not null default '' check (length(description) <= 5000),
  sku text,
  price_pesewas bigint not null check (price_pesewas > 0),
  currency char(3) not null default 'GHS' check (currency = 'GHS'),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  availability text not null default 'in_stock' check (availability in ('in_stock', 'out_of_stock', 'preorder')),
  status public.product_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(store_id, slug),
  unique(store_id, sku)
);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  storage_path text not null unique,
  display_order smallint not null default 0 check (display_order between 0 and 20),
  alt_text text not null default '' check (length(alt_text) <= 200),
  created_at timestamptz not null default now()
);

create table public.carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  guest_cart_key_hash text unique,
  currency char(3) not null default 'GHS' check (currency = 'GHS'),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((user_id is not null) <> (guest_cart_key_hash is not null))
);

create table public.cart_items (
  cart_id uuid not null references public.carts(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity integer not null check (quantity between 1 and 100),
  created_at timestamptz not null default now(),
  primary key(cart_id, product_id)
);

create table public.checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  order_group_reference text not null unique default ('ML-' || upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 12))),
  idempotency_key uuid not null unique,
  buyer_user_id uuid references auth.users(id) on delete set null,
  guest_access_token_hash text,
  guest_access_expires_at timestamptz,
  buyer_name text not null,
  buyer_email text not null,
  buyer_phone text not null,
  delivery_address text not null,
  delivery_region text not null,
  currency char(3) not null default 'GHS' check (currency = 'GHS'),
  gross_order_value_pesewas bigint not null default 0 check (gross_order_value_pesewas >= 0),
  payment_status public.payment_status not null default 'pending',
  payment_expires_at timestamptz not null default (now() + interval '30 minutes'),
  stock_released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((buyer_user_id is not null) or (guest_access_token_hash is not null and guest_access_expires_at is not null))
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  checkout_session_id uuid not null references public.checkout_sessions(id) on delete restrict,
  store_id uuid not null references public.vendor_stores(id) on delete restrict,
  order_reference text not null unique default ('V-' || upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 12))),
  subtotal_pesewas bigint not null check (subtotal_pesewas >= 0),
  delivery_fee_pesewas bigint not null default 0 check (delivery_fee_pesewas >= 0),
  commission_pesewas bigint not null default 0 check (commission_pesewas >= 0),
  vendor_net_pesewas bigint not null default 0 check (vendor_net_pesewas >= 0),
  fulfilment_status public.fulfilment_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  product_name_snapshot text not null,
  unit_price_pesewas bigint not null check (unit_price_pesewas > 0),
  quantity integer not null check (quantity between 1 and 100),
  line_total_pesewas bigint not null check (line_total_pesewas > 0),
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  checkout_session_id uuid not null references public.checkout_sessions(id) on delete restrict,
  provider text not null,
  provider_reference text not null unique,
  idempotency_key uuid not null unique,
  amount_pesewas bigint not null check (amount_pesewas > 0),
  currency char(3) not null default 'GHS' check (currency = 'GHS'),
  status public.payment_status not null default 'pending',
  provider_transaction_id text,
  initialized_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  store_id uuid not null references public.vendor_stores(id) on delete restrict,
  amount_pesewas bigint not null check (amount_pesewas >= 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'refunded', 'reversed')),
  created_at timestamptz not null default now(),
  unique(payment_id, order_id)
);

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete restrict,
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  verified boolean not null default false,
  payload_redacted jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  unique(provider, provider_event_id)
);

create table public.vendor_transactions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  store_id uuid not null references public.vendor_stores(id) on delete restrict,
  amount_pesewas bigint not null,
  transaction_type text not null check (transaction_type in ('sale', 'commission', 'refund', 'settlement', 'adjustment')),
  status text not null check (status in ('pending', 'available', 'settled', 'reversed')),
  created_at timestamptz not null default now()
);

create table public.commissions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  store_id uuid not null references public.vendor_stores(id) on delete restrict,
  rate_basis_points integer not null check (rate_basis_points between 0 and 10000),
  amount_pesewas bigint not null check (amount_pesewas >= 0),
  created_at timestamptz not null default now(),
  unique(order_id)
);

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.vendor_stores(id) on delete restrict,
  provider text not null,
  provider_reference text unique,
  amount_pesewas bigint not null check (amount_pesewas >= 0),
  status text not null check (status in ('pending', 'processing', 'paid', 'failed', 'reversed')),
  period_start date,
  period_end date,
  settled_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  opened_by uuid references auth.users(id) on delete set null,
  reason text not null,
  status text not null default 'open' check (status in ('open', 'under_review', 'resolved', 'rejected')),
  resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  order_id uuid references public.checkout_sessions(id) on delete set null,
  subject text not null check (length(subject) between 3 and 160),
  message text not null check (length(message) between 10 and 5000),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  reason text,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);

create index vendor_applications_status_idx on public.vendor_applications(verification_status, created_at desc);
create index vendor_stores_public_idx on public.vendor_stores(publication_status, slug);
create index products_listing_idx on public.products(status, category_id, created_at desc);
create index products_store_idx on public.products(store_id, status);
create index checkout_buyer_idx on public.checkout_sessions(buyer_user_id, created_at desc);
create index checkout_guest_expiry_idx on public.checkout_sessions(guest_access_token_hash, guest_access_expires_at);
create index orders_store_idx on public.orders(store_id, fulfilment_status, created_at desc);
create index order_items_order_idx on public.order_items(order_id);
create index payments_checkout_idx on public.payments(checkout_session_id, status);
create index payment_allocations_store_idx on public.payment_allocations(store_id, status, created_at desc);
create index payment_events_payment_idx on public.payment_events(payment_id, received_at desc);
create index settlements_store_idx on public.settlements(store_id, status, created_at desc);
create index disputes_status_idx on public.disputes(status, created_at desc);
create index support_user_idx on public.support_tickets(user_id, status, created_at desc);
create index audit_created_idx on public.audit_logs(created_at desc);

create function public.set_updated_at()
returns trigger language plpgsql set search_path = ''
as $$ begin new.updated_at = now(); return new; end; $$;

create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger vendor_applications_updated_at before update on public.vendor_applications for each row execute function public.set_updated_at();
create trigger vendor_stores_updated_at before update on public.vendor_stores for each row execute function public.set_updated_at();
create trigger products_updated_at before update on public.products for each row execute function public.set_updated_at();
create trigger carts_updated_at before update on public.carts for each row execute function public.set_updated_at();
create trigger checkout_sessions_updated_at before update on public.checkout_sessions for each row execute function public.set_updated_at();
create trigger orders_updated_at before update on public.orders for each row execute function public.set_updated_at();
create trigger payments_updated_at before update on public.payments for each row execute function public.set_updated_at();
create trigger disputes_updated_at before update on public.disputes for each row execute function public.set_updated_at();
create trigger support_tickets_updated_at before update on public.support_tickets for each row execute function public.set_updated_at();

create function public.prevent_audit_mutation()
returns trigger language plpgsql set search_path = ''
as $$ begin raise exception 'Audit records are append-only'; end; $$;
create trigger audit_logs_immutable before update or delete on public.audit_logs for each row execute function public.prevent_audit_mutation();
create trigger kyc_review_events_immutable before update or delete on public.kyc_review_events for each row execute function public.prevent_audit_mutation();
create trigger payment_events_immutable before update or delete on public.payment_events for each row execute function public.prevent_audit_mutation();

create function public.guard_vendor_store_transition()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  application_state public.vendor_application_status;
begin
  if tg_op = 'INSERT' then
    if new.user_id is distinct from auth.uid() or new.publication_status <> 'draft' then
      raise exception 'vendor stores must begin in draft state under their owning account';
    end if;
    return new;
  end if;

  if new.user_id is distinct from old.user_id
    or new.vendor_application_id is distinct from old.vendor_application_id
    or new.approved_by is distinct from old.approved_by
    or new.approved_at is distinct from old.approved_at
    or new.published_at is distinct from old.published_at then
    if not public.is_platform_admin() then raise exception 'protected store fields cannot be changed'; end if;
  end if;

  if new.publication_status is distinct from old.publication_status then
    if auth.uid() = old.user_id and not public.is_platform_admin() then
      select application_status into application_state from public.vendor_applications where id = old.vendor_application_id;
      if old.publication_status <> 'draft'
        or new.publication_status <> 'pending_publication'
        or application_state <> 'approved'
        or length(trim(new.description)) < 20
        or new.contact_phone is null then
        raise exception 'only an approved vendor can submit a draft store for publication';
      end if;
    elsif public.is_platform_admin() then
      if not (
        (old.publication_status = 'pending_publication' and new.publication_status in ('published', 'draft', 'suspended'))
        or (old.publication_status = 'published' and new.publication_status in ('suspended', 'archived'))
        or (old.publication_status = 'suspended' and new.publication_status in ('published', 'archived'))
      ) then
        raise exception 'invalid store publication transition';
      end if;
    else
      raise exception 'store publication requires an authorized transition';
    end if;
  end if;
  return new;
end;
$$;
create trigger vendor_store_transition_guard before insert or update on public.vendor_stores
for each row execute function public.guard_vendor_store_transition();

create function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 'MarketLink member'),
    nullif(trim(new.raw_user_meta_data ->> 'phone'), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_auth_user();

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.vendor_applications enable row level security;
alter table public.vendor_stores enable row level security;
alter table public.kyc_verification_sessions enable row level security;
alter table public.kyc_review_events enable row level security;
alter table public.kyc_consent_events enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.checkout_sessions enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.payment_allocations enable row level security;
alter table public.payment_events enable row level security;
alter table public.vendor_transactions enable row level security;
alter table public.commissions enable row level security;
alter table public.settlements enable row level security;
alter table public.disputes enable row level security;
alter table public.support_tickets enable row level security;
alter table public.notifications enable row level security;
alter table public.platform_settings enable row level security;
alter table public.audit_logs enable row level security;
alter table public.rate_limit_buckets enable row level security;

create policy "profiles read own or admin" on public.profiles for select to authenticated using (id = (select auth.uid()) or public.is_platform_admin());
create policy "profiles update own" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "categories public read active" on public.categories for select to anon, authenticated using (active or public.is_platform_admin());

create policy "applications owner or admin read" on public.vendor_applications for select to authenticated using (user_id = (select auth.uid()) or public.is_platform_admin());
create policy "published stores public read" on public.vendor_stores for select to anon, authenticated
using (
  (publication_status = 'published' and exists (
    select 1 from public.vendor_applications a
    where a.id = vendor_application_id and a.verification_status = 'approved'
  ))
  or user_id = (select auth.uid())
  or public.is_platform_admin()
);
create policy "store owner update" on public.vendor_stores for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "products public read approved published only" on public.products for select to anon, authenticated
using (
  status = 'published'
  and exists (
    select 1 from public.vendor_stores s
    join public.vendor_applications a on a.id = s.vendor_application_id
    where s.id = store_id and s.publication_status = 'published'
      and a.verification_status = 'approved'
  )
  or exists (select 1 from public.vendor_stores s where s.id = store_id and s.user_id = (select auth.uid()))
  or public.is_platform_admin()
);
create policy "vendor manages own products" on public.products for all to authenticated
using (exists (select 1 from public.vendor_stores s where s.id = store_id and s.user_id = (select auth.uid())))
with check (exists (select 1 from public.vendor_stores s where s.id = store_id and s.user_id = (select auth.uid())));
create policy "product images follow product access" on public.product_images for select to anon, authenticated
using (exists (select 1 from public.products p where p.id = product_id));
create policy "vendor manages own product images" on public.product_images for all to authenticated
using (exists (select 1 from public.products p join public.vendor_stores s on s.id = p.store_id where p.id = product_id and s.user_id = (select auth.uid())))
with check (exists (select 1 from public.products p join public.vendor_stores s on s.id = p.store_id where p.id = product_id and s.user_id = (select auth.uid())));

create policy "owner carts" on public.carts for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner cart items" on public.cart_items for all to authenticated using (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = (select auth.uid()))) with check (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = (select auth.uid())));

create policy "buyers read own checkouts" on public.checkout_sessions for select to authenticated using (buyer_user_id = (select auth.uid()) or public.is_platform_admin());
create policy "vendor reads delivery details for own order" on public.checkout_sessions for select to authenticated using (
  exists (
    select 1 from public.orders o join public.vendor_stores s on s.id = o.store_id
    where o.checkout_session_id = id and s.user_id = (select auth.uid())
  )
);
create policy "buyers read own order groups" on public.orders for select to authenticated using (
  public.is_platform_admin()
  or exists (select 1 from public.checkout_sessions c where c.id = checkout_session_id and c.buyer_user_id = (select auth.uid()))
  or exists (select 1 from public.vendor_stores s where s.id = store_id and s.user_id = (select auth.uid()))
);
create policy "order items authorized parties read" on public.order_items for select to authenticated using (
  public.is_platform_admin()
  or exists (
    select 1 from public.orders o
    left join public.checkout_sessions c on c.id = o.checkout_session_id
    left join public.vendor_stores s on s.id = o.store_id
    where o.id = order_id and (c.buyer_user_id = (select auth.uid()) or s.user_id = (select auth.uid()))
  )
);
create policy "buyers read own payments" on public.payments for select to authenticated using (
  public.is_platform_admin() or exists (
    select 1 from public.checkout_sessions c where c.id = checkout_session_id and c.buyer_user_id = (select auth.uid())
  )
);
create policy "vendor reads own transactions" on public.vendor_transactions for select to authenticated using (
  public.is_platform_admin() or exists (select 1 from public.vendor_stores s where s.id = store_id and s.user_id = (select auth.uid()))
);
create policy "vendor reads own payment allocations" on public.payment_allocations for select to authenticated using (
  public.is_platform_admin() or exists (select 1 from public.vendor_stores s where s.id = store_id and s.user_id = (select auth.uid()))
);
create policy "vendor reads own commissions" on public.commissions for select to authenticated using (
  public.is_platform_admin() or exists (select 1 from public.vendor_stores s where s.id = store_id and s.user_id = (select auth.uid()))
);
create policy "vendor reads own settlements" on public.settlements for select to authenticated using (
  public.is_platform_admin() or exists (select 1 from public.vendor_stores s where s.id = store_id and s.user_id = (select auth.uid()))
);
create policy "participants read disputes" on public.disputes for select to authenticated using (
  public.is_platform_admin()
  or opened_by = (select auth.uid())
  or exists (select 1 from public.orders o join public.vendor_stores s on s.id = o.store_id where o.id = order_id and s.user_id = (select auth.uid()))
);
create policy "user reads own tickets" on public.support_tickets for select to authenticated using (user_id = (select auth.uid()) or public.is_platform_admin());
create policy "user creates own tickets" on public.support_tickets for insert to authenticated with check (user_id = (select auth.uid()));
create policy "user reads own notifications" on public.notifications for select to authenticated using (user_id = (select auth.uid()) or public.is_platform_admin());
create policy "user updates own notifications" on public.notifications for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "KYC details admin only" on public.kyc_verification_sessions for select to authenticated using (public.is_platform_admin());
create policy "KYC decisions admin only" on public.kyc_review_events for select to authenticated using (public.is_platform_admin());
create policy "KYC consent owner read" on public.kyc_consent_events for select to authenticated using (user_id = (select auth.uid()) or public.is_platform_admin());
create policy "payment events admin only" on public.payment_events for select to authenticated using (public.is_platform_admin());
create policy "platform settings admin only" on public.platform_settings for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "audit logs admin read only" on public.audit_logs for select to authenticated using (public.is_platform_admin());

create view public.vendor_orders with (security_invoker = true) as
  select id, checkout_session_id, store_id, order_reference, subtotal_pesewas, delivery_fee_pesewas,
    commission_pesewas, vendor_net_pesewas, fulfilment_status, created_at, updated_at
  from public.orders;
comment on view public.vendor_orders is 'Vendor-facing name for the per-store fulfilment rows in orders; checkout_sessions is the shared parent order group.';

create function public.submit_vendor_application(
  p_business_type text,
  p_business_name text,
  p_category_id uuid,
  p_region text,
  p_location text,
  p_business_role text,
  p_registration_number text,
  p_terms_accepted boolean
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  application_id uuid;
  store_id uuid;
  store_slug text;
begin
  if auth.uid() is null then raise exception 'verified account required'; end if;
  if not exists (select 1 from auth.users where id = auth.uid() and email_confirmed_at is not null) then raise exception 'verified account required'; end if;
  if not p_terms_accepted then raise exception 'terms acceptance required'; end if;
  if p_business_type not in ('individual', 'registered_business') then raise exception 'invalid business type'; end if;
  if p_business_type = 'individual' and p_registration_number is not null then raise exception 'registration number is not accepted for individual vendors'; end if;
  if not exists (select 1 from public.categories where id = p_category_id and active) then raise exception 'active business category required'; end if;
  insert into public.vendor_applications (
    user_id, business_type, business_name, category_id, region, location, business_role, registration_number, application_status
  ) values (
    auth.uid(), p_business_type, p_business_name, p_category_id, p_region, p_location, p_business_role, p_registration_number, 'submitted'
  ) returning id into application_id;
  store_slug := trim(both '-' from regexp_replace(lower(p_business_name), '[^a-z0-9]+', '-', 'g'));
  if store_slug = '' then store_slug := 'store'; end if;
  insert into public.vendor_stores (vendor_application_id, user_id, name, slug)
    values (application_id, auth.uid(), p_business_name, store_slug || '-' || substr(replace(application_id::text, '-', ''), 1, 8))
    returning id into store_id;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, after_state)
    values (auth.uid(), 'vendor_application_submitted', 'vendor_application', application_id,
      jsonb_build_object('application_status', 'submitted', 'verification_status', 'submitted'));
  return jsonb_build_object('id', application_id, 'store_id', store_id, 'application_status', 'submitted', 'verification_status', 'submitted');
end;
$$;

create function public.vendor_resubmit_application(p_application_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare previous_status public.vendor_application_status;
begin
  select application_status into previous_status
    from public.vendor_applications where id = p_application_id and user_id = auth.uid() for update;
  if previous_status is null or previous_status not in ('rejected', 'needs_information') then raise exception 'application is not eligible for resubmission'; end if;
  update public.vendor_applications set application_status = 'submitted', verification_status = 'submitted',
    action_required_message = null
    where id = p_application_id;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, before_state, after_state)
    values (auth.uid(), 'vendor_application_resubmitted', 'vendor_application', p_application_id,
      jsonb_build_object('application_status', previous_status), jsonb_build_object('application_status', 'submitted'));
  return jsonb_build_object('application_id', p_application_id, 'application_status', 'submitted');
end;
$$;

create function public.admin_start_vendor_review(p_application_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare previous_status public.vendor_application_status;
begin
  if not public.is_platform_admin() then raise exception 'authorized administrator with MFA required'; end if;
  select application_status into previous_status from public.vendor_applications where id = p_application_id for update;
  if previous_status is null or previous_status <> 'submitted' then raise exception 'application is not ready for review'; end if;
  update public.vendor_applications set application_status = 'under_review' where id = p_application_id;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, before_state, after_state)
    values (auth.uid(), 'vendor_review_started', 'vendor_application', p_application_id,
      jsonb_build_object('application_status', previous_status), jsonb_build_object('application_status', 'under_review'));
  return jsonb_build_object('application_id', p_application_id, 'application_status', 'under_review');
end;
$$;

create function public.record_kyc_consent(p_application_id uuid, p_policy_version text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare consent_id uuid;
begin
  if not exists (
    select 1 from public.vendor_applications where id = p_application_id and user_id = auth.uid()
      and application_status not in ('approved', 'rejected')
  ) then raise exception 'active vendor application required'; end if;
  if length(trim(p_policy_version)) < 1 or length(trim(p_policy_version)) > 80 then raise exception 'valid policy version required'; end if;
  insert into public.kyc_consent_events (vendor_application_id, user_id, policy_version)
    values (p_application_id, auth.uid(), p_policy_version) returning id into consent_id;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, after_state)
    values (auth.uid(), 'kyc_consent_granted', 'vendor_application', p_application_id,
      jsonb_build_object('consent_event_id', consent_id, 'policy_version', p_policy_version));
  return jsonb_build_object('consent_event_id', consent_id, 'consented_at', now());
end;
$$;

create function public.admin_review_vendor_application(
  p_application_id uuid,
  p_decision public.review_decision,
  p_reason text,
  p_vendor_message text,
  p_reviewer_id uuid
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  next_status public.vendor_verification_status;
  prior_verification_status public.vendor_verification_status;
  prior_application_status public.vendor_application_status;
  next_application_status public.vendor_application_status;
begin
  if not public.is_platform_admin() or auth.uid() is distinct from p_reviewer_id then
    raise exception 'authorized administrator with MFA required';
  end if;
  if length(trim(p_reason)) < 8 or length(trim(p_reason)) > 1000 then raise exception 'review reason required'; end if;
  if p_decision in ('rejected', 'request_information') and length(trim(coalesce(p_vendor_message, ''))) < 8 then
    raise exception 'actionable vendor feedback is required';
  end if;
  select verification_status, application_status into prior_verification_status, prior_application_status
    from public.vendor_applications where id = p_application_id for update;
  if prior_application_status is distinct from 'under_review' then raise exception 'application is not in the review state'; end if;
  next_status := case p_decision
    when 'approved' then 'approved'::public.vendor_verification_status
    when 'rejected' then 'rejected'::public.vendor_verification_status
    when 'request_information' then 'needs_additional_information'::public.vendor_verification_status
    when 'manual_review' then 'manual_review_required'::public.vendor_verification_status
  end;
  if p_decision = 'approved'::public.review_decision then
    if prior_verification_status <> 'approved' or not exists (
      select 1 from public.kyc_verification_sessions
      where vendor_application_id = p_application_id and status = 'approved'
    ) then raise exception 'approved provider result is required before vendor approval'; end if;
    next_application_status := 'approved';
  elsif p_decision = 'rejected'::public.review_decision then
    next_application_status := 'rejected';
  elsif p_decision = 'request_information'::public.review_decision then
    next_application_status := 'needs_information';
    next_status := 'needs_additional_information';
  else
    next_application_status := 'under_review';
    next_status := 'manual_review_required';
  end if;
  update public.vendor_applications
    set verification_status = next_status, application_status = next_application_status,
      action_required_message = case
        when p_decision = 'approved' then null
        else nullif(trim(p_vendor_message), '')
      end
    where id = p_application_id;
  insert into public.kyc_review_events (vendor_application_id, reviewer_id, decision, reason, vendor_message)
    values (p_application_id, auth.uid(), p_decision, trim(p_reason), nullif(trim(p_vendor_message), ''));
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, reason, before_state, after_state)
    values (auth.uid(), 'vendor_verification_decision', 'vendor_application', p_application_id, trim(p_reason),
      jsonb_build_object('application_status', prior_application_status, 'verification_status', prior_verification_status),
      jsonb_build_object('application_status', next_application_status, 'verification_status', next_status));
  return jsonb_build_object('application_id', p_application_id, 'application_status', next_application_status, 'verification_status', next_status);
end;
$$;

create function public.record_provider_verification_result(
  p_application_id uuid,
  p_provider text,
  p_provider_case_reference text,
  p_provider_status text,
  p_document_result text,
  p_liveness_result text,
  p_name_match_result text,
  p_masked_identifier text,
  p_review_flags jsonb
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  next_verification_status public.vendor_verification_status;
  session_id uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'verified identity provider service required'; end if;
  next_verification_status := case p_provider_status
    when 'approved' then 'approved'::public.vendor_verification_status
    when 'rejected' then 'rejected'::public.vendor_verification_status
    when 'needs_additional_information' then 'needs_additional_information'::public.vendor_verification_status
    when 'manual_review_required' then 'manual_review_required'::public.vendor_verification_status
    when 'awaiting_verification' then 'awaiting_verification'::public.vendor_verification_status
    else 'processing'::public.vendor_verification_status
  end;
  insert into public.kyc_verification_sessions (
    vendor_application_id, provider, provider_case_reference, status,
    document_check_result, liveness_result, name_match_result, masked_identifier, provider_review_flags, completed_at
  ) values (
    p_application_id, p_provider, p_provider_case_reference, p_provider_status,
    p_document_result, p_liveness_result, p_name_match_result, p_masked_identifier,
    coalesce(p_review_flags, '[]'::jsonb), case when p_provider_status in ('approved', 'rejected') then now() else null end
  ) returning id into session_id;
  update public.vendor_applications set verification_status = next_verification_status
    where id = p_application_id and application_status not in ('approved', 'rejected');
  if not found then raise exception 'application cannot accept another verification result'; end if;
  insert into public.audit_logs (action, entity_type, entity_id, after_state)
    values ('provider_verification_result', 'vendor_application', p_application_id,
      jsonb_build_object('provider', p_provider, 'session_id', session_id, 'verification_status', next_verification_status));
  return jsonb_build_object('verification_session_id', session_id, 'verification_status', next_verification_status);
end;
$$;

create function public.vendor_submit_store_for_publication(p_store_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare old_status public.store_publication_status;
begin
  select publication_status into old_status
    from public.vendor_stores where id = p_store_id and user_id = auth.uid() for update;
  if old_status <> 'draft' then raise exception 'only a draft store can be submitted'; end if;
  if not exists (
    select 1 from public.vendor_stores s
    join public.vendor_applications a on a.id = s.vendor_application_id
    where s.id = p_store_id and a.application_status = 'approved' and a.verification_status = 'approved'
      and length(trim(s.description)) >= 20 and s.contact_phone is not null
  ) then raise exception 'approved vendor and complete store setup are required'; end if;
  update public.vendor_stores set publication_status = 'pending_publication' where id = p_store_id;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, before_state, after_state)
    values (auth.uid(), 'store_submitted_for_publication', 'vendor_store', p_store_id,
      jsonb_build_object('publication_status', old_status), jsonb_build_object('publication_status', 'pending_publication'));
  return jsonb_build_object('store_id', p_store_id, 'publication_status', 'pending_publication');
end;
$$;

create function public.admin_set_store_publication(
  p_store_id uuid,
  p_next_status public.store_publication_status,
  p_reason text
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare old_status public.store_publication_status;
begin
  if not public.is_platform_admin() then raise exception 'authorized administrator with MFA required'; end if;
  if length(trim(p_reason)) < 8 or length(trim(p_reason)) > 1000 then raise exception 'publication reason required'; end if;
  select publication_status into old_status from public.vendor_stores where id = p_store_id for update;
  if old_status is null then raise exception 'store not found'; end if;
  if p_next_status = 'published' and not exists (
    select 1 from public.vendor_stores s join public.vendor_applications a on a.id = s.vendor_application_id
    where s.id = p_store_id and a.application_status = 'approved' and a.verification_status = 'approved'
  ) then raise exception 'only an approved vendor store can be published'; end if;
  update public.vendor_stores set publication_status = p_next_status,
    approved_by = case when p_next_status = 'published' then auth.uid() else approved_by end,
    approved_at = case when p_next_status = 'published' then now() else approved_at end,
    published_at = case when p_next_status = 'published' then now() else published_at end
    where id = p_store_id;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, reason, before_state, after_state)
    values (auth.uid(), 'store_publication_decision', 'vendor_store', p_store_id, trim(p_reason),
      jsonb_build_object('publication_status', old_status), jsonb_build_object('publication_status', p_next_status));
  return jsonb_build_object('store_id', p_store_id, 'publication_status', p_next_status);
end;
$$;

create function public.create_marketplace_order(
  p_idempotency_key uuid,
  p_buyer_user_id uuid,
  p_buyer_name text,
  p_buyer_email text,
  p_buyer_phone text,
  p_delivery_address text,
  p_delivery_region text,
  p_items jsonb,
  p_guest_token_hash text
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  checkout_id uuid;
  checkout_reference text;
  item jsonb;
  product_row public.products%rowtype;
  order_id uuid;
  group_total bigint := 0;
  quantity integer;
  commission_rate integer := 0;
begin
  if auth.role() <> 'service_role' then raise exception 'server-side order service required'; end if;
  if p_buyer_user_id is null and (p_guest_token_hash is null or length(p_guest_token_hash) <> 64) then raise exception 'secure guest access token required'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then raise exception 'at least one product is required'; end if;

  insert into public.checkout_sessions (
    idempotency_key, buyer_user_id, guest_access_token_hash, guest_access_expires_at,
    buyer_name, buyer_email, buyer_phone, delivery_address, delivery_region
  ) values (
    p_idempotency_key, p_buyer_user_id, p_guest_token_hash,
    case when p_buyer_user_id is null then now() + interval '7 days' else null end,
    p_buyer_name, p_buyer_email, p_buyer_phone, p_delivery_address, p_delivery_region
  )
  on conflict (idempotency_key) do nothing
  returning id, order_group_reference into checkout_id, checkout_reference;

  if checkout_id is null then
    select id, order_group_reference into checkout_id, checkout_reference
      from public.checkout_sessions where idempotency_key = p_idempotency_key;
    return jsonb_build_object('checkout_id', checkout_id, 'order_group_reference', checkout_reference);
  end if;

  for item in select value from jsonb_array_elements(p_items)
  loop
    quantity := (item ->> 'quantity')::integer;
    if quantity < 1 or quantity > 100 then raise exception 'invalid product quantity'; end if;
    select p.* into product_row
      from public.products p
      join public.vendor_stores s on s.id = p.store_id
      join public.vendor_applications a on a.id = s.vendor_application_id
      where p.id = (item ->> 'product_id')::uuid
        and p.status = 'published' and s.publication_status = 'published'
        and a.verification_status = 'approved'
      for update of p;
    if product_row.id is null then raise exception 'product is not available for sale'; end if;
    if product_row.stock_quantity < quantity or product_row.availability = 'out_of_stock' then raise exception 'insufficient product stock'; end if;

    select id into order_id from public.orders
      where checkout_session_id = checkout_id and store_id = product_row.store_id;
    if order_id is null then
      insert into public.orders (checkout_session_id, store_id, subtotal_pesewas)
        values (checkout_id, product_row.store_id, 0)
        returning id into order_id;
    end if;
    insert into public.order_items (order_id, product_id, product_name_snapshot, unit_price_pesewas, quantity, line_total_pesewas)
      values (order_id, product_row.id, product_row.name, product_row.price_pesewas, quantity, product_row.price_pesewas * quantity);
    update public.products set stock_quantity = stock_quantity - quantity,
      availability = case when stock_quantity - quantity = 0 then 'out_of_stock' else availability end
      where id = product_row.id;
    update public.orders set subtotal_pesewas = subtotal_pesewas + product_row.price_pesewas * quantity where id = order_id;
    group_total := group_total + product_row.price_pesewas * quantity;
  end loop;

  select coalesce((select (value ->> 'rate_basis_points')::integer
    from public.platform_settings where key = 'commission_rate_basis_points'), 0) into commission_rate;
  for order_id in select id from public.orders where checkout_session_id = checkout_id
  loop
    update public.orders set
      commission_pesewas = (subtotal_pesewas * commission_rate) / 10000,
      vendor_net_pesewas = subtotal_pesewas - ((subtotal_pesewas * commission_rate) / 10000)
      where id = order_id;
    insert into public.commissions (order_id, store_id, rate_basis_points, amount_pesewas)
      select id, store_id, commission_rate, commission_pesewas from public.orders where id = order_id;
    insert into public.vendor_transactions (order_id, store_id, amount_pesewas, transaction_type, status)
      select id, store_id, vendor_net_pesewas, 'sale', 'pending' from public.orders where id = order_id;
  end loop;
  update public.checkout_sessions set gross_order_value_pesewas = group_total where id = checkout_id;
  return jsonb_build_object('checkout_id', checkout_id, 'order_group_reference', checkout_reference);
end;
$$;

create function public.prepare_paystack_payment(
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
  payment_reference text;
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
    if payment_row.checkout_session_id <> p_checkout_id then raise exception 'payment idempotency key conflict'; end if;
    if payment_row.status in ('paid', 'cancelled', 'refunded', 'partially_refunded') then raise exception 'payment attempt is already final'; end if;
    return jsonb_build_object('payment_id', payment_row.id, 'reference', payment_row.provider_reference,
      'amount_pesewas', payment_row.amount_pesewas, 'email', checkout_row.buyer_email);
  end if;

  payment_reference := 'MLPAY-' || upper(substr(encode(extensions.gen_random_bytes(12), 'hex'), 1, 24));
  insert into public.payments (
    checkout_session_id, provider, provider_reference, idempotency_key, amount_pesewas
  ) values (
    p_checkout_id, 'paystack', payment_reference, p_idempotency_key, checkout_row.gross_order_value_pesewas
  ) returning id into payment_id;
  insert into public.payment_allocations (payment_id, order_id, store_id, amount_pesewas)
    select payment_id, id, store_id, subtotal_pesewas + delivery_fee_pesewas
    from public.orders where checkout_session_id = p_checkout_id;
  update public.checkout_sessions set payment_status = 'processing' where id = p_checkout_id;
  return jsonb_build_object('payment_id', payment_id, 'reference', payment_reference,
    'amount_pesewas', checkout_row.gross_order_value_pesewas, 'email', checkout_row.buyer_email);
end;
$$;

create function public.mark_paystack_payment_initialized(p_payment_id uuid, p_provider_reference text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'server-side payment service required'; end if;
  update public.payments set initialized_at = coalesce(initialized_at, now())
    where id = p_payment_id and provider = 'paystack' and provider_reference = p_provider_reference;
  if not found then raise exception 'payment initialization reference mismatch'; end if;
end;
$$;

create function public.apply_paystack_payment_event(
  p_provider_event_id text,
  p_event_type text,
  p_provider_reference text,
  p_verified_status public.payment_status,
  p_amount_pesewas bigint,
  p_provider_transaction_id text,
  p_redacted_event jsonb
) returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  payment_row public.payments%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'payment webhook service required'; end if;
  select * into payment_row from public.payments
    where provider = 'paystack' and provider_reference = p_provider_reference for update;
  if payment_row.id is null then raise exception 'payment reference not found'; end if;
  if p_verified_status not in ('paid', 'failed') then raise exception 'unsupported provider payment transition'; end if;
  if p_amount_pesewas <> payment_row.amount_pesewas then raise exception 'verified payment amount does not match'; end if;
  insert into public.payment_events (payment_id, provider, provider_event_id, event_type, verified, payload_redacted)
    values (payment_row.id, 'paystack', p_provider_event_id, p_event_type, true, p_redacted_event)
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
      update public.payment_allocations set status = 'paid' where payment_id = payment_row.id and status = 'pending';
      update public.vendor_transactions set status = 'available'
        where order_id in (select id from public.orders where checkout_session_id = payment_row.checkout_session_id)
          and transaction_type = 'sale' and status = 'pending';
    end if;
  end if;
  return true;
end;
$$;

create function public.get_guest_order_status(p_checkout_id uuid, p_guest_token_hash text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare result jsonb;
begin
  if auth.role() <> 'service_role' then raise exception 'server-side order access required'; end if;
  select jsonb_build_object(
    'reference', c.order_group_reference,
    'payment_status', c.payment_status,
    'orders', coalesce(jsonb_agg(jsonb_build_object(
      'reference', o.order_reference,
      'fulfilment_status', o.fulfilment_status,
      'total_pesewas', o.subtotal_pesewas + o.delivery_fee_pesewas
    )), '[]'::jsonb)
  ) into result
  from public.checkout_sessions c
  left join public.orders o on o.checkout_session_id = c.id
  where c.id = p_checkout_id
    and c.guest_access_token_hash = p_guest_token_hash
    and c.guest_access_expires_at > now()
  group by c.id;
  if result is null then raise exception 'guest order access is invalid or expired'; end if;
  return result;
end;
$$;

create function public.release_expired_unpaid_order_stock(p_checkout_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare checkout_row public.checkout_sessions%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'scheduled order reconciliation service required'; end if;
  select * into checkout_row from public.checkout_sessions where id = p_checkout_id for update;
  if checkout_row.id is null or checkout_row.stock_released_at is not null
    or checkout_row.payment_expires_at > now()
    or checkout_row.payment_status not in ('pending', 'failed')
    or exists (select 1 from public.payments where checkout_session_id = p_checkout_id and status in ('pending', 'processing')) then
    return false;
  end if;
  update public.products p set
    stock_quantity = p.stock_quantity + reserved.quantity,
    availability = case when p.stock_quantity + reserved.quantity > 0 and p.availability = 'out_of_stock' then 'in_stock' else p.availability end
  from (
    select oi.product_id, sum(oi.quantity)::integer as quantity
    from public.order_items oi join public.orders o on o.id = oi.order_id
    where o.checkout_session_id = p_checkout_id
    group by oi.product_id
  ) reserved
  where p.id = reserved.product_id;
  update public.checkout_sessions set payment_status = 'cancelled', stock_released_at = now()
    where id = p_checkout_id;
  update public.orders set fulfilment_status = 'cancelled'
    where checkout_session_id = p_checkout_id and fulfilment_status = 'pending';
  return true;
end;
$$;

create function public.consume_rate_limit(
  p_key_hash text,
  p_scope text,
  p_window_started_at timestamptz,
  p_max_requests integer
) returns boolean language plpgsql security definer set search_path = ''
as $$
declare count integer;
begin
  if auth.role() <> 'service_role' then raise exception 'server-side rate-limit service required'; end if;
  if p_max_requests < 1 or p_max_requests > 10000 then raise exception 'invalid rate limit'; end if;
  insert into public.rate_limit_buckets (key_hash, scope, window_started_at)
    values (p_key_hash, p_scope, p_window_started_at)
  on conflict (key_hash, scope, window_started_at)
  do update set request_count = public.rate_limit_buckets.request_count + 1
  returning request_count into count;
  return count <= p_max_requests;
end;
$$;

revoke all on function public.submit_vendor_application(text, text, uuid, text, text, text, text, boolean) from public, anon;
grant execute on function public.submit_vendor_application(text, text, uuid, text, text, text, text, boolean) to authenticated;
revoke all on function public.vendor_resubmit_application(uuid) from public, anon;
grant execute on function public.vendor_resubmit_application(uuid) to authenticated;
revoke all on function public.admin_start_vendor_review(uuid) from public, anon;
grant execute on function public.admin_start_vendor_review(uuid) to authenticated;
revoke all on function public.record_kyc_consent(uuid, text) from public, anon;
grant execute on function public.record_kyc_consent(uuid, text) to authenticated;
revoke all on function public.admin_review_vendor_application(uuid, public.review_decision, text, text, uuid) from public, anon;
grant execute on function public.admin_review_vendor_application(uuid, public.review_decision, text, text, uuid) to authenticated;
revoke all on function public.record_provider_verification_result(uuid, text, text, text, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_provider_verification_result(uuid, text, text, text, text, text, text, text, jsonb) to service_role;
revoke all on function public.vendor_submit_store_for_publication(uuid) from public, anon;
grant execute on function public.vendor_submit_store_for_publication(uuid) to authenticated;
revoke all on function public.admin_set_store_publication(uuid, public.store_publication_status, text) from public, anon;
grant execute on function public.admin_set_store_publication(uuid, public.store_publication_status, text) to authenticated;
revoke all on function public.create_marketplace_order(uuid, uuid, text, text, text, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.create_marketplace_order(uuid, uuid, text, text, text, text, text, jsonb, text) to service_role;
revoke all on function public.prepare_paystack_payment(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.prepare_paystack_payment(uuid, uuid, text, uuid) to service_role;
revoke all on function public.mark_paystack_payment_initialized(uuid, text) from public, anon, authenticated;
grant execute on function public.mark_paystack_payment_initialized(uuid, text) to service_role;
revoke all on function public.apply_paystack_payment_event(text, text, text, public.payment_status, bigint, text, jsonb) from public, anon, authenticated;
grant execute on function public.apply_paystack_payment_event(text, text, text, public.payment_status, bigint, text, jsonb) to service_role;
revoke all on function public.get_guest_order_status(uuid, text) from public, anon, authenticated;
grant execute on function public.get_guest_order_status(uuid, text) to service_role;
revoke all on function public.release_expired_unpaid_order_stock(uuid) from public, anon, authenticated;
grant execute on function public.release_expired_unpaid_order_stock(uuid) to service_role;
revoke all on function public.consume_rate_limit(text, text, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, text, timestamptz, integer) to service_role;

grant select on public.categories, public.vendor_stores, public.products, public.product_images to anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select on public.vendor_applications to authenticated;
grant select on public.vendor_stores, public.products, public.product_images to authenticated;
grant update (name, slug, logo_path, banner_path, description, contact_phone, whatsapp_phone,
  business_hours, delivery_options, return_policy, social_links, brand_color) on public.vendor_stores to authenticated;
grant insert, update, delete on public.products, public.product_images to authenticated;
grant select, insert, update, delete on public.carts, public.cart_items to authenticated;
grant select on public.checkout_sessions, public.orders, public.order_items, public.payments,
  public.vendor_transactions, public.payment_allocations, public.commissions, public.settlements,
  public.disputes, public.support_tickets, public.notifications, public.kyc_verification_sessions,
  public.kyc_review_events, public.kyc_consent_events, public.payment_events, public.platform_settings, public.audit_logs to authenticated;
grant insert on public.support_tickets to authenticated;
grant update on public.notifications to authenticated;
grant select on public.vendor_orders to authenticated;
grant all on all tables in schema public to service_role;

insert into public.categories (name, slug) values
  ('Fashion & accessories', 'fashion-accessories'),
  ('Beauty & wellness', 'beauty-wellness'),
  ('Home & living', 'home-living'),
  ('Food & drink', 'food-drink'),
  ('Arts & crafts', 'arts-crafts')
on conflict (slug) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marketplace-public', 'marketplace-public', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "public read published store assets" on storage.objects for select to anon, authenticated
using (bucket_id = 'marketplace-public');
create policy "vendor uploads own store assets" on storage.objects for insert to authenticated
with check (
  bucket_id = 'marketplace-public'
  and (storage.foldername(name))[1] in (
    select s.id::text from public.vendor_stores s where s.user_id = (select auth.uid())
  )
  and owner_id = (select auth.uid())::text
);
create policy "vendor updates own store assets" on storage.objects for update to authenticated
using (
  bucket_id = 'marketplace-public'
  and (storage.foldername(name))[1] in (select s.id::text from public.vendor_stores s where s.user_id = (select auth.uid()))
)
with check (
  bucket_id = 'marketplace-public'
  and (storage.foldername(name))[1] in (select s.id::text from public.vendor_stores s where s.user_id = (select auth.uid()))
);
create policy "vendor removes own store assets" on storage.objects for delete to authenticated
using (
  bucket_id = 'marketplace-public'
  and (storage.foldername(name))[1] in (select s.id::text from public.vendor_stores s where s.user_id = (select auth.uid()))
);

commit;
