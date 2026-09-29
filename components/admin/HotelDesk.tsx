"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { hotelContact, type HotelPersonContact } from "@/lib/crm/hotel-contact";
import { HOTEL_DESK_LABELS, containsCardNumber, deskStatusLabel, hotelsNeedingDesk } from "@/lib/crm/hotel-desk";
import { HOTEL_DESK_KINDS, type CrmBookingItem, type CrmHotelRequest, type HotelDeskKind } from "@/lib/crm/types";
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
  item,
  requests,
  today,
  passportCount,
}: {
  bookingId: string;
  item: CrmBookingItem;
  requests: CrmHotelRequest[];
  today: string;
  passportCount: number;
}) {
  const rows = HOTEL_DESK_KINDS.map((kind) => requests.find((row) => row.booking_item_id === item.id && row.kind === kind)).filter(
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
          item={item}
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

function personLabel(person: HotelPersonContact) {
  const name = [person.first_name, person.last_name].filter(Boolean).join(" ");
  return [person.type, name].filter(Boolean).join(" · ");
}

function HotelDeskEditor({
  bookingId,
  item,
  row,
  passportCount,
  onClose,
}: {
  bookingId: string;
  item: CrmBookingItem;
  row: CrmHotelRequest | null;
  passportCount: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [subject, setSubject] = useState(row?.subject || "");
  const [body, setBody] = useState(row?.body || "");
  const [recipients, setRecipients] = useState(row?.recipients || []);
  const [extra, setExtra] = useState("");
  const [cardChoice, setCardChoice] = useState<"pliant" | "client">(row?.card_choice === "client" ? "client" : "pliant");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!row) return null;
  const known = new Map<string, string>();
  for (const person of hotelContact(item).people) {
    const email = person.email.trim().toLowerCase();
    if (!email || known.has(email)) continue;
    known.set(email, personLabel(person) || email);
  }
  const selected = new Set(recipients.map((email) => email.trim().toLowerCase()));
  const missing = [...known.entries()].filter(([email]) => !selected.has(email));

  async function run(action: "save" | "send" | "skip", next = recipients) {
    setBusy(action);
    setError(null);
    const result = await post(bookingId, row!, action, {
      subject,
      body,
      recipients: next,
      cardChoice: row!.kind === "precheckin" ? cardChoice : null,
    });
    setBusy(null);
    if (!result.ok) {
      setError(result.error || "Action impossible");
      return false;
    }
    if (action !== "save") {
      onClose();
      router.refresh();
    }
    return true;
  }

  async function changeRecipients(next: string[]) {
    setRecipients(next);
    const saved = await run("save", next);
    if (saved) router.refresh();
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
      <div className="space-y-2">
        <p className="text-xs font-semibold text-[var(--admin-navy)]">Destinataires</p>
        <ul className="space-y-1">
          {recipients.map((email) => (
            <li key={email} className="flex items-center justify-between gap-3 rounded-2xl border border-[#e5e3dc] px-3 py-2">
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[#0B192C]">{known.get(email.trim().toLowerCase()) || email}</span>
                <span className="block truncate text-xs text-[#9e7e51]">{email}</span>
              </span>
              <button
                type="button"
                className="shrink-0 rounded-full border border-[#e5e3dc] px-3 py-1 text-xs font-semibold text-[#0B192C]"
                disabled={Boolean(busy)}
                onClick={() => void changeRecipients(recipients.filter((value) => value !== email))}
              >
                Retirer
              </button>
            </li>
          ))}
        </ul>
        {missing.length ? (
          <div className="flex flex-wrap gap-2">
            {missing.map(([email, label]) => (
              <button
                key={email}
                type="button"
                className="rounded-full border border-[#C5A880] px-3 py-1 text-xs font-semibold text-[#0B192C]"
                disabled={Boolean(busy)}
                onClick={() => void changeRecipients([...recipients, email])}
              >
                Ajouter {label}
              </button>
            ))}
          </div>
        ) : null}
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 text-xs font-semibold text-[var(--admin-navy)]">
            Autre adresse
            <input className={`${fieldControlClass} mt-1`} value={extra} onChange={(event) => setExtra(event.target.value)} />
          </label>
          <button
            type="button"
            className="rounded-full border border-[#e5e3dc] px-3 py-2 text-sm font-semibold text-[#0B192C]"
            disabled={Boolean(busy)}
            onClick={() => {
              const email = extra.trim().toLowerCase();
              if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                setError("Adresse incomplète");
                return;
              }
              setExtra("");
              setError(null);
              void changeRecipients(recipients.includes(email) ? recipients : [...recipients, email]);
            }}
          >
            Ajouter
          </button>
        </div>
      </div>
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
        <button
          type="button"
          className="rounded-full border border-[#e5e3dc] px-3 py-2 text-sm"
          disabled={Boolean(busy)}
          onClick={() =>
            void run("save").then((saved) => {
              if (saved) router.refresh();
            })
          }
        >
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
