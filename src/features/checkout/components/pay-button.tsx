"use client";

import { AlertCircle, CreditCard, Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { CurrencyCode } from "@/features/events/types";
import { formatMoney } from "@/lib/money";

export type PayButtonProps = {
  holdId: string;
  totalCents: number;
  currency: CurrencyCode;
  disabled?: boolean;
};

/**
 * Creates a NOWPayments invoice and hands the browser over to its hosted checkout.
 */
export function PayButton({ holdId, totalCents, currency, disabled }: PayButtonProps) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePay() {
    if (isPending) return;
    setIsPending(true);
    setError(null);

    try {
      const response = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdId }),
      });
      const result = (await response.json()) as { payUrl?: string; error?: string };
      if (!response.ok || !result.payUrl) {
        setIsPending(false);
        setError(result.error ?? "NOWPayments could not start that payment. Please try again.");
        return;
      }

      window.location.assign(result.payUrl);
    } catch (requestError) {
      console.error("[checkout] NOWPayments request failed:", requestError);
      setIsPending(false);
      setError("Something went wrong starting the payment. Please try again.");
    }
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
            Opening NOWPayments…
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
        Secured by NOWPayments · cryptocurrency
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
