import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-xs text-muted-foreground">
        <p>© {new Date().getFullYear()} FrontRow Marketplace. Demo project — no real tickets.</p>
        <nav className="flex gap-4">
          <Link href="/marketplace" className="transition-colors hover:text-foreground">
            Events
          </Link>
          <Link href="/help" className="transition-colors hover:text-foreground">
            Help
          </Link>
          <Link href="/auth/login" className="transition-colors hover:text-foreground">
            Sign in
          </Link>
        </nav>
      </div>
    </footer>
  );
}
