"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { HoldCountdown } from "@/features/holds/components/hold-countdown";

export type CheckoutCountdownProps = {
  expiresAt: string;
};

/**
 * When the clock hits zero the page must stop offering a "Pay" button, so we
 * ask the server to re-render: it will find the Redis keys gone and switch the
 * view to the `expired` state.
 */
export function CheckoutCountdown({ expiresAt }: CheckoutCountdownProps) {
  const router = useRouter();
  const handleExpired = useCallback(() => router.refresh(), [router]);

  return <HoldCountdown expiresAt={expiresAt} onExpired={handleExpired} />;
}
