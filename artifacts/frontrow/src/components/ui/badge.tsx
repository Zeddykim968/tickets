import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Pill badge used for status and metadata throughout the marketplace. The
 * variants map one-to-one onto the app's semantics: `success` (available),
 * `warning` (scarcity), `danger` (errors / obstructed), `accent` (deals),
 * `muted` (sold out / delisted).
 */

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-tight whitespace-nowrap [&_svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/10 text-primary",
        accent: "border-accent/25 bg-accent/15 text-accent-foreground",
        success: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        warning: "border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300",
        danger: "border-destructive/25 bg-destructive/10 text-destructive",
        outline: "border-border bg-transparent text-muted-foreground",
        muted: "border-transparent bg-muted text-muted-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export type BadgeProps = React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>;

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
