"use client";

import { signOutAccount } from "@/lib/crm/account-sign-out";

export function SignOutButton() {
  async function signOut() {
    // Cet appareil seulement. Les autres appareils se ferment depuis Sécurité.
    await signOutAccount("local", "/connexion");
  }

  return (
    <button
      type="button"
      onClick={signOut}
      className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[#e5e3dc] bg-[var(--surface-2)] px-4 py-3.5 text-sm font-bold text-[var(--admin-navy)] transition hover:bg-white"
    >
      Déconnexion
    </button>
  );
}
