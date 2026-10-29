import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { EmailIngestInbox } from "@/components/admin/EmailIngestInbox";
import { LittleEmperorsInbox } from "@/components/admin/LittleEmperorsInbox";
import { Pagination } from "@/components/admin/Pagination";
import { ViewPills } from "@/components/admin/TabLinks";
import { ADMIN_PAGE_SIZE, firstParam, pageRange, parsePage, type SearchParamValue } from "@/lib/crm/admin-list";
import {
  boiteHref,
  FOURNISSEURS_VIEW_LABELS,
  FOURNISSEURS_VIEWS,
  fournisseursViewFromParam,
  type FournisseursView,
} from "@/lib/crm/boite-tabs";
import { CUSTOMER_PICK_LIMIT, CUSTOMER_PICK_SELECT, type PickableCustomer } from "@/lib/crm/customer-search";
import { appliedSinceIso } from "@/lib/crm/import-metrics";
import { readProposalOps, type ProposalOp } from "@/lib/crm/import-proposal";
import { leListMadeAt, type LeMailStamp } from "@/lib/crm/le-confirmation-mail";
import { sortByLeMadeAt } from "@/lib/crm/le-made-at";
import { littleEmperorsConfigured, littleEmperorsProductionBlocked, littleEmperorsWebhookConfigured } from "@/lib/crm/little-emperors";
import { EMAIL_INBOX_QUEUE_STATUSES, type CrmEmailIngest, type CrmLeBooking } from "@/lib/crm/types";

/** Colonnes de la file. Le corps HTML et le texte partent au GET d’une carte ouverte. */
const EMAIL_LIST_COLUMNS = [
  "id",
  "gmail_message_id",
  "gmail_thread_id",
  "label",
  "from_email",
  "subject",
  "received_at",
  "status",
  "extract",
  "candidates",
  "attachments",
  "warnings",
  "suggested_customer_id",
  "suggested_booking_id",
  "created_booking_id",
  "error",
  "ignore_reason",
  "grouped_into",
  "confirmation_refs",
  "match_tier",
  "field_confidence",
  "field_quotes",
  "created_at",
  "updated_at",
].join(", ");

type LeListRow = CrmLeBooking & { raw?: unknown; booked_at?: string | null };

function viewHref(view: FournisseursView, page = 1, source: string | null = null) {
  return boiteHref("fournisseurs", { vue: view === "file" ? null : view, page: page > 1 ? page : null, source });
}

async function loadLittleEmperors(supabase: SupabaseClient, onlyUnmatched: boolean) {
  const [{ data: rows, error: rowsError }, { data: probe }, mailsResult] = await Promise.all([
    supabase.from("crm_le_bookings").select("*"),
    supabase.from("crm_le_sync").select("last_status, last_error, last_ok_at").eq("provider", "little_emperors").maybeSingle(),
    supabase.from("crm_email_ingest").select("received_at, subject, extract, label").ilike("label", "%emperor%"),
  ]);
  const mails = mailsResult.error ? [] : ((mailsResult.data || []) as LeMailStamp[]);
  const all = rowsError ? [] : ((rows || []) as LeListRow[]);
  const kept = onlyUnmatched ? all.filter((row) => !row.crm_booking_id && row.status === "unmatched") : all;
  const listed = sortByLeMadeAt(
    kept.map((row) => {
      const booked_on = leListMadeAt(row, mails);
      const { raw: _raw, ...rest } = row;
      return { ...rest, booked_on };
    })
  );
  return {
    rows: listed,
    total: all.length,
    storageReady: !rowsError,
    probe: {
      last_status: probe?.last_status ?? null,
      last_error: probe?.last_error ?? null,
      last_ok_at: probe?.last_ok_at ?? null,
    },
  };
}

