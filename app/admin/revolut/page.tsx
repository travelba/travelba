import { requireStaffPage } from "@/lib/crm/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { RevolutInbox, type RevolutDebitRow } from "@/components/admin/RevolutInbox";
import { itemLabelFor, loadOutgoingQueue } from "@/lib/crm/trip-costs-db";
import { AccountBalanceCard } from "@/components/admin/AccountBalance";
import { loadRevolutAccountBalances, revolutClientId, revolutConfigured, revolutConnected } from "@/lib/crm/revolut";
import type { PickableCustomer } from "@/lib/crm/customer-search";
import {
  REVOLUT_MATCH_SELECT,
  scoreRevolutMatches,
  type RevolutMatchCandidate,
  type RevolutMatchCustomer,
} from "@/lib/crm/revolut-match";
import { wireAccountChoices } from "@/lib/crm/funding-wallet";
import { repairRevolutDebitQueue } from "@/lib/crm/revolut-debit";
import { revolutDebitLine } from "@/lib/crm/revolut-inbox";
import type { CrmRevolutTransaction } from "@/lib/crm/types";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";

export const metadata = { title: "Revolut" };

export default async function AdminRevolutPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  await requireStaffPage();
  const params = await searchParams;
  const initialMessage =
    params.error === "oauth"
      ? "Connexion Revolut refusée ou expirée. Relancez « Connecter Revolut »."
      : params.connected === "1"
        ? "Compte Revolut connecté. Chaque virement reste à rapprocher jusqu’au clic Valider."
        : null;
  const admin = createServiceClient();
  const { data: people } = await admin
    .from("crm_customers")
    .select(`${REVOLUT_MATCH_SELECT}, email, phone`)
    .order("last_name");
  const index = (people || []) as (RevolutMatchCustomer & PickableCustomer)[];
  // Le score (IBAN compris) se calcule ici ; le navigateur ne reçoit que les colonnes du sélecteur.
  const customers: PickableCustomer[] = index.map(({ id, first_name, last_name, company_name, email, phone }) => ({
    id,
    first_name,
    last_name,
    company_name,
    email,
    phone,
  }));

  let rows: CrmRevolutTransaction[] = [];
  let debits: RevolutDebitRow[] = [];
  try {
    await repairRevolutDebitQueue(admin);
    const [credits, outs, queue] = await Promise.all([
      admin
        .from("crm_revolut_transactions")
        .select("*")
        .eq("direction", "credit")
        .order("booked_at", { ascending: false, nullsFirst: false })
        .limit(200),
      admin
        .from("crm_revolut_transactions")
        .select("id, amount, currency, counterparty_name, reference, booked_at, raw, status")
        .eq("direction", "debit")
        .order("booked_at", { ascending: false, nullsFirst: false })
        .limit(200),
      loadOutgoingQueue({ source: "revolut", limit: 400 }, admin).catch(() => []),
    ]);
    rows = (credits.data || []) as CrmRevolutTransaction[];
    const outRows = (outs.data || []) as CrmRevolutTransaction[];
    const outgoing = new Map(queue.map((line) => [line.id, line]));
    const { data: costs } = outRows.length
      ? await admin
          .from("crm_trip_costs")
          .select("source_id, booking_id, booking_item_id")
          .eq("source", "revolut")
          .in("source_id", outRows.map((row) => row.id))
      : { data: [] };
    const costRows = (costs || []) as { source_id: string; booking_id: string; booking_item_id: string | null }[];
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
    const costById = new Map(
      costRows.map((row) => [
        row.source_id,
        {
          bookingId: row.booking_id,
          reference: references.get(row.booking_id) || "Voyage",
          itemLabel: row.booking_item_id ? labels.get(row.booking_item_id) || null : "Montant du séjour",
        },
      ])
    );
    debits = outRows.map((row) => ({
      ...revolutDebitLine(row),
      status: row.status,
      outgoing: outgoing.get(row.id) || null,
      cost: costById.get(row.id) || null,
    }));
  } catch {
    rows = [];
    debits = [];
  }

  const suggestions: Record<string, RevolutMatchCandidate[]> = {};
  for (const row of rows) {
    if (row.status !== "unmatched") continue;
    suggestions[row.id] = scoreRevolutMatches(row, index).candidates;
  }

  const { data: fundingCompanies } = await admin
    .from("crm_billing_companies")
    .select("id, customer_id, company_name, funding, sort_order")
    .in("funding", ["advance", "pro"]);
  const accounts = wireAccountChoices(
    (fundingCompanies || []) as {
      id: string;
      customer_id: string;
      company_name: string | null;
      funding: string | null;
      sort_order: number;
    }[]
  );

  const hasClientId = Boolean(revolutClientId());
  const connected = await revolutConnected();
  const balance = connected ? await loadRevolutAccountBalances() : null;

  return (
    <div>
      <PageEyebrow>Espace agence</PageEyebrow>
      <PageTitle
        title="Revolut"
        subtitle="Virements reçus à rapprocher. Les sorties du compte sont dans l’onglet Débits : elles se rattachent à un voyage, jamais à un client."
      />
      <div className="mt-6 space-y-4">
        {balance ? <AccountBalanceCard pockets={balance} /> : null}
        <RevolutInbox
          rows={rows}
          debits={debits}
          customers={customers}
          suggestions={suggestions}
          accounts={accounts}
          configured={revolutConfigured()}
          connected={connected}
          hasClientId={hasClientId}
          initialMessage={initialMessage}
        />
      </div>
    </div>
  );
}
