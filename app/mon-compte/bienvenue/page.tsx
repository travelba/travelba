import { redirect } from "next/navigation";
import { ClientOnboarding } from "@/components/account/ClientOnboarding";
import { ensureCustomerForUser, getSessionUser } from "@/lib/crm/auth";
import { needsClientOnboarding } from "@/lib/crm/session";
import { siteConfig } from "@/lib/site";

export const metadata = {
  title: `Bienvenue — ${siteConfig.shortName}`,
  robots: { index: false, follow: false },
};

export default async function BienvenuePage() {
  const { user } = await getSessionUser();
  if (!user) redirect("/connexion");
  if (!needsClientOnboarding(user)) redirect("/mon-compte");
  const customer = await ensureCustomerForUser(user);
  if (!customer) redirect("/connexion?error=no-account");
  return <ClientOnboarding />;
}
