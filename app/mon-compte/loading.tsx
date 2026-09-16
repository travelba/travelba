export default function AccountLoading() {
  return (
    <div className="space-y-4 animate-pulse" aria-busy="true" aria-live="polite">
      <div className="h-3 w-20 rounded-full bg-[var(--aura-blue-soft)]" />
      <div className="h-8 w-48 rounded-xl bg-[var(--aura-blue-soft)]" />
      <div className="h-4 w-full rounded-lg bg-slate-200/80" />
      <div className="mt-4 h-40 rounded-[1.5rem] bg-white ring-1 ring-slate-200" />
      <div className="h-24 rounded-[1.25rem] bg-white ring-1 ring-slate-200" />
      <p className="pt-2 text-sm text-muted">Chargement…</p>
    </div>
  );
}
