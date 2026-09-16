"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SecurityPanel({ email, lastSignInAt }: { email: string; lastSignInAt: string | null }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOutEverywhere() {
    if (!window.confirm("Déconnecter toutes vos sessions, y compris celle-ci ?")) return;
    setPending(true);
    const { error: signOutError } = await createClient().auth.signOut({ scope: "global" });
    if (signOutError) {
      setPending(false);
      setError(signOutError.message);
      return;
    }
    router.push("/connexion");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <section className="account-card p-5">
        <h2 className="font-display text-lg font-bold">Connexion sans mot de passe</h2>
        <p className="mt-2 text-sm text-muted">Les codes à usage unique sont envoyés à <strong>{email}</strong>. Travelba ne propose pas encore Face ID ni notification push.</p>
      </section>
      <section className="account-card p-5">
        <h2 className="font-display text-lg font-bold">Sessions</h2>
        <p className="mt-2 text-sm text-muted">Dernière connexion : {lastSignInAt ? new Date(lastSignInAt).toLocaleString("fr-FR") : "information indisponible"}.</p>
        <button type="button" disabled={pending} onClick={signOutEverywhere} className="mt-4 rounded-full border border-red-300 px-4 py-2 text-sm font-bold text-red-700 disabled:opacity-50">{pending ? "Déconnexion…" : "Déconnecter tous les appareils"}</button>
        {error ? <p role="alert" className="mt-2 text-sm text-red-700">{error}</p> : null}
      </section>
    </div>
  );
}
