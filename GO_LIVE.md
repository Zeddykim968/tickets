# FrontRow setup, testing, and production runbook

This runbook describes the application as it exists in this repository. The
active marketplace checkout uses NOWPayments hosted crypto invoices and a signed
NOWPayments webhook. Funds settle to the merchant account configured in
NOWPayments. Ticketmaster Discovery supplies a separate public event catalog
with external Ticketmaster purchase links; it does not supply live seat inventory
or in-app checkout.

## What is currently implemented

- Next.js 15 App Router marketplace and fixture/stadium views.
- PostgreSQL via Drizzle; Redis TCP/Lua scripts provide atomic seat holds.
- `GET /api/matches?limit=24` lists fixtures from the local `events` table.
- `GET /api/matches/:matchId` returns a fixture, sections, and listings. The id
  can be the event UUID or slug.
- `GET /api/events/:eventId/availability` returns live Redis-backed availability.
- `/admin` is excluded from the public header/footer and has no public signup.
  Its admin credentials are provisioned through environment variables. The
  dashboard reports sales/connection information and permits fixture sale-state
  changes; cancelling a fixture with paid orders is blocked.
- Demo fixture data is loaded by `npm run db:seed`; there is no external
  fixture-provider integration in the repo.
- `/ticketmaster` lists Ticketmaster Discovery sports events from a local catalog.
  Admins can sync up to 10 configured markets over a maximum 31-day date range;
  sync pagination is capped and uses Redis-backed request-rate/daily-quota guards.
- Public Discovery endpoints are available under `/v1`: `/capabilities`,
  `/matches`, `/matches/:matchId`, `/matches/:matchId/images`,
  `/matches/:matchId/seatmap`, `/matches/:matchId/availability`,
  `/matches/:matchId/purchase-link`, `/teams`, `/teams/:teamId`, `/venues`,
  `/venues/:venueId`, `/sports`, and `/search/suggest`.
  `GET /healthz` reports database/Redis status.
- The private admin dashboard includes Ticketmaster sync controls. Its protected
  operations are `POST /internal/sync/matches` and `GET /internal/quota`.
- NOWPayments is the active payment gateway. Checkout uses the amount and currency
  on the pending order, and the signed webhook fulfills seats only after the
  payment reaches its final successful state and while the order still owns them.
  Merchant settlement is controlled by the NOWPayments account; no automated
  wallet payout is sent by this application.
- General customer authentication is demo-only. The email cookie is not a
  production authentication system.

## Requirements

- Supported Node.js version for Next.js 15 (use Node 20 LTS or newer).
- PostgreSQL.
- Redis reachable over TCP; the hold engine uses Lua scripts and is not
  compatible with Redis services that expose only an HTTP REST API.
- npm.

## Local development (Windows PowerShell)

### 1. Start local PostgreSQL and Redis

If Docker Desktop is installed, start disposable development services:

```powershell
docker run --name frontrow-postgres `
  -e POSTGRES_PASSWORD=dev-only-password `
  -e POSTGRES_DB=frontrow `
  -p 5432:5432 -d postgres:16

docker run --name frontrow-redis `
  -p 6379:6379 -d redis:7-alpine
```

These are local development credentials only. Do not reuse them outside a
developer machine. If containers with these names already exist, start those
containers rather than creating duplicate ones.

### 2. Configure local environment

```powershell
Copy-Item .env.example .env.local
```

Set at least:

- `DATABASE_URL=postgresql://postgres:dev-only-password@localhost:5432/frontrow`
- `REDIS_URL=redis://localhost:6379`
- `NEXT_PUBLIC_APP_URL=http://localhost:3000`
- `APP_URL=http://localhost:3000`
- `NOWPAYMENTS_BASE_URL`, `NOWPAYMENTS_API_KEY`, and `NOWPAYMENTS_IPN_SECRET`
  from NOWPayments. Use sandbox credentials locally.
- `TICKETMASTER_API_KEY` from the Ticketmaster developer portal.
- `TICKETMASTER_MARKET_IDS` as comma-separated Discovery market IDs. Use only
  markets authorized for the issued key and within its quota.

