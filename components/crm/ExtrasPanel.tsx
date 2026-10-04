"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CLIENT_PREVIEW_NOTE, useClientPreview } from "@/components/account/client-preview";
import { ConfirmAction } from "@/components/crm/ConfirmAction";
import { IssuesList } from "@/components/crm/IssuesList";
import { issuesFromResponse, issuesSummary, type BookingIssue } from "@/lib/crm/booking-issues";
import {
  bookingHasFlight,
  checkinProposed,
  CHECKIN_EUR,
  checkinFeeAmount,
  extraAgencyStatus,
  findCheckinExtra,
  findVisaExtra,
  isServiceRefused,
  VISA_EUR,
  type ServiceRefusal,
} from "@/lib/crm/extras";
import { HIDDEN_PRICE_LABEL } from "@/lib/crm/carnet";
import { formatMoney } from "@/lib/crm/money";
import { BusyBar } from "@/components/crm/BusyBar";
import { Icon } from "@/components/crm/icons";
import type { FrenchPassportTrip } from "@/lib/crm/visa-trip";
import type { CrmBooking, CrmBookingItem, CrmBookingTraveler, CrmCompanion, CrmCustomer } from "@/lib/crm/types";

const PRIMARY_BTN =
  "inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--admin-navy)] px-4 text-sm font-semibold text-white disabled:opacity-50";
const SECONDARY_BTN =
  "inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--border)] bg-white px-4 text-sm font-semibold text-[var(--admin-navy)] disabled:opacity-50";
