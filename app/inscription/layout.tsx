import type { Metadata } from "next";
import { AccountBrand } from "@/components/account/AccountBrand";

export const metadata: Metadata = {
  title: "Travel Club TBA",
  robots: { index: false, follow: false },
};

export default function InscriptionLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="account-app admin-af min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-[440px] flex-col justify-center px-4 py-10">
        <div className="mb-8">
          <AccountBrand href="/" subtitle="Travel Business Agency" />
        </div>
        <div className="rounded-2xl border-t-[2px] border-t-[var(--admin-gold)] bg-white p-6 sm:p-8">{children}</div>
      </div>
    </div>
  );
}
