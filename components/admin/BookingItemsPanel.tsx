"use client";

import { FormEvent, PointerEvent, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Reorder, useDragControls } from "framer-motion";
import {
  countsAsCarnetCard,
  isExtraItemKind,
  isLedgerExpenseKind,
  visibleServiceCopy,
  type CrmBookingItem,
} from "@/lib/crm/types";
import type { BookingExtract } from "@/lib/crm/ingest-types";
import { readDocumentAmount } from "@/lib/crm/booking-issues";
import { ticketTravelerNames } from "@/lib/crm/document-passengers";
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
import { bookingStepAnchor } from "@/lib/crm/booking-tabs";
import { DRAFT_STEP_PREFIX, stepCommitPlan, type StepSnapshot } from "@/lib/crm/step-draft";
import { formatMoney } from "@/lib/crm/money";
import { shortStayDay, shortStayRange } from "@/lib/crm/staff-stay";
import { Icon } from "@/components/crm/icons";
import { STAY_CURRENCIES } from "@/lib/crm/stay-currency";
import { HotelChecklistGlance, HotelDesk } from "@/components/admin/HotelDesk";
import { ProposedDuplicates } from "@/components/admin/ProposedDuplicates";
import type { CardViewLine, CrmBookingTraveler, CrmHotelArrival, CrmHotelMessage, CrmHotelRequest, CrmHotelThreadMessage, CrmTravelDocument } from "@/lib/crm/types";
import { FilePreviewGrid } from "@/components/crm/FilePreview";
import { attachmentPreviews } from "@/lib/crm/preview-files";
import { IngestItemCard } from "@/components/crm/IngestItemCard";
import { BusyBar } from "@/components/crm/BusyBar";
import { ConfirmAction } from "@/components/crm/ConfirmAction";
import { adminAction } from "@/lib/crm/admin-action";
import { readLedgerWarning } from "@/lib/crm/ledger-warning";
import { LedgerWarningNotice } from "@/components/crm/LedgerWarningNotice";
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

function stayCards(list: CrmBookingItem[]) {
  return list.filter((item) => !isLedgerExpenseKind(item.kind));
}

