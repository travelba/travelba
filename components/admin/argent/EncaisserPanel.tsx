import Link from "next/link";
import { RevolutInbox } from "@/components/admin/RevolutInbox";
import { StripeInbox } from "@/components/admin/StripeInbox";
import { argentHref } from "@/lib/crm/argent-tabs";
import type { CrmRevolutTransaction, CrmStripeTransaction } from "@/lib/crm/types";
import { customerPickLabel, type PickableCustomer } from "@/lib/crm/customer-search";
import { wireAccountChoices } from "@/lib/crm/funding-wallet";
import { revolutClientId, revolutConfigured, revolutConnected } from "@/lib/crm/revolut";
import {
  REVOLUT_MATCH_SELECT,
  scoreRevolutMatches,
  type RevolutMatchCandidate,
  type RevolutMatchCustomer,
} from "@/lib/crm/revolut-match";
import { repairRevolutDebitQueue } from "@/lib/crm/revolut-debit";
import { stripeConfigured } from "@/lib/crm/stripe";
import { scoreStripeMatches, type StripeMatchCandidate, type StripeMatchCustomer } from "@/lib/crm/stripe-match";
import { createServiceClient } from "@/lib/supabase/admin";

type Props = {
  /** Fiche client : seuls les paiements où ce client est un candidat. */
  clientId?: string | null;
  connectedParam?: string | null;
  errorParam?: string | null;
};

/** À encaisser : virements Revolut puis paiements Stripe. Le score se calcule ici, l’IBAN reste sur le serveur. */
export async function EncaisserPanel({ clientId = null, connectedParam = null, errorParam = null }: Props) {
  const admin = createServiceClient();
  const initialMessage =
    errorParam === "oauth"
      ? "Connexion Revolut refusée ou expirée. Relancez « Connecter Revolut »."
      : connectedParam === "1"
        ? "Compte Revolut connecté. Chaque virement reste à encaisser jusqu’au clic Créditer."
        : null;

  const { data: people } = await admin
    .from("crm_customers")
    .select(`${REVOLUT_MATCH_SELECT}, email, phone, stripe_customer_id`)
    .order("last_name");
  const index = (people || []) as (RevolutMatchCustomer & StripeMatchCustomer & PickableCustomer)[];
  const customers: PickableCustomer[] = index.map(({ id, first_name, last_name, company_name, email, phone }) => ({
    id,
    first_name,
    last_name,
    company_name,
    email,
    phone,
  }));

  let revolutRows: CrmRevolutTransaction[] = [];
  let stripeRows: CrmStripeTransaction[] = [];
  try {
    await repairRevolutDebitQueue(admin);
    const [credits, payments] = await Promise.all([
      admin
        .from("crm_revolut_transactions")
        .select("*")
        .eq("direction", "credit")
        .order("booked_at", { ascending: false, nullsFirst: false })
        .limit(200),
      admin
        .from("crm_stripe_transactions")
        .select("*")
        .eq("direction", "credit")
        .order("booked_at", { ascending: false, nullsFirst: false })
        .limit(200),
    ]);
    revolutRows = (credits.data || []) as CrmRevolutTransaction[];
    stripeRows = (payments.data || []) as CrmStripeTransaction[];
  } catch {
    revolutRows = [];
    stripeRows = [];
  }

  const revolutSuggestions: Record<string, RevolutMatchCandidate[]> = {};
  for (const row of revolutRows) {
    if (row.status !== "unmatched") continue;
    revolutSuggestions[row.id] = scoreRevolutMatches(row, index).candidates;
  }
  const stripeSuggestions: Record<string, StripeMatchCandidate[]> = {};
  for (const row of stripeRows) {
    if (row.status !== "unmatched") continue;
    stripeSuggestions[row.id] = scoreStripeMatches(row, index).candidates;
  }

  const client = clientId ? index.find((person) => person.id === clientId) || null : null;
  if (client) {
    revolutRows = revolutRows.filter(
      (row) => row.status === "unmatched" && (revolutSuggestions[row.id] || []).some((c) => c.customer_id === client.id)
    );
    stripeRows = stripeRows.filter(
      (row) => row.status === "unmatched" && (stripeSuggestions[row.id] || []).some((c) => c.customer_id === client.id)
    );
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
  const connected = await revolutConnected();

  return (
    <div className="space-y-8">
      {client ? (
        <p className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--admin-gold)]/40 bg-[#f8f4ed] px-4 py-3 text-sm text-[var(--admin-navy)]">
          <span>
            Paiements où <strong>{customerPickLabel(client)}</strong> est un client possible.
          </span>
          <Link href={argentHref("a-encaisser")} className="font-semibold underline">
            Tout voir
          </Link>
        </p>
      ) : null}
      <section aria-labelledby="encaisser-revolut" className="space-y-3">
        <h2 id="encaisser-revolut" className="font-display text-lg font-bold text-[var(--admin-navy)]">
          Virements Revolut
        </h2>
        <RevolutInbox
          rows={revolutRows}
          customers={customers}
          suggestions={revolutSuggestions}
          accounts={accounts}
          configured={revolutConfigured()}
          connected={connected}
          hasClientId={Boolean(revolutClientId())}
          initialMessage={initialMessage}
        />
      </section>
      <section aria-labelledby="encaisser-stripe" className="space-y-3">
        <h2 id="encaisser-stripe" className="font-display text-lg font-bold text-[var(--admin-navy)]">
          Paiements Stripe
        </h2>
        <StripeInbox
          rows={stripeRows.map((row) => ({ ...row, payer_email: null, raw: {} }))}
          customers={customers}
          suggestions={stripeSuggestions}
          configured={stripeConfigured()}
        />
      </section>
    </div>
  );
}
