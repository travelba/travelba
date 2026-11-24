import { HOTEL_ACCESS_LINES, HOTEL_ACCESS_RESERVE } from "@/lib/crm/hotel-search-home";
import { TRAVEL_CLUB_NAME, TRAVEL_CLUB_RANK } from "@/lib/crm/signup-options";

/** Carte de membre. Pas de numéro, pas de puce, pas de date d’expiration bancaire. */
export function PlatinumInviteCard({ firstName, lastName }: { firstName: string; lastName: string }) {
  const name = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
  return (
    <div className="rounded-2xl border border-[#d7dde6] bg-[#0B192C] px-3.5 py-2.5 text-[#f4f1ea] shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] sm:px-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#d5dbe3]">{TRAVEL_CLUB_NAME}</p>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#d5dbe3]">1 an</p>
      </div>
      <p className="mt-2 bg-gradient-to-r from-[#f7f8f8] via-[#c5cdd6] to-[#8e98a6] bg-clip-text font-display text-[1.65rem] font-extrabold leading-none tracking-tight text-transparent sm:text-3xl">
        {TRAVEL_CLUB_RANK}
      </p>
      <p className="mt-2 truncate text-sm font-semibold text-[#f7f4ee]">{name || "Votre nom"}</p>
    </div>
  );
}

/** Avantages déjà affichés sur la carte Platinum du club. Le prix du palier n’y est pas. */
export function PlatinumInviteRights() {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#8A7349]">Votre adhésion vous donne droit à</p>
      <ul className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] leading-snug text-[#0B192C] sm:text-xs">
        {HOTEL_ACCESS_LINES.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="mt-1 text-[10px] leading-snug text-[#5c6570]">{HOTEL_ACCESS_RESERVE}</p>
    </div>
  );
}
