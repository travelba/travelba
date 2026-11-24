import type { Metadata } from "next";
import { AccountBrand } from "@/components/account/AccountBrand";

export const metadata: Metadata = {
  title: "Travel Club TBA",
  robots: { index: false, follow: false },
};

export default function InscriptionLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="account-app relative min-h-dvh text-[#f7f4ee]" style={{ backgroundColor: "#0B192C" }}>
      <div aria-hidden className="pointer-events-none fixed inset-0">
        <div className="absolute left-1/2 top-[46%] h-[44rem] w-[44rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#C5A880]/25" />
        <div className="absolute left-1/2 top-[46%] h-[33rem] w-[33rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#C5A880]/12" />
      </div>
      <div className="relative mx-auto flex min-h-dvh max-w-[440px] flex-col justify-center px-4 py-4 sm:px-5 sm:py-6">
        <div className="mb-3">
          <AccountBrand href="/" subtitle="Travel Business Agency" onDark />
        </div>
        <div className="relative rounded-[28px] bg-[#f6f3ec] p-4 text-[#0B192C] shadow-[0_30px_80px_rgba(0,0,0,0.45)] ring-1 ring-[#C5A880] sm:p-5">
          <div className="pointer-events-none absolute inset-2.5 rounded-[22px] ring-1 ring-[#C5A880]/45" aria-hidden />
          <div className="relative">{children}</div>
        </div>
      </div>
    </div>
  );
}
