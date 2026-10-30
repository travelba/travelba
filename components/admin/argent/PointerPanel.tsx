import Link from "next/link";
import { OutgoingQueue } from "@/components/admin/OutgoingQueue";
import { PliantAccount, type PliantLine } from "@/components/admin/PliantAccount";
import { RevolutDebits, type RevolutDebitRow } from "@/components/admin/RevolutDebits";
import { firstParam, parseLoadMore, type SearchParamValue } from "@/lib/crm/admin-list";
import { argentHref, POINTER_VIEW_LABELS, POINTER_VIEWS, pointerViewFromParam, type PointerView } from "@/lib/crm/argent-tabs";
import { formatDateTimeFr } from "@/lib/crm/money";
import { loadPliantAccountBalance, pliantConfigured } from "@/lib/crm/pliant";
import { loadPliantStayRefs } from "@/lib/crm/pliant-dossier-run";
import { tripCostEventSentence } from "@/lib/crm/pliant-link";
import { pliantStayForCard } from "@/lib/crm/pliant-tx";
import { revolutConfigured, revolutConnected } from "@/lib/crm/revolut";
import { repairRevolutDebitQueue } from "@/lib/crm/revolut-debit";
import { revolutDebitLine } from "@/lib/crm/revolut-inbox";
import type { OutgoingLine, TripCostSource } from "@/lib/crm/trip-costs";
import { itemLabelFor, loadLatestTripCostEvents, loadOutgoingQueue } from "@/lib/crm/trip-costs-db";
import type { CrmPliantTransaction, CrmRevolutTransaction } from "@/lib/crm/types";
import { createServiceClient } from "@/lib/supabase/admin";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const SOURCES: { value: "" | TripCostSource; label: string }[] = [
  { value: "", label: "Toutes les sorties" },
  { value: "pliant", label: "Pliant" },
  { value: "revolut", label: "Revolut" },
];
const PLIANT_PAGE = 500;
const PLIANT_MAX = 4000;

function day(value: SearchParamValue) {
  const raw = (firstParam(value) || "").trim();
  return ISO_DAY.test(raw) ? raw : null;
}

function fileHref(source: string, from: string | null, to: string | null) {
  return argentHref("a-pointer", { source: source || null, du: from, au: to });
}

type CostRef = { id: string; bookingId: string; reference: string; itemLabel: string | null };

async function costRefs(
  admin: ReturnType<typeof createServiceClient>,
  source: TripCostSource,
  sourceIds: string[]
): Promise<Map<string, CostRef>> {
  if (!sourceIds.length) return new Map();
  const { data: costs } = await admin
    .from("crm_trip_costs")
    .select("id, source_id, booking_id, booking_item_id")
    .eq("source", source)
    .in("source_id", sourceIds.slice(0, 1000));
  const costRows = (costs || []) as { id: string; source_id: string; booking_id: string; booking_item_id: string | null }[];
  const bookingIds = [...new Set(costRows.map((row) => row.booking_id))];
  const itemIds = costRows.map((row) => row.booking_item_id).filter((id): id is string => Boolean(id));
  const [{ data: bookings }, { data: items }] = await Promise.all([
    bookingIds.length ? admin.from("crm_bookings").select("id, reference, title, destination").in("id", bookingIds) : Promise.resolve({ data: [] }),
    itemIds.length ? admin.from("crm_booking_items").select("id, kind, title, details").in("id", itemIds) : Promise.resolve({ data: [] }),
  ]);
  const references = new Map(
    ((bookings || []) as { id: string; reference: string; title: string | null; destination: string | null }[]).map((row) => [
      row.id,
      [row.reference, (row.title || row.destination || "").trim()].filter(Boolean).join(" · "),
    ])
  );
  const labels = new Map(
    ((items || []) as { id: string; kind: string | null; title: string | null; details: Record<string, unknown> | null }[]).map((item) => [item.id, itemLabelFor(item)])
  );
  return new Map(
    costRows.map((row) => [
      row.source_id,
      {
        id: row.id,
        bookingId: row.booking_id,
        reference: references.get(row.booking_id) || "Dossier",
        itemLabel: row.booking_item_id ? labels.get(row.booking_item_id) || null : "Montant du séjour",
      },
    ])
  );
}

function ViewPills({ view }: { view: PointerView }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Vue">
      {POINTER_VIEWS.map((option) => {
        const active = option === view;
        return (
          <Link
            key={option}
            href={argentHref("a-pointer", { vue: option === "file" ? null : option })}
            aria-current={active ? "page" : undefined}
            className={`admin-tap inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-semibold ${
              active ? "border-[var(--admin-navy)] bg-[var(--admin-navy)] text-white" : "border-[var(--border)] bg-white text-[var(--admin-navy)]"
            }`}
          >
            {POINTER_VIEW_LABELS[option]}
          </Link>
        );
      })}
    </div>
  );
}

