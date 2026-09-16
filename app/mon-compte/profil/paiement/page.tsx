import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import { getStripe, stripeConfigured } from "@/lib/crm/stripe";
import { PaymentMethodsPanel } from "@/components/account/PaymentMethodsPanel";
import { ProfileSubnav } from "@/components/account/ProfileSubnav";
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
  let clientSecret: string | null = null;
  const stripe = configured ? getStripe() : null;
  if (stripe) {
    const admin = createServiceClient();
    let stripeCustomerId = customer.stripe_customer_id;
    if (!stripeCustomerId) {
      const created = await stripe.customers.create({
        email: customer.email,
        name: [customer.first_name, customer.last_name].filter(Boolean).join(" "),
        metadata: { crm_customer_id: customer.id },
      });
      stripeCustomerId = created.id;
      await admin
        .from("crm_customers")
        .update({ stripe_customer_id: stripeCustomerId })
        .eq("id", customer.id);
    }
    const intent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
      usage: "off_session",
      payment_method_types: ["card"],
      metadata: { crm_customer_id: customer.id },
    });
    clientSecret = intent.client_secret;
  }

  return (
    <div className="space-y-4 px-5 pb-10">
      <ProfileSubnav />
      <h1 className="text-xl font-semibold text-[var(--admin-navy-deep)]">Moyens de paiement</h1>
      <p className="text-xs text-muted">
        Cartes tokenisées Stripe. Travelba ne conserve que la marque, les 4 derniers chiffres et
        l’expiration.
      </p>
      <PaymentMethodsPanel
        methods={(methods || []) as CrmPaymentMethod[]}
        clientSecret={clientSecret}
        configured={configured}
      />
    </div>
  );
}
