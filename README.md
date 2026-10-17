# MarketLink

MarketLink is a Ghana-focused multi-vendor marketplace prototype built with Next.js App Router, TypeScript, Tailwind CSS, Supabase, and Recharts. Its UI is an explicitly labelled browser sandbox; seeded storefronts, dashboard metrics, sandbox approval actions, and demo checkout are illustrative—not live users, KYC decisions, revenue, payment, or settlement data.

## Run locally

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

The project root contains spaces, so run these commands from the workspace terminal rather than passing its path to an unquoted shell command.

To validate:

```powershell
npm test
npm run lint
npx tsc --noEmit
npm run build
```

## Supabase setup

1. Create a Supabase project and configure email/password sign-in, email confirmation, secure session settings, and an authorized SMTP provider.
2. The checked-in CLI config lives at `supabase/config.toml`. From the project root, authenticate the Supabase CLI with a personal access token created in your Supabase account (never put that token in `.env.local` or share it in chat), then link the intended project:

   ```powershell
   npx supabase login
   npx supabase link --project-ref <project-ref>
   ```

   The project ref is the subdomain in the project URL. Linking does not apply migrations.
3. Add the project URL and publishable key to `.env.local` as `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The public key enables browser auth only; it is not an admin credential. Set `SUPABASE_SERVICE_ROLE_KEY` only in a local server environment or secret manager, and never expose it to client code.
4. Review the migration, then apply it to a staging project first with `npx supabase db push` or the Supabase SQL editor. The migration creates normalized buyer, vendor, catalogue, checkout, vendor-order, payment-ledger, settlement, dispute, support, KYC, and append-only audit structures; it also seeds catalogue categories, not personal records.
5. Configure `RATE_LIMIT_HASH_SECRET` with a unique random secret of at least 32 bytes. The rate-limit table stores keyed hashes, not raw IP addresses. Trust `x-real-ip` only when it is set by your hosting proxy; also configure edge/WAF limits and monitor abuse.
6. Keep administrator assignment in trusted provisioning only: set `app_metadata.role = "super_admin"` with the Supabase Auth Admin API or a controlled operator workflow. Never accept a role from user metadata or the browser. The admin console is shown only after `/api/admin/session` verifies this claim; administrators must enroll or verify a TOTP factor to reach `aal2`. Each administrative API/RPC independently enforces role and MFA—client-side visibility is not authorization.
7. Configure backups, retention jobs, alerting, incident ownership, and restore drills before handling live customer data.

`profiles` has no editable role field. RLS checks the server-issued JWT `app_metadata` claim and MFA assurance. The admin vendor queue reads application-safe fields through an MFA-protected route; review start and decisions use audited database functions. Identity-provider references/results remain private, and only authorized administrators can query those records. Approval is rejected by the database unless a trusted provider has recorded an approved result. Vendor owners cannot set verification, publication, payment, or settlement states directly. Sales, orders, disputes, and audit-log dashboard views remain unavailable until their audited server-side queries are implemented.

## Netlify deployment

1. Push the intended branch to a Git provider, then [import that repository in Netlify](https://app.netlify.com/start). Use the Next.js framework preset and build command `npm run build`; leave the publish output to the Next.js runtime rather than deploying `.next` as a static site.
2. Start with a staging branch and staging Supabase project. Configure `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_SITE_URL` in Netlify for that deploy context. Set `NEXT_PUBLIC_SITE_URL` to the exact HTTPS site URL.
3. Add `SUPABASE_SERVICE_ROLE_KEY` and `RATE_LIMIT_HASH_SECRET` as server-side environment variables in Netlify. Keep them out of `NEXT_PUBLIC_` variables, repository files, and browser code. Use separate values for staging and production.
4. Add the Netlify site URL and eventual custom domain to the Supabase Auth site URL and redirect URL allowlist. Verify the auth callback, email confirmation, and password reset flows on the deployed staging site.
5. Do not configure production MTN credentials or enable live charges: the current payment adapter is sandbox-only. Do not accept real vendor identity documents or represent vendors as verified until an approved identity provider is connected. Seller settlement and production legal/operational policies also remain launch blockers.
6. Promote to the production branch only after staging migrations, authentication, rate limiting, backups, monitoring, and the required payment, identity, and seller-settlement workflows have been reviewed and tested.

## Payment, identity, and messaging boundaries

- **Checkout in the visible demo:** creates a browser-local sample order and clearly states that no payment was processed. The Supabase order API is available separately and requires the service-role secret and rate-limit secret to be configured.
- **Server checkout:** `POST /api/orders` validates input, requires a 256-bit guest token for guest access, creates a parent checkout plus per-store fulfilment orders in one database transaction, calculates prices from current database records, and reserves stock. Private guest status is available only by presenting the token to `POST /api/orders/access`; token hashes—not raw tokens—are persisted and expire.
- **Multi-vendor payment:** one provider charge is attached to a parent checkout. The schema records separate vendor allocations, commissions, and net amounts. The proposed settlement model is provider-managed split settlement to verified vendor accounts, but this is not approved or implemented; confirm Ghana availability, merchant-of-record terms, safeguarding, and licensing with the provider and qualified counsel. The current MTN MoMo Collection adapter does not split or pay out funds. Do not collect live payments until an approved provider-backed settlement flow is implemented.
- **MTN MoMo:** server-side sandbox collection uses the MTN API user, API key and Collection subscription key. The app requests a payment and verifies final status directly against MTN from the server; a browser return alone never confirms payment. Add rotated sandbox credentials to `.env.local` as `MTN_MOMO_API_USER`, `MTN_MOMO_API_KEY`, and `MTN_MOMO_COLLECTION_SUBSCRIPTION_KEY`. Live activation is deliberately not supported by this integration.
- **Identity:** Smile ID is the candidate selected for technical and commercial evaluation, not a connected or approved provider. The demo never asks for a real identity document or opens a camera. `lib/identity/provider.ts` fails closed. KYC cases are private, identifiers are masked, and admin decisions require an approved provider result plus a reason and MFA. Confirm Ghana coverage and authorization, provider contract, data-protection, retention, consent, and identity-check obligations before building or enabling capture.
- **WhatsApp:** `lib/whatsapp.ts` validates Ghana destinations and builds an encoded click-to-chat URL. It does not send messages, track delivery, or provide read receipts. The visible sample storefront currently explains that the handoff is not connected to its demo data.

## Security and data handling

- Never commit `.env.local`, provider credentials, raw identity files, access tokens, or payment payloads.
- Only non-sensitive catalogue/store assets belong in the public `marketplace-public` bucket; the migration applies type and size limits and owner-scoped upload policies. Identity documents and biometric images are not accepted or stored.
- The checkout RPC checks publication/verification state and stock while locking products, then writes exact GHS values in integer pesewas and vendor-specific order snapshots. Payment and fulfilment states are independent.
- Webhook events have a provider-event uniqueness constraint and are recorded in an immutable event ledger. Administrative KYC decisions, consent, application submission, and publication changes write append-only audit records.
- Pending checkout stock holds need a scheduled expiry/reconciliation job in the deployed project. Configure Supabase Cron or a protected scheduled worker to release expired unpaid holds and reconcile provider transactions.
- Back up the database and test restoration. Establish incident escalation, credential rotation, evidence preservation, customer notification, and provider/regulator notification procedures with counsel before launch.
- Confirm current Ghana Data Protection Act/data-controller obligations, Bank of Ghana payment-services requirements, consumer and e-commerce rules, tax obligations, and identity/biometric-provider authorization with qualified Ghanaian counsel and relevant providers. This prototype is not legal or regulatory advice.

## Important files

- `app/page.tsx`, `components/marketlink-app.tsx`, `app/globals.css`: responsive marketplace and clearly marked sandbox workspaces.
- `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/authz.ts`: Supabase session clients and server-side role/MFA enforcement.
- `app/api/`: validated onboarding, checkout, private guest order access, MTN MoMo payment initialization/status verification, and MFA-protected admin session/vendor queue/review/decision endpoints.
- `lib/payments/`, `lib/identity/`, `lib/whatsapp.ts`: isolated provider boundaries; unconfigured external services fail closed.
- `supabase/migrations/`: normalized schema, RLS, state-transition RPCs, private verification records, stock checks, and audit trail.
- `lib/__tests__/marketlink-core.test.ts`: unit coverage for admin MFA policy, GHS arithmetic, payment/application/store state transitions, and WhatsApp URL safety.

## Known prototype limits

The visual sandbox stores its demonstration cart, orders, and vendor approvals in browser local storage. Supabase email/password signup and sign-in are wired when project settings are supplied. Admin access is restricted to a trusted `app_metadata.role = "super_admin"` claim and an AAL2 session; the UI can enroll or verify TOTP, while server routes and database functions independently enforce authorization. The paginated vendor review queue is wired to Supabase; payment, orders, disputes, and audit-log admin screens explicitly report that live queries are not connected. The database migrations and server secrets must be configured in an authorized Supabase project before the live queue, catalogue, checkout, or payments can work end to end. Configure and integration-test migrations and endpoints against a Supabase staging project before use.