/** Fournisseurs : la file des e-mails, puis les réservations Little Emperors sans dossier. `source=little-emperors` n’ouvre que ces cartes. */
export async function FournisseursPanel({ supabase, params }: { supabase: SupabaseClient; params: Record<string, SearchParamValue> }) {
  const view = fournisseursViewFromParam(params.vue);
  const source = firstParam(params.source) === "little-emperors" ? "little-emperors" : null;
  const page = parsePage(params.page);
  const { from, to } = pageRange(page);
  const onlyLe = source === "little-emperors";

  let mailQuery = supabase.from("crm_email_ingest").select(EMAIL_LIST_COLUMNS, { count: "exact" });
  if (view === "classes") mailQuery = mailQuery.eq("status", "ignored");
  else if (view === "rattaches") mailQuery = mailQuery.eq("status", "attached").gte("updated_at", appliedSinceIso());
  else mailQuery = mailQuery.in("status", [...EMAIL_INBOX_QUEUE_STATUSES]);

  const [{ data: rows, count }, { data: customers }, le] = await Promise.all([
    onlyLe ? Promise.resolve({ data: [], count: 0 }) : mailQuery.order("received_at", { ascending: false, nullsFirst: false }).range(from, to),
    supabase.from("crm_customers").select(CUSTOMER_PICK_SELECT).order("last_name").limit(CUSTOMER_PICK_LIMIT),
    view === "file" ? loadLittleEmperors(supabase, !onlyLe) : Promise.resolve(null),
  ]);

  const inbox = (rows || []) as unknown as CrmEmailIngest[];
  const ids = inbox.map((row) => row.id);
  const proposals: { emailIngestId: string; ops: ProposalOp[]; conflict: boolean }[] = [];
  if (ids.length) {
    const { data: stored, error } = await supabase
      .from("crm_import_proposals")
      .select("email_ingest_id, ops, conflict, undone_at, created_at")
      .in("email_ingest_id", ids)
      .order("created_at", { ascending: false });
    if (!error && stored) {
      const seen = new Set<string>();
      for (const row of stored) {
        const emailIngestId = typeof row.email_ingest_id === "string" ? row.email_ingest_id : "";
        if (!emailIngestId || row.undone_at || seen.has(emailIngestId)) continue;
        seen.add(emailIngestId);
        proposals.push({ emailIngestId, ops: readProposalOps(row.ops), conflict: row.conflict === true });
      }
    }
  }
  const pickable = (customers || []) as PickableCustomer[];
  const total = count ?? inbox.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ViewPills
          ariaLabel="Vues de Fournisseurs"
          active={onlyLe ? "little-emperors" : view}
          views={[
            ...FOURNISSEURS_VIEWS.map((id) => ({ id, href: viewHref(id), label: FOURNISSEURS_VIEW_LABELS[id] })),
            { id: "little-emperors", href: viewHref("file", 1, "little-emperors"), label: "Little Emperors" },
          ]}
        />
        {view === "file" && !onlyLe ? (
          <p className="text-xs text-muted">Raccourcis : A déposer les pièces, I classer, E écarter le doublon.</p>
        ) : null}
      </div>

      {onlyLe ? null : (
        <section aria-labelledby="fournisseurs-mails" className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="fournisseurs-mails" className="font-display text-lg font-bold text-[var(--admin-navy)]">
              E-mails
            </h2>
            <Pagination page={page} total={total} hrefFor={(next) => viewHref(view, next)} label="e-mails" />
          </div>
          <EmailIngestInbox
            rows={inbox}
            customers={pickable}
            mode={view === "rattaches" ? "appliques" : view === "classes" ? "ignores" : "file"}
            proposals={proposals}
          />
          {total > ADMIN_PAGE_SIZE ? <Pagination page={page} total={total} hrefFor={(next) => viewHref(view, next)} label="e-mails" /> : null}
        </section>
      )}

      {le ? (
        <section aria-labelledby="fournisseurs-le" className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="fournisseurs-le" className="font-display text-lg font-bold text-[var(--admin-navy)]">
              {onlyLe ? "Little Emperors" : "Réservations Little Emperors sans dossier"}
            </h2>
            {onlyLe ? (
              <Link href={viewHref("file")} className="text-sm font-semibold text-[var(--admin-navy)] underline">
                Retour à la file
              </Link>
            ) : le.total > le.rows.length ? (
              <Link href={viewHref("file", 1, "little-emperors")} className="text-sm font-semibold text-[var(--admin-navy)] underline">
                Toutes les réservations ({le.total})
              </Link>
            ) : null}
          </div>
          <LittleEmperorsInbox
            rows={le.rows}
            customers={pickable}
            storageReady={le.storageReady}
            configured={littleEmperorsConfigured()}
            productionBlocked={littleEmperorsProductionBlocked()}
            webhookConfigured={littleEmperorsWebhookConfigured()}
            agency
            compact={!onlyLe}
            probe={le.probe}
          />
        </section>
      ) : null}
    </div>
  );
}
