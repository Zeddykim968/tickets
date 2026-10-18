"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { SESSION_COOKIE } from "./constants";

/**
 * ⚠️ DEMO AUTH - NOT PRODUCTION.
 *
 * There is no password, no user table and no session store here: this action
 * exists so the route guard in `src/middleware.ts` is demonstrable end to end.
 * Replace it with Auth.js / Clerk / Supabase before shipping, keep the same
 * cookie contract, and the middleware needs no changes.
 */
const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  next: z.string().optional(),
});

function safeRedirectTarget(candidate: string | undefined) {
  // Only allow same-origin relative paths: an open redirect is a phishing gift.
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) return "/marketplace";
  return candidate;
}

export async function signInAction(formData: FormData): Promise<void> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    next: formData.get("next") ?? undefined,
  });

  if (!parsed.success) {
    redirect("/auth/login?error=email");
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, parsed.data.email, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  redirect(safeRedirectTarget(parsed.data.next));
}

export async function signOutAction(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  redirect("/marketplace");
}
