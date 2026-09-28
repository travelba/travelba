"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BusyBar } from "@/components/crm/BusyBar";
import { hotelDisplayName, nightsBetween } from "@/lib/crm/carnet";
import {
  FULL_CREDIT_NIGHT_EUR,
  FULL_CREDIT_STATUS_LABEL,
  fullCreditCeilingCents,
  fullCreditClientMode,
  isFullCreditStatus,
  type FullCreditRecord,
  type FullCreditStatus,
} from "@/lib/crm/full-credit";
import { formatMoney } from "@/lib/crm/money";
import type { CrmBookingItem } from "@/lib/crm/types";

function euros(cents: number | null) {
  if (cents == null) return "";
  return (cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function FullCreditDesk({
  bookingId,
  reference,
  visible,
  status,
  clientSettles,
  pliantReady,
  items,
  credits,
  now,
}: {
  bookingId: string;
  reference: string;
  visible: boolean;
  status: string;
  clientSettles: boolean;
  pliantReady: boolean;
  items: CrmBookingItem[];
  credits: FullCreditRecord[];
  now: string;
}) {
  const hotels = items.filter((item) => item.kind === "hotel");
  if (!hotels.length) return null;
  if (clientSettles && credits.length === 0) return null;
  return (
    <section id="full-credit" className="admin-af-card space-y-4 rounded-3xl p-5">
      <div className="space-y-1">
        <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">Full credit</h2>
        <p className="text-sm text-muted">
          Extras dans l’hôtel : restaurant, bar, room service, spa. La chambre est déjà réglée. Le client demande au moins
          48 heures avant l’arrivée. Plafond de pré-autorisation : {FULL_CREDIT_NIGHT_EUR} € par nuit. Rien n’est débité
          tant que le montant réel n’est pas enregistré.
        </p>
      </div>
      {hotels.map((hotel) => (
        <HotelCredit
          key={hotel.id}
          bookingId={bookingId}
          reference={reference}
          visible={visible}
          status={status}
          clientSettles={clientSettles}
          pliantReady={pliantReady}
          hotel={hotel}
          credit={credits.find((row) => row.booking_item_id === hotel.id) || null}
          now={now}
        />
      ))}
    </section>
  );
}

function HotelCredit({
  bookingId,
  reference,
  visible,
  status,
  clientSettles,
  pliantReady,
  hotel,
  credit,
  now,
}: {
  bookingId: string;
  reference: string;
  visible: boolean;
  status: string;
  clientSettles: boolean;
  pliantReady: boolean;
  hotel: CrmBookingItem;
  credit: FullCreditRecord | null;
  now: string;
}) {
  const router = useRouter();
  const name = hotelDisplayName(hotel);
  const nights = credit?.nights || nightsBetween(hotel.start_at, hotel.end_at);
  const ceiling = credit?.ceiling_cents || (nights ? fullCreditCeilingCents(nights) : null);
  const mode = fullCreditClientMode({
    visible,
    status,
    clientSettles,
    kind: "hotel",
    startAt: hotel.start_at,
    endAt: hotel.end_at,
    now: new Date(now),
    existingStatus: credit?.status,
  });
  const [email, setEmail] = useState(credit?.hotel_email || "");
  const [subject, setSubject] = useState(credit?.draft_subject || "");
  const [body, setBody] = useState(credit?.draft_body || "");
  const [link, setLink] = useState(credit?.payment_url || "");
  const [amount, setAmount] = useState(euros(credit?.captured_cents ?? null));
  const [busy, setBusy] = useState<"" | "send" | "card" | "link" | "capture">("");
  const [notice, setNotice] = useState("");
  const closed = credit?.status === "cloturee";

  async function run(action: "send" | "card" | "link" | "capture") {
    if (!credit) return;
    setBusy(action);
    setNotice("");
    const payload =
      action === "send"
        ? { action, creditId: credit.id, hotelEmail: email, subject, body }
        : action === "link"
          ? { action, creditId: credit.id, paymentUrl: link }
          : action === "capture"
            ? { action, creditId: credit.id, amount }
            : { action, creditId: credit.id };
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/full-credit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setNotice(json.error || "Action impossible.");
        return;
      }
      setNotice(action === "send" ? "Courrier envoyé à l’hôtel." : action === "card" ? "Carte Pliant prête." : "Enregistré.");
      router.refresh();
    } catch {
      setNotice("Action impossible.");
    } finally {
      setBusy("");
    }
  }

  return (
    <article className="space-y-3 rounded-2xl border border-[#e5e3dc] bg-white p-4">
      <div>
        <p className="font-semibold text-[var(--admin-navy)]">{name}</p>
        <p className="text-sm text-muted">
          {nights ? `${nights} nuit${nights > 1 ? "s" : ""}` : "Dates insuffisantes"}
          {ceiling ? ` · plafond ${formatMoney(ceiling / 100, "EUR")}` : ""}
          {credit && isFullCreditStatus(credit.status) ? ` · ${FULL_CREDIT_STATUS_LABEL[credit.status as FullCreditStatus]}` : ""}
        </p>
      </div>
      {!credit ? (
        <p className="text-sm text-muted">
          {mode === "ask"
            ? `${reference} — en attente de la demande du client.`
            : mode === "late"
              ? "Le délai de 48 heures est passé. Le client peut écrire sur WhatsApp."
              : "Le client ne peut pas demander le full credit sur ce séjour."}
        </p>
      ) : (
        <>
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
            E-mail de l’hôtel
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              autoComplete="off"
              disabled={closed || busy !== ""}
              className="rounded-xl border border-border px-3 py-2 text-sm font-normal text-[var(--admin-navy)]"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
            Objet
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              disabled={closed || busy !== ""}
              className="rounded-xl border border-border px-3 py-2 text-sm font-normal text-[var(--admin-navy)]"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
            Courrier
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={12}
              disabled={closed || busy !== ""}
              className="rounded-xl border border-border px-3 py-2 text-sm font-normal text-[var(--admin-navy)]"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={closed || busy !== ""}
              onClick={() => void run("send")}
              className="admin-af-btn admin-tap rounded-full px-4 py-2 text-sm disabled:opacity-50"
            >
              {busy === "send" ? "Envoi…" : "Envoyer à l’hôtel"}
            </button>
            <button
              type="button"
              disabled={closed || busy !== "" || !pliantReady}
              onClick={() => void run("card")}
              className="admin-tap rounded-full border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {busy === "card" ? "Émission…" : credit.pliant_card_id ? "Relever le plafond" : "Transmettre la carte"}
            </button>
          </div>
          {!pliantReady ? (
            <p className="text-xs text-muted">Pliant n’est pas branchée. Le lien de paiement reste possible.</p>
          ) : null}
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
            Lien de paiement
            <span className="flex flex-col gap-2 sm:flex-row">
              <input
                value={link}
                onChange={(event) => setLink(event.target.value)}
                type="url"
                placeholder="https://"
                disabled={closed || busy !== ""}
                className="min-w-0 flex-1 rounded-xl border border-border px-3 py-2 text-sm font-normal text-[var(--admin-navy)]"
              />
              <button
                type="button"
                disabled={closed || busy !== ""}
                onClick={() => void run("link")}
                className="admin-tap rounded-full border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                {busy === "link" ? "Enregistrement…" : "Enregistrer le lien"}
              </button>
            </span>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
            Montant réellement débité (€)
            <span className="flex flex-col gap-2 sm:flex-row">
              <input
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                inputMode="decimal"
                disabled={busy !== ""}
                className="min-w-0 flex-1 rounded-xl border border-border px-3 py-2 text-sm font-normal text-[var(--admin-navy)]"
              />
              <button
                type="button"
                disabled={busy !== ""}
                onClick={() => void run("capture")}
                className="admin-tap rounded-full border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                {busy === "capture" ? "Écriture…" : "Écrire au livre"}
              </button>
            </span>
          </label>
          <BusyBar active={busy !== ""} label={busy === "send" ? "Envoi du courrier…" : "Enregistrement…"} />
          {notice ? <p className="text-sm text-[var(--admin-navy)]">{notice}</p> : null}
        </>
      )}
    </article>
  );
}
