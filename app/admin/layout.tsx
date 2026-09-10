import Link from "next/link";
import { Montserrat, Source_Sans_3 } from "next/font/google";
import { siteConfig } from "@/lib/site";
import { AdminNav } from "@/components/admin/AdminNav";

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

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className={`admin-af min-h-screen ${adminDisplay.variable} ${adminSans.variable}`}
    >
      <header className="admin-af-header sticky top-0 z-40">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <Link href="/admin" className="group flex items-baseline gap-2.5">
            <span className="font-display text-xl font-extrabold uppercase tracking-[0.04em] text-[var(--admin-navy)]">
              {siteConfig.shortName}
            </span>
            <span className="hidden text-[11px] font-semibold uppercase tracking-[0.18em] text-muted sm:inline">
              Back-office
            </span>
          </Link>
          <AdminNav />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>
    </div>
  );
}
