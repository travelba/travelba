import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ensureCustomerForUser, ensureStaff, getSessionUser } from "@/lib/crm/auth";
import { customerFullName } from "@/lib/crm/types";
import { isClientShellUserAgent } from "@/lib/native/client-shell";
import { siteConfig } from "@/lib/site";
import { AccountChrome } from "@/components/account/AccountChrome";

export const metadata = {
  title: `Mon compte — ${siteConfig.shortName}`,
  robots: { index: false, follow: false },
};

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await getSessionUser();
  if (!user) redirect("/connexion");
  const customer = await ensureCustomerForUser(user);
  if (!customer) {
    const staff = await ensureStaff(user);
    if (staff) {
      const ua = (await headers()).get("user-agent");
      if (isClientShellUserAgent(ua)) {
        return (
          <main className="grid min-h-screen place-items-center bg-[#0B192C] px-6 text-center text-[#C5A880]">
            <p>Cette application est réservée à l’espace client.</p>
          </main>
        );
      }
      redirect("/admin");
    }
    redirect("/connexion?error=no-account");
  }

  const name = customerFullName(customer);
  const initials =
    [customer.first_name?.[0], customer.last_name?.[0]]
      .filter(Boolean)
      .join("")
      .toUpperCase() || "TB";

  return (
    <AccountChrome customerName={name} initials={initials} needsPhone={!customer.phone}>
      {children}
    </AccountChrome>
  );
}
