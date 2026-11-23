import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ensureCustomerForUser, ensureStaff, getSessionUser } from "@/lib/crm/auth";
import { DESK_COOKIE, deskBypass } from "@/lib/crm/desk-mode";
import { customerFullName } from "@/lib/crm/types";
import { brandShareImages, CONCIERGE_SHARE_DESCRIPTION, CONCIERGE_SHARE_TITLE, siteConfig } from "@/lib/site";
import { AccountChrome } from "@/components/account/AccountChrome";
import { AccountCacheProvider } from "@/components/account/AccountCache";
import { hotelBookingEnabled, showHotelButton } from "@/lib/crm/hotel-access";
import { readHotelButtonVisibility } from "@/lib/crm/hotel-access-run";

export const metadata = {
  title: `Mon compte — ${siteConfig.shortName}`,
  description: CONCIERGE_SHARE_DESCRIPTION,
  robots: { index: false, follow: false },
  openGraph: {
    title: CONCIERGE_SHARE_TITLE,
    description: CONCIERGE_SHARE_DESCRIPTION,
    siteName: siteConfig.name,
    type: "website" as const,
    images: brandShareImages(CONCIERGE_SHARE_TITLE),
  },
  twitter: {
    card: "summary_large_image" as const,
    title: CONCIERGE_SHARE_TITLE,
    description: CONCIERGE_SHARE_DESCRIPTION,
    images: brandShareImages(CONCIERGE_SHARE_TITLE).map((image) => image.url),
  },
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
  const enabled = hotelBookingEnabled(customer);
  const hotels = showHotelButton({ enabled, visibility: await readHotelButtonVisibility() });

  return (
    <AccountCacheProvider userId={customer.id}>
      <AccountChrome customerName={name} initials={initials} needsPhone={!customer.phone && !desk} desk={desk} hotels={hotels}>
        {children}
      </AccountChrome>
    </AccountCacheProvider>
  );
}
