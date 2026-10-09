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
import { mylerRefreshNotice, mylerSheet, partnerVisibleProbeError } from "@/lib/crm/myler-sheet";
import type { CrmLeBooking } from "@/lib/crm/types";

function isCancelledState(state: string | null) {
  const value = (state || "").trim().toLowerCase();
  return value === "cancelled" || value === "canceled";
}

function formatWhen(value: string | null | undefined, partner: boolean) {
  if (!partner) return formatDateFr(value);
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: value.length === 10 ? undefined : "Europe/Paris",
  });
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
  const copy = mylerSheet(!agency);
  const live = configured && !productionBlocked;
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
      setError(json.error || mylerSheet(!agency).failed);
      return null;
    }
    return json;
  }

  async function sync() {
    setBusy("sync");
    setNotice(null);
    const json = await post({ action: "sync" });
    setBusy(null);
    if (json?.ok) setNotice(mylerRefreshNotice(Number(json.fetched) || 0, !agency));
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
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">{copy.title}</p>
        <h2 className="mt-1 font-display text-lg font-bold text-[var(--admin-navy)]">{copy.host}</h2>
        <p className="mt-3 text-sm font-semibold text-[var(--admin-navy)]">
          {live ? copy.keyOn : copy.keyOff}
        </p>
        <p className="mt-2 text-sm text-[var(--admin-navy)]">{copy.keyNote}</p>
        <p className="mt-3 rounded-xl bg-[#f8f4ee] px-3 py-2 text-sm text-[var(--admin-navy)]">{copy.sso}</p>
        {agency ? null : (
        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="font-medium text-[var(--admin-navy)]">{copy.authLabel}</dt>
            <dd className="text-muted">{copy.auth}</dd>
          </div>
          <div>
            <dt className="font-medium text-[var(--admin-navy)]">{copy.routesLabel}</dt>
            <dd>
              <ul className="mt-1 space-y-1 font-mono text-xs text-[var(--admin-navy)]">
                {copy.routes.map((route) => (
                  <li key={route}>{route}</li>
                ))}
              </ul>
            </dd>
          </div>
          <div>
            <dt className="font-medium text-[var(--admin-navy)]">{copy.syncLabel}</dt>
            <dd className="text-muted">{copy.sync}</dd>
          </div>
          <div>
            <dt className="font-medium text-[var(--admin-navy)]">{copy.webhookLabel}</dt>
            <dd className="break-all text-[var(--admin-navy)]">{copy.webhook}</dd>
            <dd className="text-muted">
              {copy.headerLabel} {copy.webhookHeader}
            </dd>
            <dd className="text-[var(--admin-navy)]">{webhookConfigured ? copy.webhookOn : copy.webhookOff}</dd>
          </div>
        </dl>
        )}
        {notice ? (
          <p className="mt-3 rounded-xl bg-[#f8f4ee] px-3 py-2 text-sm text-[var(--admin-navy)]">{notice}</p>
        ) : !live ? (
          <p className="mt-3 text-sm text-muted">{copy.blocked}</p>
        ) : probe.last_error ? (
          <p className="mt-3 rounded-xl bg-[#f8f4ee] px-3 py-2 text-sm text-[var(--admin-navy)]">
            {agency ? probe.last_error : partnerVisibleProbeError(probe.last_error)}
          </p>
        ) : probe.last_ok_at ? (
          <p className="mt-3 text-sm text-[var(--admin-navy)]">
            {mylerRefreshNotice(rows.length, !agency)} {copy.lastRead} · {formatWhen(probe.last_ok_at, !agency)}.
          </p>
        ) : (
          <p className="mt-3 text-sm text-muted">{copy.idle}</p>
        )}
        <div className="mt-3">
          <button
            type="button"
            onClick={sync}
            disabled={Boolean(busy) || !live}
            className="admin-af-btn-accent rounded-md px-3 py-2 text-sm disabled:opacity-50"
          >
            {copy.refresh}
          </button>
        </div>
      </section>

      {error ? <p className="rounded-xl bg-[#f8f4ee] px-3 py-2 text-sm">{error}</p> : null}
      {!storageReady ? <p className="text-sm text-muted">{copy.storage}</p> : null}
      {storageReady && rows.length === 0 ? (
        <p className="text-sm text-muted">
          {live && probe.last_ok_at && !probe.last_error ? copy.emptyOk : copy.emptyIdle}
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
                  <p className="font-semibold text-[var(--admin-navy)]">{row.hotel_name || copy.hotelUnknown}</p>
                  <p className="text-sm text-muted">
                    {(row.state || "").trim().toLowerCase() === "booked"
                      ? copy.stateBooked
                      : isCancelledState(row.state)
                        ? copy.stateCancelled
                        : row.state || copy.stateMissing}
                  </p>
                </div>
                {row.confirmation_number ? (
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#9e7e51]">{row.confirmation_number}</p>
                ) : null}
              </div>
              <dl className="mt-3 grid gap-1 text-sm">
                {row.address ? (
                  <div>
                    <dt className="inline font-medium">{copy.address} · </dt>
                    <dd className="inline">{row.address}</dd>
                  </div>
                ) : null}
                {row.city ? (
                  <div>
                    <dt className="inline font-medium">{copy.city} · </dt>
                    <dd className="inline">{row.city}</dd>
                  </div>
                ) : null}
                {row.website ? (
                  <div>
                    <dt className="inline font-medium">{copy.site} · </dt>
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
                    <dt className="inline font-medium">{copy.stay} · </dt>
                    <dd className="inline">
                      {formatWhen(row.check_in, !agency)} — {formatWhen(row.check_out, !agency)}
                    </dd>
                  </div>
                ) : null}
                {row.guest_names?.length ? (
                  <div>
                    <dt className="inline font-medium">{copy.guests} · </dt>
                    <dd className="inline">{row.guest_names.join(", ")}</dd>
                  </div>
                ) : null}
                {row.total_cost ? (
                  <div>
                    <dt className="inline font-medium">{copy.total} · </dt>
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
                  {row.cancellation_deadline ? (
                    <p>
                      {copy.deadline} · {row.cancellation_deadline}
                    </p>
                  ) : null}
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
              {!cancelled && row.is_cancellable === false ? <p className="mt-2 text-sm text-muted">{copy.lateCancel}</p> : null}
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
