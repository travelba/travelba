import { redirect } from "next/navigation";
import { ClientOnboarding } from "@/components/account/ClientOnboarding";
import { OnboardingShell } from "@/components/account/OnboardingShell";
import { ensureCustomerForUser, getSessionUser } from "@/lib/crm/auth";
import { isOnboardingReplay, needsClientOnboarding } from "@/lib/crm/session";
import { siteConfig } from "@/lib/site";

export const metadata = {
  title: `Bienvenue — ${siteConfig.shortName}`,
  robots: { index: false, follow: false },
};

export default async function BienvenuePage({
  searchParams,
}: {
  searchParams: Promise<{ revoir?: string | string[] }>;
}) {
  const replay = isOnboardingReplay(await searchParams);
  const { user } = await getSessionUser();
  if (!user) redirect("/connexion");
  if (!needsClientOnboarding(user) && !replay) redirect("/mon-compte");
  const customer = await ensureCustomerForUser(user);
  if (!customer) redirect("/connexion?error=no-account");
  return (
    <OnboardingShell>
      <ClientOnboarding />
    </OnboardingShell>
  );
}
