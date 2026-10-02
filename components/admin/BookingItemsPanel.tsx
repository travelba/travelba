"use client";

import { FormEvent, PointerEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Reorder } from "framer-motion";
import {
  countsAsCarnetCard,
  isExtraItemKind,
  isLedgerExpenseKind,
  visibleServiceCopy,
  type CrmBookingItem,
} from "@/lib/crm/types";
import type { BookingExtract } from "@/lib/crm/ingest-types";
import { readDocumentAmount } from "@/lib/crm/booking-issues";
import {
  documentsForItem,
  flightCardSubtitle,
  flightCardTitle,
  hotelDisplayName,
  itemClock,
  itemPriceLabel,
  keptHiddenFromClient,
  kindIcon,
} from "@/lib/crm/carnet";
import { flightCountsInStay } from "@/lib/crm/bookings";
import { groupAttachedEmails } from "@/lib/crm/email-duplicates";
import { formatMoney } from "@/lib/crm/money";
import { shortStayDay, shortStayRange } from "@/lib/crm/staff-stay";
import { Icon } from "@/components/crm/icons";
import { STAY_CURRENCIES } from "@/lib/crm/stay-currency";
import { HotelChecklistGlance, HotelDesk } from "@/components/admin/HotelDesk";
import { ProposedDuplicates } from "@/components/admin/ProposedDuplicates";
import type { CardViewLine, CrmBookingTraveler, CrmHotelArrival, CrmHotelMessage, CrmHotelRequest, CrmHotelThreadMessage, CrmTravelDocument } from "@/lib/crm/types";
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

