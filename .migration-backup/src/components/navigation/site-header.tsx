import { Ticket } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Global sticky header, rendered once in the root layout. Stays a server
 * component - no state, no client bundle - so it costs nothing beyond markup.
 */


const NAV_LINKS = [
  { href: "/marketplace", label: "Events" },
  { href: "/marketplace?view=weekend", label: "This weekend" },
  { href: "/sell", label: "Sell tickets" },
  { href: "/help", label: "Help" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-6 px-4">
        <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Ticket className="size-4" />
          </span>
          FrontRow
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/auth/login">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/marketplace">Browse tickets</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
