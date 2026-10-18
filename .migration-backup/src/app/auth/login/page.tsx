import type { Metadata } from "next";
import { AuthForm } from "@/features/auth/components/auth-form";

/**
 * Sign-in page. Reads `?next=` (where the middleware redirected from) and
 * `?error=email` (set by the action on a validation failure) from the URL and
 * forwards both to the shared `AuthForm`.
 */

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<{ next?: string; error?: string }>;
};

export default async function LoginPage({ searchParams }: PageProps) {
  const { next, error } = await searchParams;

  return <AuthForm mode="login" next={next} error={error} />;
}
