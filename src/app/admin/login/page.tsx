import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { adminSignInAction } from "./actions";
import { getAdminSession } from "@/lib/admin/auth";

export const metadata: Metadata = {
  title: "Admin sign in",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getAdminSession()) redirect("/admin");
  const { error } = await searchParams;

  return (
    <main className="mx-auto w-full max-w-md px-4 py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">FrontRow control</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">Admin sign in</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Admin access is provisioned through server environment variables. There is no public
        registration.
      </p>

      {error && (
        <p role="alert" className="mt-5 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          The credentials were not accepted.
        </p>
      )}

      <form action={adminSignInAction} className="mt-7 space-y-4">
        <label className="grid gap-1.5 text-sm font-medium">
          Email
          <input
            type="email"
            name="email"
            required
            autoComplete="username"
            className="h-11 rounded-xl border border-input bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Password
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            className="h-11 rounded-xl border border-input bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          />
        </label>
        <button
          type="submit"
          className="h-11 w-full rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
        >
          Sign in to admin
        </button>
      </form>
    </main>
  );
}
