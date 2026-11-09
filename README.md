# FrontRow — sports ticketing marketplace

A viagogo-style resale marketplace for live sport, built on Next.js 15 (App Router).
Buyers browse a real stadium map with **live** availability, drill into individual rows
with view-quality flags and discount-versus-face-value pricing, and hold what they want
for **10 minutes** while they pay through a NOWPayments hosted crypto invoice.

---

## Stack

| Concern      | Choice                                                                 |
| ------------ | ---------------------------------------------------------------------- |
| Framework    | Next.js 15 (App Router, React 19, TypeScript, Server Actions)           |
| Styling      | Tailwind CSS v4 (CSS-first config) + shadcn/ui primitives, lucide icons |
| Database     | PostgreSQL via Drizzle ORM (`postgres-js`)                              |
| Seat holds   | Redis with Lua scripts and key TTLs                                     |
| UI state     | Zustand                                                                 |
| Payments     | NOWPayments hosted crypto invoices and signed settlement webhook        |
| Event data   | Ticketmaster Discovery API catalog with Ticketmaster-hosted purchase     |
| Validation   | Zod on every server-action boundary                                     |

---

## Directory layout

The layout is **domain-driven**: `src/app` only wires routes together, and every
non-trivial behaviour lives under `src/features/<domain>`.

```
src/
├── app/                                  # routing only - thin by design
│   ├── api/
│   │   ├── events/[eventId]/availability/route.ts   # live availability polling
│   │   ├── payments/checkout/route.ts               # create a NOWPayments invoice
│   │   └── nowpayments/webhook/route.ts             # signed settlement webhook
│   ├── auth/{login,register}/page.tsx
│   ├── checkout/[holdId]/page.tsx        # renders every state of a hold
│   ├── marketplace/
│   │   ├── layout.tsx
│   │   ├── page.tsx                      # event feed
│   │   └── events/[eventId]/page.tsx     # the stadium view
│   ├── hooks/use-event-availability.ts   # polling hook (client)
│   ├── globals.css                       # Tailwind v4 tokens + dark mode
│   ├── layout.tsx  loading.tsx  global-error.tsx  page.tsx
│   └── middleware.ts → src/middleware.ts
│
├── components/
│   ├── ui/                               # shadcn-style primitives
│   └── navigation/site-header.tsx
│
├── db/
│   ├── schema/{events,sections,seats,orders}.ts + index.ts
│   ├── index.ts                          # HMR-safe lazy Drizzle client
│   ├── seed.ts                           # demo stadium (deterministic)
│   └── reconcile.ts                      # Redis ↔ Postgres drift sweeper
│
├── features/
│   ├── events/
│   │   ├── availability.ts               # Postgres inventory + Redis locks
│   │   ├── queries.ts                    # all read queries
│   │   ├── types.ts  view-quality.ts     # domain + presentation metadata
│   │   └── components/
│   │       ├── event-marketplace-view.tsx  # owns the single polling loop
│   │       ├── section-picker.tsx  section-card.tsx  stadium-map.tsx
│   │       └── event-card.tsx
│   ├── seats/components/{listing-feed,listing-row}.tsx
│   ├── holds/
│   │   ├── actions.ts                    # ⭐ atomic 10-minute reservation
│   │   ├── redis.ts                      # ⭐ ioredis + Lua
│   │   ├── keys.ts  constants.ts  validation.ts  types.ts
│   │   └── components/{hold-bar,hold-countdown,release-seats-button}.tsx
│   ├── orders/{pricing,queries}.ts
│   ├── checkout/components/{pay-button,checkout-countdown}.tsx
│   └── auth/{actions,constants}.ts + components/auth-form.tsx
│
├── lib/            env.ts  money.ts  datetime.ts  utils.ts  safe-query.ts  load-env.ts
└── stores/hold-selection-store.ts        # Zustand seat selection
```

---

## Getting started

Follow [GO_LIVE.md](./GO_LIVE.md) for database provisioning and migrations,
local testing, admin setup, and production deployment instructions.

Quick start (PowerShell, after PostgreSQL and Redis are available):

