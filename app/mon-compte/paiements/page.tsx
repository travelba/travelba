import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import { SchedulePaymentButton } from "@/components/account/SchedulePaymentButton";
import type { CrmPaymentSchedule } from "@/lib/crm/types";

type Props = { searchParams: Promise<{ paiement?: string }> };

export default async function PaymentsPage({ searchParams }: Props) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/connexion?next=/mon-compte/paiements");
  const customer = await ensureCustomerForUser(user);
  if (!customer) redirect("/connexion?error=account");
  const { data } = await supabase
    .from("crm_payment_schedules")
    .select("*")
    .eq("customer_id", customer.id)
    .order("due_on");
  const schedules = (data || []) as CrmPaymentSchedule[];
  const due = schedules.reduce((sum, item) => sum + Math.max(0, Number(item.amount) - Number(item.paid_amount)), 0);
  const currency = schedules[0]?.currency || "EUR";
  const state = (await searchParams).paiement;

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--aura-blue)]">Règlements</p>
        <h1 className="font-display text-3xl font-extrabold text-[var(--admin-navy)]">Échéancier</h1>
      </header>
      {state === "succes" ? <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Paiement reçu par Stripe. Le statut sera actualisé après confirmation bancaire.</p> : null}
      {state === "annule" ? <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Paiement annulé : aucun débit n’a été enregistré.</p> : null}
      <section className="rounded-3xl bg-[var(--aura-navy-card)] p-6 text-white">
        <p className="text-sm text-white/70">Reste à payer</p>
        <p className="mt-1 font-display text-4xl font-extrabold">{due.toLocaleString("fr-FR", { style: "currency", currency })}</p>
      </section>
      <div className="space-y-3">
        {schedules.length ? schedules.map((item) => {
          const remaining = Math.max(0, Number(item.amount) - Number(item.paid_amount));
          return (
            <article key={item.id} className="account-card flex items-center justify-between gap-4 p-5">
              <div>
                <p className="font-semibold">{item.label}</p>
                <p className="text-sm text-muted">Échéance : {new Date(item.due_on).toLocaleDateString("fr-FR")}</p>
                <p className="text-xs font-semibold uppercase text-[var(--aura-blue)]">{item.status}</p>
              </div>
              <div className="text-right">
                <p className="font-display text-lg font-bold">{remaining.toLocaleString("fr-FR", { style: "currency", currency: item.currency })}</p>
                {remaining > 0 && ["pending", "overdue"].includes(item.status) ? <SchedulePaymentButton scheduleId={item.id} /> : null}
              </div>
            </article>
          );
        }) : <div className="account-card p-8 text-center text-sm text-muted">Aucune échéance active.</div>}
      </div>
    </div>
  );
}
