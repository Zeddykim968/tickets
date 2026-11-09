import { count, desc, eq, sql } from "drizzle-orm";
import type { Metadata } from "next";
import { getDb } from "@/db";
import { events, orders, seats } from "@/db/schema";
import { getRedis } from "@/features/holds/redis";
import { AdminSyncPanel } from "@/features/ticketmaster/components/admin-sync-panel";
import { lastTicketmasterSync } from "@/lib/ticketmaster/sync";
import { ticketmasterDailyUsage, ticketmasterQuotaSnapshot } from "@/lib/ticketmaster/client";
import { ticketmasterMarkets } from "@/lib/ticketmaster/config";
import { formatMoney } from "@/lib/money";
import { updateFixtureStatusAction } from "./actions";
import { adminSignOutAction } from "./login/actions";

export const metadata: Metadata = {
  title: "Admin dashboard",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

async function loadDashboard() {
  const db = getDb();
  const [fixtureCounts, inventoryCounts, orderCounts, revenue, fixtures, lastSync, quota, dailyCalls] = await Promise.all([
    db.select({ total: count(), onSale: sql<number>`count(*) filter (where ${events.status} = 'on_sale')::int` }).from(events),
    db.select({
      total: count(),
      available: sql<number>`count(*) filter (where ${seats.status} = 'available')::int`,
      listed: sql<number>`count(*) filter (where ${seats.isListed} = true)::int`,
    }).from(seats),
    db.select({
      total: count(),
      pending: sql<number>`count(*) filter (where ${orders.status} = 'pending')::int`,
      paid: sql<number>`count(*) filter (where ${orders.status} = 'paid')::int`,
    }).from(orders),
    db.select({
      currency: orders.currency,
      amount: sql<number>`coalesce(sum(${orders.totalCents}), 0)::int`,
    })
      .from(orders)
      .where(eq(orders.status, "paid"))
      .groupBy(orders.currency),
    db.select({
      id: events.id,
      homeTeam: events.homeTeam,
      awayTeam: events.awayTeam,
      startsAt: events.startsAt,
      status: events.status,
      venueCity: events.venueCity,
    })
      .from(events)
      .orderBy(desc(events.startsAt))
      .limit(20),
    lastTicketmasterSync().catch((error) => {
      console.error("[admin] Ticketmaster sync state unavailable", error);
      return null;
    }),
    ticketmasterQuotaSnapshot().catch((error) => {
      console.error("[admin] Ticketmaster quota state unavailable", error);
      return null;
    }),
    ticketmasterDailyUsage().catch((error) => {
      console.error("[admin] Ticketmaster daily usage unavailable", error);
      return 0;
    }),
  ]);

  const [redisHealth] = await Promise.all([
    getRedis().ping().then(() => "Connected").catch(() => "Unavailable"),
  ]);

  return {
    fixtures: fixtureCounts[0],
    inventory: inventoryCounts[0],
    orders: orderCounts[0],
    paidRevenue: revenue,
    fixtureList: fixtures,
    ticketmaster: { lastSync, quota, dailyCalls, markets: ticketmasterMarkets() },
    connections: {
      database: "Connected",
      redis: redisHealth,
      paymentGateway:
        process.env.NOWPAYMENTS_BASE_URL &&
        process.env.NOWPAYMENTS_API_KEY &&
        process.env.NOWPAYMENTS_IPN_SECRET
          ? "NOWPayments configured (active checkout)"
          : "NOWPayments not configured",
      ticketmaster: process.env.TICKETMASTER_API_KEY ? "Discovery API configured" : "Not configured",
    },
  };
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; updated?: string }>;
}) {
  const dashboard = await loadDashboard();
  const { error, updated } = await searchParams;

  const metrics = [
    { label: "Fixtures", value: dashboard.fixtures.total, detail: `${dashboard.fixtures.onSale} on sale` },
    { label: "Seat listings", value: dashboard.inventory.listed, detail: `${dashboard.inventory.available} available` },
    { label: "Orders", value: dashboard.orders.total, detail: `${dashboard.orders.paid} paid · ${dashboard.orders.pending} pending` },
    {
      label: "Paid order value",
      value: dashboard.paidRevenue.length
        ? dashboard.paidRevenue.map((row) => formatMoney(row.amount, row.currency)).join(" · ")
        : formatMoney(0, "NGN"),
      detail: "confirmed orders",
    },
  ];

  return (
    <main className="space-y-8">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Website overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Private operational status and sales data. This page is not linked from the public site.
          </p>
        </div>
        <form action={adminSignOutAction}>
          <button type="submit" className="rounded-lg border border-border px-3 py-2 text-xs font-semibold">
            Sign out
          </button>
        </form>
      </section>

      {error && (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error === "paid_orders"
            ? "This fixture has paid orders. A refund workflow is required before cancelling it."
            : error === "fixture_not_found"
              ? "The fixture could not be found."
              : "The fixture status update was not valid."}
        </p>
      )}
      {updated && (
        <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-200">
          Fixture status updated.
        </p>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Marketplace analytics">
        {metrics.map((metric) => (
          <article key={metric.label} className="rounded-2xl border border-border bg-card p-5">
            <p className="text-xs font-semibold text-muted-foreground">{metric.label}</p>
            <p className="mt-2 text-2xl font-bold tabular-nums">{metric.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{metric.detail}</p>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-base font-semibold">Connections</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Secrets stay in server environment variables and are never displayed here.
        </p>
        <dl className="mt-4 divide-y divide-border">
          {Object.entries(dashboard.connections).map(([name, value]) => (
            <div key={name} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <dt className="capitalize">{name.replace(/([A-Z])/g, " $1")}</dt>
              <dd className={value === "Unavailable" ? "font-semibold text-destructive" : "text-muted-foreground"}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed">
          Marketplace fixtures and Ticketmaster Discovery events are separate catalogs. Discovery sync does not create resale inventory.
        </p>
      </section>

      <AdminSyncPanel
        configured={Boolean(process.env.TICKETMASTER_API_KEY)}
        defaultMarkets={dashboard.ticketmaster.markets}
        initialQuota={dashboard.ticketmaster.quota}
        initialDailyCalls={dashboard.ticketmaster.dailyCalls}
        lastSync={dashboard.ticketmaster.lastSync}
      />

      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-base font-semibold">Fixtures</h2>
        <p className="mt-1 text-xs text-muted-foreground">Latest scheduled fixtures and their public sale state.</p>
        <div className="mt-4 divide-y divide-border">
          {dashboard.fixtureList.map((fixture) => (
            <div key={fixture.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-semibold">{fixture.homeTeam} vs {fixture.awayTeam}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {fixture.venueCity} · {fixture.startsAt.toLocaleString("en-GB")}
                </p>
              </div>
              <form action={updateFixtureStatusAction} className="flex items-center gap-2">
                <input type="hidden" name="eventId" value={fixture.id} />
                <label className="sr-only" htmlFor={`fixture-status-${fixture.id}`}>Fixture status</label>
                <select
                  id={`fixture-status-${fixture.id}`}
                  name="status"
                  defaultValue={fixture.status}
                  className="h-9 rounded-lg border border-input bg-background px-2 text-xs capitalize"
                >
                  <option value="scheduled">Scheduled</option>
                  <option value="on_sale">On sale</option>
                  <option value="sold_out">Sold out</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="completed">Completed</option>
                </select>
                <button type="submit" className="h-9 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground">
                  Update
                </button>
              </form>
            </div>
          ))}
          {dashboard.fixtureList.length === 0 && (
            <p className="py-4 text-sm text-muted-foreground">No fixtures have been seeded.</p>
          )}
        </div>
      </section>
    </main>
  );
}