```powershell
Copy-Item .env.example .env.local
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Useful scripts: `npm run typecheck`, `npm run lint`, `npm test`, `npm run db:studio`,
`npm run db:generate` → `npm run db:migrate` for versioned migrations,
`npm run db:reconcile` for the drift sweeper.

### Fixtures API and private admin

`GET /api/matches?limit=24` returns the public fixture feed and
`GET /api/matches/:matchId` returns a fixture, sections, and listings. The
detail route accepts either the event UUID or slug. Both read from the same
PostgreSQL `events` table used by `/marketplace`. The current fixtures are
demo seed data; no external sports-data provider is configured.

The public `/ticketmaster` catalog reads sports events from Ticketmaster Discovery
data synced to PostgreSQL. Buyers follow Ticketmaster purchase links for those
events; Discovery does not provide complete seat inventory or in-app purchases.
Set the server-only `TICKETMASTER_API_KEY` and comma-separated
`TICKETMASTER_MARKET_IDS`, migrate the catalog schema, then run a bounded sync
from the private admin dashboard. The `/v1` API exposes catalog capabilities,
matches, match details/images/seat maps/availability/purchase links, teams,
venues, sports taxonomy, and search suggestions. See [GO_LIVE.md](./GO_LIVE.md)
for the route and operating details.

The private `/admin` area is not linked from the public navigation and has no
registration route. Provision the single admin using `ADMIN_EMAIL`,
`ADMIN_PASSWORD` (16+ characters), and `ADMIN_SESSION_SECRET` (32+ characters)
in server-only environment variables. Admin sessions are signed, HTTP-only,
and expire after eight hours. The dashboard shows fixture, inventory, order,
connection, and paid-order metrics, allows fixture sale-state updates, and
provides a Ticketmaster catalog sync/quota panel.
Payment/provider secrets are never displayed or editable in the dashboard.
Ticketmaster Discovery catalog syncing is available when its server-side key and
market IDs are configured. It is separate from the seeded marketplace inventory.

Without a configured database the UI renders a "Data layer not configured" banner
instead of a 500 — every page-level read goes through `tryQuery`.

---

## The hold pipeline (the interesting part)

```
  buyer taps "Reserve"
          │
          ├─ 1. Postgres  : are these seats still listed + unsold?   → friendly error
          ├─ 2. Redis read: are they in someone else's cart?         → friendly error
          ├─ 3. Redis Lua : check-and-set, atomically                → THE GATE
          ├─ 4. Postgres  : insert order(pending) + items, mirror hold onto seats
          └─ 5. expire    : the key TTL *is* the deadline. No sweeper needed.
