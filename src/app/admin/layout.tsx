import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">FrontRow</p>
          <p className="mt-1 text-sm text-muted-foreground">Private administration</p>
        </div>
        <p className="text-xs text-muted-foreground">Signed in as {session.email}</p>
      </header>
      {children}
    </div>
  );
}
