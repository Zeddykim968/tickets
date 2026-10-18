"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type HoldCountdownProps = {
  /** ISO timestamp of the Redis TTL deadline. */
  expiresAt: string;
  /** Fired once, the first time the countdown reaches zero. */
  onExpired?: () => void;
  className?: string;
};

/**
 * Counts down to the hold deadline.
 *
 * The first render intentionally shows a placeholder: rendering a
 * server-computed clock time would hydrate against a different client clock
 * and produce a mismatch. Real time only appears after mount.
 */
export function HoldCountdown({ expiresAt, onExpired, className }: HoldCountdownProps) {
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  useEffect(() => {
    const deadline = new Date(expiresAt).getTime();
    let fired = false;

    const tick = () => {
      const next = Math.max(0, deadline - Date.now());
      setRemainingMs(next);

      if (next === 0 && !fired) {
        fired = true;
        onExpired?.();
      }
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt, onExpired]);

  const totalSeconds = remainingMs === null ? null : Math.floor(remainingMs / 1000);
  const minutes = totalSeconds === null ? null : Math.floor(totalSeconds / 60);
  const seconds = totalSeconds === null ? null : totalSeconds % 60;

  const isCritical = totalSeconds !== null && totalSeconds <= 60;
  const isExpired = totalSeconds === 0;

  return (
    <span
      role="timer"
      aria-live={isCritical ? "assertive" : "off"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-sm font-bold tabular-nums transition-colors",
        isExpired
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : isCritical
            ? "border-destructive/30 bg-destructive/10 text-destructive motion-safe:animate-pulse"
            : "border-primary/30 bg-primary/10 text-primary",
        className,
      )}
    >
      {minutes === null ? "--:--" : `${minutes}:${String(seconds ?? 0).padStart(2, "0")}`}
    </span>
  );
}