function toSnapshot(item: CrmBookingItem): StepSnapshot {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    supplier: item.supplier,
    confirmation_ref: item.confirmation_ref,
    start_at: item.start_at,
    end_at: item.end_at,
    amount: item.amount,
    include_in_ledger: Boolean(item.include_in_ledger),
    visible_to_client: Boolean(item.visible_to_client),
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

/**
 * Une étape déplaçable : seule la poignée (icône grip) démarre le glisser, le reste de la carte
 * laisse passer le défilement tactile et les clics (A-35). Les flèches du menu font la même chose au clavier.
 */
function ReorderStep({
  item,
  locked,
  onDragEnd,
  children,
}: {
  item: CrmBookingItem;
  locked: boolean;
  onDragEnd: () => void;
  children: (handle: { onPointerDown: (event: PointerEvent<HTMLElement>) => void }) => ReactNode;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDragEnd}
      whileDrag={{ zIndex: 30, background: "#ffffff" }}
      className="relative mt-2"
    >
      {children({
        onPointerDown: (event) => {
          if (locked) return;
          controls.start(event);
        },
      })}
    </Reorder.Item>
  );
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
  openHotelItemId = null,
  reference = null,
  onLiveItems,
  onStepsPending,
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
  openHotelItemId?: string | null;
  documents?: CrmBookingDocument[];
  household?: HouseholdMember[];
  currency?: string;
  clientSettlesStay?: boolean;
  onBindDraftSave?: (save: (() => Promise<boolean>) | null) => void;
  /** Référence du dossier, pour le même libellé que les pièces jointes. */
  reference?: string | null;
  /** Cartes en cours, prix compris, pour que le montant du séjour suive sans attendre l’enregistrement. */
  onLiveItems?: (items: CrmBookingItem[]) => void;
  /** Une étape retirée ou modifiée attend l’enregistrement du séjour. */
  onStepsPending?: (pending: boolean) => void;
}) {
  const router = useRouter();
  const pendingRef = useRef(false);
  const baselineRef = useRef(stayCards(items));
  const [pending, setPending] = useState(false);
  const [rows, setRows] = useState(items);
  const [syncedItems, setSyncedItems] = useState(items);
  if (syncedItems !== items) {
    setSyncedItems(items);
    if (!pending) {
      setRows(items);
      setPending(false);
    }
  }
  useEffect(() => {
    if (pending) return;
    baselineRef.current = stayCards(rows);
  }, [pending, rows]);
  const onStepsPendingRef = useRef(onStepsPending);
  useEffect(() => {
    onStepsPendingRef.current = onStepsPending;
  });
  useEffect(() => {
    onStepsPendingRef.current?.(pending);
  }, [pending]);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<ItemDraft>(emptyDraft());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rowsRef = useRef(rows);
  const cardRowsRef = useRef<CrmBookingItem[]>([]);
  const orderDirty = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Étape enregistrée mais grand livre refusé : reste affiché après router.refresh(), jusqu’au prochain enregistrement.
  const [ledgerNote, setLedgerNote] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [openStep, setOpenStep] = useState<string | null>(null);
  // `?hotel=` (toast « l’hôtel a répondu ») ouvre le bureau de cet hôtel dès le montage.
  const [deskFor, setDeskFor] = useState<string | null>(() => {
    if (!openHotelItemId) return null;
    const item = items.find((row) => row.id === openHotelItemId && row.kind === "hotel");
    return item && hotelRequests.some((row) => row.booking_item_id === item.id) ? item.id : null;
  });

  useEffect(() => {
    if (!openHotelItemId || deskFor !== openHotelItemId) return;
    document.getElementById(`hotel-desk-${openHotelItemId}`)?.scrollIntoView({ block: "center" });
  }, [deskFor, openHotelItemId]);

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

  function remember(next: CrmBookingItem[]) {
    const cards = stayCards(next);
    rowsRef.current = next;
    cardRowsRef.current = cards;
    const plan = stepCommitPlan(baselineRef.current.map(toSnapshot), cards.map(toSnapshot));
    pendingRef.current = plan.pending;
    setPending(plan.pending);
    setRows(next);
  }

  const cardRows = stayCards(rows);

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
    orderDirty.current = true;
    remember([...nextCards, ...expenses]);
  }

  function finishCardDrag() {
    orderDirty.current = false;
  }

  /** Monter / Descendre au clavier : même ordre, même enregistrement que le glisser. */
  function moveCard(item: CrmBookingItem, delta: -1 | 1) {
    const current = cardRowsRef.current;
    const index = current.findIndex((row) => row.id === item.id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= current.length) return;
    const next = [...current];
    [next[index], next[target]] = [next[target], next[index]];
    applyCardOrder(next);
    finishCardDrag();
    setMenuFor(null);
  }

  const applyDraftToRows = useCallback(
    (current: CrmBookingItem[], editing: string, source: ItemDraft, newId?: string) => {
    if (!source.title.trim()) return null;
    const payload = {
      kind: source.kind,
      title: source.title.trim(),
      supplier: source.supplier || null,
      confirmation_ref: source.confirmation_ref || null,
      start_at: source.start_at || null,
      end_at: source.end_at || null,
      amount: source.amount ?? null,
      include_in_ledger:
        clientSettlesStay && !isExtraItemKind(source.kind) ? false : Boolean(source.include_in_ledger),
      details: source.details || {},
    };
    if (editing === "new") {
      const created: CrmBookingItem = {
        id: newId || `${DRAFT_STEP_PREFIX}${crypto.randomUUID()}`,
        booking_id: bookingId,
        kind: payload.kind,
        title: payload.title,
        supplier: payload.supplier,
        confirmation_ref: payload.confirmation_ref,
        start_at: payload.start_at,
        end_at: payload.end_at,
        amount: payload.amount,
        include_in_ledger: payload.include_in_ledger,
        sort_order: current.length,
        details: payload.details,
        visible_to_client: false,
        source_document_id: null,
        lifecycle: "active",
        created_at: "",
        updated_at: "",
      };
      return [...stayCards(current), created, ...current.filter((item) => isLedgerExpenseKind(item.kind))];
    }
    return current.map((item) => (item.id === editing ? { ...item, ...payload } : item));
  },
    [bookingId, clientSettlesStay]
  );

  const onLiveItemsRef = useRef(onLiveItems);
  useEffect(() => {
    onLiveItemsRef.current = onLiveItems;
  });
  useEffect(() => {
    const next =
      editingId && draft.title.trim()
        ? applyDraftToRows(rows, editingId, draft, `${DRAFT_STEP_PREFIX}live`) || rows
        : rows;
    onLiveItemsRef.current?.(next);
  }, [rows, editingId, draft, applyDraftToRows]);

  function keepDraft() {
    if (!editingId) return;
    const next = applyDraftToRows(rowsRef.current, editingId, draft);
    if (!next) {
      setError("Titre requis.");
      return;
    }
    setError(null);
    setEditingId(null);
    remember(next);
  }

  async function flushSteps() {
    let current = rowsRef.current;
    const editing = editingRef.current;
    if (editing) {
      const next = applyDraftToRows(current, editing, draftRef.current);
      if (!next) {
        setError("Titre requis.");
        return false;
      }
      current = next;
      setEditingId(null);
      remember(next);
    }
    const plan = stepCommitPlan(baselineRef.current.map(toSnapshot), stayCards(current).map(toSnapshot));
    if (!plan.pending) return true;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/bookings/${bookingId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commit: true,
        deleted: plan.deleted,
        updated: plan.updated,
        created: plan.created.map((step) => ({ ...step, client_id: step.id })),
        order: plan.order,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "Les étapes n’ont pas été enregistrées.");
      return false;
    }
    setLedgerNote(readLedgerWarning(json));
    const ids = (json.ids || {}) as Record<string, string>;
    const remapped = current.map((item) => {
      const real = ids[item.id];
      return real ? { ...item, id: real } : item;
    });
    rowsRef.current = remapped;
    cardRowsRef.current = stayCards(remapped);
    baselineRef.current = cardRowsRef.current;
    pendingRef.current = false;
    setPending(false);
    setRows(remapped);
    return true;
  }

  const editingRef = useRef(editingId);
  const draftRef = useRef(draft);
  const saveDraftRef = useRef(flushSteps);
  const onBindRef = useRef(onBindDraftSave);
  useEffect(() => {
    editingRef.current = editingId;
    draftRef.current = draft;
    saveDraftRef.current = flushSteps;
    onBindRef.current = onBindDraftSave;
  });
  useEffect(() => {
    onBindRef.current?.(() => saveDraftRef.current());
    return () => onBindRef.current?.(null);
  }, []);

  function setCardVisible(item: CrmBookingItem, visible: boolean) {
    if (visible && (item.lifecycle === "cancelled" || item.lifecycle === "superseded")) {
      setError("Cette carte est archivée. Elle ne revient pas dans le carnet.");
      return;
    }
    const details = { ...(item.details || {}) };
    if (visible) delete details.client_hidden;
    else details.client_hidden = true;
    setMenuFor(null);
    remember(
      rowsRef.current.map((row) =>
        row.id === item.id ? { ...row, visible_to_client: visible, details } : row
      )
    );
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
    if (editingId === id) setEditingId(null);
    setMenuFor(null);
    remember(rowsRef.current.filter((row) => row.id !== id));
  }

  return (
    <section className="admin-af-card rounded-3xl p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">Étapes du voyage</h2>
        <button type="button" className="admin-af-btn rounded-full px-4 py-2 text-sm" onClick={startNew}>
          Ajouter une étape
        </button>
      </div>
      <p className="mt-1 text-xs text-muted">Déplacez une étape par sa poignée, ou Monter / Descendre dans son menu. Par défaut, l’ordre suit les dates.</p>
      {pending ? (
        <p className="mt-2 text-sm font-semibold text-[var(--admin-navy)]">
          Modifications en attente. Elles ne s’appliquent qu’à l’enregistrement du séjour.
        </p>
      ) : null}
      <div className="mt-3">
        <BusyBar active={busy} label="Enregistrement…" />
      </div>
      {notice ? <p className="mt-2 text-sm text-[var(--admin-navy)]">{notice}</p> : null}
      <LedgerWarningNotice message={ledgerNote} onDismiss={() => setLedgerNote(null)} className="mt-2" />
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
          const ticketNames = item.kind === "flight" ? ticketTravelerNames(item.details) : [];
          const airport = item.kind === "flight" || item.kind === "rail" ? flightCardSubtitle(item) : "";
          const when =
            item.kind === "hotel" ? shortStayRange(item.start_at, item.end_at) : shortStayDay(item.start_at);
          const retired =
            item.lifecycle === "superseded" || item.lifecycle === "cancelled";
          const retiredLabel = item.lifecycle === "cancelled" ? "Annulée" : retired ? "Remplacée" : "";
          const unshown =
            stayVisible &&
            !retired &&
            !item.visible_to_client &&
            !keptHiddenFromClient(item.details) &&
            countsAsCarnetCard(item.kind);
          const price = flightCountsInStay(item, rows) ? itemPriceLabel(item, currency) : null;
          const printed = readDocumentAmount(item.details);
          const stepAmount = item.amount == null ? null : Number(item.amount);
          const priceDiffers =
            printed != null && (stepAmount == null || Math.abs(printed - stepAmount) > 0.009);
          const counted = item.include_in_ledger && !(clientSettlesStay && !isExtraItemKind(item.kind));
          const quiet = [
            retiredLabel,
            subtitle,
            docs.length ? `${docs.length} pièce${docs.length > 1 ? "s" : ""}` : "",
            counted ? "Compté" : "",
            priceDiffers && printed != null
              ? `Prix du document : ${printedPrice(printed, typeof item.details?.document_currency === "string" ? item.details.document_currency : "")}`
              : "",
          ]
            .filter(Boolean)
            .join(" · ");
          const position = cardRows.findIndex((row) => row.id === item.id);
          return (
          <ReorderStep key={item.id} item={item} locked={locked} onDragEnd={finishCardDrag}>
            {(handle) => (
            <div
              id={bookingStepAnchor(item.id)}
              className={`scroll-mt-28 rounded-2xl border px-3 py-3 ${
                retired
                  ? "border-[var(--border)] bg-[#F4F1EA] text-muted"
                  : unshown
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
                {item.id.startsWith(DRAFT_STEP_PREFIX) ? null : (
                <ItemAttachments
                  bookingId={bookingId}
                  itemId={item.id}
                  docs={docs}
                  items={rows}
                  reference={reference}
                />
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={keepDraft}
                    className="admin-af-btn admin-tap rounded-full px-4 py-2 text-sm"
                  >
                    Valider
                  </button>
                  <button type="button" className={flatBtn} onClick={() => setEditingId(null)}>
                    Annuler
                  </button>
                </div>
              </div>
            ) : (
              <>
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  aria-label={`Déplacer ${stepTitle(item)}`}
                  disabled={locked}
                  onPointerDown={handle.onPointerDown}
                  className="-ml-1 mt-0.5 inline-flex h-6 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted active:cursor-grabbing disabled:opacity-30"
                >
                  <Icon name="grip" className="h-4 w-4" />
                </button>
                <div className="min-w-0 flex-1">
                <button
                  type="button"
                  aria-expanded={openStep === item.id}
                  onClick={() => setOpenStep(openStep === item.id ? null : item.id)}
                  className="flex w-full items-start gap-3 rounded-xl text-left"
                >
                  <span className="w-16 shrink-0 pt-0.5 text-xs font-semibold text-muted">{when || "Sans date"}</span>
                  <Icon name={kindIcon(item.kind)} className="mt-0.5 h-4 w-4 shrink-0 text-[var(--admin-navy)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-[var(--admin-navy)]">{stepTitle(item)}</span>
                    {ticketNames.length ? (
                      <span className="block text-sm font-semibold text-[var(--admin-navy)]">{ticketNames.join(", ")}</span>
                    ) : null}
                    {airport ? <span className="block truncate text-xs text-muted">{airport}</span> : null}
                    {quiet ? <span className="block truncate text-xs text-muted">{quiet}</span> : null}
                    {unshown ? (
                      <span className="block text-xs font-semibold text-[var(--admin-gold-dark)]">Pas encore montré au client</span>
                    ) : null}
                  </span>
                  {price ? <span className="shrink-0 text-sm font-semibold text-[var(--admin-navy)]">{price}</span> : null}
                  <Icon
                    name="expand_more"
                    className={`mt-0.5 h-4 w-4 shrink-0 text-muted transition ${openStep === item.id ? "rotate-180" : ""}`}
                  />
                </button>
                {item.kind === "hotel" && hotelRequests.some((row) => row.booking_item_id === item.id) ? (
                  <div className="mt-2 flex gap-3">
                    <span className="w-16 shrink-0" />
                    <span className="w-4 shrink-0" />
                    <div className="min-w-0 flex-1">
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
                        focusReply={openHotelItemId === item.id}
                      />
                    ) : null}
                    </div>
                  </div>
                ) : null}
                </div>
                <div className="relative flex shrink-0 items-center gap-2">
                  <button type="button" className={flatBtn} onClick={() => startEdit(item)}>
                    Modifier
                  </button>
                  <button
                    type="button"
                    aria-label="Autres actions de l’étape"
                    className={flatIconBtn}
                    onClick={() => setMenuFor(menuFor === item.id ? null : item.id)}
                  >
                    …
                  </button>
                  {menuFor === item.id ? (
                    <div className="absolute right-0 top-9 z-20 flex w-60 flex-col gap-2 rounded-2xl border border-[var(--border)] bg-white p-2">
                      {!retired ? (
                      <button
                        type="button"
                        className={flatBtn}
                        disabled={busy}
                        onClick={() => void setCardVisible(item, !item.visible_to_client)}
                      >
                        {item.visible_to_client ? "Cacher" : "Montrer"}
                      </button>
                      ) : null}
                      <div className="flex gap-1">
                        <button
                          type="button"
                          className={`${flatBtn} flex-1 gap-1`}
                          disabled={busy || position <= 0}
                          onClick={() => moveCard(item, -1)}
                        >
                          <Icon name="arrow_up" className="h-3.5 w-3.5" />
                          Monter
                        </button>
                        <button
                          type="button"
                          className={`${flatBtn} flex-1 gap-1`}
                          disabled={busy || position < 0 || position >= cardRows.length - 1}
                          onClick={() => moveCard(item, 1)}
                        >
                          <Icon name="arrow_down" className="h-3.5 w-3.5" />
                          Descendre
                        </button>
                      </div>
                      <ConfirmAction
                        size="sm"
                        tone="danger"
                        label="Retirer"
                        confirmLabel="Retirer l’étape"
                        ariaLabel={`Retirer ${stepTitle(item)}`}
                        question="L’étape quitte la liste. Elle quitte le voyage à l’enregistrement du séjour. Le fichier reste dans le dossier."
                        disabled={busy}
                        onConfirm={() => removeItem(item.id)}
                      />
                    </div>
                  ) : null}
                  </div>
              </div>
              {openStep === item.id ? (
                <div className="mt-3 border-t border-[var(--border)] pt-3">
                  <ItemAttachments
                    bookingId={bookingId}
                    itemId={item.id}
                    docs={docs}
                    items={rows}
                    reference={reference}
                    filesOnly
                  />
                </div>
              ) : null}
              </>
            )}
            </div>
            )}
          </ReorderStep>
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
            onClick={keepDraft}
            className="admin-af-btn admin-tap rounded-full px-4 py-2 text-sm"
          >
            Valider
          </button>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-sm text-accent">{error}</p> : null}
      <p className="mt-2 text-xs text-muted">Retirer une étape la retire de la liste. Le voyage change à l’enregistrement. Le fichier reste dans le dossier.</p>
    </section>
  );
}

function ItemAttachments({
  bookingId,
  itemId,
  docs,
  items,
  reference = null,
  compact = false,
  filesOnly = false,
}: {
  bookingId: string;
  itemId: string;
  docs: CrmBookingDocument[];
  items: CrmBookingItem[];
  reference?: string | null;
  compact?: boolean;
  /** Ligne déroulée : la vignette et Retirer, comme les pièces jointes. */
  filesOnly?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const fd = new FormData(form);
    fd.set("booking_item_id", itemId);
    setBusy(true);
    setError(null);
    const result = await adminAction(`/api/admin/bookings/${bookingId}/documents`, {
      method: "POST",
      formData: fd,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "Pièce non jointe. Réessayez.");
      return;
    }
    form.reset();
    router.refresh();
  }

  /** Confirmé sur la vignette : renvoie l’erreur pour l’afficher sous le bouton. */
  async function removeDoc(documentId: string) {
    const result = await adminAction(
      `/api/admin/bookings/${bookingId}/documents?id=${encodeURIComponent(documentId)}`,
      { method: "DELETE" }
    );
    if (!result.ok) return result.error || "Retrait impossible. Réessayez.";
    router.refresh();
    return undefined;
  }

  if (compact) return null;

  const files = attachmentPreviews(docs, items, reference);

  return (
    <div className={filesOnly ? "space-y-1" : "mt-2 space-y-1"}>
      {files.length ? (
        <FilePreviewGrid
          files={files}
          onRemove={(file) => removeDoc(file.id)}
          removeQuestion={(file) => `${file.label} quitte le dossier et son fichier est supprimé.`}
        />
      ) : filesOnly ? (
        <p className="text-xs text-muted">Aucun justificatif sur cette étape.</p>
      ) : null}
      {filesOnly ? null : (
      <form onSubmit={upload} className="flex flex-wrap items-center gap-2">
        <BusyBar active={busy} label="Envoi…" />
        <input name="file" type="file" required disabled={busy} className="text-xs" />
        <button type="submit" disabled={busy} className={flatBtn}>
          {busy ? "Envoi…" : "Joindre"}
        </button>
        {error ? (
          <p role="alert" className="basis-full text-xs text-[var(--admin-red)]">
            {error}
          </p>
        ) : null}
      </form>
      )}
    </div>
  );
}
