"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AvailabilityPayload, SectionAvailability } from "@/features/events/types";
import { AVAILABILITY_POLL_MS } from "@/features/holds/constants";

export type EventAvailabilityState = {
  data: AvailabilityPayload;
  isRefreshing: boolean;
  /** True while serving a snapshot older than the last successful poll. */
  isStale: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

/**
 * Polls the availability endpoint on an interval and merges the result over the
 * server-rendered snapshot.
 *
 * Deliberate choices:
 *  - The initial payload comes from the server component, so there is no
 *    loading flash on first paint.
 *  - A failed poll keeps the *last known good* payload and only flips
 *    `isStale`. Flashing "sold out" because of one dropped packet would be a
 *    worse lie than slightly old data.
 *  - Polling pauses while the tab is hidden and refreshes immediately on
 *    return, which is the behaviour buyers actually notice.
 */
export function useEventAvailability(
  eventId: string,
  initialData: AvailabilityPayload,
): EventAvailabilityState {
  const [data, setData] = useState<AvailabilityPayload>(initialData);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    // Never let a slow poll stack up behind the interval.
    if (inFlight.current) return;
    inFlight.current = true;
    setIsRefreshing(true);

    try {
      const response = await fetch(`/api/events/${eventId}/availability`, {
        cache: "no-store",
        headers: { accept: "application/json" },
      });

      if (!response.ok) throw new Error(`availability request failed (${response.status})`);

      const payload = (await response.json()) as AvailabilityPayload;
      if (!mounted.current) return;

      setData(payload);
      setError(null);
    } catch (cause) {
      if (!mounted.current) return;
      setError(cause instanceof Error ? cause.message : "Could not refresh availability");
    } finally {
      inFlight.current = false;
      if (mounted.current) setIsRefreshing(false);
    }
  }, [eventId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      // A background tab does not need to poll; the refresh below catches up.
      if (document.visibilityState === "visible") void refresh();
    }, AVAILABILITY_POLL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };

    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  return { data, isRefreshing, isStale: error !== null, error, refresh };
}

/** O(1) per-section lookup for the card list and the stadium map. */
export function indexAvailabilityBySection(payload: AvailabilityPayload) {
  // Tuple annotation keeps `new Map` happy without relying on inference.
  return new Map<string, SectionAvailability>(
    payload.sections.map((section): [string, SectionAvailability] => [section.sectionId, section]),
  );
}

/** Seats currently inside somebody's 10-minute window. */
export function lockedSeatSet(payload: AvailabilityPayload) {
  return new Set(payload.lockedSeatIds);
}
