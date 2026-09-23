"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { IssuesList } from "@/components/crm/IssuesList";
import { Icon } from "@/components/crm/icons";
import { issuesFromResponse, type BookingIssue } from "@/lib/crm/booking-issues";
import {
  bookingHasFlight,
  CHAUFFEUR_EUR,
  extraAmount,
  extraFlightAt,
  extraHeadsFromBooking,
  extraNoticeOk,
  extraTitle,
  findExtra,
  formatCustomerAddress,
  formatEuroWhole,
  GREETER_ADULT_EUR,
  GREETER_CHILD_EUR,
  greeterTariffLine,
  type ExtraKind,
  type ExtraLeg,
} from "@/lib/crm/extras";
import type { CrmBooking, CrmBookingItem, CrmBookingTraveler, CrmCompanion, CrmCustomer } from "@/lib/crm/types";

export function ExtrasPanel({
  variant,
  booking,
  items,
  travelers,
  holder,
  companions,
  whatsappHref,
}: {
  variant: "admin" | "client";
  booking: CrmBooking;
  items: CrmBookingItem[];
  travelers: CrmBookingTraveler[];
  holder: CrmCustomer;
  companions: CrmCompanion[];
  whatsappHref?: string;
}) {
  const router = useRouter();
  const [address, setAddress] = useState(() => formatCustomerAddress(holder));
  const [busy, setBusy] = useState<string | null>(null);
  const [issues, setIssues] = useState<BookingIssue[]>([]);
  const now = useMemo(() => new Date(), []);
  if (!bookingHasFlight(items)) return null;
  const headsAt = extraHeadsFromBooking({
    travelers,
    holder,
    companions,
    at: now,
  });
  const isAdmin = variant === "admin";
  const balanceNote = isAdmin
    ? "Ce montant s’ajoute à l’encours."
    : "Ce montant s’ajoute à votre solde.";

  async function request(kind: ExtraKind, leg: ExtraLeg) {
    setBusy(`${kind}:${leg}`);
    setIssues([]);
    const url =
      variant === "admin"
        ? `/api/admin/bookings/${booking.id}/extras`
        : `/api/client/bookings/${booking.reference}/extras`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, leg, address }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setIssues(issuesFromResponse(json));
      return;
    }
    router.refresh();
  }

  async function cancel(itemId: string) {
    if (variant !== "admin") return;
    setBusy(`cancel:${itemId}`);
    await fetch(`/api/admin/bookings/${booking.id}/items?itemId=${encodeURIComponent(itemId)}`, {
      method: "DELETE",
    });
    setBusy(null);
    router.refresh();
  }

  function row(kind: ExtraKind, leg: ExtraLeg) {
    const existing = findExtra(items, kind, leg) as CrmBookingItem | null;
    const at = extraFlightAt(items, leg, booking.start_date || booking.end_date);
    const windowOk = extraNoticeOk(at, now);
    const locked = !isAdmin && !windowOk;
    const label = extraTitle(kind, leg);
    const price =
      kind === "chauffeur"
        ? `${formatEuroWhole(extraAmount("chauffeur"))} par trajet`
        : greeterTariffLine(headsAt.adults, headsAt.children);
    return (
      <div key={`${kind}-${leg}`} className="rounded-xl border border-border px-3 py-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-[var(--admin-navy)]">{label}</p>
            <p className="text-sm font-semibold text-[var(--admin-navy)]">{price}</p>
            <p className="text-xs text-muted">{balanceNote}</p>
            {locked ? (
              <p className="mt-1 text-xs text-accent">
                Disponible jusqu’à 48 h avant le vol.{" "}
                {whatsappHref ? (
                  <a href={whatsappHref} className="font-semibold underline" target="_blank" rel="noreferrer">
                    Contacter l’agence
                  </a>
                ) : null}
              </p>
            ) : null}
          </div>
          {existing ? (
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[var(--admin-sky)] px-2 py-0.5 text-[10px] font-bold uppercase">
                Demandé
              </span>
              {isAdmin ? (
                <button
                  type="button"
                  className="text-xs font-semibold text-accent"
                  disabled={busy !== null}
                  onClick={() => void cancel(existing.id)}
                >
                  Annuler
                </button>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              disabled={busy !== null || locked}
              onClick={() => void request(kind, leg)}
              className="rounded-full bg-[var(--admin-navy)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy === `${kind}:${leg}` ? "…" : "Demander"}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
          Services de l’agence
        </p>
        <h2 className="mt-1 font-display text-lg font-bold text-[var(--admin-navy)]">À la demande</h2>
        <p className="mt-1 text-sm text-muted">
          Ces services s’ajoutent à votre vol, au départ comme à l’arrivée.
        </p>
      </div>
      <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
        Adresse de prise en charge (chauffeur privé)
        <input
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          className="rounded-xl border border-border px-3 py-2 text-sm font-normal text-[var(--admin-navy)]"
        />
      </label>
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-[var(--admin-navy)]">
          <Icon name="chauffeur" className="h-4 w-4" />
          <p className="text-xs font-bold uppercase tracking-[0.12em]">Chauffeur privé</p>
        </div>
        <p className="text-sm text-muted">
          Un chauffeur privé vous prend en charge à l’adresse indiquée et vous dépose à l’aéroport. Le
          véhicule est prévu 2 h 30 avant le décollage. Au retour, il vous attend à la sortie et vous
          ramène à cette adresse.
        </p>
        <p className="text-sm font-semibold text-[var(--admin-navy)]">
          {formatEuroWhole(CHAUFFEUR_EUR)} par trajet
        </p>
        {row("chauffeur", "departure")}
        {row("chauffeur", "arrival")}
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-[var(--admin-navy)]">
          <Icon name="greeter" className="h-4 w-4" />
          <p className="text-xs font-bold uppercase tracking-[0.12em]">Greeter</p>
        </div>
        <p className="text-sm text-muted">
          Un greeter vous accueille à l’aéroport : enregistrement, passage de la sûreté, jusqu’à la porte
          ou au salon. À l’arrivée, il vous attend à la sortie et vous accompagne jusqu’au chauffeur.
        </p>
        <p className="text-sm font-semibold text-[var(--admin-navy)]">
          {formatEuroWhole(GREETER_ADULT_EUR)} par adulte, {formatEuroWhole(GREETER_CHILD_EUR)} par enfant,
          par trajet.
        </p>
        <p className="text-xs text-muted">
          {headsAt.adults} adulte{headsAt.adults > 1 ? "s" : ""} · {headsAt.children} enfant
          {headsAt.children > 1 ? "s" : ""}
          {headsAt.missingBirth
            ? ` · ${headsAt.missingBirth} sans date de naissance (compté adulte)`
            : ""}
        </p>
        {row("greeter", "departure")}
        {row("greeter", "arrival")}
      </div>
      <IssuesList issues={issues} />
    </section>
  );
}
