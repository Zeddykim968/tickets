"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function SiteShell({
  children,
  header,
  footer,
}: {
  children: ReactNode;
  header: ReactNode;
  footer: ReactNode;
}) {
  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith("/admin") ?? false;

  return (
    <div className="flex min-h-dvh flex-col bg-background font-sans text-foreground antialiased">
      {!isAdminRoute && header}
      <div className="flex-1">{children}</div>
      {!isAdminRoute && footer}
    </div>
  );
}
