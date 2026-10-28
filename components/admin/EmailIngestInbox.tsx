"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { adminAction } from "@/lib/crm/admin-action";
import { shownPersonName } from "@/lib/crm/identity";
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
import { emailHtmlHasText, sanitizeEmailHtml } from "@/lib/crm/email-source";
import { collapseSharedTicketPrice } from "@/lib/crm/item-match";
import { collapseInboxRows } from "@/lib/crm/email-thread";
import { proposalLine, type ProposalOp } from "@/lib/crm/import-proposal";

type ExtractItem = {
  kind?: string;
  title?: string;
  confirmation_ref?: string | null;
  start_at?: string | null;
  amount?: number | null;
  details?: Record<string, unknown> | null;
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
  start_at?: string | null;
  end_at?: string | null;
  details?: Record<string, unknown> | null;
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
      return shownPersonName(record);
    })
    .filter(Boolean);
}

function OriginalMail({ row }: { row: CrmEmailIngest }) {
  const hasBody = Boolean(row.body_html || row.body_text);
  const [body, setBody] = useState<{ html: string; text: string } | null>(
    hasBody ? { html: row.body_html || "", text: row.body_text || "" } : null
  );
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (body || failed) return;
    let cancelled = false;
    void adminAction<{ body_html?: string; body_text?: string }>(`/api/admin/email-ingest/${row.id}`, {
      method: "GET",
    }).then((result) => {
      if (cancelled) return;
      if (!result.ok || !result.data) {
        setFailed(true);
        return;
      }
      setBody({ html: result.data.body_html || "", text: result.data.body_text || "" });
    });
    return () => {
      cancelled = true;
    };
  }, [body, failed, row.id]);
  const html = sanitizeEmailHtml(body?.html);
  const text = (body?.text || "").trim();
  const htmlVisible = emailHtmlHasText(body?.html);
  return (
    <aside className="rounded-2xl border border-[#C5A880] bg-[#FAF9F6] p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#C5A880]">
        Message d’origine
      </p>
      <p className="mt-2 text-sm font-semibold text-[#0B192C]">{row.subject?.trim() || "Sans objet"}</p>
      <p className="mt-1 text-xs text-muted">
        {row.from_email || "Expéditeur inconnu"}
        {row.received_at ? ` · ${formatDateTimeFr(row.received_at)}` : ""}
      </p>
      {!body && !failed ? <p className="mt-3 text-sm text-muted">Chargement du message…</p> : null}
      {failed ? <p className="mt-3 text-sm text-muted">Le message n’a pas pu être lu.</p> : null}
      {body && htmlVisible ? (
        <div
          className="mt-3 max-h-[32rem] overflow-auto rounded-xl bg-white p-3 text-sm text-[#0B192C]"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : body && text ? (
        <pre className="mt-3 max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-xl bg-white p-3 font-sans text-sm text-[#0B192C]">
          {text}
        </pre>
      ) : body ? (
        <p className="mt-3 text-sm text-muted">
          Ce mail n’a pas de texte. Le document est dans les pièces jointes.
        </p>
      ) : null}
    </aside>
  );
}

function pendingLabel(action: string) {
  if (action === "new_booking") return "Création…";
  if (action === "refuse") return "Refus…";
  if (action === "rematch") return "Nouvelle proposition…";
  if (action === "attach_booking") return "Dépôt…";
  if (action === "apply_cards" || action === "replace_booking") return "Dépôt…";
  return "Rattachement…";
}

function doneLabel(action: string) {
  if (action === "new_booking") return "Le dossier est créé. Le mail quitte la file.";
  if (action === "refuse") return "Le mail est classé sans dossier.";
  if (action === "attach_booking") return "Les pièces sont déposées. Les cartes n’ont pas changé.";
  if (action === "apply_cards" || action === "replace_booking") {
    return "Les pièces sont déposées. Les cartes n’ont pas changé.";
  }
  return "Le mail est classé sur le dossier.";
}

function itemLabel(kind: string | undefined) {
  return BOOKING_ITEM_LABELS[(kind || "fee") as BookingItemKind] || "Prestation";
}

