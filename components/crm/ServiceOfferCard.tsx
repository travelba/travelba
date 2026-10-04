"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AddressSuggest } from "@/components/crm/AddressSuggest";
import { BusyBar } from "@/components/crm/BusyBar";
import { ConfirmAction } from "@/components/crm/ConfirmAction";
import { Icon } from "@/components/crm/icons";
import { IssuesList } from "@/components/crm/IssuesList";
import { issuesFromResponse, issuesSummary, type BookingIssue } from "@/lib/crm/booking-issues";
import { CLIENT_PREVIEW_NOTE, useClientPreview } from "@/components/account/client-preview";
import { HIDDEN_PRICE_LABEL, kindIcon } from "@/lib/crm/carnet";
import { addressCity } from "@/lib/crm/address-suggest";
import { extraAgencyStatus, serviceClock, storedTransferAddresses, type ServiceOffer } from "@/lib/crm/extras";
import { formatDateFr, formatMoney } from "@/lib/crm/money";
import { BOOKING_ITEM_LABELS, type CrmBookingItem } from "@/lib/crm/types";

const PRIMARY_BTN =
  "inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--admin-navy)] px-4 text-sm font-semibold text-white disabled:opacity-50";
const SECONDARY_BTN =
  "inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--border)] bg-white px-4 text-sm font-semibold text-[var(--admin-navy)] disabled:opacity-50";
const LINK_BTN = "inline-flex min-h-11 items-center px-2 text-sm font-semibold text-muted";

