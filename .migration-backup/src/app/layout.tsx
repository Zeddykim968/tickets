/**
 * Root layout: wraps every route with the site header/footer and the Tailwind
 * theme. `suppressHydrationWarning` on <html> is deliberate - a theme
 * switcher that toggles the `dark` class before hydration would otherwise
 * warn, and the class strategy in globals.css needs that freedom.
 */
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/navigation/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "FrontRow — pick your exact seat",
    template: "%s · FrontRow",
  },
  description:
    "A live-sport ticket marketplace. Browse real seat maps with live availability, compare row-by-row views and pay securely with Paystack.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  openGraph: {
    type: "website",
    title: "FrontRow — pick your exact seat",
    description: "Real seat maps, live availability and a 10-minute hold while you check out.",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fdfdfd" },
    { media: "(prefers-color-scheme: dark)", color: "#101317" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-dvh flex-col bg-background font-sans text-foreground antialiased">
        <SiteHeader />
        <main className="flex-1">{children}</main>

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
      </body>
    </html>
  );
}
