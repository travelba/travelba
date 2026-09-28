import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ensureCustomerForUser, ensureStaff, getSessionUser } from "@/lib/crm/auth";
import { DESK_COOKIE, deskBypass } from "@/lib/crm/admin-client-login";
import { customerFullName } from "@/lib/crm/types";
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
    if (staff) redirect("/admin");
    redirect("/connexion?error=no-account");
  }

  const name = customerFullName(customer);
  const initials =
    [customer.first_name?.[0], customer.last_name?.[0]]
      .filter(Boolean)
      .join("")
      .toUpperCase() || "TB";
  const jar = await cookies();
  const desk = deskBypass(jar.get(DESK_COOKIE)?.value, user.id);

  return (
    <AccountChrome customerName={name} initials={initials} needsPhone={!customer.phone && !desk}>
      {children}
    </AccountChrome>
  );
}
