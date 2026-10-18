/**
 * Route-level loading skeleton, shown while a server component suspends. The
 * blocks deliberately mirror the marketplace layout (header, hero, 340px map
 * column, card grid) so the swap from skeleton to content barely moves.
 * `.skeleton` provides the sweep animation from globals.css.
 */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-10">
      <div className="skeleton h-8 w-72 rounded-lg" />
      <div className="skeleton h-40 w-full rounded-2xl" />
      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="skeleton h-80 rounded-2xl" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="skeleton h-44 rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
