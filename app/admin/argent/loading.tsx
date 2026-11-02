export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-hidden>
      <div className="h-3 w-28 rounded bg-[var(--admin-peach)]" />
      <div className="h-8 w-48 max-w-full rounded-lg bg-[var(--admin-peach)]" />
      <div className="h-4 w-full max-w-md rounded bg-[#ece9e2]" />
      <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        <div className="h-16 rounded-2xl bg-[#f3eee4]" />
        <div className="h-16 rounded-2xl bg-[#f3eee4]" />
        <div className="h-16 rounded-2xl bg-[#f3eee4]" />
        <div className="h-16 rounded-2xl bg-[var(--admin-navy)]/85" />
      </div>
      <div className="grid grid-cols-2 gap-1 rounded-full bg-[#e9e8e5] p-1 xl:hidden">
        <div className="h-10 rounded-full bg-[var(--admin-navy)]/80" />
        <div className="h-10" />
      </div>
      <div className="h-11 w-full rounded-full bg-[var(--admin-navy)]/70 lg:hidden" />
      <div className="divide-y divide-[#e5e3dc] overflow-hidden rounded-2xl bg-white ring-1 ring-[#e5e3dc]">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-16" />
        ))}
      </div>
    </div>
  );
}