```

**Why three layers.** Steps 1 and 2 exist only to produce a readable message
("2 of those seats are in other buyers' carts"). Step 3 is what actually prevents
double-booking: the free-check and the claim happen inside Redis' single-threaded
interpreter, so two simultaneous requests cannot both observe "available".

**Why Redis instead of a DB column.** A hold is ephemeral state with a deadline.
Modelling it as `seats.status = 'held'` requires a sweeper that will eventually be
down, and a stale `held` row is a seat nobody can buy. A TTL cannot get stuck.

**Key design** (`features/holds/keys.ts`):

| Key                                     | Value         | TTL      |
| --------------------------------------- | ------------- | -------- |
| `hold:idx:{holdId}`                     | `eventId`     | 10 min   |
| `hold:{ev:xxxxxxxx}:{holdId}`           | manifest JSON | 10 min   |
| `lock:seat:{ev:xxxxxxxx}:{seatId}`      | `holdId`      | 10 min   |

The `{ev:...}` hash tag pins every key belonging to one event into the same Redis
Cluster slot, so the multi-key Lua script is CROSSSLOT-safe. The `hold:idx` key sits
deliberately outside the tag — it is only ever touched by single-key commands.

**Release is a compare-and-delete.** A hold whose TTL already lapsed must never delete
the lock of the buyer who legitimately took the seat afterwards, so each key is removed
only when it still points at *this* `holdId`.

**Compensating actions.** If Postgres rejects the order after Redis claimed the seats,
the hold is released immediately; if Redis fails *after* claiming, the action's catch
block releases best-effort. Either way the seats are not parked for ten minutes.

### Payments

The checkout route reads the amount and currency from the **order row**, creates
a NOWPayments hosted crypto invoice, and returns its invoice URL. The webhook
(`/api/nowpayments/webhook`) verifies NOWPayments' sorted-payload HMAC in constant
time, checks the invoice amount and currency, deduplicates events, and fulfills
orders only when the payment reaches `finished` and the seats are still held.
Successful fulfillment marks seats sold and releases their Redis locks. Funds
settle to the merchant account using its settlement settings in NOWPayments;
the application does not send wallet payouts. Test callbacks, duplicate
delivery, expiry, and failure cases in the NOWPayments sandbox before enabling
production payments.

---

## Tests

```bash
docker run --rm -p 6379:6379 redis:7-alpine   # the hold engine needs a real Redis
npm test
```

`src/features/holds/hold-engine.test.ts` covers the claims a typecheck cannot make:

- **32 buyers race for one seat and exactly one wins.** If the check-and-set were ever split
  out of the Lua script into a `GET` then a `SET`, this fails.
- **A losing racer is told the *correct* seat.** The Lua script reports a 1-based `KEYS`
  index, which the JS caller must convert; this is the regression test for the off-by-one
  that used to blame the neighbouring seat.
- **A rejected claim is all-or-nothing** — the valid half of a failed request is never left
  silently held.
- **The TTL *is* the deadline** — a lapsed hold frees its seat with no sweeper.
- **Release is compare-and-delete** — a stale "back button" cannot evict the buyer who took
  the seat afterwards.

Without a reachable Redis the suite reports itself as **skipped**, not failed, so `npm test`
stays meaningful in a bare checkout. Teardown runs in a hook rather than as a final step, so
a failing run cannot leave locks behind and poison the next one.

---

## Notable design decisions

- **One polling loop.** `EventMarketplaceView` owns the only availability fetch; the map,
  the section cards and the ticket feed read the same snapshot, so a lock can never
  appear in one panel and not another. Swap the poll for SSE/WebSocket and the payload
  shape is unchanged.
- **A failed poll keeps the last known-good payload** and only flags `isStale` — flashing
  "sold out" because one packet dropped would be a worse lie than slightly old data.
- **Prices never come from the client.** The store holds prices purely for optimistic UI;
  `reserveSeats` re-reads every price from Postgres.
- **Money is integer minor units** (kobo); the checkout converts the order total to
  the major-unit amount expected by NOWPayments.
- **Availability is derived, not stored**: `available = listed − sold − held`, with the two
  halves coming from Postgres and Redis respectively.
- **Server components by default.** Only the interactive leaves are `"use client"` —
  the map, the section card, the section picker, the ticket feed and row, the hold bar,
  the countdown and the pay button. Every page, every query and the whole schema stay
  server-only, and `features/holds/constants.ts` is deliberately dependency-free so client
  code never drags `ioredis` or `node:crypto` into the browser bundle.
- **The discount badge compares like with like**: the "was" price is the face value of the
  *cheapest* seat, fetched with `array_agg(...)[1]`, not the cheapest face value in the
  section. Those are different numbers.

---

## Deliberately out of scope

- **Auth is a stub.** `features/auth/actions.ts` sets a cookie without checking a password
  so the middleware guard is demonstrable. Replace it with Auth.js / Clerk / Supabase and
  the cookie contract in `features/auth/constants.ts` is all the middleware needs.
- **No ticket issuance** — no QR codes, PDFs or transfer flow yet.
- **No seller onboarding or payouts**, and no `listings` table separate from `seats`.
- **Reconciliation is a script, not a scheduler** (`npm run db:reconcile`). Point a cron
  or a queue at it. See "drift" below.
- **`sections.capacity` vs live listings**: capacity is venue capacity; the card counts
  actual listings.

### Known drift

`seats.hold_id` / `seats.hold_expires_at` are a *mirror* of the authoritative Redis hold,
written for support and auditing. Nothing clears them when a TTL lapses — that is what
`npm run db:reconcile` is for. Redis remains authoritative for who may buy a seat, so this
drift can never sell a seat twice; it just makes the mirror stale.
