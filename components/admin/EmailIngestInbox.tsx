"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { adminAction } from "@/lib/crm/admin-action";
import { Icon } from "@/components/crm/icons";
import { CustomerPickDialog } from "@/components/admin/CustomerPickDialog";
import { EmptyState } from "@/components/crm/ui";
import { Field, MoneyInput, fieldControlClass } from "@/components/crm/fields";
import { FilePreviewGrid } from "@/components/crm/FilePreview";
import { STAY_CURRENCIES, stayCurrency } from "@/lib/crm/stay-currency";
import {
  itemRequiresDocumentPrice,
  readDocumentAmount,
  type BookingIssue,
} from "@/lib/crm/booking-issues";
import {
  BOOKING_ITEM_LABELS,
  visibleServiceCopy,
  type BookingItemKind,
  type CrmEmailIngest,
} from "@/lib/crm/types";
import {
  customerPickLabel,
  type PickableCustomer,
} from "@/lib/crm/customer-search";
import { emailCardTitle } from "@/lib/crm/ingest-title";
import { formatDateFr, formatDateRangeShort, formatDateTimeFr, formatMoney } from "@/lib/crm/money";
import { sanitizeEmailHtml } from "@/lib/crm/email-source";
import { inboxStayAction, type LifecycleCard } from "@/lib/crm/item-lifecycle";

type ExtractItem = {
  kind?: string;
  title?: string;
  confirmation_ref?: string | null;
  amount?: number | null;
  details?: {
    document_amount?: number | string | null;
    document_currency?: string | null;
  } | null;
};