For admin access, set `ADMIN_EMAIL`, `ADMIN_PASSWORD` (minimum 16 characters),
and `ADMIN_SESSION_SECRET` (minimum 32 characters). Generate a secret locally:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Do not commit `.env.local`, provider credentials, or database URLs.

### 3. Install, migrate, and seed

```powershell
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://localhost:3000/marketplace`. The demo seed is deterministic and
reloads its demo fixtures; do not run it against a production database because
the seed deletes/recreates the demo fixtures and their dependent inventory.

The versioned migrations are under `drizzle/`:

- `0000_jazzy_dark_phoenix.sql` creates the core marketplace schema.
- `0001_rapid_the_fallen.sql` adds the initial payment tables.
- `0002_same_madame_web.sql` removes a redundant uniqueness constraint while
  retaining the payment order lookup index.
- `0004_transfi_checkout.sql` links payments to marketplace orders and
  removes obsolete Paystack-only order fields.
- `0005_nowpayments_gateway.sql` adds NOWPayments invoice IDs, keeps legacy
  provider order IDs for payment history, removes unused provider user IDs, and
  expires old in-flight checkouts so they can be restarted with NOWPayments.
- The Ticketmaster catalog migration (generated from the current schema) creates
  local tables for Discovery events, teams, venues, sports taxonomy, and ID
  crosswalk data.

For an empty database, `npm run db:migrate` applies them in order. No migration
has been applied to the configured hosted database as part of this work. Avoid
`npm run db:push` for normal deployment; use reviewed, versioned migrations.

## Testing and verification

Run these before opening a PR or deployment:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

The hold-engine tests need a real reachable Redis instance. They verify races,
all-or-nothing seat claims, TTL expiry, and safe lock release. NOWPayments status
mapping and terminal-state transition tests are unit tests and do not call the
provider.

Manual local checks:

1. Browse `/marketplace`, open a fixture, and verify its section/listing data.
2. Verify `GET /api/matches?limit=24` and
   `GET /api/matches/super-eagles-vs-black-stars-uyo`.
3. Reserve seats in two browser sessions and check that a seat cannot be held
   twice; allow a hold to expire and confirm availability returns.
4. Visit `/admin/login`, sign in with the provisioned environment credentials, check
   the dashboard, change a fixture status, and sign out. Verify there is no
   admin link on the public pages.
5. After configuring the Ticketmaster key and market IDs, open `/admin`, run a
    short sync window, and verify events at `/ticketmaster` and `GET /v1/matches`.
    Check `/internal/quota` while signed in and `/healthz` for dependency status.
6. Test checkout, successful/failed callbacks, and duplicate webhook delivery
   using NOWPayments sandbox credentials until
   production readiness requirements below are complete.

The production build may log a data-query warning if the configured database
is unavailable during static analysis. A successful build alone does not prove
database connectivity or a successful migration.

## Database migrations and existing databases

The repository's `.env.local` may target a remote Supabase database. Inspect
the destination before applying anything. Back up production data and obtain
approval from the database owner before a production migration.

The following migrations begin with `0000`, which creates the original core
tables. If a database was previously initialized by `db:push` or another tool
but has no matching Drizzle migration history, running `db:migrate` can fail
because the tables already exist. Do not solve that by deleting tables or
resetting the database. First inspect the schema and migration history and
decide on a reviewed Drizzle baseline procedure.

For Supabase/managed Postgres, use:

- `DATABASE_URL`: the app's supported connection URL.
- `DATABASE_MIGRATION_URL`: a direct or session-mode database connection URL
  for Drizzle migrations. The CLI prefers this when it is set. Do not use a
  transaction-only pooler for migrations unless the provider explicitly
  supports the required session behavior.

Apply migrations only after confirming the target and checking the migration
history:

```powershell
npm run db:migrate
```

