import { tripProposalStatusCopy } from "@/lib/crm/trip-costs";

/** La place des propositions, pendant la lecture de la file. */
export function TripProposalSearch() {
  const label = tripProposalStatusCopy("loading");
  return (
    <div className="rounded-2xl border border-[var(--admin-gold)]/40 bg-[#fbf7ef] px-4 py-3" role="status" aria-live="polite" aria-busy="true">
      <div className="animate-pulse space-y-2" aria-hidden>
        <div className="h-3 w-40 rounded-full bg-[var(--admin-gold)]/30" />
        <div className="h-10 rounded-xl bg-white/80" />
      </div>
      <p className="mt-2 text-sm text-muted">{label}</p>
    </div>
  );
}

/** La file n’a pas répondu. Le reste du bloc reste en place. */
export function TripProposalError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#faf9f6] px-4 py-3" role="status">
      <p className="text-sm text-muted">{tripProposalStatusCopy("error")}</p>
      <button type="button" onClick={onRetry} className="admin-tap text-sm font-semibold text-[#9e7e51] underline">
        Réessayer
      </button>
    </div>
  );
}
