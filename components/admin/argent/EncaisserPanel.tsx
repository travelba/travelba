import Link from "next/link";
import { after } from "next/server";
import { RevolutInbox } from "@/components/admin/RevolutInbox";
import { StripeInbox } from "@/components/admin/StripeInbox";
import { argentHref } from "@/lib/crm/argent-tabs";
import type { CrmRevolutTransaction, CrmStripeTransaction } from "@/lib/crm/types";
import { companiesByCustomer, customerPickLabel, type PickableCustomer } from "@/lib/crm/customer-search";
import { wireAccountChoices } from "@/lib/crm/funding-wallet";
import { reclassifyPendingRevolutCredits, revolutClientId, revolutConfigured, revolutConnected } from "@/lib/crm/revolut";
import { splitPendingStripePayouts } from "@/lib/crm/stripe-payout-sync";
import {
  REVOLUT_MATCH_SELECT,
  scoreRevolutMatches,
  type RevolutMatchCandidate,
  type RevolutMatchCustomer,
} from "@/lib/crm/revolut-match";
import { repairRevolutDebitQueue } from "@/lib/crm/revolut-debit";
import { stripeConfigured } from "@/lib/crm/stripe";
import { pieceDigits, type PayerHistory, type PayerPiece } from "@/lib/crm/stripe-payer";
import { loadStripeSuggestHints } from "@/lib/crm/stripe-suggest-load";
import { scoreStripeMatches, type StripeMatchCandidate, type StripeMatchCustomer } from "@/lib/crm/stripe-match";
import { createServiceClient } from "@/lib/supabase/admin";

type Props = {
  /** Fiche client : seuls les paiements où ce client est un candidat. */
  clientId?: string | null;
  connectedParam?: string | null;
  errorParam?: string | null;
  canBackfill?: boolean;
};

