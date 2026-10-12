import { requireStaffPage } from "@/lib/crm/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { RevolutInbox } from "@/components/admin/RevolutInbox";
import { AccountBalanceCard } from "@/components/admin/AccountBalance";
import { loadRevolutAccountBalances, revolutClientId, revolutConfigured, revolutConnected } from "@/lib/crm/revolut";
import { customerPickLabel, type PickableCustomer } from "@/lib/crm/customer-search";
import {
  REVOLUT_MATCH_SELECT,
  scoreRevolutMatches,
  type RevolutMatchCandidate,
  type RevolutMatchCustomer,
} from "@/lib/crm/revolut-match";
import { wireAccountChoices } from "@/lib/crm/funding-wallet";
import { repairRevolutDebitQueue, revolutBookingPickLabel } from "@/lib/crm/revolut-debit";
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
  let debits: ReturnType<typeof revolutDebitLine>[] = [];
  try {
    await repairRevolutDebitQueue(admin);
    const [credits, outs] = await Promise.all([
      admin
        .from("crm_revolut_transactions")
        .select("*")
        .eq("direction", "credit")
        .order("booked_at", { ascending: false, nullsFirst: false })
        .limit(200),
      admin
        .from("crm_revolut_transactions")
        .select(
          "id, amount, currency, counterparty_name, reference, booked_at, raw, status, matched_customer_id, matched_booking_id"
        )
        .eq("direction", "debit")
        .order("booked_at", { ascending: false, nullsFirst: false })
        .limit(200),
    ]);
    rows = (credits.data || []) as CrmRevolutTransaction[];
    const rawDebits = (outs.data || []) as (CrmRevolutTransaction & {
      matched_customer_id: string | null;
      matched_booking_id: string | null;
    })[];
    const bookingIds = [
      ...new Set(rawDebits.map((row) => row.matched_booking_id).filter((id): id is string => Boolean(id))),
    ];
    const bookingLabels = new Map<string, string>();
    if (bookingIds.length) {
      const { data: stays } = await admin
        .from("crm_bookings")
        .select("id, reference, title, destination, start_date, visible_to_client, archived_at")
        .in("id", bookingIds);
      for (const stay of (stays || []) as {
        id: string;
        reference: string;
        title: string | null;
        destination: string | null;
        start_date: string | null;
        visible_to_client: boolean | null;
        archived_at: string | null;
      }[]) {
        bookingLabels.set(stay.id, revolutBookingPickLabel(stay));
      }
    }
    const names = new Map(customers.map((customer) => [customer.id, customerPickLabel(customer)]));
    debits = rawDebits.map((row) =>
      revolutDebitLine({
        ...row,
        customerLabel: row.matched_customer_id ? names.get(row.matched_customer_id) || "Client" : "",
        bookingId: row.matched_booking_id,
        bookingLabel: row.matched_booking_id
          ? bookingLabels.get(row.matched_booking_id) || "Dossier retiré"
          : "",
      })
    );
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
        subtitle="Virements reçus à rapprocher. Les sorties se rattachent à un client et une réservation : elles ne créditent pas le client."
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
