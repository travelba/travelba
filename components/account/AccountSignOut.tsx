"use client";

import { signOutAccount } from "@/lib/crm/account-sign-out";
import { Icon } from "@/components/crm/icons";

export function AccountSignOut({ className }: { className?: string }) {
  async function signOut() {
    await signOutAccount("global", "/connexion");
  }

  return (
    <button type="button" onClick={signOut} className={className}>
      <Icon name="logout" className="h-5 w-5" />
      Déconnexion
    </button>
  );
}
