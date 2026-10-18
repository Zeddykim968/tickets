import { AlertTriangle, Ban, Eye, Sparkles, type LucideIcon } from "lucide-react";
import type { ViewQuality } from "./types";

/**
 * Presentation metadata for the "Clear view" / "Restricted view" flags that
 * appear on both the section cards and the individual listing rows. Keeping it
 * in one map is what guarantees the badge means the same thing everywhere.
 */
export const VIEW_QUALITY_META: Record<
  ViewQuality,
  {
    label: string;
    short: string;
    description: string;
    icon: LucideIcon;
    badgeClass: string;
    rank: number;
  }
> = {
  premium: {
    label: "Premium view",
    short: "Premium",
    description: "Centre-line or elevated sightline with no obstructions.",
    icon: Sparkles,
    badgeClass: "border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300",
    rank: 0,
  },
  clear: {
    label: "Clear view",
    short: "Clear view",
    description: "Full view of the pitch; no known obstructions.",
    icon: Eye,
    badgeClass: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    rank: 1,
  },
  restricted: {
    label: "Restricted view",
    short: "Restricted",
    description: "Part of the pitch may be blocked by a pillar, rail or roof.",
    icon: AlertTriangle,
    badgeClass: "border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300",
    rank: 2,
  },
  obstructed: {
    label: "Obstructed view",
    short: "Obstructed",
    description: "A large part of the pitch is not visible from this seat.",
    icon: Ban,
    badgeClass: "border-destructive/25 bg-destructive/10 text-destructive",
    rank: 3,
  },
};

export type AvailabilityTone = {
  label: string;
  badgeClass: string;
  dotClass: string;
  barClass: string;
  /** Drives the "live scarcity" pulse animation on the dot. */
  urgent: boolean;
  soldOut: boolean;
};

const SOLD_OUT_TONE: AvailabilityTone = {
  label: "Sold out",
  badgeClass: "border-transparent bg-muted text-muted-foreground",
  dotClass: "bg-muted-foreground/50",
  barClass: "bg-muted-foreground/30",
  urgent: false,
  soldOut: true,
};

/**
 * Scarcity colouring. The thresholds are the whole point of the badge: a buyer
 * scans the stadium map and needs "3 left" to look different from "104 seats".
 */
export function availabilityTone(available: number, total: number): AvailabilityTone {
  if (total === 0) {
    return {
      label: "No listings",
      badgeClass: "border-border bg-transparent text-muted-foreground",
      dotClass: "bg-muted-foreground/40",
      barClass: "bg-muted-foreground/20",
      urgent: false,
      soldOut: true,
    };
  }

  if (available === 0) return SOLD_OUT_TONE;

  if (available <= 5) {
    return {
      label: available === 1 ? "Last seat" : `${available} left`,
      badgeClass:
        "border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300",
      dotClass: "bg-amber-500",
      barClass: "bg-amber-500",
      urgent: true,
      soldOut: false,
    };
  }

  return {
    label: `${available} seats`,      badgeClass:
        "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    dotClass: "bg-emerald-500",
    barClass: "bg-emerald-500",
    urgent: false,
    soldOut: false,
  };
}

export function viewQualityMeta(quality: ViewQuality) {
  return VIEW_QUALITY_META[quality];
}
