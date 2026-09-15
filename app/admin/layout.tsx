import { Montserrat, Source_Sans_3 } from "next/font/google";
import { siteConfig } from "@/lib/site";
import { AdminNav } from "@/components/admin/AdminNav";
import { createServiceClient } from "@/lib/supabase/admin";

const adminDisplay = Montserrat({
  subsets: ["latin"],
  variable: "--font-admin-display",
  weight: ["600", "700", "800"],
  display: "swap",
});

const adminSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-admin-sans",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata = {
  title: `Admin — ${siteConfig.shortName}`,
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let unmatched = 0;
  try {
    const admin = createServiceClient();
    const { count } = await admin
      .from("crm_revolut_transactions")
      .select("id", { count: "exact", head: true })
      .eq("status", "unmatched");
    unmatched = count ?? 0;
  } catch {
    unmatched = 0;
  }

  return (
    <div
      className={`admin-af min-h-screen ${adminDisplay.variable} ${adminSans.variable}`}
    >
      <div className="flex min-h-screen flex-col lg:flex-row">
        <AdminNav unmatchedCount={unmatched} />
        <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
