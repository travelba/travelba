import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import { loadClientMoneySnapshot } from "@/lib/crm/client-money";
import { postedLedgerTotals } from "@/lib/crm/money";
import { CompanyTripCard, PersonalLedgerCard } from "@/components/account/PersonalLedgerCard";
import { TransactionRows } from "@/components/account/TransactionRows";
import { Icon } from "@/components/crm/icons";

export default async function TransactionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  const customer = await ensureCustomerForUser(user);
  if (!customer) redirect("/connexion");

  const money = await loadClientMoneySnapshot(supabase, customer);
  const companyTotals = postedLedgerTotals(money.companyRows);
  const companyCurrency = money.companyRows[0]?.currency || money.personalCurrency;
  const personalCredits = money.personalRows.filter((t) => t.direction === "credit").length;

  return (
    <div className="space-y-5">
      {money.member ? (
        <CompanyTripCard
          companyName={money.companyName || "votre société"}
          debits={companyTotals.debits}
          currency={companyCurrency}
        />
      ) : null}

      <PersonalLedgerCard
        rows={money.personalRows}
        balanceValue={money.personalBalance}
        currency={money.personalCurrency}
        title={money.member ? "Vos voyages" : "Grand livre"}
        hint={
          money.member
            ? "Wallet personnel — pour un séjour que vous financez vous-même. Indépendant du solde société."
            : undefined
        }
      />

      {money.member ? (
        <section className="space-y-3">
          <div className="flex items-center gap-1.5">
            <Icon name="receipt_long" className="h-5 w-5 text-[var(--admin-navy)]" />
            <h2 className="font-display text-xl font-semibold text-[var(--admin-navy)]">
              Frais {money.companyName || "société"}
            </h2>
          </div>
          <TransactionRows
            rows={money.companyRows}
            emptyTitle="Aucun frais société"
            emptyDescription="Les débits de vos dossiers professionnels apparaîtront ici, sans le solde de la société."
          />
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Icon name="account_balance_wallet" className="h-5 w-5 text-[var(--admin-navy)]" />
            <h2 className="font-display text-xl font-semibold text-[var(--admin-navy)]">
              {money.member ? "Mouvements personnels" : "Mouvements"}
            </h2>
          </div>
          {personalCredits ? (
            <span className="rounded-full bg-[var(--admin-gold)]/20 px-2.5 py-0.5 text-[12px] font-semibold text-[var(--admin-navy)]">
              {personalCredits} règlement{personalCredits > 1 ? "s" : ""}
            </span>
          ) : null}
        </div>
        <TransactionRows
          rows={money.personalRows}
          emptyTitle={money.member ? "Aucun voyage à votre charge" : "Aucun mouvement"}
          emptyDescription={
            money.member
              ? "Quand l’agence ouvrira un séjour à votre nom, l’encours personnel apparaîtra ici."
              : "Les débits de réservation et crédits rapprochés apparaîtront ici."
          }
        />
      </section>
    </div>
  );
}
