"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function AccountSignOut({ className }: { className?: string }) {
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/connexion");
    router.refresh();
  }

  return (
    <button type="button" onClick={signOut} className={className}>
      <span className="material-symbols-outlined text-[20px]">logout</span>
      Déconnexion sécurisée
    </button>
  );
}
