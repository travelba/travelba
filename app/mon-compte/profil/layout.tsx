import { redirect } from "next/navigation";
import { ensureCustomerForUser, getSessionUser } from "@/lib/crm/auth";
import { customerFullName } from "@/lib/crm/types";
import { ProfileHeader } from "@/components/account/ProfileHeader";

/** Vous / Pièces / Voyageurs / Facturation partagent l’en-tête et la sous-nav : ils ne clignotent plus à chaque onglet. */
export default async function ProfilLayout({ children }: { children: React.ReactNode }) {
  const { user } = await getSessionUser();
  if (!user) redirect("/connexion");
  const customer = await ensureCustomerForUser(user);
  if (!customer) redirect("/connexion");

  return (
    <div className="space-y-4 pb-6">
      <ProfileHeader name={customerFullName(customer)} email={customer.email} />
      {children}
    </div>
  );
}
