"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HotelThread } from "@/components/admin/HotelThread";
import { PrecheckPack } from "@/components/admin/PrecheckPack";
import { hotelDisplayName } from "@/lib/crm/carnet";
import { HOTEL_DESK_LABELS, deskStatusLabel, hotelsNeedingDesk, type HotelMailPiece } from "@/lib/crm/hotel-desk";
import { precheckParty } from "@/lib/crm/hotel-precheck";
import { HOTEL_DESK_KINDS, type CardViewLine, type CrmBookingItem, type CrmBookingTraveler, type CrmHotelMessage, type CrmHotelRequest, type CrmTravelDocument, type HotelDeskKind } from "@/lib/crm/types";

const letterFieldClass =
  "w-full rounded-xl border border-[#d9d1c3] bg-[#faf9f6] px-3 py-2.5 text-sm text-[#0B192C] outline-none transition placeholder:text-[#3d4654] focus:border-[#0B192C] focus:bg-white";

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
  travelers = [],
  identityDocs = [],
  holder = null,
  cardLast4 = null,
  clientCardName = null,
  hasCardCode = false,
  cardViews = [],
  messages = [],
  attached = [],
}: {
  bookingId: string;
  item: CrmBookingItem;
  requests: CrmHotelRequest[];
  today: string;
  travelers?: CrmBookingTraveler[];
  identityDocs?: CrmTravelDocument[];
  holder?: { first_name: string; last_name: string } | null;
  cardLast4?: string | null;
  clientCardName?: string | null;
  hasCardCode?: boolean;
  cardViews?: CardViewLine[];
  messages?: CrmHotelMessage[];
  attached?: HotelMailPiece[];
}) {
  const rows = HOTEL_DESK_KINDS.map((kind) => requests.find((row) => row.booking_item_id === item.id && row.kind === kind)).filter(
    (row): row is CrmHotelRequest => Boolean(row)
  );
  const [open, setOpen] = useState<HotelDeskKind | null>(null);
  if (!rows.length) return null;
  const active = rows.filter((row) => row.status !== "skipped");
  const skipped = rows.filter((row) => row.status === "skipped");
  return (
    <div className="mt-3 space-y-3">
      <HotelThread bookingId={bookingId} item={item} requests={requests} messages={messages} attached={attached} />
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#6f552c]">Courriers préparés</p>
      <div className="flex flex-wrap gap-2">
        {active.map((row) => {
          const label = deskStatusLabel(row, today);
          const attention = label === "À faire" || label === "À relancer" || label.includes("à faire");
          return (
            <button
              key={row.kind}
              type="button"
              className={`rounded-full border bg-white px-3 py-1.5 text-xs font-semibold text-[#0B192C] ${
                attention ? "border-[#C5A880]" : "border-[#d9d1c3]"
              }`}
              onClick={() => setOpen(open === row.kind ? null : row.kind)}
            >
              {HOTEL_DESK_LABELS[row.kind]}
              {label ? <span className="ml-1 font-medium text-[#6f552c]">{label}</span> : null}
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
          travelers={travelers}
          identityDocs={identityDocs}
          holder={holder}
          cardLast4={cardLast4}
          clientCardName={clientCardName}
          hasCardCode={hasCardCode}
          cardViews={cardViews}
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
  item,
  row,
  travelers,
  identityDocs,
  holder,
  cardLast4,
  clientCardName,
  hasCardCode,
  cardViews,
  onClose,
}: {
  bookingId: string;
  item: CrmBookingItem;
  row: CrmHotelRequest | null;
  travelers: CrmBookingTraveler[];
  identityDocs: CrmTravelDocument[];
  holder: { first_name: string; last_name: string } | null;
  cardLast4: string | null;
  clientCardName: string | null;
  hasCardCode: boolean;
  cardViews: CardViewLine[];
  onClose: () => void;
}) {
  const router = useRouter();
  const party = precheckParty(travelers, identityDocs, holder);
  const availableIds = party.flatMap((traveler) => traveler.pieces.map((piece) => piece.id));
  const [subject, setSubject] = useState(row?.subject || "");
  const [body, setBody] = useState(row?.body || "");
  const recipients = row?.recipients || [];
  const [cardChoice, setCardChoice] = useState<"pliant" | "client">(row?.card_choice === "client" ? "client" : "pliant");
  const [pieceIds, setPieceIds] = useState<string[]>(() =>
    row?.identity_picked ? (row.identity_document_ids || []).filter((id) => availableIds.includes(id)) : availableIds
  );
  const [last4, setLast4] = useState(cardLast4);
  const [clientFile, setClientFile] = useState<File | null>(null);
  const [storedName, setStoredName] = useState(clientCardName);
  const [codeReady, setCodeReady] = useState(hasCardCode);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!row) return null;

  async function run(action: "save" | "send" | "skip", next = recipients, pieces = pieceIds) {
    if (action === "send" && row!.kind === "precheckin" && cardChoice === "client" && !clientFile && !storedName) {
      setError("Déposez la carte du client.");
      return false;
    }
    setBusy(action);
    setError(null);
    const result = await post(bookingId, row!, action, {
      subject,
      body,
      recipients: next,
      cardChoice: row!.kind === "precheckin" ? cardChoice : null,
      identityDocumentIds: row!.kind === "precheckin" ? pieces : undefined,
      clientCard: action === "send" && row!.kind === "precheckin" && cardChoice === "client" ? clientFile : null,
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

  async function generateCard() {
    setBusy("card");
    setError(null);
    const result = await post(bookingId, row!, "issue-card", {
      subject,
      body,
      recipients,
      cardChoice: "pliant",
      identityDocumentIds: pieceIds,
    });
    setBusy(null);
    if (!result.ok) {
      setError(result.error || "La carte n'a pas pu être créée.");
      return;
    }
    if (result.last4) setLast4(result.last4);
  }

  async function pickClientCard(file: File | null) {
    if (!file) {
      setBusy("card");
      setError(null);
      const cleared = await post(bookingId, row!, "clear-client-card", {
        subject,
        body,
        recipients,
        cardChoice: "client",
        identityDocumentIds: pieceIds,
      });
      setBusy(null);
      if (!cleared.ok) {
        setError(cleared.error || "La carte n'a pas pu être retirée.");
        return;
      }
      setClientFile(null);
      setStoredName(null);
      return;
    }
    try {
      const light = await lightCard(file);
      setBusy("card");
      setError(null);
      const saved = await post(bookingId, row!, "save-client-card", {
        subject,
        body,
        recipients,
        cardChoice: "client",
        identityDocumentIds: pieceIds,
        clientCard: light,
      });
      setBusy(null);
      if (!saved.ok) {
        setError(saved.error || "La carte n'a pas pu être enregistrée.");
        return;
      }
      setClientFile(light);
      setStoredName(saved.name || light.name);
    } catch (err) {
      setBusy(null);
      setError(err instanceof Error ? err.message : "Carte illisible.");
    }
  }

  return (
    <div className="space-y-2 rounded-2xl border border-[#e5e0d4] bg-white p-3 text-[#0B192C]">
      {row.kind === "precheckin" ? (
        <PrecheckPack
          bookingId={bookingId}
          itemId={item.id}
          party={party}
          selectedIds={pieceIds}
          cardChoice={cardChoice}
          last4={last4}
          holder={[holder?.first_name, holder?.last_name].filter(Boolean).join(" ")}
          hotel={hotelDisplayName(item) || item.title}
          clientFileName={storedName || clientFile?.name || null}
          hasCardCode={codeReady}
          cardViews={cardViews}
          disabled={Boolean(busy)}
          generating={busy === "card"}
          onToggle={(id) => {
            const next = pieceIds.includes(id) ? pieceIds.filter((value) => value !== id) : [...pieceIds, id];
            setPieceIds(next);
            void run("save", recipients, next);
          }}
          onCardChoice={(choice) => {
            setCardChoice(choice);
            if (choice === "pliant") setClientFile(null);
          }}
          onGenerate={() => void generateCard()}
          onClientFile={(file) => void pickClientCard(file)}
          onCodeReady={() => setCodeReady(true)}
        />
      ) : null}
      <label className="block text-xs font-semibold text-[#0B192C]">
        Objet
        <input className={`${letterFieldClass} mt-1`} value={subject} onChange={(event) => setSubject(event.target.value)} />
      </label>
      <label className="block text-xs font-semibold text-[#0B192C]">
        Message
        <textarea className={`${letterFieldClass} mt-1 min-h-40`} value={body} onChange={(event) => setBody(event.target.value)} />
      </label>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="admin-af-btn rounded-full bg-[#0B192C] px-3 py-2 text-sm text-[#faf9f6]" disabled={Boolean(busy)} onClick={() => void run("send")}>
          {busy === "send" ? "Envoi…" : "Envoyer"}
        </button>
        <button
          type="button"
          className="rounded-full border border-[#d9d1c3] bg-white px-3 py-2 text-sm font-semibold text-[#0B192C]"
          disabled={Boolean(busy)}
          onClick={() =>
            void run("save").then((saved) => {
              if (saved) router.refresh();
            })
          }
        >
          {busy === "save" ? "…" : "Enregistrer"}
        </button>
        <button type="button" className="px-3 py-2 text-sm font-medium text-[#3d4654]" disabled={Boolean(busy)} onClick={() => void run("skip")}>
          Pas pour ce séjour
        </button>
      </div>
    </div>
  );
}

async function lightCard(file: File) {
  if (file.type === "application/pdf") {
    if (file.size > 4_000_000) throw new Error("Le PDF dépasse 4 Mo.");
    return file;
  }
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Déposez un JPEG, un PNG ou un PDF.");
  if (file.size <= 1_500_000) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  bitmap.close();
  if (!blob || blob.size > 4_000_000) throw new Error("La photo est trop lourde.");
  return new File([blob], "carte-client.jpg", { type: "image/jpeg" });
}

async function post(
  bookingId: string,
  row: CrmHotelRequest,
  action: string,
  extra?: {
    subject: string;
    body: string;
    recipients: string[];
    cardChoice: "pliant" | "client" | null;
    identityDocumentIds?: string[];
    clientCard?: File | null;
  }
) {
  const fields = {
    action,
    itemId: row.booking_item_id,
    kind: row.kind,
    subject: extra?.subject ?? row.subject,
    body: extra?.body ?? row.body,
    recipients: extra?.recipients ?? row.recipients,
    cardChoice: extra?.cardChoice ?? row.card_choice,
    identityDocumentIds: extra?.identityDocumentIds,
  };
  const res = extra?.clientCard
    ? await fetch(`/api/admin/bookings/${bookingId}/hotel-desk`, {
        method: "POST",
        body: (() => {
          const form = new FormData();
          form.set("action", fields.action);
          form.set("itemId", fields.itemId);
          form.set("kind", fields.kind);
          form.set("subject", fields.subject);
          form.set("body", fields.body);
          form.set("recipients", JSON.stringify(fields.recipients));
          form.set("cardChoice", fields.cardChoice || "");
          form.set("identityDocumentIds", JSON.stringify(fields.identityDocumentIds || []));
          form.set("clientCard", extra.clientCard as File);
          return form;
        })(),
      })
    : await fetch(`/api/admin/bookings/${bookingId}/hotel-desk`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(fields),
      });
  const json = (await res.json().catch(() => null)) as { error?: string; last4?: string; name?: string } | null;
  if (!res.ok) return { ok: false, error: json?.error || "Action impossible", last4: "", name: "" };
  return { ok: true, error: "", last4: json?.last4 || "", name: json?.name || "" };
}
