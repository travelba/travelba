"use client";

import { Icon } from "@/components/crm/icons";
import { signOutAccount } from "@/lib/crm/account-sign-out";
import { SIGN_OUT_LABEL } from "@/lib/crm/user-menu";

export function SignOutButton() {
  function signOut(event: { preventDefault: () => void }) {
    event.preventDefault();
    // Cet appareil seulement. Les autres appareils se ferment depuis Sécurité.
    void signOutAccount("local", "/connexion");
  }

  return (
    <button
      type="button"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        signOut(event);
      }}
      onClick={signOut}
      className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[#e5e3dc] bg-[var(--surface-2)] px-4 py-3.5 text-sm font-bold text-[var(--admin-navy)] transition hover:bg-white"
    >
      <Icon name="logout" className="h-4 w-4" />
      {SIGN_OUT_LABEL}
    </button>
  );
}
