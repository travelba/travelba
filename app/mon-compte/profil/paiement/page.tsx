import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import { stripeConfigured } from "@/lib/crm/stripe";
import { PaymentMethodsPanel } from "@/components/account/PaymentMethodsPanel";
import { ProfileSubnav } from "@/components/account/ProfileSubnav";
import { ConciergeBanner, PageEyebrow, PageTitle } from "@/components/crm/ui";
import type { CrmPaymentMethod } from "@/lib/crm/types";

export default async function PaiementPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  const customer = await ensureCustomerForUser(user);
  if (!customer) redirect("/connexion");

  const { data: methods } = await supabase
    .from("crm_payment_methods")
    .select("*")
    .eq("customer_id", customer.id)
    .order("created_at", { ascending: false });

  const configured = stripeConfigured();

  return (
    <div className="space-y-6">
      <div>
        <PageEyebrow>Espace privilège voyageur</PageEyebrow>
        <PageTitle
          title="Moyens de paiement"
          subtitle="Cartes enregistrées via Stripe — aucune donnée bancaire n’est stockée chez Travelba."
        />
        <ProfileSubnav />
      </div>
      <PaymentMethodsPanel
        methods={(methods || []) as CrmPaymentMethod[]}
        configured={configured}
      />
      <ConciergeBanner />
    </div>
  );
}
