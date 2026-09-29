"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HOTEL_DESK_LABELS, containsCardNumber, deskStatusLabel, hotelsNeedingDesk } from "@/lib/crm/hotel-desk";
import { HOTEL_DESK_KINDS, type CrmHotelRequest, type HotelDeskKind } from "@/lib/crm/types";
import { fieldControlClass } from "@/components/crm/fields";

export function HotelDeskSummary({
  requests,
  today,
}: {
  requests: CrmHotelRequest[];
  today: string;
}) {
  const hotels = hotelsNeedingDesk(requests, today);
  if (!hotels) return null;
  return (
    <p className="text-sm font-semibold text-[var(--admin-navy)]">
      {hotels} hôtel{hotels > 1 ? "s" : ""} à traiter
    </p>
  );
}

export function HotelDesk({
  bookingId,
  itemId,
  requests,
  today,
  passportCount,
}: {
  bookingId: string;
  itemId: string;
  requests: CrmHotelRequest[];
  today: string;
  passportCount: number;
}) {
  const rows = HOTEL_DESK_KINDS.map((kind) => requests.find((row) => row.booking_item_id === itemId && row.kind === kind)).filter(
    (row): row is CrmHotelRequest => Boolean(row)
  );
  const [open, setOpen] = useState<HotelDeskKind | null>(null);
  if (!rows.length) return null;
  const active = rows.filter((row) => row.status !== "skipped");
  const skipped = rows.filter((row) => row.status === "skipped");
  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        {active.map((row) => {
          const label = deskStatusLabel(row, today);
          const attention = label === "À faire" || label === "À relancer" || label.includes("à faire");
          return (
            <button
              key={row.kind}
              type="button"
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                attention ? "border-[#C5A880] bg-[#C5A880]/15 text-[var(--admin-navy)]" : "border-[#e5e3dc] text-[var(--admin-navy)]"
              }`}
              onClick={() => setOpen(open === row.kind ? null : row.kind)}
            >
              {HOTEL_DESK_LABELS[row.kind]}
              {label ? <span className="ml-1 font-normal text-[#9e7e51]">{label}</span> : null}
            </button>
          );
        })}
      </div>
      {open ? (
        <HotelDeskEditor
          key={open}
          bookingId={bookingId}
          row={rows.find((row) => row.kind === open) || null}
          passportCount={passportCount}
          onClose={() => setOpen(null)}
        />
      ) : null}
      {skipped.length ? (
        <p className="text-xs text-muted">
          {skipped.map((row) => (
            <RestoreButton key={row.kind} bookingId={bookingId} row={row} />
          ))}
        </p>
      ) : null}
    </div>
  );
}

function RestoreButton({ bookingId, row }: { bookingId: string; row: CrmHotelRequest }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="mr-3 underline"
      onClick={() => {
        void post(bookingId, row, "restore").then(() => router.refresh());
      }}
    >
      Remettre {HOTEL_DESK_LABELS[row.kind]}
    </button>
  );
}

function HotelDeskEditor({
  bookingId,
  row,
  passportCount,
  onClose,
}: {
  bookingId: string;
  row: CrmHotelRequest | null;
  passportCount: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [subject, setSubject] = useState(row?.subject || "");
  const [body, setBody] = useState(row?.body || "");
  const [recipients, setRecipients] = useState((row?.recipients || []).join(", "));
  const [cardChoice, setCardChoice] = useState<"pliant" | "client">(row?.card_choice === "client" ? "client" : "pliant");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!row) return null;

  async function run(action: "save" | "send" | "skip") {
    setBusy(action);
    setError(null);
    const result = await post(bookingId, row!, action, {
      subject,
      body,
      recipients: recipients.split(/[,;\s]+/).map((value) => value.trim()).filter(Boolean),
      cardChoice: row!.kind === "precheckin" ? cardChoice : null,
    });
    setBusy(null);
    if (!result.ok) {
      setError(result.error || "Action impossible");
      return;
    }
    onClose();
    router.refresh();
  }

  const reply = row.reply_body && !containsCardNumber(row.reply_body) ? row.reply_body : "";
  return (
    <div className="space-y-2 rounded-2xl border border-[#e5e3dc] bg-white p-3">
      {row.status === "replied" || reply ? (
        <div className="rounded-xl bg-[#f8f3eb] p-3 text-sm text-[var(--admin-navy)]">
          <p className="text-xs font-semibold">Réponse de l'hôtel</p>
          {row.reply_from ? <p className="text-xs text-muted">{row.reply_from}</p> : null}
          {reply ? (
            <p className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap">{reply}</p>
          ) : (
            <p className="mt-2 text-muted">L'hôtel a répondu.</p>
          )}
        </div>
      ) : null}
      <label className="block text-xs font-semibold text-[var(--admin-navy)]">
        Destinataires
        <input className={`${fieldControlClass} mt-1`} value={recipients} onChange={(event) => setRecipients(event.target.value)} />
      </label>
      <label className="block text-xs font-semibold text-[var(--admin-navy)]">
        Objet
        <input className={`${fieldControlClass} mt-1`} value={subject} onChange={(event) => setSubject(event.target.value)} />
      </label>
      <label className="block text-xs font-semibold text-[var(--admin-navy)]">
        Message
        <textarea className={`${fieldControlClass} mt-1 min-h-40`} value={body} onChange={(event) => setBody(event.target.value)} />
      </label>
      {row.kind === "precheckin" ? (
        <fieldset className="space-y-1 text-sm text-[var(--admin-navy)]">
          <legend className="text-xs font-semibold">Carte pour l'enregistrement</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name={`card-${row.id}`} checked={cardChoice === "pliant"} onChange={() => setCardChoice("pliant")} />
            Carte Pliant, ajoutée à l'envoi et non enregistrée
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name={`card-${row.id}`} checked={cardChoice === "client"} onChange={() => setCardChoice("client")} />
            Carte du client, sans numéro
          </label>
          <p className="text-xs text-muted">
            {passportCount
              ? `${passportCount} passeport${passportCount > 1 ? "s" : ""} joint${passportCount > 1 ? "s" : ""} à l'envoi.`
              : "Aucun passeport à joindre."}
          </p>
        </fieldset>
      ) : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="admin-af-btn rounded-full px-3 py-2 text-sm" disabled={Boolean(busy)} onClick={() => void run("send")}>
          {busy === "send" ? "Envoi…" : "Envoyer"}
        </button>
        <button type="button" className="rounded-full border border-[#e5e3dc] px-3 py-2 text-sm" disabled={Boolean(busy)} onClick={() => void run("save")}>
          {busy === "save" ? "…" : "Enregistrer"}
        </button>
        <button type="button" className="px-3 py-2 text-sm text-muted" disabled={Boolean(busy)} onClick={() => void run("skip")}>
          Pas pour ce séjour
        </button>
      </div>
    </div>
  );
}

async function post(
  bookingId: string,
  row: CrmHotelRequest,
  action: string,
  extra?: { subject: string; body: string; recipients: string[]; cardChoice: "pliant" | "client" | null }
) {
  const res = await fetch(`/api/admin/bookings/${bookingId}/hotel-desk`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action,
      itemId: row.booking_item_id,
      kind: row.kind,
      subject: extra?.subject ?? row.subject,
      body: extra?.body ?? row.body,
      recipients: extra?.recipients ?? row.recipients,
      cardChoice: extra?.cardChoice ?? row.card_choice,
    }),
  });
  const json = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) return { ok: false, error: json?.error || "Action impossible" };
  return { ok: true, error: "" };
}
