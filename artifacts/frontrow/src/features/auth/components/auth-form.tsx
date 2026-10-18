import { AlertCircle, ArrowRight, Ticket } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { signInAction } from "@/features/auth/actions";

export type AuthFormProps = {
  mode: "login" | "register";
  next?: string;
  error?: string;
};

const COPY = {
  login: {
    title: "Sign in",
    subtitle: "Access your orders, saved seats and seller dashboard.",
    cta: "Sign in",
    footerText: "New to FrontRow?",
    footerLink: "/auth/register",
    footerLabel: "Create an account",
  },
  register: {
    title: "Create your account",
    subtitle: "Buy in seconds and relist tickets you can't use.",
    cta: "Create account",
    footerText: "Already have an account?",
    footerLink: "/auth/login",
    footerLabel: "Sign in",
  },
} as const;

/**
 * A plain server-rendered form posting to a server action: it works with
 * JavaScript disabled and needs no client bundle.
 */
export function AuthForm({ mode, next, error }: AuthFormProps) {
  const copy = COPY[mode];

  return (
    <div className="mx-auto w-full max-w-md px-4 py-16">
      <div className="mb-6 flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Ticket className="size-4" />
        </span>
        <span className="font-bold tracking-tight">FrontRow</span>
      </div>

      <h1 className="text-2xl font-bold tracking-tight">{copy.title}</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">{copy.subtitle}</p>

      {error && (
        <p
          role="alert"
          className="mt-5 flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
        >
          <AlertCircle className="mt-px size-3.5 shrink-0" />
          {error === "email"
            ? "That email address doesn't look right."
            : "Something went wrong. Try again."}
        </p>
      )}

      <form action={signInAction} className="mt-6 space-y-4">
        {next && <input type="hidden" name="next" value={next} />}

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold">Email</span>
          <input
            type="email"
            name="email"
            required
            placeholder="you@example.com"
            autoComplete="email"
            className="h-11 rounded-xl border border-input bg-background px-3 text-sm outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring/60"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold">Password</span>
          <input
            type="password"
            name="password"
            required
            placeholder="••••••••"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            minLength={8}
            className="h-11 rounded-xl border border-input bg-background px-3 text-sm outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring/60"
          />
        </label>

        <Button type="submit" size="lg" className="w-full">
          {copy.cta}
          <ArrowRight />
        </Button>
      </form>

      <p className="mt-5 text-center text-xs text-muted-foreground">
        {copy.footerText}{" "}
        <Link href={copy.footerLink} className="font-semibold text-primary hover:underline">
          {copy.footerLabel}
        </Link>
      </p>

      <p className="mt-8 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-800 dark:text-amber-200">
        Demo authentication: no password is checked and no account is created. The email is stored in a
        cookie so the protected-route guard can be demonstrated. Replace with Auth.js, Clerk or Supabase
        before production.
      </p>
    </div>
  );
}
