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
      className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#fde8eb] px-4 py-3.5 text-sm font-bold text-[var(--admin-red)] transition hover:bg-[#fad7dc]"
    >
      Déconnexion sécurisée
    </button>
  );
}