export function ServiceOfferCard({
  offer,
  existing,
  variant,
  bookingId,
  reference,
  price,
  currency,
  locked,
  homeAddress,
  detail,
  pricesVisible = true,
}: {
  offer: ServiceOffer;
  existing: CrmBookingItem | null;
  variant: "admin" | "client";
  bookingId: string;
  reference: string;
  price: number;
  currency: string;
  locked: boolean;
  homeAddress?: string | null;
  detail?: string | null;
  pricesVisible?: boolean;
}) {
  const router = useRouter();
  const preview = useClientPreview();
  const saved =
    offer.kind === "chauffeur" ? storedTransferAddresses(offer, homeAddress, existing?.details) : { depart: "", arrive: "" };
  const [depart, setDepart] = useState(saved.depart);
  const [arrive, setArrive] = useState(saved.arrive);
  const [busy, setBusy] = useState<"validate" | "cancel" | "confirm" | "save" | null>(null);
  /** « Valider » ouvre le récapitulatif ; la demande ne part qu’à « Confirmer la demande ». */
  const [review, setReview] = useState(false);
  const [gone, setGone] = useState(false);
  const [issues, setIssues] = useState<BookingIssue[]>([]);
  const isAdmin = variant === "admin";
  const clock = serviceClock(offer.whenIso);
  const kindLabel = BOOKING_ITEM_LABELS[offer.kind];
  const confirmed = existing ? extraAgencyStatus(existing) === "confirmed" : false;
  const addressesDirty = depart.trim() !== saved.depart || arrive.trim() !== saved.arrive;
  const statusLabel = !existing
    ? locked
      ? "Jusqu’à 48 h avant le vol"
      : "Non validé"
    : confirmed
      ? "Confirmé"
      : "En attente de confirmation";
  const priceLabel = pricesVisible ? formatMoney(price, currency) : HIDDEN_PRICE_LABEL;
  const endpoint = isAdmin ? `/api/admin/bookings/${bookingId}/extras` : `/api/client/bookings/${reference}/extras`;
  const whenLabel = [offer.day ? formatDateFr(offer.day) : null, clock || null].filter(Boolean).join(" · ");

  function addressBody(addresses = false) {
    return {
      kind: offer.kind,
      leg: offer.leg,
      place: offer.place,
      moment: offer.moment,
      depart: offer.kind === "chauffeur" ? depart.trim() : null,
      arrive: offer.kind === "chauffeur" ? arrive.trim() : null,
      address: offer.kind === "chauffeur" ? depart.trim() : null,
      addresses,
    };
  }

  async function post(body: Record<string, unknown>) {
    try {
      const res = await fetch(endpoint, {
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

  async function request() {
    if (offer.kind === "chauffeur" && (!depart.trim() || !arrive.trim())) {
      setIssues([{ field: "address", message: "Indiquez l’adresse de départ et l’adresse d’arrivée." }]);
      return;
    }
    if (preview) {
      setIssues([{ field: "preview", message: CLIENT_PREVIEW_NOTE }]);
      return;
    }
    setBusy("validate");
    setIssues([]);
    const result = await post(addressBody());
    setBusy(null);
    if (!result.ok) {
      setIssues(result.issues);
      return;
    }
    setReview(false);
    router.refresh();
  }

  async function cancel() {
    if (!existing || busy || confirmed) return;
    if (preview) {
      setIssues([{ field: "preview", message: CLIENT_PREVIEW_NOTE }]);
      return;
    }
    setBusy("cancel");
    setIssues([]);
    const result = await post({
      cancel: true,
      kind: offer.kind,
      leg: offer.leg,
      place: offer.place,
      moment: offer.moment,
    });
    setBusy(null);
    if (!result.ok) {
      setIssues(result.issues);
      return;
    }
    router.refresh();
  }

  async function refuse() {
    if (busy || existing || isAdmin) return { ok: false, error: "Cette proposition ne peut plus être masquée." };
    if (preview) return { ok: false, error: CLIENT_PREVIEW_NOTE };
    setIssues([]);
    const result = await post({
      decline: true,
      kind: offer.kind,
      leg: offer.leg,
      place: offer.place,
      moment: offer.moment,
    });
    if (!result.ok) return { ok: false, error: issuesSummary(result.issues) || "La proposition n’a pas pu être masquée." };
    setGone(true);
    router.refresh();
    return { ok: true };
  }

  async function saveAddresses() {
    if (!existing || busy || confirmed || offer.kind !== "chauffeur") return;
    if (!depart.trim() || !arrive.trim()) {
      setIssues([{ field: "address", message: "Indiquez l’adresse de départ et l’adresse d’arrivée." }]);
      return;
    }
    if (preview) {
      setIssues([{ field: "preview", message: CLIENT_PREVIEW_NOTE }]);
      return;
    }
    setBusy("save");
    setIssues([]);
    const result = await post(addressBody(true));
    setBusy(null);
    if (!result.ok) {
      setIssues(result.issues);
      return;
    }
    router.refresh();
  }

  async function confirm() {
    if (!existing || !isAdmin || busy || confirmed) return;
    setBusy("confirm");
    setIssues([]);
    const result = await post({
      confirm: true,
      kind: offer.kind,
      leg: offer.leg,
      place: offer.place,
      moment: offer.moment,
    });
    setBusy(null);
    if (!result.ok) {
      setIssues(result.issues);
      return;
    }
    router.refresh();
  }

  function openReview() {
    setIssues([]);
    setReview(true);
  }

  function closeReview() {
    setIssues([]);
    setDepart(saved.depart);
    setArrive(saved.arrive);
    setReview(false);
  }

  function controls() {
    if (existing) {
      if (confirmed) return null;
      return (
        <span className="flex flex-wrap items-center justify-end gap-2">
          {offer.kind === "chauffeur" && addressesDirty ? (
            <button type="button" disabled={busy !== null} onClick={() => void saveAddresses()} className={PRIMARY_BTN}>
              {busy === "save" ? "…" : "Enregistrer"}
            </button>
          ) : null}
          {isAdmin ? (
            <button type="button" disabled={busy !== null} onClick={() => void confirm()} className={PRIMARY_BTN}>
              {busy === "confirm" ? "…" : "Confirmer"}
            </button>
          ) : null}
          <button type="button" disabled={busy !== null} onClick={() => void cancel()} className={SECONDARY_BTN}>
            {busy === "cancel" ? "…" : "Annuler"}
          </button>
        </span>
      );
    }
    if (locked || review) return null;
    return (
      <span className="flex flex-wrap items-center justify-end gap-2">
        {!isAdmin ? (
          <ConfirmAction
            label="Refuser"
            question="Masquer cette proposition ?"
            hint="Elle ne sera plus affichée pour ce vol. L’agence reste joignable pour la rouvrir."
            confirmLabel="Masquer"
            busyLabel="Un instant…"
            className={LINK_BTN}
            confirmClassName={PRIMARY_BTN}
            onConfirm={refuse}
          />
        ) : null}
        <button type="button" disabled={busy !== null} onClick={openReview} className={PRIMARY_BTN}>
          Valider
        </button>
      </span>
    );
  }

  if (gone) return null;

  const showAddresses = offer.kind === "chauffeur" && (Boolean(existing) || review);

  return (
    <article
      className={
        existing
          ? "w-full min-w-0 rounded-2xl border border-[#e5e3dc] bg-white"
          : "w-full min-w-0 rounded-2xl border border-dashed border-[var(--admin-gold)] bg-[#faf9f6]"
      }
    >
      <div className="flex min-w-0 items-start gap-3 px-3.5 pt-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--admin-peach)] text-[var(--admin-navy)]">
          <Icon name={kindIcon(offer.kind)} className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--admin-gold)]">
            {statusLabel}
          </p>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--aura-blue)]">
            {kindLabel}
            {clock ? ` · ${clock}` : ""}
          </p>
          <p className="break-words text-sm font-semibold leading-snug text-[var(--admin-navy)]">{offer.route}</p>
          {offer.kind === "chauffeur" ? null : (
            <p className="break-words text-xs text-muted">{[detail, offer.flightLine].filter(Boolean).join(" · ")}</p>
          )}
        </div>
      </div>
      {review ? null : (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 pb-3 pt-2">
          <span className="text-sm font-bold text-[var(--admin-navy)]">{priceLabel}</span>
          {controls()}
        </div>
      )}
      {review ? (
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
              <dd className="font-medium text-[var(--admin-navy)]">
                {kindLabel} · {offer.route}
              </dd>
            </div>
            {whenLabel ? (
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wide text-muted">Horaire</dt>
                <dd className="font-medium text-[var(--admin-navy)]">{whenLabel}</dd>
              </div>
            ) : null}
            {detail || offer.flightLine ? (
              <div className="sm:col-span-2">
                <dt className="text-[10px] font-bold uppercase tracking-wide text-muted">Détail</dt>
                <dd className="font-medium text-[var(--admin-navy)]">{[detail, offer.flightLine].filter(Boolean).join(" · ")}</dd>
              </div>
            ) : null}
            <div className="sm:col-span-2">
              <dt className="text-[10px] font-bold uppercase tracking-wide text-muted">Prix</dt>
              <dd className="font-bold text-[var(--admin-navy)]">{priceLabel}</dd>
            </div>
          </dl>
          {pricesVisible ? null : (
            <p className="text-xs text-muted">Le prix est communiqué par l’agence à la publication du séjour.</p>
          )}
          {showAddresses ? (
            <div className="grid gap-2">
              <AddressSuggest
                label="Départ"
                value={depart}
                onChange={setDepart}
                readOnly={false}
                near={addressCity(saved.depart) || addressCity(homeAddress)}
              />
              <AddressSuggest
                label="Arrivée"
                value={arrive}
                onChange={setArrive}
                readOnly={false}
                near={addressCity(saved.arrive) || addressCity(offer.airport)}
              />
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy !== null} onClick={() => void request()} className={`${PRIMARY_BTN} flex-1`}>
              {busy === "validate" ? "Envoi…" : "Confirmer la demande"}
            </button>
            <button type="button" disabled={busy !== null} onClick={closeReview} className={`${SECONDARY_BTN} flex-1`}>
              Annuler
            </button>
          </div>
        </div>
      ) : null}
      {showAddresses && !review ? (
        <div className="grid gap-2 px-3.5 pb-3">
          <AddressSuggest
            label="Départ"
            value={depart}
            onChange={setDepart}
            readOnly={confirmed}
            near={addressCity(saved.depart) || addressCity(homeAddress)}
          />
          <AddressSuggest
            label="Arrivée"
            value={arrive}
            onChange={setArrive}
            readOnly={confirmed}
            near={addressCity(saved.arrive) || addressCity(offer.airport)}
          />
          {offer.flightLine ? <p className="text-xs text-muted">{offer.flightLine}</p> : null}
        </div>
      ) : null}
      {busy ? (
        <div className="px-3.5 pb-3">
          <BusyBar
            label={
              busy === "cancel"
                ? "Annulation…"
                : busy === "confirm"
                  ? "Confirmation…"
                  : busy === "save"
                    ? "Enregistrement…"
                    : "Envoi de la demande…"
            }
          />
        </div>
      ) : null}
      {issues.length ? (
        <div className="px-3.5 pb-3">
          <IssuesList issues={issues} />
        </div>
      ) : null}
    </article>
  );
}
