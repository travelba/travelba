"use client";

import { FormEvent, PointerEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Reorder } from "framer-motion";
import {
  BOOKING_ITEM_LABELS,
  isExtraItemKind,
  isLedgerExpenseKind,
  visibleServiceCopy,
  type BookingItemKind,
  type CrmBookingItem,
} from "@/lib/crm/types";
import type { BookingExtract } from "@/lib/crm/ingest-types";
import { itemDetailsLine, itemWhen } from "@/lib/crm/booking-display";
import { readDocumentAmount } from "@/lib/crm/booking-issues";
import { documentsForItem, hotelDisplayName, itemPriceLabel } from "@/lib/crm/carnet";
import { flightCountsInStay } from "@/lib/crm/bookings";
import { attachedEmailLabel } from "@/lib/crm/email-detach";
import { formatDateTimeFr, formatMoney } from "@/lib/crm/money";
import { STAY_CURRENCIES } from "@/lib/crm/stay-currency";
import { HotelContactButton } from "@/components/crm/HotelContact";
import { HotelDesk } from "@/components/admin/HotelDesk";
import type { CardViewLine, CrmBookingTraveler, CrmHotelArrival, CrmHotelRequest, CrmTravelDocument } from "@/lib/crm/types";
import { FilePreviewTile } from "@/components/crm/FilePreview";
import { IngestItemCard } from "@/components/crm/IngestItemCard";
import { BusyBar } from "@/components/crm/BusyBar";
import type { CrmBookingDocument } from "@/lib/crm/types";
import type { HouseholdMember } from "@/lib/crm/household";

type ItemDraft = BookingExtract["items"][number];

function emptyDraft(): ItemDraft {
  return {
    kind: "hotel",
    title: "",
    supplier: "",
    confirmation_ref: "",
    start_at: "",
    end_at: "",
    amount: null,
    include_in_ledger: false,
    details: {},
  };
}

function toDraft(item: CrmBookingItem): ItemDraft {
  return {
    kind: isLedgerExpenseKind(item.kind) ? "fee" : item.kind,
    title: item.title,
    supplier: item.supplier || "",
    confirmation_ref: item.confirmation_ref || "",
    start_at: item.start_at || "",
    end_at: item.end_at || "",
    amount: item.amount,
    include_in_ledger: Boolean(item.include_in_ledger),
    details: item.details || {},
  };
}

function printedPrice(amount: number, currency: string) {
  const code = currency.trim().toUpperCase();
  if ((STAY_CURRENCIES as readonly string[]).includes(code)) return formatMoney(amount, code);
  return currency ? `${amount.toLocaleString("fr-FR")} ${currency}` : amount.toLocaleString("fr-FR");
}

function blockDragFromControl(event: PointerEvent<HTMLElement>) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest("button, a, input, textarea, select, label")) event.stopPropagation();
}