/** À encaisser : virements Revolut puis paiements Stripe. Le score se calcule ici, l’IBAN reste sur le serveur. */
export async function EncaisserPanel({
  clientId = null,
  connectedParam = null,
  errorParam = null,
  canBackfill = false,
}: Props) {
  const admin = createServiceClient();
  const initialMessage =
    errorParam === "oauth"
      ? "Connexion Revolut refusée ou expirée. Relancez « Connecter Revolut »."
      : connectedParam === "1"
        ? "Compte Revolut connecté. Chaque virement reste à encaisser jusqu’au clic Créditer."
        : null;

  console.time("[argent] encaisser");
  after(() => {
    void repairRevolutDebitQueue(admin).catch((error: unknown) => {
      console.error("[argent] débits", error instanceof Error ? error.message : error);
    });
    void reclassifyPendingRevolutCredits(admin).catch((error: unknown) => {
      console.error("[argent] reclassement", error instanceof Error ? error.message : error);
    });
    void splitPendingStripePayouts(admin).catch((error: unknown) => {
      console.error("[argent] versements", error instanceof Error ? error.message : error);
    });
  });
  const [{ data: people }, credits, payments] = await Promise.all([
    admin
      .from("crm_customers")
      .select(`${REVOLUT_MATCH_SELECT}, usage_name, email, phone, stripe_customer_id`)
      .order("last_name"),
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
  const index = (people || []) as (RevolutMatchCustomer & StripeMatchCustomer & PickableCustomer)[];
  const customerIds = index.map((row) => row.id);
  const { data: companyRows } = customerIds.length
    ? await admin.from("crm_billing_companies").select("customer_id, company_name").in("customer_id", customerIds)
    : { data: [] };
  const byCustomer = companiesByCustomer((companyRows || []) as { customer_id: string; company_name: string | null }[]);
  const customers: PickableCustomer[] = index.map(({ id, first_name, last_name, usage_name, company_name, email, phone }) => ({
    id,
    first_name,
    last_name,
    usage_name,
    company_name,
    email,
    phone,
    companies: byCustomer.get(id) || [],
  }));

  let revolutRows = (credits.error ? [] : credits.data || []) as CrmRevolutTransaction[];
  let stripeRows = (payments.error ? [] : payments.data || []) as CrmStripeTransaction[];
  console.timeEnd("[argent] encaisser");

  const stripeCustomerIds = [
    ...stripeRows.map((row) => {
      const id = row.raw && typeof row.raw === "object" ? (row.raw as { stripe_customer_id?: unknown }).stripe_customer_id : null;
      return typeof id === "string" ? id : "";
    }),
    ...revolutRows.map((row) => row.stripe_line?.stripe_customer_id || ""),
  ];
  const numbers = [
    ...stripeRows.map((row) => row.reference || ""),
    ...revolutRows.map((row) => row.reference || row.stripe_line?.dossier_ref || ""),
  ];
  let hints: { history: PayerHistory[]; pieces: PayerPiece[] } = { history: [], pieces: [] };
  try {
    hints = await loadStripeSuggestHints(admin, { stripeCustomerIds, numbers });
  } catch {
    hints = { history: [], pieces: [] };
  }
  const inboxByIntent = new Map(stripeRows.map((row) => [row.stripe_payment_intent_id, row]));

  const revolutSuggestions: Record<string, RevolutMatchCandidate[]> = {};
  for (const row of revolutRows) {
    if (row.status !== "unmatched") continue;
    if (row.category && row.category !== "client" && row.category !== "stripe_paiement") continue;
    if (row.category === "stripe_paiement" && row.stripe_line) {
      const line = row.stripe_line;
      const inbox = line.payment_intent_id ? inboxByIntent.get(line.payment_intent_id) : undefined;
      const email = line.email || inbox?.payer_email || null;
      const name = line.name || inbox?.payer_name || null;
      const stripeCustomer =
        line.stripe_customer_id ||
        (inbox?.raw && typeof inbox.raw === "object" ? String((inbox.raw as { stripe_customer_id?: unknown }).stripe_customer_id || "") : "");
      const designation = pieceDigits(row.reference) || pieceDigits(inbox?.reference) || pieceDigits(line.dossier_ref) || row.reference;
      const scored = scoreStripeMatches(
        { payer_name: name, payer_email: email, reference: designation, raw: { stripe_customer_id: stripeCustomer || null } },
        index,
        hints
      );
      const mapped: RevolutMatchCandidate[] = scored.candidates.map((candidate) => ({
        customer_id: candidate.customer_id,
        score: candidate.score,
        reason: candidate.reason as RevolutMatchCandidate["reason"],
        label: candidate.label,
      }));
      if (line.customer_id && !mapped.some((candidate) => candidate.customer_id === line.customer_id)) {
        const person = index.find((item) => item.id === line.customer_id);
        if (person) {
          const reason = (line.suggestion_reason || "stripe") as RevolutMatchCandidate["reason"];
          mapped.unshift({
            customer_id: person.id,
            score: reason === "metadata" || reason === "stripe_customer" ? 100 : 80,
            reason,
            label: customerPickLabel(person),
          });
        }
      }
      revolutSuggestions[row.id] = mapped;
      if (email || name) {
        row.stripe_line = { ...line, email: email || line.email, name: name || line.name };
      }
      continue;
    }
    revolutSuggestions[row.id] = scoreRevolutMatches(row, index).candidates;
  }
  const stripeSuggestions: Record<string, StripeMatchCandidate[]> = {};
  for (const row of stripeRows) {
    if (row.status !== "unmatched") continue;
    stripeSuggestions[row.id] = scoreStripeMatches(row, index, hints).candidates;
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
          rows={stripeRows.map((row) => ({ ...row, raw: {} }))}
          customers={customers}
          suggestions={stripeSuggestions}
          configured={stripeConfigured()}
          canBackfill={canBackfill}
        />
      </section>
    </div>
  );
}
