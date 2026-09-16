import { Plus_Jakarta_Sans, Inter } from "next/font/google";
import { requireCustomerPage } from "@/lib/crm/auth";
import { customerFullName } from "@/lib/crm/types";
import { siteConfig } from "@/lib/site";
import { AccountChrome } from "@/components/account/AccountChrome";

const display = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-admin-display",
  weight: ["600", "700", "800"],
  display: "swap",
});

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-admin-sans",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata = {
  title: `Mon compte — ${siteConfig.shortName}`,
  robots: { index: false, follow: false },
};

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { customer } = await requireCustomerPage();

  const name = customerFullName(customer);
  const initials =
    [customer.first_name?.[0], customer.last_name?.[0]]
      .filter(Boolean)
      .join("")
      .toUpperCase() || "TB";

  return (
    <div className={`${display.variable} ${sans.variable}`}>
      <AccountChrome customerName={name} initials={initials}>
        {children}
      </AccountChrome>
    </div>
  );
}
