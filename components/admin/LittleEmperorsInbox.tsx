"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CustomerPickDialog } from "@/components/admin/CustomerPickDialog";
import { BusyBar } from "@/components/crm/BusyBar";
import { ConfirmAction } from "@/components/crm/ConfirmAction";
import { adminAction } from "@/lib/crm/admin-action";
import type { PickableCustomer } from "@/lib/crm/customer-search";
import { formatDateFr } from "@/lib/crm/money";
import { MYLER_SHEET, mylerRefreshNotice } from "@/lib/crm/myler-sheet";
import type { CrmLeBooking } from "@/lib/crm/types";

function isCancelledState(state: string | null) {
  const value = (state || "").trim().toLowerCase();
  return value === "cancelled" || value === "canceled";
}

const LATE_CANCEL =
  "La date limite d’annulation est passée. Écrivez à bookings@littleemperors.com : la politique d’annulation s’applique.";

function stateLabel(state: string | null) {
  const value = (state || "").trim().toLowerCase();
  if (value === "booked") return "Réservée";
  if (value === "cancelled" || value === "canceled") return "Annulée";
  return state || "État non indiqué";
}

function websiteHref(value: string | null) {
  if (!value) return null;
  return /^https?:\/\//i.test(value) ? value : null;
}

export function LittleEmperorsInbox({
  rows,
  customers,
  storageReady,
  configured,
  productionBlocked,
  webhookConfigured,
  agency,
  probe,
}: {
  rows: CrmLeBooking[];
  customers: PickableCustomer[];
  storageReady: boolean;
  configured: boolean;
  productionBlocked: boolean;
  webhookConfigured: boolean;
  agency: boolean;
  probe: { last_status: number | null; last_error: string | null; last_ok_at: string | null };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [attachId, setAttachId] = useState<string | null>(null);

  async function post(body: Record<string, string>) {
    setError(null);
    const response = await fetch("/api/admin/little-emperors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(json.error || "Opération impossible.");
      return null;
    }
    return json;
  }

  async function sync() {
    setBusy("sync");
    setNotice(null);
    const json = await post({ action: "sync" });
    setBusy(null);
    if (json?.ok) setNotice(mylerRefreshNotice(Number(json.fetched) || 0));
    router.refresh();
  }

  /** Confirmé sur la ligne : renvoie l’erreur pour l’afficher sous le bouton. */
  async function cancel(id: string) {
    const result = await adminAction("/api/admin/little-emperors", { method: "POST", body: { action: "cancel", id } });
    if (!result.ok) return result.error || "Annulation impossible.";
    router.refresh();
    return undefined;
  }

  async function attach(customer: PickableCustomer) {
    if (!attachId) return;
    const id = attachId;
    setAttachId(null);
    setBusy(id);
    const json = await post({ action: "attach", id, customer_id: customer.id });
    setBusy(null);
    if (json?.bookingId) router.push(`/admin/reservations/${json.bookingId}`);
  }

  return (
    <div className="space-y-4">
      {busy ? <BusyBar label="Little Emperors" /> : null}
      <section className="rounded-2xl border border-[#e5e3dc] bg-white p-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">{MYLER_SHEET.title}</p>
        <h2 className="mt-1 font-display text-lg font-bold text-[var(--admin-navy)]">{MYLER_SHEET.host}</h2>
        <p className="mt-3 text-sm font-semibold text-[var(--admin-navy)]">
          {configured && !productionBlocked ? MYLER_SHEET.keyOn : MYLER_SHEET.keyOff}
        </p>
        <p className="mt-2 text-sm text-[var(--admin-navy)]">{MYLER_SHEET.keyNote}</p>
        <p className="mt-3 rounded-xl bg-[#f8f4ee] px-3 py-2 text-sm text-[var(--admin-navy)]">{MYLER_SHEET.sso}</p>
        {productionBlocked ? (
          <p className="mt-2 text-sm text-[#8a5a2a]">Cet environnement n’appelle pas Little Emperors.</p>
        ) : null}
        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="font-medium text-[var(--admin-navy)]">Authentification</dt>
            <dd className="text-muted">{MYLER_SHEET.auth}</dd>
          </div>
          <div>
            <dt className="font-medium text-[var(--admin-navy)]">Routes v2</dt>
            <dd>
              <ul className="mt-1 space-y-1 font-mono text-xs text-[var(--admin-navy)]">
                {MYLER_SHEET.routes.map((route) => (
                  <li key={route}>{route}</li>
                ))}
              </ul>
            </dd>
          </div>
          <div>
            <dt className="font-medium text-[var(--admin-navy)]">Lecture</dt>
            <dd className="text-muted">{MYLER_SHEET.sync}</dd>
          </div>
          <div>
            <dt className="font-medium text-[var(--admin-navy)]">Webhook</dt>
            <dd className="break-all text-[var(--admin-navy)]">{MYLER_SHEET.webhook}</dd>
            <dd className="text-muted">En-tête {MYLER_SHEET.webhookHeader}</dd>
            <dd className="text-[var(--admin-navy)]">
              {webhookConfigured ? MYLER_SHEET.webhookOn : MYLER_SHEET.webhookOff}
            </dd>
          </div>
        </dl>
        {notice ? (
          <p className="mt-3 rounded-xl bg-[#f8f4ee] px-3 py-2 text-sm text-[var(--admin-navy)]">{notice}</p>
        ) : probe.last_error ? (
          <p className="mt-3 rounded-xl bg-[#f8f4ee] px-3 py-2 text-sm text-[var(--admin-navy)]">{probe.last_error}</p>
        ) : probe.last_ok_at ? (
          <p className="mt-3 text-sm text-[var(--admin-navy)]">
            {mylerRefreshNotice(rows.length)} Dernière lecture · {formatDateFr(probe.last_ok_at)}.
          </p>
        ) : (
          <p className="mt-3 text-sm text-muted">{MYLER_SHEET.idle}</p>
        )}
        <div className="mt-3">
          <button
            type="button"
            onClick={sync}
            disabled={Boolean(busy) || !configured}
            className="admin-af-btn-accent rounded-md px-3 py-2 text-sm disabled:opacity-50"
          >
            Actualiser
          </button>
        </div>
      </section>

      {error ? <p className="rounded-xl bg-[#f8f4ee] px-3 py-2 text-sm">{error}</p> : null}
      {!storageReady ? (
        <p className="text-sm text-muted">La table des réservations Little Emperors n’est pas encore en place.</p>
      ) : null}
      {storageReady && rows.length === 0 ? (
        <p className="text-sm text-muted">
          {probe.last_ok_at && !probe.last_error
            ? "Aucune réservation à afficher. L’environnement de test a répondu."
            : "Aucune réservation Little Emperors pour le moment."}
        </p>
      ) : null}

      <ul className="space-y-3">
        {rows.map((row) => {
          const href = websiteHref(row.website);
          const cancelled = isCancelledState(row.state);
          return (
            <li key={row.id} className="rounded-2xl border border-[#e5e3dc] bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-[var(--admin-navy)]">{row.hotel_name || "Hôtel non indiqué"}</p>
                  <p className="text-sm text-muted">{stateLabel(row.state)}</p>
                </div>
                {row.confirmation_number ? (
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#9e7e51]">{row.confirmation_number}</p>
                ) : null}
              </div>
              <dl className="mt-3 grid gap-1 text-sm">
                {row.address ? (
                  <div>
                    <dt className="inline font-medium">Adresse · </dt>
                    <dd className="inline">{row.address}</dd>
                  </div>
                ) : null}
                {row.city ? (
                  <div>
                    <dt className="inline font-medium">Ville · </dt>
                    <dd className="inline">{row.city}</dd>
                  </div>
                ) : null}
                {row.website ? (
                  <div>
                    <dt className="inline font-medium">Site · </dt>
                    <dd className="inline">
                      {href ? (
                        <a href={href} className="underline" target="_blank" rel="noreferrer">
                          {row.website}
                        </a>
                      ) : (
                        row.website
                      )}
                    </dd>
                  </div>
                ) : null}
                {row.check_in || row.check_out ? (
                  <div>
                    <dt className="inline font-medium">Séjour · </dt>
                    <dd className="inline">
                      {formatDateFr(row.check_in)} — {formatDateFr(row.check_out)}
                    </dd>
                  </div>
                ) : null}
                {row.guest_names?.length ? (
                  <div>
                    <dt className="inline font-medium">Voyageurs · </dt>
                    <dd className="inline">{row.guest_names.join(", ")}</dd>
                  </div>
                ) : null}
                {row.total_cost ? (
                  <div>
                    <dt className="inline font-medium">Total Little Emperors · </dt>
                    <dd className="inline">
                      {row.total_cost}
                      {row.currency ? ` ${row.currency}` : ""}
                    </dd>
                  </div>
                ) : null}
              </dl>
              {row.cancellation_policies?.length ? (
                <div className="mt-3 text-sm text-muted">
                  {row.cancellation_policies.map((policy) => (
                    <p key={policy}>{policy}</p>
                  ))}
                  {row.cancellation_deadline ? <p>Limite · {row.cancellation_deadline}</p> : null}
                </div>
              ) : null}
              {row.last_error ? <p className="mt-2 text-sm text-[#8a5a2a]">{row.last_error}</p> : null}
              {agency ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {row.crm_booking_id ? (
                  <Link
                    href={`/admin/reservations/${row.crm_booking_id}`}
                    className="rounded-md border border-[#e5e3dc] px-3 py-2 text-sm font-semibold"
                  >
                    Ouvrir le dossier
                  </Link>
                ) : !cancelled ? (
                  <button
                    type="button"
                    onClick={() => setAttachId(row.id)}
                    className="rounded-md border border-[var(--admin-navy)] px-3 py-2 text-sm font-semibold"
                  >
                    Créer un dossier brouillon
                  </button>
                ) : null}
                {!cancelled && row.is_cancellable === true ? (
                  <ConfirmAction
                    label="Annuler chez Little Emperors"
                    confirmLabel="Confirmer l’annulation"
                    busyLabel="Annulation Little Emperors…"
                    question={`La réservation ${row.hotel_name || "de cet hôtel"} est annulée chez Little Emperors. La politique d’annulation s’applique.`}
                    disabled={Boolean(busy)}
                    onConfirm={() => cancel(row.id)}
                  />
                ) : null}
              </div>
              ) : null}
              {!cancelled && row.is_cancellable === false ? <p className="mt-2 text-sm text-muted">{LATE_CANCEL}</p> : null}
            </li>
          );
        })}
      </ul>

      {agency ? (
      <CustomerPickDialog
        open={Boolean(attachId)}
        customers={customers}
        title="Client du dossier"
        onClose={() => setAttachId(null)}
        onSelect={attach}
      />
      ) : null}
    </div>
  );
}
