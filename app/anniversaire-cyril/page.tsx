import type { Metadata } from "next";
import { CyrilFlightForm } from "@/components/account/CyrilFlightForm";
import { Icon } from "@/components/crm/icons";
import { BrandMark } from "@/components/crm/ui";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Anniversaire de Cyril — Marrakech",
  description: "Indiquez vos vols aller et retour pour le transfert.",
  robots: { index: false, follow: false },
};

export default function AnniversaireCyrilPage() {
  return (
    <div className="account-app admin-af min-h-screen">
      <header className="sticky top-0 z-40 border-b border-[#e5e3dc] bg-[rgba(250,249,246,0.9)] shadow-[0_1px_8px_rgba(11,25,44,0.04)] backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[480px] items-center justify-between gap-3 px-4 sm:px-5">
          <BrandMark href="/anniversaire-cyril" subtitle="Marrakech" compact />
          <a
            href={`https://wa.me/${siteConfig.whatsappNumber}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--admin-navy)] hover:bg-[var(--surface-2)]"
            aria-label="Écrire à l’agence sur WhatsApp"
            title="Écrire à l’agence"
          >
            <Icon name="chat" className="h-[22px] w-[22px]" />
          </a>
        </div>
      </header>
      <main className="mx-auto max-w-[480px] px-4 pb-16 pt-5 sm:px-5">
        <CyrilFlightForm />
      </main>
    </div>
  );
}