function formatDocumentPrice(amount: number, currency: string) {
  if (/^[A-Z]{3}$/.test(currency)) {
    try {
      return formatMoney(amount, currency);
    } catch {
      return `${amount.toLocaleString("fr-FR")} ${currency}`;
    }
  }
  return currency
    ? `${amount.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
    : amount.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type ExtractView = {
  title?: string | null;
  destination?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  document_status?: string | null;
  currency?: string | null;
  items?: ExtractItem[];
};

type BookingCard = {
  id: string;
  kind: string;
  title: string;
  confirmation_ref: string | null;
  lifecycle: string | null;
  amount: number | null;
};

type BookingOption = {
  id: string;
  reference: string;
  label: string;
  status: string;
  statusKey?: string;
  items?: BookingCard[];
};

function printedTravelers(row: CrmEmailIngest) {
  const raw = row.extract?.travelers;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((person) => {
      if (!person || typeof person !== "object") return "";
      const record = person as { first_name?: string | null; last_name?: string | null };
      return [record.first_name, record.last_name].filter(Boolean).join(" ").trim();
    })
    .filter(Boolean);
}

function OriginalMail({ row }: { row: CrmEmailIngest }) {
  const html = sanitizeEmailHtml(row.body_html);
  const text = (row.body_text || "").trim();
  return (
    <aside className="rounded-2xl border border-[#C5A880] bg-[#FAF9F6] p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#C5A880]">
        Message d’origine
      </p>
      <p className="mt-2 text-sm font-semibold text-[#0B192C]">{row.subject || "Sans objet"}</p>
      <p className="mt-1 text-xs text-muted">
        {row.from_email || "Expéditeur inconnu"}
        {row.received_at ? ` · ${formatDateTimeFr(row.received_at)}` : ""}
      </p>
      {html ? (
        <div
          className="mt-3 max-h-[32rem] overflow-auto rounded-xl bg-white p-3 text-sm text-[#0B192C]"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : text ? (
        <pre className="mt-3 max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-xl bg-white p-3 font-sans text-sm text-[#0B192C]">
          {text}
        </pre>
      ) : (
        <p className="mt-3 text-sm text-muted">
          Le corps de ce message n’a pas encore été conservé. Les prochains mails afficheront le texte reçu.
        </p>
      )}
    </aside>
  );
}

function itemLabel(kind: string | undefined) {
  return BOOKING_ITEM_LABELS[(kind || "fee") as BookingItemKind] || "Prestation";
}

export function EmailIngestInbox({
  rows,
  customers,
}: {
  rows: CrmEmailIngest[];
  customers: PickableCustomer[];
}) {
  const router = useRouter();
  const customerLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of customers) map.set(c.id, customerPickLabel(c));
    return map;
  }, [customers]);

  const [busy, setBusy] = useState<string | null>(null);
  // L’autosave du titre a son propre état : il ne verrouille plus Rattacher / Créer (A-55).
  const [savingTitle, setSavingTitle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [pickFor, setPickFor] = useState<string | null>(null);
  const [bookings, setBookings] = useState<Record<string, BookingOption[]>>({});
  const [loadingRows, setLoadingRows] = useState<Record<string, boolean>>({});
  // Échec de chargement des voyages : distinct de « aucun voyage », avec « Réessayer ».
  const [loadErrors, setLoadErrors] = useState<Record<string, string>>({});
  // Dernier client demandé par ligne : une réponse tardive d’un autre client est ignorée.
  const latestLoad = useRef<Record<string, string>>({});
  const [selectedBooking, setSelectedBooking] = useState<Record<string, string>>({});
  const [selectedItem, setSelectedItem] = useState<Record<string, string>>({});
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, ExtractView>>({});
  const [currencyChosen, setCurrencyChosen] = useState<Record<string, boolean>>({});

  const chosenCustomer = useCallback(
    (row: CrmEmailIngest) => chosen[row.id] ?? row.suggested_customer_id ?? "",
    [chosen]
  );

  const loadBookings = useCallback(
    async (rowId: string, customerId: string, preselect?: string | null) => {
      if (!customerId) return;
      latestLoad.current[rowId] = customerId;
      const stale = () => latestLoad.current[rowId] !== customerId;
      setLoadingRows((prev) => ({ ...prev, [rowId]: true }));
      // Pas de voyage d’un autre client gardé sélectionné pendant le chargement ou après un échec.
      setSelectedBooking((prev) => (prev[rowId] ? { ...prev, [rowId]: "" } : prev));
      setLoadErrors((prev) => {
        if (!(rowId in prev)) return prev;
        const next = { ...prev };
        delete next[rowId];
        return next;
      });
      try {
        const res = await fetch(
          `/api/admin/email-ingest/bookings?customer_id=${encodeURIComponent(customerId)}`
        );
        const data = (await res.json().catch(() => ({}))) as {
          bookings?: BookingOption[];
          error?: string;
        };
        if (stale()) return;
        if (!res.ok || !Array.isArray(data.bookings)) {
          setLoadErrors((prev) => ({
            ...prev,
            [rowId]: data.error || "Impossible de charger les voyages de ce client.",
          }));
          return;
        }
        const list = data.bookings;
        setBookings((prev) => ({ ...prev, [rowId]: list }));
        setSelectedBooking((prev) => ({
          ...prev,
          [rowId]:
            preselect && list.some((b) => b.id === preselect)
              ? preselect
              : list[0]?.id || "",
        }));
      } catch {
        if (!stale()) {
          setLoadErrors((prev) => ({
            ...prev,
            [rowId]: "Connexion interrompue : voyages non chargés.",
          }));
        }
      } finally {
        if (!stale()) setLoadingRows((prev) => ({ ...prev, [rowId]: false }));
      }
    },
    []
  );

  // Client déjà proposé : les voyages se chargent tout de suite, sans attendre un clic (A-55).
  const preloaded = useRef(new Set<string>());
  useEffect(() => {
    for (const row of rows) {
      if (!row.suggested_customer_id || preloaded.current.has(row.id)) continue;
      preloaded.current.add(row.id);
      void loadBookings(row.id, row.suggested_customer_id, row.suggested_booking_id);
    }
  }, [rows, loadBookings]);

  async function saveTitle(rowId: string, title: string) {
    setSavingTitle(rowId);
    const result = await adminAction(`/api/admin/email-ingest/${rowId}`, {
      method: "POST",
      body: { action: "save_title", title },
    });
    setSavingTitle(null);
    if (!result.ok) setError(result.error || "Titre non enregistré.");
  }

  /** Reproposer : relance client / voyage sur l’extract stocké, sans rattacher. */
  async function rematch(rowId: string) {
    setBusy(rowId);
    setError(null);
    const result = await adminAction(`/api/admin/email-ingest/${rowId}`, { method: "POST", body: { action: "rematch" } });
    setBusy(null);
    if (!result.ok) {
      setError(result.error || "Nouvelle proposition impossible.");
      return;
    }
    setChosen((prev) => {
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
    setBookings((prev) => {
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
    preloaded.current.delete(rowId);
    router.refresh();
  }

  function viewOf(row: CrmEmailIngest): ExtractView {
    return drafts[row.id] || ((row.extract || {}) as ExtractView);
  }

  function writeDraft(row: CrmEmailIngest, patch: ExtractView) {
    const base =
      row.extract && typeof row.extract === "object" && !Array.isArray(row.extract)
        ? (row.extract as ExtractView)
        : {};
    setDrafts((prev) => ({
      ...prev,
      [row.id]: { ...base, ...(prev[row.id] || {}), ...patch },
    }));
  }

  function patchItem(
    row: CrmEmailIngest,
    index: number,
    details: ExtractItem["details"]
  ) {
    const items = [...(viewOf(row).items || [])];
    const current = items[index];
    if (!current) return;
    items[index] = { ...current, details: { ...(current.details || {}), ...details } };
    writeDraft(row, { items });
  }

  function removeItem(row: CrmEmailIngest, index: number) {
    writeDraft(row, { items: (viewOf(row).items || []).filter((_, i) => i !== index) });
  }

  async function act(
    rowId: string,
    payload: {
      action: string;
      customer_id?: string;
      booking_id?: string;
      title?: string;
      extract?: ExtractView;
      apply_stay_currency?: boolean;
      item_id?: string;
    },
    opts?: { refresh?: boolean }
  ) {
    setBusy(rowId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/email-ingest/${rowId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        issues?: BookingIssue[];
      };
      if (!res.ok) {
        const detail = (data.issues || []).map((issue) => issue.message).filter(Boolean).join(" ");
        setError(detail || data.error || "Opération impossible");
        return;
      }
      if (opts?.refresh !== false) router.refresh();
    } catch {
      setError("Réseau indisponible, réessayez.");
    } finally {
      setBusy(null);
    }
  }

  if (!rows.length) {
    return (
      <EmptyState
        title="Aucun e-mail à rattacher"
        description="Les mails fournisseurs (Little Emperors, Expedia TAAP, billets d’avion) restent ici tant que l’agence ne les a pas rattachés ou refusés."
      />
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-lg border border-accent/40 bg-accent/5 px-3 py-2 text-sm text-accent">
          {error}
        </p>
      ) : null}

      {rows.map((row) => {
        const extract = viewOf(row);
        const items = Array.isArray(extract.items) ? extract.items : [];
        const customerId = chosenCustomer(row);
        const customerName = customerId
          ? customerLabelById.get(customerId) || "Client choisi"
          : null;
        const suggestedIds = [
          ...new Set(
            [row.suggested_customer_id, ...row.candidates.map((c) => c.customer_id)].filter(
              Boolean
            ) as string[]
          ),
        ];
        const options = bookings[row.id];
        const loadingBookings = Boolean(loadingRows[row.id]);
        const bookingsError = loadingBookings ? null : loadErrors[row.id] || null;
        const isBusy = busy === row.id;
        const cardTitle =
          titles[row.id] ??
          emailCardTitle({
            title: extract.title,
            destination: extract.destination,
            subject: row.subject,
          });

        return (
          <article
            key={row.id}
            className="rounded-2xl border border-border bg-white p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {row.label ? (
                    <span className="rounded-full bg-[var(--admin-navy)]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--admin-navy)]">
                      {row.label}
                    </span>
                  ) : null}
                  {row.status === "matched" ? (
                    <span className="rounded-full bg-[var(--admin-gold)]/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--admin-navy)]">
                      Client proposé
                    </span>
                  ) : null}
                  {row.status === "received" ? (
                    <span className="rounded-full bg-[var(--admin-navy)]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--admin-navy)]">
                      Analyse en cours
                    </span>
                  ) : null}
                  {row.status === "error" ? (
                    <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">
                      Erreur
                    </span>
                  ) : null}
                  {extract.document_status === "quote" ? (
                    <span className="rounded-full bg-[var(--admin-peach)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--admin-navy)]">
                      Devis
                    </span>
                  ) : null}
                  {extract.document_status === "cancelled" ? (
                    <span className="rounded-full bg-[#F4F1EA] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--admin-navy)] ring-1 ring-[var(--border)]">
                      Annulation
                    </span>
                  ) : null}
                </div>
                {row.error ? (
                  <p className="mt-2 text-sm text-accent">{row.error}</p>
                ) : null}
                <label className="mt-2 block text-xs font-semibold text-muted">
                  Titre du dossier
                  <input
                    value={cardTitle}
                    onChange={(event) =>
                      setTitles((prev) => ({ ...prev, [row.id]: event.target.value }))
                    }
                    onBlur={(event) => {
                      const next = event.target.value.trim();
                      if (!next || next === (extract.title || "").trim()) return;
                      void saveTitle(row.id, next);
                    }}
                    className={`${fieldControlClass} admin-tap mt-1`}
                    aria-label="Titre du dossier"
                  />
                  {savingTitle === row.id ? (
                    <span className="mt-1 block text-[11px] font-medium text-muted" aria-live="polite">
                      Titre enregistré en arrière-plan…
                    </span>
                  ) : null}
                </label>
                {row.subject ? (
                  <p className="mt-1 truncate text-xs text-muted">Sujet du mail : {row.subject}</p>
                ) : null}
                <p className="truncate text-xs text-muted">
                  {row.from_email || "—"}
                  {row.received_at ? ` · ${formatDateFr(row.received_at)}` : ""}
                </p>
              </div>
            </div>

            <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
            <div>
            {printedTravelers(row).length ? (
              <p className="text-sm text-[var(--admin-navy)]">
                {printedTravelers(row).length > 1 ? "Voyageurs" : "Voyageur"} :{" "}
                {printedTravelers(row).join(", ")}
              </p>
            ) : null}
            {(extract.start_date || extract.end_date) && (
              <p className="mt-2 text-sm text-[var(--admin-navy)]">
                {formatDateRangeShort(extract.start_date, extract.end_date)}
              </p>
            )}

            <div className="mt-3 max-w-xs">
              <Field
                label="Devise du séjour"
                hint="EUR, USD, CHF ou GBP. Le PDF ne remplace pas ce choix."
              >
                <select
                  value={stayCurrency(extract.currency)}
                  onChange={(event) => {
                    writeDraft(row, { currency: event.target.value });
                    setCurrencyChosen((prev) => ({ ...prev, [row.id]: true }));
                  }}
                  aria-label="Devise du séjour"
                  className={`${fieldControlClass} admin-tap bg-white`}
                >
                  {STAY_CURRENCIES.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {items.length ? (
              <ul className="mt-2 space-y-2">
                {items.map((item, index) => {
                  const amount = readDocumentAmount(item.details);
                  const currency =
                    typeof item.details?.document_currency === "string"
                      ? item.details.document_currency.trim().toUpperCase()
                      : "";
                  const documentCurrency = (STAY_CURRENCIES as readonly string[]).includes(currency)
                    ? currency
                    : currency
                      ? stayCurrency(currency)
                      : "";
                  const needsPrice = itemRequiresDocumentPrice(item.kind);
                  const cancelling = extract.document_status === "cancelled";
                  return (
                    <li
                      key={index}
                      className={`rounded-xl border p-2 text-sm ${
                        cancelling
                          ? "border-[var(--border)] bg-[#F4F1EA] text-muted"
                          : "border-border"
                      }`}
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                        <span className="mt-0.5 w-fit rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                          {itemLabel(item.kind)}
                        </span>
                        <span className={`min-w-0 flex-1 ${cancelling ? "text-muted" : "text-[var(--admin-navy)]"}`}>
                          <span className={`block truncate ${cancelling ? "line-through" : ""}`}>
                            {visibleServiceCopy(item.title || "—")}
                          </span>
                          {cancelling ? (
                            <span className="mt-1 inline-flex rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--admin-navy)] ring-1 ring-[var(--border)]">
                              Serait annulée
                            </span>
                          ) : null}
                          {item.confirmation_ref ? (
                            <span className="block truncate text-xs text-muted">
                              Réf. {item.confirmation_ref}
                            </span>
                          ) : null}
                        </span>
                        <button
                          type="button"
                          className="admin-tap self-start rounded-full px-3 text-xs font-semibold text-accent"
                          aria-label={`Retirer ${itemLabel(item.kind)}`}
                          onClick={() => removeItem(row, index)}
                        >
                          Retirer
                        </button>
                      </div>
                      {cancelling ? null : needsPrice ? (
                        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_7.5rem]">
                          <Field
                            label="Prix imprimé sur le document"
                            hint="Facultatif. Montant lu sur le PDF, s’il est imprimé."
                          >
                            <MoneyInput
                              value={amount}
                              onChange={(next) => patchItem(row, index, { document_amount: next })}
                              aria-label={`Prix document ${itemLabel(item.kind)}`}
                              placeholder="Montant imprimé"
                            />
                          </Field>
                          <Field label="Devise du document">
                            <select
                              value={documentCurrency}
                              onChange={(event) =>
                                patchItem(row, index, { document_currency: event.target.value })
                              }
                              aria-label={`Devise du document ${itemLabel(item.kind)}`}
                              className={`${fieldControlClass} admin-tap bg-white`}
                            >
                              <option value="">Choisir</option>
                              {STAY_CURRENCIES.map((code) => (
                                <option key={code} value={code}>
                                  {code}
                                </option>
                              ))}
                            </select>
                          </Field>
                        </div>
                      ) : amount != null ? (
                        <p className="mt-1 text-xs text-muted">
                          Prix imprimé sur le document : {formatDocumentPrice(amount, currency)}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">
                Aucune carte extraite — à saisir après rattachement.
              </p>
            )}

            {row.attachments?.length ? (
              <div className="mt-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
                  Pièces jointes
                </p>
                <div className="mt-2">
                  <FilePreviewGrid
                    files={row.attachments.map((file, index) => ({
                      id: `${row.id}-${index}`,
                      path: file.path,
                      fileName: file.name || "document",
                      mimeType: file.mime_type,
                      label: file.name || "Pièce jointe",
                      shareText: "Bonjour, je vous transmets une pièce du dossier.",
                    }))}
                  />
                </div>
              </div>
            ) : null}

            {row.warnings?.length ? (
              <p className="mt-2 text-xs text-accent">
                {row.warnings.map((w) => w.message).join(" · ")}
              </p>
            ) : null}
            </div>
            <OriginalMail row={row} />
            </div>

            <div className="mt-3 rounded-xl border border-border bg-[var(--surface-2)]/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm">
                  <span className="text-muted">Client : </span>
                  <span className="font-semibold text-[var(--admin-navy)]">
                    {customerName || "à choisir"}
                  </span>
                </p>
                <button
                  type="button"
                  className="admin-tap inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-semibold text-[var(--admin-navy)] hover:bg-white"
                  onClick={() => setPickFor(row.id)}
                >
                  <Icon name="group" className="h-4 w-4" />
                  {customerName ? "Changer" : "Choisir un client"}
                </button>
              </div>

              {customerId ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                  <select
                    className="admin-af-input text-sm"
                    value={selectedBooking[row.id] || ""}
                    aria-label="Voyage du client"
                    onFocus={() => {
                      if (!options) loadBookings(row.id, customerId, row.suggested_booking_id);
                    }}
                    onChange={(e) => {
                      setSelectedBooking((prev) => ({ ...prev, [row.id]: e.target.value }));
                      setSelectedItem((prev) => ({ ...prev, [row.id]: "" }));
                    }}
                  >
                    {!options || loadingBookings ? (
                      <option value="">
                        {loadingBookings
                          ? "Voyages en cours de chargement…"
                          : bookingsError
                            ? "Voyages non chargés"
                            : "Charger les voyages…"}
                      </option>
                    ) : options.length ? (
                      options.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.label} ({b.status})
                        </option>
                      ))
                    ) : (
                      <option value="">Aucun voyage pour ce client</option>
                    )}
                  </select>
                  {(() => {
                    const stay = options?.find((booking) => booking.id === selectedBooking[row.id]);
                    const gesture = stay
                      ? inboxStayAction({
                          documentStatus: extract.document_status,
                          incoming: items,
                          bookingStatus: stay.statusKey,
                          items: (stay.items || []) as LifecycleCard[],
                          chosenItemId: selectedItem[row.id] || null,
                        })
                      : null;
                    const waitingForCard = Boolean(gesture?.choices.length && !gesture.itemId);
                    return (
                      <>
                        {gesture?.cancelCards?.length ? (
                          <ul className="space-y-1 sm:col-span-2">
                            {gesture.cancelCards.map((card) => (
                              <li
                                key={card.id}
                                className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[#F4F1EA] px-3 py-2 text-sm"
                              >
                                <span className="text-muted line-through">{card.title}</span>
                                <span className="inline-flex rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--admin-navy)] ring-1 ring-[var(--border)]">
                                  Serait annulée
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {gesture?.choices.length ? (
                          <select
                            className="admin-af-input text-sm sm:col-span-2"
                            value={selectedItem[row.id] || ""}
                            aria-label="Carte du séjour"
                            onChange={(event) =>
                              setSelectedItem((prev) => ({ ...prev, [row.id]: event.target.value }))
                            }
                          >
                            <option value="">Choisir la carte</option>
                            {gesture.choices.map((card) => (
                              <option key={card.id} value={card.id}>
                                {itemLabel(card.kind)} — {card.title}
                              </option>
                            ))}
                          </select>
                        ) : null}
                        <button
                          type="button"
                          disabled={isBusy || !selectedBooking[row.id] || waitingForCard}
                          className="admin-af-btn-accent admin-tap rounded-lg px-3 py-2 text-sm disabled:opacity-50"
                          onClick={() =>
                            act(row.id, {
                              action: gesture?.action === "replace" ? "replace_booking" : "attach_booking",
                              booking_id: selectedBooking[row.id],
                              item_id: gesture?.itemId || undefined,
                              title: cardTitle.trim(),
                              ...(drafts[row.id]
                                ? {
                                    extract: drafts[row.id],
                                    apply_stay_currency: Boolean(currencyChosen[row.id]),
                                  }
                                : {}),
                            })
                          }
                        >
                          {gesture?.label || "Rattacher au voyage"}
                        </button>
                        {gesture?.hint ? (
                          <p className="text-xs text-muted sm:col-span-2">{gesture.hint}</p>
                        ) : null}
                      </>
                    );
                  })()}
                  {bookingsError ? (
                    <p
                      role="alert"
                      className="flex flex-wrap items-center gap-2 text-sm text-[var(--admin-red)] sm:col-span-2"
                    >
                      {bookingsError}
                      <button
                        type="button"
                        className="admin-tap rounded-full px-3 py-1 text-xs font-semibold text-[var(--admin-navy)] ring-1 ring-[var(--border)]"
                        onClick={() => void loadBookings(row.id, customerId, row.suggested_booking_id)}
                      >
                        Réessayer
                      </button>
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={isBusy || !customerId}
                  className="admin-tap inline-flex items-center gap-1 rounded-lg border border-[var(--admin-navy)] px-3 py-2 text-sm font-semibold text-[var(--admin-navy)] disabled:opacity-40"
                  onClick={() =>
                    act(row.id, {
                      action: "new_booking",
                      customer_id: customerId,
                      title: cardTitle.trim(),
                      ...(drafts[row.id]
                        ? {
                            extract: drafts[row.id],
                            apply_stay_currency: Boolean(currencyChosen[row.id]),
                          }
                        : {}),
                    })
                  }
                >
                  <Icon name="add" className="h-4 w-4" />
                  Créer un dossier
                </button>
                {row.extract ? (
                  <button
                    type="button"
                    disabled={isBusy}
                    className="admin-tap inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-medium text-[var(--admin-navy)] disabled:opacity-40"
                    onClick={() => void rematch(row.id)}
                  >
                    <Icon name="sync_alt" className="h-4 w-4" />
                    Reproposer
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={isBusy}
                  className="admin-tap inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-muted hover:text-accent disabled:opacity-40"
                  onClick={() => act(row.id, { action: "refuse" })}
                >
                  <Icon name="close" className="h-4 w-4" />
                  Refuser
                </button>
              </div>
            </div>

            <CustomerPickDialog
              open={pickFor === row.id}
              customers={customers}
              suggestedIds={suggestedIds}
              selectedId={customerId}
              title="Rattacher à un client"
              onSelect={(c) => {
                setChosen((prev) => ({ ...prev, [row.id]: c.id }));
                setBookings((prev) => {
                  const next = { ...prev };
                  delete next[row.id];
                  return next;
                });
                loadBookings(row.id, c.id, row.suggested_booking_id);
              }}
              onClose={() => setPickFor(null)}
            />
          </article>
        );
      })}
    </div>
  );
}
