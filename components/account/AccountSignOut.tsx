"use client";

import { useRouter } from "next/navigation";
import { signOutAccount } from "@/lib/crm/account-sign-out";
import { Icon } from "@/components/crm/icons";

export function AccountSignOut({ className }: { className?: string }) {
  const router = useRouter();

  async function signOut() {
    await signOutAccount("global");
    router.push("/connexion");
    router.refresh();
  }

  return (
    <button type="button" onClick={signOut} className={className}>
      <Icon name="logout" className="h-5 w-5" />
      Déconnexion
    </button>
  );
}
