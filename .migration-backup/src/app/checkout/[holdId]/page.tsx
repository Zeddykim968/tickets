import { CalendarDays, CheckCircle2, Mail, MapPin, TimerOff } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckoutCountdown } from "@/features/checkout/components/checkout-countdown";
import { PayButton } from "@/features/checkout/components/pay-button";
import { viewQualityMeta } from "@/features/events/view-quality";
import { ReleaseSeatsButton } from "@/features/holds/components/release-seats-button";
import { getCheckoutView } from "@/features/orders/queries";
import { formatEventDateTime } from "@/lib/datetime";
import { discountPercent, formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Checkout - a server component that renders exactly one of the four states of
 * `CheckoutView` (see `features/orders/queries.ts`):
 *
 *   not_found -> the hold id is unknown
 *   expired   -> the Redis keys are gone and the order is not paid
 *   paid      -> the webhook settled it; receipt view (double-tab safety)
 *   active    -> a live hold: countdown, line items, Pay button
 *
 * Redis is the judge in every branch: the page re-reads the hold on every
 * request, so a buyer who refreshes after the TTL lapses lands on the expired
 * state even if their tab kept the old countdown running.
 */
export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};

// A hold is live state: never cache, never prerender. A cached response could
// show a buyer a live countdown for a hold that has already lapsed.
export const dynamic = "force-dynamic";

export default async function CheckoutPage({ params }: { params: Promise<{ holdId: string }> }) {
  const { holdId } = await params;
  const view = await getCheckoutView(holdId);

  if (view.state === "not_found") {
    return (
      <CenteredState
        icon={<TimerOff className="size-6" />}
        title="We can't find that checkout"
        body="The hold id is unknown. Holds are only valid for ten minutes, so this link may simply be old."
        action={
          <Button asChild>
            <Link href="/marketplace">Back to tickets</Link>
          </Button>
        }
      />
    );
  }

  if (view.state === "expired") {
    return (
      <CenteredState
        icon={<TimerOff className="size-6" />}
        title="Your hold expired"
        body="The ten minutes ran out and the seats went back on sale. Nothing has been charged — grab them again if they're still there."
        action={
          <Button asChild>
            <Link href="/marketplace">Find tickets</Link>
          </Button>
        }
      />
    );
  }

  if (view.state === "paid") {
    const currency = view.currency;

    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-12">
        <div className="flex flex-col items-center text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-7" />
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">You&apos;re going!</h1>
          <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
            Payment confirmed and your seats are locked in. Your tickets have been sent to{" "}
            <span className="font-semibold text-foreground">{view.email}</span>.
          </p>
          <Badge variant="success" className="mt-4 font-mono">
            {view.reference}
          </Badge>
        </div>

        <ul className="mt-8 divide-y divide-border rounded-2xl border border-border bg-card">
          {view.items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-4 px-5 py-3">
              <div>
                <p className="text-sm font-semibold">
                  {item.sectionLabel} · Row {item.rowLabel} · Seat {item.seatNumber}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {viewQualityMeta(item.viewQuality).label}
                </p>
              </div>
              <p className="text-sm font-semibold tabular-nums">
                {formatMoney(item.unitPriceCents, currency)}
              </p>
            </li>
          ))}
        </ul>

        <dl className="mt-4 flex items-center justify-between rounded-2xl border border-border bg-muted/40 px-5 py-4">
          <dt className="text-sm font-semibold">Total paid</dt>
          <dd className="text-lg font-bold tabular-nums">
            {formatMoney(view.totalCents, currency)}
          </dd>
        </dl>
      </div>
    );
  }

  // --- Active hold --------------------------------------------------------
  const { hold, items, event, secondsRemaining } = view;
  const currency = hold.currency;
  const backHref = `/marketplace/events/${event.slug}`;
  const isAlmostUp = secondsRemaining <= 60;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10">
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-4",
          isAlmostUp
            ? "border-destructive/30 bg-destructive/5"
            : "border-primary/30 bg-primary/5",
        )}
      >
        <div>
          <p className="text-sm font-semibold">Seats held for you</p>
          <p className="text-xs text-muted-foreground">
            Complete payment before the timer runs out — nothing has been charged yet.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <CheckoutCountdown expiresAt={hold.expiresAt} />
          <ReleaseSeatsButton holdId={holdId} backHref={backHref} />
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-card">
            <div className="border-b border-border px-5 py-4">
              <h1 className="text-base font-semibold tracking-tight">
                {event.homeTeam} <span className="font-normal text-muted-foreground">vs</span>{" "}
                {event.awayTeam}
              </h1>
              <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="size-3" />
                  {formatEventDateTime(event.startsAt)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3" />
                  {event.venueName}, {event.venueCity}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Mail className="size-3" />
                  {hold.seatIds.length} ticket{hold.seatIds.length === 1 ? "" : "s"}
                </span>
              </p>
            </div>

            <ul className="divide-y divide-border">
              {items.map((item) => {
                const quality = viewQualityMeta(item.viewQuality);
                const saving = discountPercent(item.originalPriceCents, item.priceCents);

                return (
                  <li key={item.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted font-mono text-xs font-bold">
                      {item.sectionCode}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">
                        Row {item.rowLabel} · Seat {item.seatNumber}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">{item.sectionName}</p>
                      {item.viewNote && (
                        <p className="truncate text-[11px] text-muted-foreground">{item.viewNote}</p>
                      )}
                    </div>

                    <span
                      title={quality.description}
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                        quality.badgeClass,
                      )}
                    >
                      {quality.short}
                    </span>

                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold tabular-nums">
                        {formatMoney(item.priceCents, currency)}
                      </p>
                      {saving > 0 && item.originalPriceCents && (
                        <p className="text-[11px] text-muted-foreground line-through tabular-nums">
                          {formatMoney(item.originalPriceCents, currency, { compact: true })}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <p className="rounded-2xl border border-border bg-muted/40 p-4 text-[11px] leading-relaxed text-muted-foreground">
            Your seats are locked for exactly ten minutes from when you requested them. If the timer
            runs out, the reservation disappears automatically and the seats go back on sale — you will
            not be charged.
          </p>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold tracking-tight">Order summary</h2>

            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="font-semibold tabular-nums">{formatMoney(hold.subtotalCents, currency)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Service fee</dt>
                <dd className="font-semibold tabular-nums">{formatMoney(hold.serviceFeeCents, currency)}</dd>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                <dt className="font-semibold">Total</dt>
                <dd className="text-lg font-bold tabular-nums text-primary">
                  {formatMoney(hold.totalCents, currency)}
                </dd>
              </div>
            </dl>

            <div className="mt-5">
              <PayButton holdId={holdId} totalCents={hold.totalCents} currency={currency} />
            </div>

            <p className="mt-4 text-center text-[11px] text-muted-foreground">
              Reference <span className="font-mono">{hold.holdId.slice(0, 8)}</span>
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

/**
 * Shared layout for the terminal states (unknown link, expired hold): a centred
 * icon, one honest sentence and a way back into the funnel.
 */
function CenteredState({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center px-4 py-24 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon}
      </span>
      <h1 className="mt-4 text-xl font-bold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
      <div className="mt-6">{action}</div>
    </div>
  );
}
