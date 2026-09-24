"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IssuesList } from "@/components/crm/IssuesList";
import { issuesFromResponse, type BookingIssue } from "@/lib/crm/booking-issues";
import {
  bookingHasFlight,
  CHECKIN_EUR,
  checkinFeeAmount,
  findCheckinExtra,
  findVisaExtra,
  isServiceRefused,
  VISA_EUR,
  type ServiceRefusal,
} from "@/lib/crm/extras";
import { formatMoney } from "@/lib/crm/money";
import { BusyBar } from "@/components/crm/BusyBar";
import { Icon } from "@/components/crm/icons";
import type { FrenchPassportTrip } from "@/lib/crm/visa-trip";
import type { CrmBooking, CrmBookingItem, CrmBookingTraveler, CrmCompanion, CrmCustomer } from "@/lib/crm/types";

export function ExtrasPanel({
  variant,
  booking,
  items,
  travelers,
  formalities = null,
  refusals = [],
}: {
  variant: "admin" | "client";
  booking: CrmBooking;
  items: CrmBookingItem[];
  travelers: CrmBookingTraveler[];
  holder: CrmCustomer;
  companions: CrmCompanion[];
  whatsappHref?: string;
  formalities?: Pick<FrenchPassportTrip, "needsFormality" | "passengers" | "amount"> | null;
  refusals?: ServiceRefusal[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [issues, setIssues] = useState<BookingIssue[]>([]);
  if (!bookingHasFlight(items)) return null;
  const isAdmin = variant === "admin";
  const passengers = Math.max(1, travelers.length || formalities?.passengers || 1);

  async function request(kind: "checkin" | "visa") {
    setBusy(kind);
    setIssues([]);
    const url =
      variant === "admin"
        ? `/api/admin/bookings/${booking.id}/extras`
        : `/api/client/bookings/${booking.reference}/extras`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setIssues(issuesFromResponse(json));
      return;
    }
    router.refresh();
  }

  async function refuse(kind: "checkin" | "visa") {
    if (isAdmin || busy) return;
    setHidden((current) => (current.includes(kind) ? current : [...current, kind]));
    setIssues([]);
    const res = await fetch(`/api/client/bookings/${booking.reference}/extras`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decline: true, kind }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setHidden((current) => current.filter((row) => row !== kind));
      setIssues(issuesFromResponse(json));
      return;
    }
    router.refresh();
  }

  async function cancel(kind: "checkin" | "visa", itemId: string) {
    if (busy) return;
    setBusy(`cancel:${itemId}`);
    setIssues([]);
    const res = isAdmin
      ? await fetch(`/api/admin/bookings/${booking.id}/items?itemId=${encodeURIComponent(itemId)}`, {
          method: "DELETE",
        })
      : await fetch(`/api/client/bookings/${booking.reference}/extras`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cancel: true, kind }),
        });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setIssues(issuesFromResponse(json));
      return;
    }
    router.refresh();
  }

  function serviceCard(input: {
    kind: "checkin" | "visa";
    title: string;
    icon: string;
    note: string;
    amount: number;
    count: number;
    existing: CrmBookingItem | null;
  }) {
    const status = input.existing ? "Validé" : "Non validé";
    const priceLabel = formatMoney(input.amount, booking.currency);
    const subtitle = `${status} · ${input.note} · ${input.count} passager${input.count > 1 ? "s" : ""}`;
    const pending = busy === input.kind || (input.existing && busy === `cancel:${input.existing.id}`);
    const refuseButton =
      !input.existing && !isAdmin ? (
        <button
          type="button"
          onClick={() => void refuse(input.kind)}
          className="inline-flex h-5 items-center text-[11px] font-semibold leading-none text-muted"
        >
          Refuser
        </button>
      ) : null;
    const validate = input.existing ? (
      <button
        type="button"
        className="inline-flex h-5 items-center justify-center rounded-full bg-[var(--admin-navy)] px-2.5 text-[11px] font-semibold leading-none text-white disabled:opacity-50"
        disabled={busy !== null}
        onClick={() => void cancel(input.kind, input.existing!.id)}
      >
        {busy === `cancel:${input.existing.id}` ? "…" : "Annuler"}
      </button>
    ) : (
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => void request(input.kind)}
        className="inline-flex h-5 items-center justify-center rounded-full bg-[var(--admin-navy)] px-2.5 text-[11px] font-semibold leading-none text-white disabled:opacity-50"
      >
        {busy === input.kind ? "…" : "Valider"}
      </button>
    );

    return (
      <article
        key={input.kind}
        className={
          input.existing
            ? "w-full min-w-0 overflow-hidden rounded-2xl border border-[#e5e3dc] bg-white"
            : "w-full min-w-0 overflow-hidden rounded-2xl border border-dashed border-[var(--admin-gold)] bg-[#faf9f6]"
        }
      >
        <div className="flex min-w-0 items-start gap-3 overflow-hidden px-3.5 py-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--admin-peach)] text-[var(--admin-navy)]">
            <Icon name={input.icon} className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1 overflow-hidden">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--aura-blue)]">{input.title}</p>
            <p className="break-words text-sm font-semibold leading-snug text-[var(--admin-navy)]">{input.note}</p>
            <p className="truncate text-xs text-muted" title={subtitle}>
              {subtitle}
            </p>
            <p className="mt-1 flex items-center justify-between gap-2 sm:hidden">
              <span className="text-sm font-bold text-[var(--admin-navy)]">{priceLabel}</span>
              <span className="inline-flex items-center gap-2">
                {refuseButton}
                {validate}
              </span>
            </p>
          </div>
          <div className="hidden shrink-0 items-start gap-2 sm:flex">
            <p className="max-w-[7.5rem] text-right text-sm font-bold leading-snug text-[var(--admin-navy)]">{priceLabel}</p>
            <span className="inline-flex items-center gap-2">
              {refuseButton}
              {validate}
            </span>
          </div>
        </div>
        {pending ? (
          <div className="px-3.5 pb-3">
            <BusyBar label={busy?.startsWith("cancel") ? "Annulation…" : "Validation…"} />
          </div>
        ) : null}
      </article>
    );
  }

  const checkin = findCheckinExtra(items) as CrmBookingItem | null;
  const visa = findVisaExtra(items) as CrmBookingItem | null;
  const checkinGone =
    !checkin && (hidden.includes("checkin") || isServiceRefused(refusals, { kind: "checkin" }));
  const visaGone = !visa && (hidden.includes("visa") || isServiceRefused(refusals, { kind: "visa" }));
  const showVisa = Boolean(formalities?.needsFormality) && !visaGone;
  if (checkinGone && !showVisa) return null;

  return (
    <section className="space-y-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
          Services de l’agence
        </p>
        <h2 className="mt-1 font-display text-lg font-bold text-[var(--admin-navy)]">À la carte</h2>
        <p className="mt-1 text-sm text-muted">Enregistrement et formalités, par passager.</p>
      </div>
      {checkinGone
        ? null
        : serviceCard({
            kind: "checkin",
            title: "Enregistrement",
            icon: "airplane_ticket",
            note: `${CHECKIN_EUR} € par passager`,
            amount: checkinFeeAmount(passengers),
            count: passengers,
            existing: checkin,
          })}
      {showVisa
        ? serviceCard({
            kind: "visa",
            title: "Obtention du visa",
            icon: "description",
            note: `${VISA_EUR} € par passager, hors frais du visa`,
            amount: formalities?.amount || (formalities?.passengers || passengers) * VISA_EUR,
            count: formalities?.passengers || passengers,
            existing: visa,
          })
        : null}
      <IssuesList issues={issues} />
    </section>
  );
}