/** À pointer : la file des sorties (Pliant + Revolut), puis les vues complètes par source. */
export async function PointerPanel({ params }: { params: Record<string, SearchParamValue> }) {
  const view = pointerViewFromParam(params.vue);
  const admin = createServiceClient();

  if (view === "pliant") {
    const limit = parseLoadMore(params.limite, PLIANT_PAGE, PLIANT_MAX);
    const configured = pliantConfigured();
    const account = configured ? await loadPliantAccountBalance() : null;
    let lines: PliantLine[] = [];
    let more = false;
    try {
      const rows: CrmPliantTransaction[] = [];
      for (let from = 0; from < limit; from += PLIANT_PAGE) {
        const { data, error } = await admin
          .from("crm_pliant_transactions")
          .select(
            "id, card_id, status, type, merchant, billing_cents, billing_currency, transaction_cents, transaction_currency, booked_at, card_label, card_last4, holder_name, category, comment, match_status"
          )
          .or("type.is.null,type.neq.STATUS_INQUIRY")
          .order("booked_at", { ascending: false, nullsFirst: false })
          .range(from, from + PLIANT_PAGE - 1);
        if (error) throw error;
        const batch = (data || []) as CrmPliantTransaction[];
        rows.push(...batch);
        if (batch.length < PLIANT_PAGE) break;
        if (from + PLIANT_PAGE >= limit) more = limit < PLIANT_MAX;
      }
      const cardIds = [...new Set(rows.map((row) => row.card_id).filter((id): id is string => Boolean(id)))];
      const [stays, queue, costById, audits] = await Promise.all([
        loadPliantStayRefs(admin, cardIds),
        loadOutgoingQueue({ source: "pliant", limit: PLIANT_MAX }, admin),
        costRefs(
          admin,
          "pliant",
          rows.map((row) => row.id)
        ),
        loadLatestTripCostEvents(
          rows.map((row) => row.id),
          admin
        ),
      ]);
      const outgoing = new Map<string, OutgoingLine>(queue.map((line) => [line.id, line]));
      lines = rows.map((row) => {
        const stay = pliantStayForCard(row.card_id, stays);
        const event = audits.get(row.id);
        return {
          id: row.id,
          merchant: row.merchant,
          status: row.status,
          type: row.type,
          billingCents: row.billing_cents,
          currency: row.billing_currency,
          transactionCents: row.transaction_cents,
          transactionCurrency: row.transaction_currency,
          bookedAt: row.booked_at,
          cardLabel: row.card_label,
          last4: row.card_last4 || stay?.last4 || null,
          holderName: row.holder_name,
          category: row.category,
          comment: row.comment,
          reference: stay?.reference || null,
          title: stay?.title || null,
          client: stay?.client || null,
          company: stay?.company || null,
          bookingId: stay?.bookingId || null,
          matchStatus: row.match_status || "unmatched",
          outgoing: outgoing.get(row.id) || null,
          cost: costById.get(row.id) || null,
          auditLabel: event
            ? tripCostEventSentence({
                action: event.action,
                who: event.who,
                fromReference: event.fromReference,
                toReference: event.toReference,
                atLabel: formatDateTimeFr(event.at),
              })
            : null,
        };
      });
    } catch (err) {
      console.error("[admin/argent/pliant]", err instanceof Error ? err.message : err);
      lines = [];
      more = false;
    }
    return (
      <div className="space-y-4">
        <ViewPills view={view} />
        <PliantAccount configured={configured} lines={lines} account={account} />
        {more ? (
          <p className="mt-4 text-center">
            <Link
              href={argentHref("a-pointer", { vue: "pliant", limite: String(limit + PLIANT_PAGE) })}
              className="admin-tap inline-flex min-h-11 items-center rounded-full border border-[var(--border)] bg-white px-5 text-sm font-semibold text-[var(--admin-navy)]"
            >
              Charger plus ({lines.length} dépenses affichées)
            </Link>
          </p>
        ) : null}
      </div>
    );
  }

  if (view === "revolut") {
    let debits: RevolutDebitRow[] = [];
    try {
      await repairRevolutDebitQueue(admin);
      const [outs, queue] = await Promise.all([
        admin
          .from("crm_revolut_transactions")
          .select("id, amount, currency, counterparty_name, reference, booked_at, raw, status")
          .eq("direction", "debit")
          .order("booked_at", { ascending: false, nullsFirst: false })
          .limit(200),
        loadOutgoingQueue({ source: "revolut", limit: 400 }, admin).catch(() => []),
      ]);
      const outRows = (outs.data || []) as CrmRevolutTransaction[];
      const outgoing = new Map(queue.map((line) => [line.id, line]));
      const costById = await costRefs(
        admin,
        "revolut",
        outRows.map((row) => row.id)
      );
      debits = outRows.map((row) => ({
        ...revolutDebitLine(row),
        status: row.status,
        outgoing: outgoing.get(row.id) || null,
        cost: costById.get(row.id) || null,
      }));
    } catch {
      debits = [];
    }
    return (
      <div className="space-y-4">
        <ViewPills view={view} />
        <RevolutDebits debits={debits} configured={revolutConfigured()} connected={await revolutConnected()} />
      </div>
    );
  }

  const sourceParam = firstParam(params.source);
  const source: TripCostSource | null = sourceParam === "pliant" || sourceParam === "revolut" ? sourceParam : null;
  const from = day(params.du);
  const to = day(params.au);
  let lines: OutgoingLine[] = [];
  let outside = { pliant: 0, revolut: 0 };
  try {
    const [queue, pliantOutside, revolutOutside] = await Promise.all([
      loadOutgoingQueue({ source, from, to, limit: 500 }, admin),
      admin.from("crm_pliant_transactions").select("id", { count: "exact", head: true }).eq("match_status", "ignored"),
      admin
        .from("crm_revolut_transactions")
        .select("id", { count: "exact", head: true })
        .eq("direction", "debit")
        .eq("status", "ignored"),
    ]);
    lines = queue;
    outside = { pliant: pliantOutside.count || 0, revolut: revolutOutside.count || 0 };
  } catch (err) {
    console.error("[admin/argent/pointer]", err instanceof Error ? err.message : err);
  }
  const withSuggestion = lines.filter((line) => line.suggestions.length > 0).length;

  return (
    <div className="space-y-4">
      <ViewPills view={view} />
      <form method="get" action="/admin/argent" className="admin-af-card flex flex-wrap items-end gap-3 p-4">
        <input type="hidden" name="onglet" value="a-pointer" />
        <div className="flex flex-wrap gap-2" role="group" aria-label="Source">
          {SOURCES.map((option) => {
            const active = (source || "") === option.value;
            return (
              <Link
                key={option.value || "all"}
                href={fileHref(option.value, from, to)}
                aria-current={active ? "page" : undefined}
                className={`admin-tap inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-semibold ${
                  active ? "border-[var(--admin-navy)] bg-[var(--admin-navy)] text-white" : "border-[var(--border)] bg-white text-[var(--admin-navy)]"
                }`}
              >
                {option.label}
              </Link>
            );
          })}
        </div>
        {source ? <input type="hidden" name="source" value={source} /> : null}
        <label className="text-xs font-semibold uppercase tracking-wide text-muted">
          Du
          <input
            type="date"
            name="du"
            defaultValue={from || ""}
            className="mt-1 block min-h-10 rounded-lg border border-[var(--border)] bg-white px-3 text-sm font-normal normal-case tracking-normal text-[var(--admin-navy)]"
          />
        </label>
        <label className="text-xs font-semibold uppercase tracking-wide text-muted">
          Au
          <input
            type="date"
            name="au"
            defaultValue={to || ""}
            className="mt-1 block min-h-10 rounded-lg border border-[var(--border)] bg-white px-3 text-sm font-normal normal-case tracking-normal text-[var(--admin-navy)]"
          />
        </label>
        <button type="submit" className="admin-af-btn admin-tap min-h-10 rounded-full px-4 text-sm font-semibold">
          Filtrer
        </button>
        {from || to ? (
          <Link href={fileHref(source || "", null, null)} className="text-sm font-semibold text-[#9e7e51] underline">
            Toute la période
          </Link>
        ) : null}
      </form>

      <section className="admin-af-card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-[var(--admin-navy)]">À pointer</h2>
          <p className="text-sm text-muted">
            {lines.length === 0
              ? "Aucune sortie en attente."
              : `${lines.length} sortie${lines.length > 1 ? "s" : ""} · ${withSuggestion} avec une proposition`}
          </p>
        </div>
        <OutgoingQueue lines={lines} />
      </section>

      <p className="text-sm text-muted">
        Hors voyage : {outside.pliant} dépense{outside.pliant > 1 ? "s" : ""} Pliant et {outside.revolut} sortie
        {outside.revolut > 1 ? "s" : ""} Revolut. Elles se remettent dans la file depuis{" "}
        <Link href={argentHref("a-pointer", { vue: "pliant" })} className="underline">
          Toutes les dépenses Pliant
        </Link>{" "}
        et{" "}
        <Link href={argentHref("a-pointer", { vue: "revolut" })} className="underline">
          Toutes les sorties Revolut
        </Link>
        .
      </p>
    </div>
  );
}
