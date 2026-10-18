import { ArrowRight, Clock, Eye, Lock, MapPinned, Sparkles, Wallet } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * Marketing landing page.
 *
 * Fully static - no data reads, so it is prerendered at build time and served
 * from the edge. The four features below are the product's actual answer to
 * "why buy here": exact seats, honest views, a guaranteed hold window, and
 * verified payment.
 */

const FEATURES = [
  {
    icon: MapPinned,
    title: "Pick the exact seat",
    body: "An interactive bowl: tap a section, see the live price from the cheapest seat in it, then drill down to individual rows.",
  },
  {
    icon: Eye,
    title: "Know the view before you pay",
    body: "Every listing carries a view-quality flag — clear, restricted or obstructed — plus the seller's own note.",
  },
  {
    icon: Clock,
    title: "10 minutes, guaranteed",
    body: "Seats are reserved with a Redis TTL the moment you ask. Nobody can double-sell them while you check out.",
  },
  {
    icon: Wallet,
    title: "Pay how you like",
    body: "Cards, bank transfer and USSD through Paystack. Orders are only fulfilled after the webhook verifies the amount.",
  },
];

export default function HomePage() {
  return (
    <>
      <section className="stadium-glow border-b border-border">
        <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:py-28">
          <Badge variant="success" className="mb-5">
            <Sparkles />
            Live seat maps · real availability
          </Badge>

          <h1 className="max-w-3xl text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
            Football tickets,{" "}
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              seat by seat
            </span>
          </h1>

          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            FrontRow is a resale marketplace for live sport. Browse the stadium, compare rows against
            face value, hold what you want for ten minutes and pay securely.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link href="/marketplace">
                Browse tickets
                <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/sell">Sell your seats</Link>
            </Button>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="size-3" />
              No account needed to buy
            </p>
          </div>

          <dl className="mt-14 grid max-w-3xl grid-cols-2 gap-6 sm:grid-cols-3">
            {[
              { value: "10 min", label: "seat hold window" },
              { value: "Redis TTL", label: "atomic reservations" },
              { value: "Paystack", label: "verified payments" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl border border-border bg-card/70 px-4 py-3">
                <dt className="text-lg font-bold tracking-tight">{stat.value}</dt>
                <dd className="text-xs text-muted-foreground">{stat.label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-16">
        <h2 className="text-2xl font-semibold tracking-tight">How the marketplace works</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="group rounded-2xl border border-border bg-card p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <feature.icon className="size-5" />
              </span>
              <h3 className="mt-4 text-sm font-semibold">{feature.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{feature.body}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
