export default function Loading() {
  return (
    <div className="animate-pulse space-y-5" aria-hidden>
      <div className="space-y-2">
        <div className="h-3 w-36 rounded bg-[var(--admin-peach)]" />
        <div className="h-8 w-48 rounded-lg bg-[var(--admin-peach)]" />
        <div className="h-3 w-full max-w-xs rounded bg-[#efece6]" />
      </div>
      <div className="h-72 rounded-2xl bg-white ring-1 ring-[#e5e3dc]" />
      <div className="h-44 rounded-2xl bg-white ring-1 ring-[#e5e3dc]" />
      <div className="h-36 rounded-2xl bg-white ring-1 ring-[#e5e3dc]" />
    </div>
  );
}
