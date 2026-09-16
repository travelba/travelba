import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import { SecurityPanel } from "@/components/account/SecurityPanel";

export default async function SecurityPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/connexion?next=/mon-compte/securite");
  const customer = await ensureCustomerForUser(user);
  if (!customer) redirect("/connexion?error=account");
  return (
    <div className="space-y-5">
      <header><p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--aura-blue)]">Confidentialité</p><h1 className="font-display text-3xl font-extrabold text-[var(--admin-navy)]">Sécurité</h1></header>
      <SecurityPanel email={customer.email} lastSignInAt={user.last_sign_in_at || null} />
    </div>
  );
}