const LINK_BTN = "inline-flex min-h-11 items-center px-2 text-sm font-semibold text-muted";

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
  const preview = useClientPreview();
  const [busy, setBusy] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  /** « Valider » ouvre le récapitulatif de ce service ; la demande part à « Confirmer la demande ». */
  const [review, setReview] = useState<"checkin" | "visa" | null>(null);
  const [issues, setIssues] = useState<BookingIssue[]>([]);
  if (!bookingHasFlight(items)) return null;
  const isAdmin = variant === "admin";
  const pricesVisible = isAdmin || booking.prices_visible !== false;
  const passengers = Math.max(1, travelers.length || formalities?.passengers || 1);

  async function post(url: string, body: Record<string, unknown>) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false as const, issues: issuesFromResponse(json) };
      return { ok: true as const, issues: [] as BookingIssue[] };
    } catch {
      return { ok: false as const, issues: [{ field: "network", message: "Connexion interrompue. Réessayez." }] };
    }
  }

  async function request(kind: "checkin" | "visa") {
    if (preview) {
      setIssues([{ field: "preview", message: CLIENT_PREVIEW_NOTE }]);
      return;
    }
    setBusy(kind);
    setIssues([]);
    const url =
      variant === "admin"
        ? `/api/admin/bookings/${booking.id}/extras`
        : `/api/client/bookings/${booking.reference}/extras`;
    const result = await post(url, { kind });
    setBusy(null);
    if (!result.ok) {
      setIssues(result.issues);
      return;
    }
    setReview(null);
    router.refresh();
  }

  async function refuse(kind: "checkin" | "visa") {
    if (isAdmin || busy) return { ok: false, error: "Cette proposition ne peut plus être masquée." };
    if (preview) return { ok: false, error: CLIENT_PREVIEW_NOTE };
    setIssues([]);
    const result = await post(`/api/client/bookings/${booking.reference}/extras`, { decline: true, kind });
    if (!result.ok) return { ok: false, error: issuesSummary(result.issues) || "La proposition n’a pas pu être masquée." };
    setHidden((current) => (current.includes(kind) ? current : [...current, kind]));
    router.refresh();
    return { ok: true };
  }

  async function confirmCheckin(itemId: string) {
    if (!isAdmin || busy) return;
    setBusy(`confirm:${itemId}`);
    setIssues([]);
    const res = await fetch(`/api/admin/bookings/${booking.id}/extras`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true, kind: "checkin" }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setIssues(issuesFromResponse(json));
      return;
    }
    router.refresh();
  }

  async function cancel(kind: "checkin" | "visa", itemId: string) {
    if (busy) return;
    if (preview) {
      setIssues([{ field: "preview", message: CLIENT_PREVIEW_NOTE }]);
      return;
    }
    setBusy(`cancel:${itemId}`);
    setIssues([]);
    const res = isAdmin && kind !== "checkin"
      ? await fetch(`/api/admin/bookings/${booking.id}/items?itemId=${encodeURIComponent(itemId)}`, {
          method: "DELETE",
        })
      : await fetch(isAdmin ? `/api/admin/bookings/${booking.id}/extras` : `/api/client/bookings/${booking.reference}/extras`, {
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
    const confirmed = input.existing ? extraAgencyStatus(input.existing) === "confirmed" : false;
    const status = !input.existing ? "Non validé" : confirmed ? "Confirmé" : "Validé";
    const priceLabel = pricesVisible ? formatMoney(input.amount, booking.currency) : HIDDEN_PRICE_LABEL;
    const subtitle = `${status} · ${input.note} · ${input.count} passager${input.count > 1 ? "s" : ""}`;
    const pending =
      busy === input.kind ||
      (input.existing && (busy === `cancel:${input.existing.id}` || busy === `confirm:${input.existing.id}`));
    const reviewing = review === input.kind && !input.existing;
    const refuseButton =
      !input.existing && !isAdmin && !reviewing ? (
        <ConfirmAction
          label="Refuser"
          question="Masquer cette proposition ?"
          hint="Elle ne sera plus affichée pour ce séjour. L’agence reste joignable pour la rouvrir."
          confirmLabel="Masquer"
          className={LINK_BTN}
          confirmClassName={PRIMARY_BTN}
          onConfirm={() => refuse(input.kind)}
        />
      ) : null;
    const validate = input.existing ? (
      confirmed ? null : (
        <span className="flex flex-wrap items-center justify-end gap-2">
          {isAdmin && input.kind === "checkin" ? (
            <button
              type="button"
              className={PRIMARY_BTN}
              disabled={busy !== null}
              onClick={() => void confirmCheckin(input.existing!.id)}
            >
              {busy === `confirm:${input.existing.id}` ? "…" : "Cartes déposées"}
            </button>
          ) : null}
          <button
            type="button"
            className={SECONDARY_BTN}
            disabled={busy !== null}
            onClick={() => void cancel(input.kind, input.existing!.id)}
          >
            {busy === `cancel:${input.existing.id}` ? "…" : "Annuler"}
          </button>
        </span>
      )
    ) : reviewing ? null : (
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => {
          setIssues([]);
          setReview(input.kind);
        }}
        className={PRIMARY_BTN}
      >
        Valider
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
        <div className="flex min-w-0 items-start gap-3 overflow-hidden px-3.5 pt-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--admin-peach)] text-[var(--admin-navy)]">
            <Icon name={input.icon} className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1 overflow-hidden">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--aura-blue)]">{input.title}</p>
            <p className="break-words text-sm font-semibold leading-snug text-[var(--admin-navy)]">{input.note}</p>
            <p className="break-words text-xs text-muted">{subtitle}</p>
          </div>
        </div>
        {reviewing ? null : (
          <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 pb-3 pt-2">
            <span className="text-sm font-bold text-[var(--admin-navy)]">{priceLabel}</span>
            <span className="flex flex-wrap items-center justify-end gap-2">
              {refuseButton}
              {validate}
            </span>
          </div>
        )}
        {reviewing ? (
          <div
            className="mx-3.5 mb-3 mt-2 space-y-3 rounded-xl border border-[var(--admin-gold)]/50 bg-white p-3"
            role="group"
            aria-label="Récapitulatif de la demande"
            aria-live="polite"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
              Récapitulatif de la demande
            </p>
            <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wide text-muted">Prestation</dt>
                <dd className="font-medium text-[var(--admin-navy)]">{input.title}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wide text-muted">Passagers</dt>
                <dd className="font-medium text-[var(--admin-navy)]">
                  {input.count} passager{input.count > 1 ? "s" : ""} · {input.note}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[10px] font-bold uppercase tracking-wide text-muted">Prix</dt>
                <dd className="font-bold text-[var(--admin-navy)]">{priceLabel}</dd>
              </div>
            </dl>
            {pricesVisible ? null : (
              <p className="text-xs text-muted">Le prix est communiqué par l’agence à la publication du séjour.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void request(input.kind)}
                className={`${PRIMARY_BTN} flex-1`}
              >
                {busy === input.kind ? "Envoi…" : "Confirmer la demande"}
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => {
                  setIssues([]);
                  setReview(null);
                }}
                className={`${SECONDARY_BTN} flex-1`}
              >
                Annuler
              </button>
            </div>
          </div>
        ) : null}
        {pending ? (
          <div className="px-3.5 pb-3">
            <BusyBar
              label={
                busy?.startsWith("cancel")
                  ? "Annulation…"
                  : busy?.startsWith("confirm")
                    ? "Confirmation…"
                    : "Envoi de la demande…"
              }
            />
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
  const showVisa = !formalities?.needsFormality && Boolean(visa) && !visaGone;
  const showCheckin =
    !isAdmin && !checkinGone && (checkinProposed(booking) || Boolean(checkin));
  if (!showCheckin && !showVisa) return null;

  return (
    <section className="space-y-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
          Services de l’agence
        </p>
        <h2 className="mt-1 font-display text-lg font-bold text-[var(--admin-navy)]">À la carte</h2>
        {showCheckin ? <p className="mt-1 text-sm text-muted">Enregistrement, par passager.</p> : null}
      </div>
      {showCheckin
        ? serviceCard({
            kind: "checkin",
            title: "Enregistrement",
            icon: "airplane_ticket",
            note: pricesVisible ? `${CHECKIN_EUR} € par passager` : "Par passager",
            amount: checkinFeeAmount(passengers),
            count: passengers,
            existing: checkin,
          })
        : null}
      {showVisa
        ? serviceCard({
            kind: "visa",
            title: "Obtention du visa",
            icon: "description",
            note: pricesVisible ? `${VISA_EUR} € par passager, hors frais du visa` : "Par passager, hors frais du visa",
            amount: formalities?.amount || (formalities?.passengers || passengers) * VISA_EUR,
            count: formalities?.passengers || passengers,
            existing: visa,
          })
        : null}
      <IssuesList issues={issues} />
    </section>
  );
}
