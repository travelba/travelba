"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BusyBar } from "@/components/crm/BusyBar";
import { Icon } from "@/components/crm/icons";
import { CHAUFFEUR_EUR, CHECKIN_EUR, GREETER_ADULT_EUR } from "@/lib/crm/extras";

type OfferKey = "offer_chauffeur" | "offer_greeter" | "offer_checkin";

const OFFERS: {
  key: OfferKey;
  title: string;
  note: string;
  price: string;
  icon: string;
}[] = [
  {
    key: "offer_chauffeur",
    title: "Chauffeur",
    note: "Transfert domicile ou hôtel, collé au vol.",
    price: `${CHAUFFEUR_EUR} € le trajet`,
    icon: "airport_shuttle",
  },
  {
    key: "offer_greeter",
    title: "VIP Airport",
    note: "Accueil, Fast Track, au départ et à l’arrivée.",
    price: `${GREETER_ADULT_EUR} € par adulte`,
    icon: "verified_user",
  },
  {
    key: "offer_checkin",
    title: "Enregistrement",
    note: "L’agence enregistre les passagers.",
    price: `${CHECKIN_EUR} € par passager`,
    icon: "airplane_ticket",
  },
];

export function ServiceOfferToggles({
  bookingId,
  chauffeur,
  greeter,
  checkin,
  hasFlight,
}: {
  bookingId: string;
  chauffeur: boolean;
  greeter: boolean;
  checkin: boolean;
  hasFlight: boolean;
}) {
  const router = useRouter();
  const [on, setOn] = useState({
    offer_chauffeur: chauffeur,
    offer_greeter: greeter,
    offer_checkin: checkin,
  });
  const [busy, setBusy] = useState<OfferKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(key: OfferKey) {
    if (!hasFlight || busy) return;
    const next = !on[key];
    setOn((current) => ({ ...current, [key]: next }));
    setBusy(key);
    setError(null);
    const res = await fetch(`/api/admin/bookings/${bookingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: next }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(null);
    if (!res.ok) {
      setOn((current) => ({ ...current, [key]: !next }));
      setError(json.error || "Enregistrement impossible.");
      return;
    }
    router.refresh();
  }

  return (
    <section className="admin-af-card overflow-hidden rounded-3xl">
      <div className="border-b border-[#e8e4dc] px-5 py-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">Services proposés</p>
        <h2 className="mt-1 font-display text-lg font-bold text-[#0b192c]">Dans cette réservation</h2>
        <p className="mt-1 max-w-xl text-sm text-[#44474c]">
          {hasFlight
            ? "Rien n’est proposé au client tant que vous ne l’activez pas."
            : "Disponible lorsqu’un vol est dans le dossier."}
        </p>
      </div>
      <ul className="grid gap-px bg-[#e8e4dc] sm:grid-cols-2">
        {OFFERS.map((offer) => {
          const enabled = on[offer.key];
          const saving = busy === offer.key;
          return (
            <li key={offer.key} className="bg-white px-5 py-4">
              <div className="flex items-start gap-3">
                <span
                  className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                    enabled ? "bg-[#0b192c] text-[#faf9f6]" : "bg-[#f3f1ea] text-[#0b192c]"
                  }`}
                >
                  <Icon name={offer.icon} className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-base font-bold text-[#0b192c]">{offer.title}</p>
                  <p className="mt-0.5 text-sm text-[#44474c]">{offer.note}</p>
                  <p className="mt-1 text-xs font-semibold text-[#9e7e51]">{offer.price}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  aria-label={enabled ? `Retirer ${offer.title}` : `Proposer ${offer.title}`}
                  disabled={!hasFlight || busy !== null}
                  onClick={() => void toggle(offer.key)}
                  className={`relative mt-1 h-7 w-12 shrink-0 rounded-full transition disabled:opacity-40 ${
                    enabled ? "bg-[#0b192c]" : "bg-[#e5e3dc]"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${
                      enabled ? "left-5" : "left-0.5"
                    }`}
                  />
                </button>
              </div>
              {saving ? (
                <div className="mt-3">
                  <BusyBar label="Enregistrement…" />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {error ? <p className="px-5 py-3 text-sm text-red-700">{error}</p> : null}
    </section>
  );
}
