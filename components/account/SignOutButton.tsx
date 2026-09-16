"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/connexion");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={signOut}
      className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[#e5e3dc] bg-[var(--surface-2)] px-4 py-3.5 text-sm font-bold text-[var(--admin-navy)] transition hover:bg-white"
    >
      Déconnexion sécurisée
    </button>
  );
}
