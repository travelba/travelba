import { redirect } from "next/navigation";
import { InscriptionFlow } from "@/components/account/InscriptionFlow";
import { ensureCustomerForUser, getSessionUser } from "@/lib/crm/auth";
import { isSelfServiceOrigin } from "@/lib/crm/self-signup";
import { siteConfig } from "@/lib/site";

export const metadata = {
  title: `Inscription — ${siteConfig.shortName}`,
  robots: { index: false, follow: false },
};

export default async function InscriptionPage() {
  const { user } = await getSessionUser();
  if (user) {
    const customer = await ensureCustomerForUser(user);
    if (customer && !isSelfServiceOrigin(customer.account_origin)) redirect("/mon-compte");
    if (customer?.signup_completed_at) redirect("/mon-compte/hotels");
  }
  return <InscriptionFlow signedIn={Boolean(user)} />;
}
