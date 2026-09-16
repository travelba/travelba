export default function AdminLoading() {
  return (
    <div className="space-y-4 animate-pulse" aria-busy="true" aria-live="polite">
      <div className="h-3 w-24 rounded-full bg-[var(--admin-sky)]/50" />
      <div className="h-8 w-56 rounded-xl bg-[var(--admin-sky)]/70" />
      <div className="h-4 w-full max-w-md rounded-lg bg-[var(--admin-sky)]/40" />
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div className="h-28 rounded-2xl bg-white/80 ring-1 ring-[var(--border)]" />
        <div className="h-28 rounded-2xl bg-white/80 ring-1 ring-[var(--border)]" />
        <div className="h-28 rounded-2xl bg-white/80 ring-1 ring-[var(--border)]" />
      </div>
      <p className="pt-2 text-sm text-muted">Chargement…</p>
    </div>
  );
}
