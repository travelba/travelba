import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser, ensureStaff } from "@/lib/crm/auth";
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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

  return (
    <AccountChrome customerName={name} initials={initials} needsPhone={!customer.phone}>
      {children}
    </AccountChrome>
  );
}