function detailText(item: CrmBookingItem, key: string) {
  const value = item.details?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function stepTitle(item: CrmBookingItem) {
  if (item.kind === "hotel") return hotelDisplayName(item);
  if (item.kind === "flight" || item.kind === "rail") return flightCardTitle(item);
  return visibleServiceCopy(item.title);
}

function stepSubtitle(item: CrmBookingItem) {
  const parts: string[] = [];
  if (item.kind === "flight" || item.kind === "rail") {
    const number = detailText(item, "flight_number");
    const cabin = detailText(item, "cabin");
    const clock = itemClock(item.start_at);
    const end = itemClock(item.end_at);
    const tickets = Number(item.details?.ticket_count);
    if (number) parts.push(number);
    if (cabin) parts.push(cabin);
    if (clock) parts.push(end ? `${clock} → ${end}` : clock);
    if (item.kind === "flight" && Number.isFinite(tickets) && tickets > 1) {
      parts.push(`${Math.round(tickets)} billets`);
    }
  } else if (item.kind === "hotel") {
    const room = detailText(item, "room");
    const city = detailText(item, "city");
    if (room) parts.push(room);
    if (city) parts.push(city);
  } else if (item.supplier) {
    parts.push(item.supplier);
  }
  const ref = item.confirmation_ref || detailText(item, "pnr");
  if (ref) parts.push(`Réf. ${ref}`);
  return parts.filter(Boolean).join(" · ");
}

const flatBtn =
  "admin-tap inline-flex h-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-white px-3 text-xs font-semibold text-[var(--admin-navy)] disabled:opacity-40";
const flatIconBtn =
  "admin-tap inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-white text-sm font-bold text-[var(--admin-navy)]";

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
  hotelMessages = [],
  hotelThreadMessages = [],
  stayVisible = false,
}: {
  bookingId: string;
  items: CrmBookingItem[];
  stayVisible?: boolean;
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
    body_text?: string | null;
    extract?: unknown;
    warnings?: { file?: string | null; message?: string | null }[] | null;
  }[];
  hotelMessages?: CrmHotelMessage[];
  hotelThreadMessages?: CrmHotelThreadMessage[];
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
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [deskFor, setDeskFor] = useState<string | null>(null);

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

  async function dismissEmail(emailId: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/admin/email-ingest/${emailId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dismiss" }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "Impossible d’écarter ce doublon");
      return;
    }
    setNotice("Doublon écarté. Le mail reste en archive, la carte du voyage aussi.");
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
        <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">Étapes du voyage</h2>
        <button type="button" className="admin-af-btn rounded-full px-4 py-2 text-sm" onClick={startNew}>
          Ajouter une étape
        </button>
      </div>
      <p className="mt-1 text-xs text-muted">Glissez une étape pour changer l’ordre. Par défaut, l’ordre suit les dates.</p>
      <div className="mt-3">
        <BusyBar active={busy} label="Enregistrement…" />
      </div>
      {notice ? <p className="mt-2 text-sm text-[var(--admin-navy)]">{notice}</p> : null}
      <Reorder.Group
        axis="y"
        values={cardRows}
        onReorder={applyCardOrder}
        className="mt-1 flex list-none flex-col p-0 text-sm"
      >
        {cardRows.map((item) => {
          const locked = editingId === item.id || busy;
          const docs = documentsForItem(item, documents);
          const subtitle = stepSubtitle(item);
          const airport = item.kind === "flight" || item.kind === "rail" ? flightCardSubtitle(item) : "";
          const when =
            item.kind === "hotel" ? shortStayRange(item.start_at, item.end_at) : shortStayDay(item.start_at);
          const unshown =
            stayVisible &&
            !item.visible_to_client &&
            !keptHiddenFromClient(item.details) &&
            countsAsCarnetCard(item.kind);
          const price = flightCountsInStay(item, items) ? itemPriceLabel(item, currency) : null;
          const printed = readDocumentAmount(item.details);
          const stepAmount = item.amount == null ? null : Number(item.amount);
          const priceDiffers =
            printed != null && (stepAmount == null || Math.abs(printed - stepAmount) > 0.009);
          const counted = item.include_in_ledger && !(clientSettlesStay && !isExtraItemKind(item.kind));
          const quiet = [
            subtitle,
            docs.length ? `${docs.length} pièce${docs.length > 1 ? "s" : ""}` : "",
            counted ? "Compté" : "",
            priceDiffers && printed != null
              ? `Prix du document : ${printedPrice(printed, typeof item.details?.document_currency === "string" ? item.details.document_currency : "")}`
              : "",
          ]
            .filter(Boolean)
            .join(" · ");
          return (
          <Reorder.Item
            key={item.id}
            value={item}
            dragListener={!locked}
            onDragEnd={finishCardDrag}
            whileDrag={{ zIndex: 30, background: "#ffffff" }}
            className={`relative mt-2 ${locked ? "" : "cursor-grab active:cursor-grabbing"}`}
          >
            <div
              onPointerDown={blockDragFromControl}
              className={`rounded-2xl border px-3 py-3 ${
                unshown
                  ? "border-[var(--admin-gold)] bg-[var(--admin-peach)]"
                  : "border-[var(--border)] bg-white"
              }`}
            >
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
                  docs={docs}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void saveDraft()}
                    className="admin-af-btn admin-tap rounded-full px-4 py-2 text-sm"
                  >
                    {busy ? "…" : "Enregistrer l’étape"}
                  </button>
                  <button type="button" className={flatBtn} onClick={() => setEditingId(null)}>
                    Annuler
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <p className="w-16 shrink-0 pt-0.5 text-xs font-semibold text-muted">{when || "Sans date"}</p>
                <Icon name={kindIcon(item.kind)} className="mt-0.5 h-4 w-4 shrink-0 text-[var(--admin-navy)]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--admin-navy)]">{stepTitle(item)}</p>
                  {airport ? <p className="truncate text-xs text-muted">{airport}</p> : null}
                  {quiet ? <p className="truncate text-xs text-muted">{quiet}</p> : null}
                  {unshown ? (
                    <p className="text-xs font-semibold text-[var(--admin-gold-dark)]">Pas encore montré au client</p>
                  ) : null}
                  {item.kind === "hotel" && hotelRequests.some((row) => row.booking_item_id === item.id) ? (
                    <div className="mt-1">
                      {deskFor === item.id ? null : <HotelChecklistGlance itemId={item.id} requests={hotelRequests} />}
                      <button
                        type="button"
                        className={flatBtn}
                        onClick={() => setDeskFor(deskFor === item.id ? null : item.id)}
                      >
                        {deskFor === item.id ? "Fermer l’hôtel" : "Écrire à l’hôtel"}
                      </button>
                      {deskFor === item.id ? (
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
                          messages={hotelMessages}
                          thread={hotelThreadMessages}
                          attached={attachedEmails}
                        />
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {price ? <p className="text-sm font-semibold text-[var(--admin-navy)]">{price}</p> : null}
                  <div className="relative flex items-center gap-2">
                  <button type="button" className={flatBtn} onClick={() => startEdit(item)}>
                    Modifier
                  </button>
                  <button
                    type="button"
                    aria-label="Autres actions de l’étape"
                    className={flatIconBtn}
                    onClick={() => {
                      setMenuFor(menuFor === item.id ? null : item.id);
                      setConfirmRemove(null);
                    }}
                  >
                    …
                  </button>
                  {menuFor === item.id ? (
                    <div className="absolute right-0 top-9 z-20 flex w-44 flex-col gap-1 rounded-2xl border border-[var(--border)] bg-white p-2">
                      <button
                        type="button"
                        className={flatBtn}
                        disabled={busy}
                        onClick={() => void setCardVisible(item, !item.visible_to_client)}
                      >
                        {item.visible_to_client ? "Cacher" : "Montrer"}
                      </button>
                      {confirmRemove === item.id ? (
                        <button type="button" className={flatBtn} onClick={() => void removeItem(item.id)}>
                          Confirmer
                        </button>
                      ) : (
                        <button type="button" className={flatBtn} onClick={() => setConfirmRemove(item.id)}>
                          Retirer
                        </button>
                      )}
                    </div>
                  ) : null}
                  </div>
                </div>
              </div>
            )}
            </div>
          </Reorder.Item>
          );
        })}
      </Reorder.Group>
      <ProposedDuplicates
        duplicates={groupAttachedEmails(attachedEmails).duplicates}
        busy={busy}
        onDismiss={(id) => void dismissEmail(id)}
      />
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
            className="admin-af-btn admin-tap rounded-full px-4 py-2 text-sm"
          >
            {busy ? "Enregistrement…" : "Ajouter au dossier"}
          </button>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-sm text-accent">{error}</p> : null}
      <p className="mt-2 text-xs text-muted">Retirer une étape garde le fichier dans le dossier.</p>
    </section>
  );
}

function ItemAttachments({
  bookingId,
  itemId,
  docs,
  compact = false,
}: {
  bookingId: string;
  itemId: string;
  docs: CrmBookingDocument[];
  compact?: boolean;
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

  if (compact) return null;

  return (
    <div className="mt-2 space-y-1">
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
        <button type="submit" disabled={busy} className={flatBtn}>
          {busy ? "Envoi…" : "Joindre"}
        </button>
      </form>
    </div>
  );
}
