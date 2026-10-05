/** Squelette de « Vous » : quatre plis sous l’en-tête du layout. */
export default function Loading() {
  return (
    <div className="animate-pulse space-y-3" aria-hidden="true">
      <div className="space-y-3 rounded-xl border border-[#e3e2e0]/70 bg-white px-4 py-3">
        <div className="h-10 rounded-lg bg-[#f3f1ea]" />
        <div className="h-10 rounded-lg bg-[#f3f1ea]" />
        <div className="h-10 rounded-lg bg-[#f3f1ea]" />
        <div className="h-10 rounded-lg bg-[#f3f1ea]" />
      </div>
      <div className="h-14 rounded-2xl bg-white ring-1 ring-[#e5e3dc]" />
    </div>
  );
}
