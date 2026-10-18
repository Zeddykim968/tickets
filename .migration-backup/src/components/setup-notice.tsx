import { DatabaseZap } from "lucide-react";

/**
 * Friendly degradation banner rendered by pages whose data read failed -
 * typically a fresh clone with no `.env.local`, where `getDb()` throws on
 * connect. The optional `detail` carries the underlying error for debugging.
 * Pairs with `tryQuery` in `lib/safe-query.ts`, which catches instead of 500ing.
 */

export function SetupNotice({ detail }: { detail?: string }) {
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5">
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-200">
        <DatabaseZap className="size-4" />
        Data layer not configured
      </p>
      <p className="mt-1.5 text-xs text-amber-800/80 dark:text-amber-200/80">
        The page rendered without live data. Copy <code className="font-mono">.env.example</code> to{" "}
        <code className="font-mono">.env.local</code>, then run{" "}
        <code className="font-mono">npm run db:push</code> and{" "}
        <code className="font-mono">npm run db:seed</code> to create the demo stadium.
      </p>
      {detail && (
        <p className="mt-2 truncate font-mono text-[11px] text-amber-800/70 dark:text-amber-200/70">
          {detail}
        </p>
      )}
    </div>
  );
}
