"use client";

import { useState } from "react";

type SyncResult = {
  completedAt: string;
  markets: string[];
  eventsProcessed: number;
  pagesFetched: number;
  dailyCallsUsed?: number;
};

type AdminSyncPanelProps = {
  configured: boolean;
  defaultMarkets: string[];
  initialQuota: {
    rateLimit: string | null;
    available: string | null;
    over: string | null;
    reset: string | null;
    observedAt: string;
  } | null;
  initialDailyCalls: number;
  lastSync: Omit<SyncResult, "dailyCallsUsed"> | null;
};

const dateInputValue = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

export function AdminSyncPanel({
  configured,
  defaultMarkets,
  initialQuota,
  initialDailyCalls,
  lastSync,
}: AdminSyncPanelProps) {
  const now = new Date();
  const [from, setFrom] = useState(dateInputValue(now));
  const [to, setTo] = useState(dateInputValue(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)));
  const [markets, setMarkets] = useState(defaultMarkets.join(", "));
  const [dailyCalls, setDailyCalls] = useState(initialDailyCalls);
  const [quota, setQuota] = useState(initialQuota);
  const [sync, setSync] = useState<SyncResult | null>(lastSync);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runSync(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const marketIds = markets.split(",").map((market) => market.trim()).filter(Boolean);
      const response = await fetch("/internal/sync/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: new Date(from).toISOString(),
          to: new Date(to).toISOString(),
          markets: marketIds,
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message = typeof payload === "object" && payload !== null &&
          "error" in payload && typeof payload.error === "object" && payload.error !== null &&
          "message" in payload.error && typeof payload.error.message === "string"
          ? payload.error.message
          : "Catalog sync failed.";
        throw new Error(message);
      }
      const result = payload as SyncResult;
      setSync(result);
      setDailyCalls(result.dailyCallsUsed ?? dailyCalls);
      const quotaResponse = await fetch("/internal/quota", { cache: "no-store" });
      if (quotaResponse.ok) {
        const latest = await quotaResponse.json() as { discovery: AdminSyncPanelProps["initialQuota"] };
        setQuota(latest.discovery);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Catalog sync failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-5 rounded-2xl border border-border bg-card p-5">
      <div>
        <h2 className="text-base font-semibold">Ticketmaster Discovery catalog</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Sync sports listings to the local catalog. This does not import live seat inventory or enable Ticketmaster checkout.
        </p>
      </div>

      {!configured && (
        <p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
          Set TICKETMASTER_API_KEY in the server environment before syncing.
        </p>
      )}

      <form onSubmit={runSync} className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-xs font-medium">
          Start date
          <input required type="datetime-local" value={from} onChange={(event) => setFrom(event.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm" />
        </label>
        <label className="grid gap-1 text-xs font-medium">
          End date (up to 31 days)
          <input required type="datetime-local" value={to} onChange={(event) => setTo(event.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm" />
        </label>
        <label className="grid gap-1 text-xs font-medium md:col-span-2">
          Market IDs
          <input value={markets} onChange={(event) => setMarkets(event.target.value)} placeholder="Comma-separated Ticketmaster market IDs" className="h-10 rounded-lg border border-input bg-background px-3 text-sm" />
          <span className="text-[11px] font-normal text-muted-foreground">At most 10 markets per sync; defaults to TICKETMASTER_MARKET_IDS.</span>
        </label>
        <button type="submit" disabled={!configured || busy} className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50 md:col-span-2">
          {busy ? "Syncing catalog…" : "Run catalog sync"}
        </button>
      </form>

      {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      {sync && (
        <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs">
          Sync finished {new Date(sync.completedAt).toLocaleString()}: {sync.eventsProcessed} events across {sync.markets.length} market(s), {sync.pagesFetched} pages; {sync.dailyCallsUsed} Discovery calls used today.
        </p>
      )}

      <dl className="grid gap-3 text-xs sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Daily Discovery calls</dt><dd className="mt-1 font-semibold">{dailyCalls} / 5,000 hard safety limit (sync pauses at 4,000)</dd></div>
        <div><dt className="text-muted-foreground">Last successful catalog sync</dt><dd className="mt-1 font-semibold">{sync ? new Date(sync.completedAt).toLocaleString() : "Never"}</dd></div>
        <div><dt className="text-muted-foreground">Provider quota remaining</dt><dd className="mt-1 font-semibold">{quota?.available ?? "No provider snapshot yet"}</dd></div>
        <div><dt className="text-muted-foreground">Provider quota observed</dt><dd className="mt-1 font-semibold">{quota ? new Date(quota.observedAt).toLocaleString() : "—"}</dd></div>
      </dl>
    </section>
  );
}
