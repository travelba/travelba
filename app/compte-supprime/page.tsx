import type { Metadata } from "next";
import { AccountDeletedNotice } from "@/components/account/AccountDeletedNotice";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: `Compte supprimé — ${siteConfig.name}`,
  robots: { index: false, follow: false },
};

/** Page publique après la déconnexion. Le proxy ne la renvoie pas vers la connexion. */
export default function CompteSupprimePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col justify-center bg-[#faf9f6] px-5 py-10">
      <AccountDeletedNotice />
    </main>
  );
}
