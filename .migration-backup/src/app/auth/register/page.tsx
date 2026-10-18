import type { Metadata } from "next";
import { AuthForm } from "@/features/auth/components/auth-form";

/**
 * Registration page. Reuses the same `AuthForm` as login with different copy:
 * in the demo both submit to `signInAction`, which sets the session cookie
 * without checking a password (see the warning in auth-form.tsx).
 */

export const metadata: Metadata = {
  title: "Create an account",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<{ next?: string; error?: string }>;
};

export default async function RegisterPage({ searchParams }: PageProps) {
  const { next, error } = await searchParams;

  return <AuthForm mode="register" next={next} error={error} />;
}