Then verify the expected tables exist (`events`, `sections`, `seats`, `orders`,
`order_items`, `users`, `payments`, `webhook_events`) using the database
provider's SQL editor or Drizzle Studio. Drizzle Studio can be started locally
with `npm run db:studio`; treat its access as privileged.

## Production deployment checklist

### Infrastructure and secrets

1. Provision production PostgreSQL and Redis, enable backups/retention, and
   confirm network access from the hosting runtime.
2. Add server-only environment variables in the hosting provider:
   `DATABASE_URL`, `DATABASE_MIGRATION_URL` (deployment/migration job only),
   `REDIS_URL`, `NOWPAYMENTS_BASE_URL`, `NOWPAYMENTS_API_KEY`,
   `NOWPAYMENTS_IPN_SECRET`, `TICKETMASTER_API_KEY`,
   `TICKETMASTER_MARKET_IDS`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`,
   `ADMIN_SESSION_SECRET`, and `NEXT_PUBLIC_APP_URL`.
3. Set `NEXT_PUBLIC_APP_URL` and `APP_URL` to the canonical HTTPS origin.
4. Keep secrets out of `NEXT_PUBLIC_*`, logs, source control, and admin pages.
   Rotate credentials if they were ever committed or shared.
5. Use production NOWPayments credentials only after sandbox checkout and
   webhook behavior has been verified. Configure the IPN callback URL to
   `/api/nowpayments/webhook` over HTTPS and configure merchant settlement in
   the NOWPayments account.
6. Configure Ticketmaster's production Discovery key and approved market IDs.
   The sync service pauses background sync at 4,000 local daily calls and blocks
   all calls at 5,000; these are application guards, not replacements for the
   provider's quota.
7. Make sure Redis is a TCP Redis-compatible service with Lua support and
   adequate persistence/availability for the hold requirements.

### Database release

1. Take/verify a restorable backup.
2. Review the exact migration SQL in `drizzle/`.
3. For a fresh production DB, apply the migrations in order with the migration
   URL; do not run the demo seed.
4. For a database that already contains schema/data, first reconcile its
   migration history. Do not rerun the `0000` baseline against existing tables.
5. Confirm schema and application health before shifting traffic.

### Deploy and smoke-test

```powershell
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run start
```

Configure the host to build once and run `npm start` with the production
environment. For serverless hosts, use a deployment migration job with
`DATABASE_MIGRATION_URL`; do not run schema DDL from every application
instance/startup.

After deployment, verify:

- Public marketplace and match routes respond.
- Database reads and Redis availability work from the production runtime.
- `/admin` redirects to `/admin/login` when not authenticated; valid provisioned
  credentials work; sign-out invalidates the session.
- NOWPayments sandbox/production mode is correct, webhooks arrive, duplicate webhook
  delivery does not fulfill an order twice, and delayed payment behavior is
  understood.
- Ticketmaster Discovery sync stays within the assigned provider quota, and all
  Discovery purchase links redirect to an official HTTPS Ticketmaster domain.
- Logs and alerts capture database, Redis, payment, and webhook failures
  without recording credentials or unnecessary personal/payment data.

## Production blockers and limitations

Do not consider the site ready to sell real tickets until all of these are
addressed and tested:

- Replace demo customer authentication with a real identity/session provider.
- Exercise NOWPayments callbacks, amount/currency handling, duplicate webhooks,
  failure handling, refunds, and seat fulfillment in provider sandbox before
  accepting production payments.
- Ticketmaster Discovery data is a separate catalog, not a feed for the
  marketplace's own seat inventory. Ticketmaster event purchases remain on
  Ticketmaster unless partner inventory/checkout access is separately approved.
- Add an operational refund/cancellation process before allowing admin to
  cancel fixtures with paid orders.
- Configure rate limiting, monitoring, alerts, backups, restore drills, and
  operational ownership for the admin and payment endpoints.

The `/admin` interface is intentionally not linked from the public navigation,
but an unlinked URL is not access control. Its security comes from the signed
HTTP-only admin session; continue to use a strong unique password, TLS, and
hosting-side secret management.
