"use client";

import { useState } from "react";
import { Icon } from "@/components/crm/icons";
import { signOutAccount } from "@/lib/crm/account-sign-out";
import { SIGN_OUT_LABEL } from "@/lib/crm/user-menu";

/**
 * Bas de Réglages. Le retrait laisse le bouton au-dessus de la barre
 * (le contenu a déjà 5rem + safe-area) et de la bulle WhatsApp
 * (fixe, bas 4.75rem + safe-area, hauteur 3.5rem, à droite).
 */
export function AdminSignOutButton() {
  const [pending, setPending] = useState(false);

  async function signOut() {
    if (pending) return;
    setPending(true);
    const result = await signOutAccount("local", "/admin/login");
    if (!result.ok) setPending(false);
  }

  return (
    <div className="mt-10 pb-[calc(4rem+env(safe-area-inset-bottom,0px))] lg:pb-2">
      <button
        type="button"
        onClick={() => void signOut()}
        disabled={pending}
        className="admin-tap inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-white px-4 py-3.5 text-sm font-bold text-[var(--admin-navy)] hover:bg-[var(--surface-2)] disabled:opacity-60"
      >
        <Icon name="logout" className="h-4 w-4 text-[var(--admin-gold-dark)]" />
        {pending ? "Déconnexion…" : SIGN_OUT_LABEL}
      </button>
    </div>
  );
}