export function BookingItemsPanel({
  bookingId,
  items,
  documents = [],
  household = [],
  currency = "EUR",
  clientSettlesStay = false,
  onBindDraftSave,
  hotelRequests = [],
  today = "",
  travelers = [],
  identityDocs = [],
  holder = null,
  arrivals = [],
  hasCardCode = false,
  cardViews = [],
  attachedEmails = [],
}: {
  bookingId: string;
  items: CrmBookingItem[];
  hotelRequests?: CrmHotelRequest[];
  today?: string;
  travelers?: CrmBookingTraveler[];
  identityDocs?: CrmTravelDocument[];
  holder?: { first_name: string; last_name: string } | null;
  arrivals?: CrmHotelArrival[];
  hasCardCode?: boolean;
  cardViews?: CardViewLine[];
  attachedEmails?: {
    id: string;
    subject: string | null;
    from_email: string | null;
    received_at: string | null;
    extract?: unknown;
  }[];
  documents?: CrmBookingDocument[];
  household?: HouseholdMember[];
  currency?: string;
  clientSettlesStay?: boolean;
  onBindDraftSave?: (save: (() => Promise<boolean>) | null) => void;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(items);
  const [syncedItems, setSyncedItems] = useState(items);
  if (syncedItems !== items) {
    setSyncedItems(items);
    setRows(items);
  }
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<ItemDraft>(emptyDraft());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rowsRef = useRef(rows);
  const cardRowsRef = useRef<CrmBookingItem[]>([]);
  const orderDirty = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDetach, setConfirmDetach] = useState<string | null>(null);

  function startEdit(item: CrmBookingItem) {
    setEditingId(item.id);
    const next = toDraft(item);
    if (clientSettlesStay && !isExtraItemKind(item.kind)) next.include_in_ledger = false;
    setDraft(next);
    setError(null);
  }

  function startNew() {
    setEditingId("new");
    setDraft(emptyDraft());
    setError(null);
  }

  async function persistOrder(next: CrmBookingItem[]) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/bookings/${bookingId}/items`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: next.map((item) => item.id) }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Ordre non enregistré.");
      setRows(items);
      return;
    }
    router.refresh();
  }

  const cardRows = rows.filter((item) => !isLedgerExpenseKind(item.kind));

  useEffect(() => {
    rowsRef.current = rows;
    cardRowsRef.current = cardRows;
  });

  function applyCardOrder(nextCards: CrmBookingItem[]) {
    if (
      nextCards.length === cardRowsRef.current.length &&
      nextCards.every((item, index) => item.id === cardRowsRef.current[index]?.id)
    ) {
      return;
    }
    const expenses = rowsRef.current.filter((item) => isLedgerExpenseKind(item.kind));
    const next = [...nextCards, ...expenses];
    rowsRef.current = next;
    cardRowsRef.current = nextCards;
    orderDirty.current = true;
    setRows(next);
  }

  function finishCardDrag() {
    if (!orderDirty.current) return;
    orderDirty.current = false;
    void persistOrder(cardRowsRef.current);
  }

  async function saveDraft() {
    if (!editingId) return true;
    if (!draft.title.trim()) {
      setError("Titre requis.");
      return false;
    }
    setBusy(true);
    setError(null);
    const payload = {
      kind: draft.kind,
      title: draft.title,
      supplier: draft.supplier || null,
      confirmation_ref: draft.confirmation_ref || null,
      start_at: draft.start_at || null,
      end_at: draft.end_at || null,
      amount: draft.amount,
      include_in_ledger:
        clientSettlesStay && !isExtraItemKind(draft.kind) ? false : Boolean(draft.include_in_ledger),
      details: draft.details || {},
    };
    const res =
      editingId && editingId !== "new"
        ? await fetch(`/api/admin/bookings/${bookingId}/items`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: editingId, ...payload }),
          })
        : await fetch(`/api/admin/bookings/${bookingId}/items`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "Enregistrement impossible");
      return false;
    }
    setEditingId(null);
    router.refresh();
    return true;
  }

  const saveDraftRef = useRef(saveDraft);
  const onBindRef = useRef(onBindDraftSave);
  useEffect(() => {
    saveDraftRef.current = saveDraft;
    onBindRef.current = onBindDraftSave;
  });
  useEffect(() => {
    onBindRef.current?.(() => saveDraftRef.current());
    return () => onBindRef.current?.(null);
  }, []);

  async function setCardVisible(item: CrmBookingItem, visible: boolean) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/bookings/${bookingId}/items`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, visible_to_client: visible }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "La carte n’a pas pu être masquée.");
      return;
    }
    router.refresh();
  }

  async function detachEmail(emailId: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/admin/email-ingest/${emailId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "detach" }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      error?: string;
      kept?: string[];
      deleted_booking?: boolean;
    };
    setBusy(false);
    setConfirmDetach(null);
    if (!res.ok) {
      setError(json.error || "Remise impossible");
      return;
    }
    if (json.deleted_booking) {
      router.push("/admin/emails");
      return;
    }
    const kept = (json.kept || []).filter(Boolean);
    setNotice(
      kept.length
        ? `Mail remis dans les e-mails. Une carte déjà présente a été laissée : ${kept.join(", ")}.`
        : "Mail remis dans les e-mails à rattacher."
    );
    router.refresh();
  }

  async function removeItem(id: string) {
    setBusy(true);
    await fetch(`/api/admin/bookings/${bookingId}/items?itemId=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    setBusy(false);
    if (editingId === id) setEditingId(null);
    router.refresh();
  }

  return (
    <section className="admin-af-card rounded-3xl p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold">Cartes</h2>
        <button
          type="button"
          className="text-xs font-semibold text-[var(--admin-navy)] underline"
          onClick={startNew}
        >
          Ajouter une carte
        </button>
      </div>
      <p className="mt-1 text-xs text-muted">
        Déplacez une carte pour changer l’ordre du carnet. Par défaut : chronologique. Une carte hôtel
        revient chaque nuit dans l’aperçu : retirer la carte retire toutes ces lignes. Une chambre en trop
        se retire dans la carte.
      </p>
      <div className="mt-3">
        <BusyBar active={busy} label="Enregistrement…" />
      </div>
      {attachedEmails.map((mail) => (
        <div
          key={mail.id}
          className="mt-3 rounded-2xl border border-[var(--admin-gold)] bg-[var(--surface-2)] px-3 py-3"
        >
          <p className="text-sm font-semibold text-[var(--admin-navy)]">{attachedEmailLabel(mail)}</p>
          <p className="mt-1 text-xs text-muted">
            Importé depuis un e-mail
            {mail.from_email ? ` · ${mail.from_email}` : ""}
            {mail.received_at ? ` · ${formatDateTimeFr(mail.received_at)}` : ""}
          </p>
          {confirmDetach === mail.id ? (
            <div className="mt-2">
              <p className="text-sm text-[var(--admin-navy)]">
                Retirer cette réservation de ce dossier et la remettre dans les e-mails à rattacher ?
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  className="admin-tap rounded-full bg-[var(--admin-navy)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                  onClick={() => void detachEmail(mail.id)}
                >
                  Remettre dans les e-mails
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className="admin-tap rounded-full px-3 py-1.5 text-xs font-semibold text-muted"
                  onClick={() => setConfirmDetach(null)}
                >
                  Annuler
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={busy}
              className="admin-tap mt-2 text-xs font-semibold text-[var(--admin-navy)] underline disabled:opacity-40"
              onClick={() => setConfirmDetach(mail.id)}
            >
              Remettre dans les e-mails
            </button>
          )}
        </div>
      ))}
      {notice ? <p className="mt-2 text-sm text-[var(--admin-navy)]">{notice}</p> : null}
      <Reorder.Group
        axis="y"
        values={cardRows}
        onReorder={applyCardOrder}
        className="mt-2 flex list-none flex-col gap-2 p-0 text-sm"
      >
        {cardRows.map((item) => {
          const locked = editingId === item.id || busy;
          return (
          <Reorder.Item
            key={item.id}
            value={item}
            dragListener={!locked}
            onDragEnd={finishCardDrag}
            whileDrag={{
              scale: 1.02,
              zIndex: 30,
              boxShadow: "0 16px 40px rgba(11, 25, 44, 0.18)",
              borderColor: "#C5A880",
            }}
            className={`relative rounded-xl border border-border bg-[var(--surface)] px-3 py-2 ${
              locked ? "" : "cursor-grab active:cursor-grabbing"
            }`}
          >
            <div onPointerDown={blockDragFromControl}>
            {editingId === item.id ? (
              <div className="space-y-2">
                <IngestItemCard
                  item={draft}
                  household={household}
                  lockStayLedger={clientSettlesStay}
                  onChange={setDraft}
                  onRemove={() => setEditingId(null)}
                />
                <ItemAttachments
                  bookingId={bookingId}
                  itemId={item.id}
                  docs={documentsForItem(item, documents)}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void saveDraft()}
                    className="admin-af-btn rounded-full px-4 py-1.5 text-xs"
                  >
                    {busy ? "…" : "Enregistrer la carte"}
                  </button>
                  <button type="button" className="text-xs font-semibold" onClick={() => setEditingId(null)}>
                    Annuler
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium">
                    {visibleServiceCopy(BOOKING_ITEM_LABELS[item.kind as BookingItemKind] || item.kind)} ·{" "}
                    {item.kind === "hotel" ? hotelDisplayName(item) : visibleServiceCopy(item.title)}
                    {!item.visible_to_client ? (
                      <span className="ml-2 rounded-full bg-[var(--admin-peach)] px-2 py-0.5 text-[10px] font-bold uppercase">
                        Brouillon
                      </span>
                    ) : null}
                    {item.include_in_ledger && !(clientSettlesStay && !isExtraItemKind(item.kind)) ? (
                      <span className="ml-2 rounded-full bg-[var(--admin-sky)] px-2 py-0.5 text-[10px] font-bold uppercase">
                        Transactions
                      </span>
                    ) : null}
                  </p>
                  {item.kind === "hotel" ? <HotelContactButton item={item} /> : null}
                  {item.kind === "hotel" ? (
                    <HotelDesk
                      bookingId={bookingId}
                      item={item}
                      requests={hotelRequests}
                      today={today}
                      travelers={travelers}
                      identityDocs={identityDocs}
                      holder={holder}
                      cardLast4={arrivals.find((arrival) => arrival.booking_item_id === item.id)?.card_last4 || null}
                      clientCardName={arrivals.find((arrival) => arrival.booking_item_id === item.id)?.client_card_name || null}
                      hasCardCode={hasCardCode}
                      cardViews={cardViews.filter((line) => line.itemId === item.id)}
                    />
                  ) : null}
                  <p className="text-xs text-muted">
                    {[itemWhen(item), itemDetailsLine(item), flightCountsInStay(item, items) ? itemPriceLabel(item, currency) : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {readDocumentAmount(item.details) != null ? (
                    <p className="text-xs text-muted">
                      Prix imprimé sur le document :{" "}
                      {printedPrice(
                        readDocumentAmount(item.details) as number,
                        typeof item.details?.document_currency === "string"
                          ? item.details.document_currency
                          : ""
                      )}
                      . Corrigez-le dans la carte si la lecture a coupé le montant.
                    </p>
                  ) : null}
                  <ItemAttachments
                    bookingId={bookingId}
                    itemId={item.id}
                    docs={documentsForItem(item, documents)}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-1 [&_button]:cursor-pointer">
                  <button
                    type="button"
                    className="text-xs font-semibold text-[var(--admin-navy)]"
                    onClick={() => startEdit(item)}
                  >
                    Modifier
                  </button>
                  <button
                    type="button"
                    className="text-xs font-semibold text-[var(--admin-navy)]"
                    disabled={busy}
                    onClick={() => void setCardVisible(item, !item.visible_to_client)}
                  >
                    {item.visible_to_client ? "Masquer" : "Afficher"}
                  </button>
                  <button
                    type="button"
                    className="admin-tap rounded-full px-3 text-xs font-semibold text-accent"
                    onClick={() => void removeItem(item.id)}
                  >
                    Retirer
                  </button>
                </div>
              </div>
            )}
            </div>
          </Reorder.Item>
          );
        })}
      </Reorder.Group>
      {editingId === "new" ? (
        <div className="mt-3 space-y-2">
          <IngestItemCard
            item={draft}
            household={household}
            lockStayLedger={clientSettlesStay}
            onChange={setDraft}
            onRemove={() => setEditingId(null)}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveDraft()}
            className="admin-af-btn rounded-full px-4 py-2 text-sm"
          >
            {busy ? "Enregistrement…" : "Ajouter au dossier"}
          </button>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-sm text-accent">{error}</p> : null}
      <p className="mt-2 text-xs text-muted">Retirer une carte conserve le PDF joint au dossier.</p>
    </section>
  );
}

function ItemAttachments({
  bookingId,
  itemId,
  docs,
}: {
  bookingId: string;
  itemId: string;
  docs: CrmBookingDocument[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fd = new FormData(form);
    fd.set("booking_item_id", itemId);
    setBusy(true);
    await fetch(`/api/admin/bookings/${bookingId}/documents`, { method: "POST", body: fd });
    setBusy(false);
    form.reset();
    router.refresh();
  }

  async function removeDoc(documentId: string) {
    setBusy(true);
    await fetch(
      `/api/admin/bookings/${bookingId}/documents?id=${encodeURIComponent(documentId)}`,
      { method: "DELETE" }
    );
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="mt-2 space-y-1">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">Pièces jointes</p>
      <div className="flex flex-wrap gap-3">
        {docs.map((doc) => (
          <FilePreviewTile
            key={doc.id}
            onRemove={() => void removeDoc(doc.id)}
            file={{
              id: doc.id,
              path: doc.storage_path,
              fileName: doc.file_name || "document",
              mimeType: doc.mime_type,
              label: doc.file_name || "Pièce jointe",
              shareText: "Bonjour, je vous transmets une pièce de la réservation.",
            }}
          />
        ))}
      </div>
      <form onSubmit={upload} className="flex flex-wrap items-center gap-2">
        <BusyBar active={busy} label="Envoi…" />
        <input name="file" type="file" required className="text-xs" />
        <button type="submit" disabled={busy} className="text-xs font-semibold text-[var(--admin-navy)]">
          {busy ? "Envoi…" : "Joindre"}
        </button>
      </form>
    </div>
  );
}
