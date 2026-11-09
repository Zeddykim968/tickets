/**
 * Root layout: wraps every route with the site header/footer and the Tailwind
 * theme. `suppressHydrationWarning` on <html> is deliberate - a theme
 * switcher that toggles the `dark` class before hydration would otherwise
 * warn, and the class strategy in globals.css needs that freedom.
 */
import type { Metadata, Viewport } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteShell } from "@/components/site-shell";
import { SiteHeader } from "@/components/navigation/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "FrontRow — pick your exact seat",
    template: "%s · FrontRow",
  },
  description:
    "A live-sport ticket marketplace. Browse real seat maps with live availability, compare row-by-row views and pay securely with NOWPayments.",
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
      <body>
        <SiteShell header={<SiteHeader />} footer={<SiteFooter />}>
          {children}
        </SiteShell>
      </body>
    </html>
  );
}
