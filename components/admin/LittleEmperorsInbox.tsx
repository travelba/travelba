"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CustomerPickDialog } from "@/components/admin/CustomerPickDialog";
import { BusyBar } from "@/components/crm/BusyBar";
import type { PickableCustomer } from "@/lib/crm/customer-search";
import { formatDateFr } from "@/lib/crm/money";
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
  probe,
}: {
  rows: CrmLeBooking[];
  customers: PickableCustomer[];
  storageReady: boolean;
  configured: boolean;
  productionBlocked: boolean;
  probe: { last_status: number | null; last_error: string | null; last_ok_at: string | null };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
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
    await post({ action: "sync" });
    setBusy(null);
    router.refresh();
  }

  async function init() {
    setBusy("init");
    setRedirectUrl(null);
    const json = await post({ action: "init", email, name });
    setBusy(null);
    if (json?.redirect_url) setRedirectUrl(String(json.redirect_url));
  }

  async function cancel(id: string) {
    setBusy(id);
    const json = await post({ action: "cancel", id });
    setBusy(null);
    if (json) {
      setConfirmId(null);
      router.refresh();
    }
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
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">Environnement de test</p>
        <p className="mt-1 text-sm text-[var(--admin-navy)]">
          api-staging.littleemperors.com — la clé de test n’est pas celle du compte de production.
        </p>
        {productionBlocked ? (
          <p className="mt-2 text-sm text-[#8a5a2a]">Cet environnement n’appelle pas Little Emperors.</p>
        ) : null}
        {!configured && !productionBlocked ? (
          <p className="mt-2 text-sm text-[#8a5a2a]">La clé de test n’est pas configurée sur cet environnement.</p>
        ) : null}
        {probe.last_error ? (
          <p className="mt-3 rounded-xl bg-[#f8f4ee] px-3 py-2 text-sm text-[var(--admin-navy)]">{probe.last_error}</p>
        ) : probe.last_ok_at ? (
          <p className="mt-3 text-sm text-muted">
            Dernière lecture réussie · {formatDateFr(probe.last_ok_at)} · {rows.length} réservation
            {rows.length > 1 ? "s" : ""}.
          </p>
        ) : (
          <p className="mt-3 text-sm text-muted">Aucune lecture pour l’instant.</p>
        )}
        <div className="mt-3">
          <button
            type="button"
            onClick={sync}
            disabled={Boolean(busy) || !configured}
            className="admin-af-btn-accent rounded-md px-3 py-2 text-sm disabled:opacity-50"
          >
            Actualiser les réservations
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-[#e5e3dc] bg-white p-4">
        <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">Initialisation</h2>
        <p className="mt-1 text-sm text-muted">
          Little Emperors demande un appel sur l’API de test avec l’e-mail et le nom, puis l’ouverture du lien de
          consentement. Cela ne touche pas le compte de production.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium">E-mail</span>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-[#e5e3dc] px-3 py-2"
              autoComplete="off"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Nom</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-lg border border-[#e5e3dc] px-3 py-2"
              autoComplete="off"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={init}
          disabled={Boolean(busy) || !configured}
          className="mt-3 rounded-md border border-[var(--admin-navy)] px-3 py-2 text-sm font-semibold text-[var(--admin-navy)] disabled:opacity-50"
        >
          Demander le lien de test
        </button>
        {redirectUrl ? (
          <p className="mt-3 text-sm">
            <a href={redirectUrl} className="font-semibold text-[var(--admin-navy)] underline" target="_blank" rel="noreferrer">
              Ouvrir le consentement Little Emperors
            </a>
          </p>
        ) : null}
      </section>

      {error ? <p className="rounded-xl bg-[#f8f4ee] px-3 py-2 text-sm">{error}</p> : null}
      {!storageReady ? (
        <p className="text-sm text-muted">La table des réservations Little Emperors n’est pas encore en place.</p>
      ) : null}
      {storageReady && rows.length === 0 ? (
        <p className="text-sm text-muted">Aucune réservation Little Emperors pour le moment.</p>
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
                  confirmId === row.id ? (
                    <button
                      type="button"
                      disabled={busy === row.id}
                      onClick={() => cancel(row.id)}
                      className="rounded-md bg-[var(--admin-navy)] px-3 py-2 text-sm font-semibold text-white"
                    >
                      Confirmer l’annulation
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmId(row.id)}
                      className="rounded-md border border-[#e5e3dc] px-3 py-2 text-sm"
                    >
                      Annuler chez Little Emperors
                    </button>
                  )
                ) : null}
              </div>
              {!cancelled && row.is_cancellable === false ? <p className="mt-2 text-sm text-muted">{LATE_CANCEL}</p> : null}
            </li>
          );
        })}
      </ul>

      <CustomerPickDialog
        open={Boolean(attachId)}
        customers={customers}
        title="Client du dossier"
        onClose={() => setAttachId(null)}
        onSelect={attach}
      />
    </div>
  );
}
