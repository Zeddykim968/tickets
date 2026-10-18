"use client";

import { AlertCircle, Armchair, ChevronUp, Loader2, Lock, ShieldCheck, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { CurrencyCode } from "@/features/events/types";
import { reserveSeats } from "@/features/holds/actions";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { selectSelectedSeats, useHoldStore } from "@/stores/hold-selection-store";

const EMAIL_STORAGE_KEY = "frontrow.buyerEmail";

export type HoldBarProps = {
  eventId: string;
  currency: CurrencyCode;
  /** Marketplace service fee in basis points, mirrored from the server. */
  feeBps: number;
  /** Server-configured hold lifetime, so the copy never contradicts the real TTL. */
  ttlSeconds: number;
};

/**
 * Sticky cart for the seat selection.
 *
 * The button is a two-step confirm (reveal the form, then submit) because a
 * misclick here costs the buyer a 10-minute window on seats they did not want.
 *
 * Totals shown here are *optimistic*: they are derived from prices the server
 * already rendered. `reserveSeats` recomputes everything from Postgres, so the
 * displayed subtotal is never the charged subtotal.
 */
export function HoldBar({ eventId, currency, feeBps, ttlSeconds }: HoldBarProps) {
  const selectedSeats = useHoldStore(selectSelectedSeats);
  const isSubmitting = useHoldStore((state) => state.isSubmitting);
  const errorMessage = useHoldStore((state) => state.errorMessage);
  const setError = useHoldStore((state) => state.setError);
  const setSubmitting = useHoldStore((state) => state.setSubmitting);
  const clearSelection = useHoldStore((state) => state.clearSelection);
  const removeSeats = useHoldStore((state) => state.removeSeats);
  const beginHold = useHoldStore((state) => state.beginHold);

  const router = useRouter();

  const [isExpanded, setIsExpanded] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");

  // Remember the buyer's email between sessions - it is the one field Paystack
  // genuinely needs, and retyping it on every purchase is hostile.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(EMAIL_STORAGE_KEY);
      if (saved) setEmail(saved);
    } catch {
      // Private mode / storage disabled: harmless, just start blank.
    }
  }, []);

  const count = selectedSeats.length;
  const isOpen = count > 0;

  const subtotalCents = useMemo(
    () => selectedSeats.reduce((sum, seat) => sum + seat.priceCents, 0),
    [selectedSeats],
  );
  const serviceFeeCents = useMemo(
    () => Math.round((subtotalCents * feeBps) / 10_000),
    [subtotalCents, feeBps],
  );
  const totalCents = subtotalCents + serviceFeeCents;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (count === 0 || isSubmitting) return;

    setSubmitting(true);
    setError(null);

    const result = await reserveSeats({
      eventId,
      seatIds: selectedSeats.map((seat) => seat.id),
      buyerEmail: email,
      buyerName: fullName.trim() || undefined,
    });

    if (!result.ok) {
      setSubmitting(false);
      setError(result.message);
      // A seat that lost the race must leave the cart immediately, otherwise
      // the next submit can only fail again.
      if (result.conflictingSeatIds?.length) {
        removeSeats(result.conflictingSeatIds);
        setIsExpanded(true);
      }
      return;
    }

    try {
      window.localStorage.setItem(EMAIL_STORAGE_KEY, email);
    } catch {
      // ignore
    }

    beginHold(result.holdId, result.expiresAt);
    router.push(result.redirectTo);
  }

  return (
    <>
      {/* Keeps the last listing reachable above the fixed bar. */}
      <div aria-hidden className={cn("transition-[height] duration-300", isOpen ? "h-40 sm:h-32" : "h-0")} />

      <aside
        aria-label="Seat selection"
        aria-hidden={!isOpen}
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 transition-transform duration-300 ease-out",
          isOpen ? "translate-y-0" : "pointer-events-none translate-y-full",
        )}
      >
        <div className="mx-auto w-full max-w-7xl px-4 pb-4">
          <div className="overflow-hidden rounded-2xl border border-border bg-card/95 shadow-2xl shadow-black/10 backdrop-blur-md">
            {/* Selected chips ------------------------------------------- */}
            <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
              <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold">
                <Armchair className="size-3.5 text-primary" />
                {count} seat{count === 1 ? "" : "s"}
              </span>

              <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto [scrollbar-width:none]">
                {selectedSeats.map((seat) => (
                  <button
                    key={seat.id}
                    type="button"
                    onClick={() => removeSeats([seat.id])}
                    title={`Remove ${seat.sectionCode} row ${seat.rowLabel} seat ${seat.seatNumber}`}
                    className="group inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <span className="font-mono font-bold">{seat.sectionCode}</span>
                    <span className="tabular-nums">
                      R{seat.rowLabel}·S{seat.seatNumber}
                    </span>
                    <X className="size-3 opacity-60 group-hover:opacity-100" />
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => {
                  clearSelection();
                  setIsExpanded(false);
                }}
                className="shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Clear
              </button>
            </div>

            {/* Totals + CTA -------------------------------------------- */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
              <dl className="flex items-center gap-4">
                <div className="text-[11px]">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd className="font-semibold tabular-nums">{formatMoney(subtotalCents, currency)}</dd>
                </div>
                <div className="text-[11px]">
                  <dt className="text-muted-foreground">Service fee</dt>
                  <dd className="font-semibold tabular-nums">{formatMoney(serviceFeeCents, currency)}</dd>
                </div>
                <div className="text-[11px]">
                  <dt className="text-muted-foreground">Total</dt>
                  <dd className="text-base font-bold tabular-nums text-primary">
                    {formatMoney(totalCents, currency)}
                  </dd>
                </div>
              </dl>

              <div className="ml-auto flex items-center gap-3">
                <p className="hidden items-center gap-1 text-[11px] text-muted-foreground sm:flex">
                  <Lock className="size-3" />
                  Held for {Math.round(ttlSeconds / 60)} minutes
                </p>

                <Button
                  type="button"
                  size="lg"
                  onClick={() => setIsExpanded((value) => !value)}
                  disabled={isSubmitting}
                  aria-expanded={isExpanded}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="animate-spin" />
                      Holding…
                    </>
                  ) : (
                    <>
                      Hold seats
                      <ChevronUp
                        className={cn("transition-transform duration-200", isExpanded && "rotate-180")}
                      />
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Confirm form -------------------------------------------- */}
            <div
              className={cn(
                "grid transition-[grid-template-rows] duration-300 ease-out",
                isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              <form onSubmit={handleSubmit} className="overflow-hidden">
                <div className="flex flex-wrap items-end gap-3 border-t border-border bg-muted/30 px-4 py-3">
                  <label className="flex min-w-[15rem] flex-1 flex-col gap-1">
                    <span className="text-[11px] font-semibold">Email for your tickets</span>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@example.com"
                      autoComplete="email"
                      className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring/60"
                    />
                  </label>

                  <label className="flex min-w-[12rem] flex-1 flex-col gap-1">
                    <span className="text-[11px] font-semibold">
                      Full name <span className="font-normal text-muted-foreground">(optional)</span>
                    </span>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      placeholder="Ada Obi"
                      autoComplete="name"
                      className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring/60"
                    />
                  </label>

                  <Button type="submit" size="lg" disabled={isSubmitting || count === 0} className="min-w-[12rem]">
                    {isSubmitting ? (
                      <>
                        <Loader2 className="animate-spin" />
                        Reserving…
                      </>
                    ) : (
                      <>
                        <ShieldCheck />
                        Reserve for {Math.round(ttlSeconds / 60)}:00
                      </>
                    )}
                  </Button>

                  <p className="w-full text-[11px] text-muted-foreground">
                    Paying is a separate step. We will not charge you until you confirm on Paystack.
                  </p>
                </div>
              </form>
            </div>

            {errorMessage && (
              <p
                role="alert"
                className="flex items-start gap-2 border-t border-destructive/20 bg-destructive/10 px-4 py-2 text-[11px] font-medium text-destructive"
              >
                <AlertCircle className="mt-px size-3.5 shrink-0" />
                {errorMessage}
              </p>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
