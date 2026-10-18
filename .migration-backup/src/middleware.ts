import { NextResponse, type NextRequest } from "next/server";
import { PROTECTED_PREFIXES, SESSION_COOKIE } from "@/features/auth/constants";

/**
 * Edge middleware. Runs before every matched request, so it stays free of
 * database, Redis and node:crypto imports - `SESSION_COOKIE` and
 * `PROTECTED_PREFIXES` are plain strings on purpose.
 *
 * Two jobs:
 *  1. Permanently redirect the legacy `/events/:slug` URLs so shared links
 *     and search results keep working after the route moved under
 *     `/marketplace`.
 *  2. Guard authenticated-only areas. **Checkout is deliberately unprotected**:
 *     guest checkout converts far better in ticketing, and the 10-minute hold
 *     already prevents abuse of unavailable inventory.
 */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith("/events/")) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.replace(/^\/events\//, "/marketplace/events/");
    return NextResponse.redirect(url, 308);
  }

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtected && !request.cookies.has(SESSION_COOKIE)) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    url.search = `?next=${encodeURIComponent(`${pathname}${search}`)}`;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/events/:path*", "/account", "/account/:path*", "/sell", "/sell/:path*"],
};
