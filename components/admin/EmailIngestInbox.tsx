"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/crm/icons";
import { CustomerPickDialog } from "@/components/admin/CustomerPickDialog";
import { EmptyState } from "@/components/crm/ui";
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
import { formatDateFr, formatDateRangeShort } from "@/lib/crm/money";

type ExtractItem = {
  kind?: string;
  title?: string;
  confirmation_ref?: string | null;
};

type ExtractView = {
  title?: string | null;
  destination?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  document_status?: string | null;
  items?: ExtractItem[];
};

type BookingOption = { id: string; reference: string; label: string; status: string };

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
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [pickFor, setPickFor] = useState<string | null>(null);
  const [bookings, setBookings] = useState<Record<string, BookingOption[]>>({});
  const [selectedBooking, setSelectedBooking] = useState<Record<string, string>>({});

  const chosenCustomer = useCallback(
    (row: CrmEmailIngest) => chosen[row.id] ?? row.suggested_customer_id ?? "",
    [chosen]
  );

  const loadBookings = useCallback(
    async (rowId: string, customerId: string, preselect?: string | null) => {
      if (!customerId) return;
      try {
        const res = await fetch(
          `/api/admin/email-ingest/bookings?customer_id=${encodeURIComponent(customerId)}`
        );
        const data = (await res.json()) as { bookings?: BookingOption[] };
        const list = data.bookings || [];
        setBookings((prev) => ({ ...prev, [rowId]: list }));
        setSelectedBooking((prev) => ({
          ...prev,
          [rowId]:
            preselect && list.some((b) => b.id === preselect)
              ? preselect
              : list[0]?.id || "",
        }));
      } catch {
        setBookings((prev) => ({ ...prev, [rowId]: [] }));
      }
    },
    []
  );

  async function act(
    rowId: string,
    payload: { action: string; customer_id?: string; booking_id?: string }
  ) {
    setBusy(rowId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/email-ingest/${rowId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Opération impossible");
        return;
      }
      router.refresh();
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
        description="Les mails fournisseurs (little-emperors, expedia-taap…) analysés apparaîtront ici pour rattachement."
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
        const extract = (row.extract || {}) as ExtractView;
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
        const isBusy = busy === row.id;

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
                  {extract.document_status === "quote" ? (
                    <span className="rounded-full bg-[var(--admin-peach)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--admin-navy)]">
                      Devis
                    </span>
                  ) : null}
                </div>
                <h3 className="mt-1 truncate font-display text-base font-semibold text-[var(--admin-navy)]">
                  {extract.title || extract.destination || row.subject || "Réservation"}
                </h3>
                <p className="truncate text-xs text-muted">
                  {row.from_email || "—"}
                  {row.received_at ? ` · ${formatDateFr(row.received_at)}` : ""}
                </p>
              </div>
            </div>

            {(extract.start_date || extract.end_date) && (
              <p className="mt-2 text-sm text-[var(--admin-navy)]">
                {formatDateRangeShort(extract.start_date, extract.end_date)}
              </p>
            )}

            {items.length ? (
              <ul className="mt-2 space-y-1">
                {items.map((item, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm">
                    <span className="mt-0.5 rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                      {itemLabel(item.kind)}
                    </span>
                    <span className="min-w-0 flex-1 text-[var(--admin-navy)]">
                      <span className="block truncate">{visibleServiceCopy(item.title || "—")}</span>
                      {item.confirmation_ref ? (
                        <span className="block truncate text-xs text-muted">
                          Réf. {item.confirmation_ref}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">
                Aucune carte extraite — à saisir après rattachement.
              </p>
            )}

            {row.warnings?.length ? (
              <p className="mt-2 text-xs text-accent">
                {row.warnings.map((w) => w.message).join(" · ")}
              </p>
            ) : null}

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
                  className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-semibold text-[var(--admin-navy)] hover:bg-white"
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
                    onFocus={() => {
                      if (!options) loadBookings(row.id, customerId, row.suggested_booking_id);
                    }}
                    onChange={(e) =>
                      setSelectedBooking((prev) => ({ ...prev, [row.id]: e.target.value }))
                    }
                  >
                    {!options ? (
                      <option value="">Charger les voyages…</option>
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
                  <button
                    type="button"
                    disabled={isBusy || !selectedBooking[row.id]}
                    className="admin-af-btn-accent rounded-lg px-3 py-2 text-sm disabled:opacity-50"
                    onClick={() =>
                      act(row.id, {
                        action: "attach_booking",
                        booking_id: selectedBooking[row.id],
                      })
                    }
                  >
                    Rattacher au voyage
                  </button>
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={isBusy || !customerId}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--admin-navy)] px-3 py-2 text-sm font-semibold text-[var(--admin-navy)] disabled:opacity-40"
                  onClick={() =>
                    act(row.id, { action: "new_booking", customer_id: customerId })
                  }
                >
                  <Icon name="add" className="h-4 w-4" />
                  Créer un dossier
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-muted hover:text-accent disabled:opacity-40"
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
