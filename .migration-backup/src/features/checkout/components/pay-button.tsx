"use client";

import { AlertCircle, CreditCard, Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { initializePaymentAction } from "@/features/checkout/actions";
import type { CurrencyCode } from "@/features/events/types";
import { formatMoney } from "@/lib/money";

export type PayButtonProps = {
  holdId: string;
  totalCents: number;
  currency: CurrencyCode;
  disabled?: boolean;
};

/**
 * Kicks off the Paystack transaction and hands the browser over to their
 * hosted checkout with a full-page navigation (`window.location.assign`).
 *
 * Paystack's checkout cannot be embedded in an iframe, so a client-side route
 * push would be wrong here.
 */
export function PayButton({ holdId, totalCents, currency, disabled }: PayButtonProps) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePay() {
    if (isPending) return;
    setIsPending(true);
    setError(null);

    const result = await initializePaymentAction({ holdId });

    if (!result.ok) {
      setIsPending(false);
      setError(result.message);
      return;
    }

    // Leave `isPending` true: the button should stay in its loading state
    // until the browser actually leaves the page.
    window.location.assign(result.authorizationUrl);
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        size="lg"
        className="w-full"
        onClick={handlePay}
        disabled={isPending || disabled}
      >
        {isPending ? (
          <>
            <Loader2 className="animate-spin" />
            Opening Paystack…
          </>
        ) : (
          <>
            <CreditCard />
            Pay {formatMoney(totalCents, currency)}
          </>
        )}
      </Button>

      <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
        <ShieldCheck className="size-3" />
        Secured by Paystack · cards, bank transfer and USSD
      </p>

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2 text-[11px] font-medium text-destructive"
        >
          <AlertCircle className="mt-px size-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
