"use client";

import { Loader2, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { releaseHoldAction } from "@/features/holds/actions";

export type ReleaseSeatsButtonProps = {
  holdId: string;
  /** Where to send the buyer after the seats go back on sale. */
  backHref: string;
};

/**
 * Giving the seats back is a first-class action, not just a closed tab.
 * The TTL would collect them anyway, but the next buyer gets them immediately.
 */
export function ReleaseSeatsButton({ holdId, backHref }: ReleaseSeatsButtonProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function handleRelease() {
    setIsPending(true);
    await releaseHoldAction(holdId);
    router.push(backHref);
    router.refresh();
  }

  return (
    <Button type="button" variant="ghost" size="sm" onClick={handleRelease} disabled={isPending}>
      {isPending ? <Loader2 className="animate-spin" /> : <Undo2 />}
      Release these seats
    </Button>
  );
}