export function EmailIngestInbox({
  rows,
  customers,
  mode = "file",
  proposals = [],
  initialOpenId = null,
}: {
  rows: CrmEmailIngest[];
  customers: PickableCustomer[];
  /** file : à traiter. appliques : 24 h, avec Annuler. ignores : à récupérer. */
  mode?: "file" | "appliques" | "ignores";
  proposals?: { emailIngestId: string; ops: ProposalOp[]; conflict: boolean }[];
  /** Carte déjà ouverte (test). La liste reste repliée. */
  initialOpenId?: string | null;
}) {
  const router = useRouter();
  const customerLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of customers) map.set(c.id, customerPickLabel(c));
    return map;
  }, [customers]);

  const [busy, setBusy] = useState<{ id: string; action: string } | null>(null);
  // L’autosave du titre a son propre état : il ne verrouille plus Rattacher / Créer (A-55).
  const [savingTitle, setSavingTitle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [pickFor, setPickFor] = useState<string | null>(null);
  const [bookings, setBookings] = useState<Record<string, BookingOption[]>>({});
  const [loadingRows, setLoadingRows] = useState<Record<string, boolean>>({});
  // Échec de chargement des voyages : distinct de « aucun voyage », avec « Réessayer ».
  const [loadErrors, setLoadErrors] = useState<Record<string, string>>({});
  // Dernier client demandé par ligne : une réponse tardive d’un autre client est ignorée.
  const latestLoad = useRef<Record<string, string>>({});
  const [selectedBooking, setSelectedBooking] = useState<Record<string, string>>({});
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, ExtractView>>({});
  const [currencyChosen, setCurrencyChosen] = useState<Record<string, boolean>>({});
  const [openedId, setOpenedId] = useState<string | null>(initialOpenId);

  const cards = useMemo(() => collapseInboxRows(rows), [rows]);
  const proposalById = useMemo(() => {
    const map = new Map<string, { ops: ProposalOp[]; conflict: boolean }>();
    for (const proposal of proposals) map.set(proposal.emailIngestId, proposal);
    return map;
  }, [proposals]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (mode !== "file") return;
      const card = cards[0]?.primary;
      if (!card) return;
      const key = event.key.toLowerCase();
      if (key === "a" && card.suggested_booking_id) {
        event.preventDefault();
        void act(card.id, { action: "attach_booking", booking_id: card.suggested_booking_id });
      } else if (key === "i") {
        event.preventDefault();
        void act(card.id, { action: "ignore" });
      } else if (key === "e") {
        event.preventDefault();
        void act(card.id, { action: "dismiss_duplicate" });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // act est déclaré plus bas et change à chaque frappe : les trois raccourcis ne lisent que la carte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, mode]);

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
    setBusy({ id: rowId, action: "rematch" });
    setError(null);
    setNotice(null);
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
    setBusy({ id: rowId, action: payload.action });
    setError(null);
    setNotice(null);
    setRowError((prev) => {
      if (!(rowId in prev)) return prev;
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
    try {
      const res = await fetch(`/api/admin/email-ingest/${rowId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        issues?: BookingIssue[];
        message?: string;
      };
      if (!res.ok) {
        const detail = (data.issues || []).map((issue) => issue.message).filter(Boolean).join(" ");
        setRowError((prev) => ({
          ...prev,
          [rowId]: detail || data.error || "Opération impossible",
        }));
        return;
      }
      setNotice(data.message || doneLabel(payload.action));
      if (opts?.refresh !== false) router.refresh();
    } catch {
      setRowError((prev) => ({ ...prev, [rowId]: "Réseau indisponible, réessayez." }));
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
      {notice ? (
        <p
          role="status"
          className="rounded-lg border border-[#C5A880] bg-[#FAF9F6] px-3 py-2 text-sm text-[#0B192C]"
        >
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-lg border border-accent/40 bg-accent/5 px-3 py-2 text-sm text-accent">
          {error}
        </p>
      ) : null}

      {cards.map(({ primary: row, members }) => {
        const extract = viewOf(row);
        const sourceItems = Array.isArray(extract.items) ? extract.items : [];
        const items = collapseSharedTicketPrice(
          sourceItems.map((item) => ({ ...item, kind: item.kind || "fee" }))
        );
        const ticketTotalOnce = items.some(
          (item, index) =>
            readDocumentAmount(sourceItems[index]?.details) != null &&
            readDocumentAmount(item.details) == null
        );
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
        const isBusy = busy?.id === row.id;
        const cardTitle =
          titles[row.id] ??
          emailCardTitle({
            title: extract.title,
            destination: extract.destination,
            subject: row.subject,
          });

        if (openedId !== row.id) {
          return (
            <article key={row.id} className="rounded-2xl border border-border bg-white px-4 py-3 shadow-sm">
              <button
                type="button"
                onClick={() => setOpenedId(row.id)}
                className="admin-tap flex w-full flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-left"
              >
                <span className="min-w-0 flex-1 truncate font-semibold text-[#0B192C]">
                  {row.subject?.trim() || "Sans objet"}
                </span>
                <span className="max-w-[16rem] truncate text-sm text-muted">{row.from_email || "—"}</span>
                <span className="text-sm text-muted">{row.received_at ? formatDateFr(row.received_at) : ""}</span>
                <span className="text-[10px] font-bold uppercase tracking-wide text-[#0B192C]">
                  {row.label || row.status}
                </span>
              </button>
            </article>
          );
        }

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
                  {members.length > 1 ? (
                    <span className="rounded-full bg-[#C5A880]/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#0B192C]">
                      Doublon possible · Fil de {members.length} messages
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
                {row.candidates[0]?.reason ? (
                  <p className="mt-1 text-xs text-[#0B192C]">
                    Proposition : {row.candidates[0].label} — {row.candidates[0].reason}
                  </p>
                ) : null}
                {proposalById.get(row.id)?.ops.length ? (
                  <div className="mt-2">
                    <p className="text-xs font-semibold text-muted">Avant / après</p>
                    <ul className="mt-1 space-y-0.5 text-sm text-[#0B192C]">
                      {proposalById.get(row.id)!.ops.map((op, index) => (
                        <li key={`${op.op}-${index}`}>{proposalLine(op)}</li>
                      ))}
                    </ul>
                    {proposalById.get(row.id)?.conflict ? (
                      <p className="mt-1 text-xs font-semibold text-[#8A5A12]">Conflit : choisir la carte.</p>
                    ) : null}
                  </div>
                ) : null}
                {(row.field_quotes || []).some((field) => field.confidence < 0.9) ? (
                  <ul className="mt-2 space-y-1">
                    {(row.field_quotes || [])
                      .filter((field) => field.confidence < 0.9)
                      .map((field) => (
                        <li
                          key={field.key}
                          title={field.quote || "Aucune citation dans le mail"}
                          className="text-sm font-semibold text-[#8A5A12]"
                        >
                          {field.value}
                        </li>
                      ))}
                  </ul>
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
                      {cancelling ? null : needsPrice &&
                        item.kind === "flight" &&
                        readDocumentAmount(sourceItems[index]?.details) != null &&
                        readDocumentAmount(item.details) == null ? (
                        <p className="mt-2 text-xs text-muted">
                          Même total que l’autre vol de ce billet : il n’est pas répété.
                        </p>
                      ) : needsPrice ? (
                        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_7.5rem]">
                          <Field
                            label="Prix imprimé sur le document"
                            hint={
                              ticketTotalOnce && item.kind === "flight"
                                ? "Total du billet, une fois pour ces vols."
                                : "Facultatif. Montant lu sur le PDF, s’il est imprimé."
                            }
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
                Aucune carte extraite. Déposer les pièces n’en crée pas.
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
                  <label className="block text-xs font-semibold text-muted">
                    Changer de dossier
                  <select
                    className={`${fieldControlClass} admin-tap mt-1 text-sm`}
                    value={selectedBooking[row.id] || ""}
                    aria-label="Changer de dossier"
                    onFocus={() => {
                      if (!options) loadBookings(row.id, customerId, row.suggested_booking_id);
                    }}
                    onChange={(e) => {
                      setSelectedBooking((prev) => ({ ...prev, [row.id]: e.target.value }));
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
                  </label>
                  {(() => {
                    const picked = selectedBooking[row.id];
                    const depositBookingId = picked != null ? picked : row.suggested_booking_id || "";
                    const cardLabel = "Mettre à jour les cartes";
                    return (
                      <>
                        <div className="flex flex-wrap gap-2 sm:col-span-2">
                          <button
                            type="button"
                            disabled={isBusy || !depositBookingId}
                            aria-busy={isBusy || undefined}
                            className="admin-af-btn-accent admin-tap rounded-lg px-3 py-2 text-sm disabled:opacity-50"
                            onClick={() =>
                              act(row.id, {
                                action: "attach_booking",
                                booking_id: depositBookingId,
                              })
                            }
                          >
                            {isBusy && busy?.action === "attach_booking" ? pendingLabel("attach_booking") : "Déposer les pièces"}
                          </button>
                          <button
                            type="button"
                            disabled={isBusy || !picked}
                            aria-busy={isBusy || undefined}
                            className="admin-tap rounded-lg border border-[var(--admin-navy)] px-3 py-2 text-sm font-semibold text-[var(--admin-navy)] disabled:opacity-50"
                            onClick={() =>
                              act(row.id, {
                                action: "apply_cards",
                                booking_id: picked,
                                item_id: undefined,
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
                            {isBusy && busy?.action === "apply_cards" ? pendingLabel("apply_cards") : cardLabel}
                          </button>
                        </div>
                        <p className="text-xs text-muted sm:col-span-2">
                          Déposer les pièces copie les fichiers sur le dossier. Les cartes ne changent pas.
                        </p>
                        <p className="text-xs text-muted sm:col-span-2">
                          Mettre à jour les cartes dépose les pièces sur la réservation qui correspond. Aucune carte n’est créée ni modifiée.
                        </p>
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
                {mode === "appliques" ? (
                  <button
                    type="button"
                    disabled={isBusy}
                    className="admin-tap rounded-lg bg-[#0B192C] px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
                    onClick={() => act(row.id, { action: "detach" })}
                  >
                    {isBusy && busy?.action === "detach" ? "Annulation…" : "Annuler"}
                  </button>
                ) : null}
                {mode === "ignores" ? (
                  <button
                    type="button"
                    disabled={isBusy}
                    className="admin-tap rounded-lg bg-[#0B192C] px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
                    onClick={() => act(row.id, { action: "restore" })}
                  >
                    {isBusy && busy?.action === "restore" ? "Retour…" : "Remettre dans la file"}
                  </button>
                ) : null}
                {mode === "file" ? (
                  <button
                    type="button"
                    disabled={isBusy}
                    className="admin-tap rounded-lg border border-[#C5A880] px-3 py-2 text-sm font-semibold text-[#0B192C] disabled:opacity-40"
                    onClick={() => act(row.id, { action: "dismiss_duplicate" })}
                  >
                    {isBusy && busy?.action === "dismiss_duplicate" ? "Écart…" : "Écarter le doublon"}
                  </button>
                ) : null}
                {mode === "file" ? (
                  <button
                    type="button"
                    disabled={isBusy}
                    className="admin-tap rounded-lg px-3 py-2 text-sm font-medium text-muted disabled:opacity-40"
                    onClick={() => act(row.id, { action: "ignore" })}
                  >
                    {isBusy && busy?.action === "ignore" ? "Ignoré…" : "Ignorer"}
                  </button>
                ) : null}
                {mode === "file" ? (
                <>
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
                  {isBusy && busy?.action === "new_booking" ? "Création…" : "Créer un dossier"}
                </button>
                {row.extract ? (
                  <button
                    type="button"
                    disabled={isBusy}
                    className="admin-tap inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-medium text-[var(--admin-navy)] disabled:opacity-40"
                    onClick={() => void rematch(row.id)}
                  >
                    <Icon name="sync_alt" className="h-4 w-4" />
                    {isBusy && busy?.action === "rematch" ? "Nouvelle proposition…" : "Reproposer"}
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={isBusy}
                  className="admin-tap inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-muted hover:text-accent disabled:opacity-40"
                  onClick={() => act(row.id, { action: "refuse" })}
                >
                  <Icon name="close" className="h-4 w-4" />
                  {isBusy && busy?.action === "refuse" ? "Refus…" : "Refuser"}
                </button>
                </>
                ) : null}
              </div>
              {rowError[row.id] ? (
                <p role="alert" className="mt-2 text-sm text-accent">
                  {rowError[row.id]}
                </p>
              ) : null}
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
