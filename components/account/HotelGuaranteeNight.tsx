"use client";

import { BusyBar } from "@/components/crm/BusyBar";
import { Icon } from "@/components/crm/icons";

const TRUST = "Votre carte sert uniquement de garantie. Elle est conservée par un partenaire de paiement sécurisé.";

/** Étape Garantie, variante Nuit : panneau marine, formulaire dans un écrin clair. */
export function HotelGuaranteeNight({
  widgetUrl,
  state,
  onLoad,
}: {
  widgetUrl: string;
  state: "loading" | "ready" | "saved";
  onLoad?: () => void;
}) {
  return (
    <div className="min-h-full space-y-6 px-5 pb-10 pt-4" data-hotel-card="1" data-guarantee="nuit" style={{ background: "#0B192C", color: "#f7f4ee" }}>
      <div className="space-y-2">
        <p className="text-[13px] font-semibold" style={{ color: "#C5A880" }}>Paiement sécurisé</p>
        <h1 className="h-serif text-[1.7rem] leading-[1.15]">Garantie de la réservation</h1>
      </div>
      <p className="flex items-start gap-2.5 text-sm leading-relaxed text-[#f7f4ee]/85">
        <Icon name="lock" className="mt-0.5 h-4 w-4 shrink-0 text-[#C5A880]" />
        <span>{TRUST}</span>
      </p>
      {state === "loading" ? (
        <div className="space-y-3" data-hotel-card-state="loading">
          <p className="text-sm">Le formulaire sécurisé se charge…</p>
          <BusyBar active tone="light" label="Formulaire sécurisé" />
        </div>
      ) : null}
      {state === "saved" ? (
        <p className="h-serif text-[1.15rem] leading-snug" data-hotel-card-state="saved">
          Carte enregistrée.
        </p>
      ) : (
        <div className="rounded-2xl bg-[#f7f4ee] p-1.5">
          <iframe
            title="Garantie de la réservation"
            src={widgetUrl}
            referrerPolicy="no-referrer"
            onLoad={onLoad}
            className="block h-[520px] w-full rounded-xl border-0 bg-white"
          />
        </div>
      )}
      <p className="pb-24 text-center text-[13px] text-[#f7f4ee]/80">Validez dans le formulaire.</p>
    </div>
  );
}
