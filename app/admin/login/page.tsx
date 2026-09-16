"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BrandMark } from "@/components/crm/ui";
import { safeInternalRedirect } from "@/lib/safe-redirect";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(() =>
    searchParams.get("error") === "staff"
      ? "Ce compte n’a pas accès au back-office agence."
      : null
  );
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data: signData, error: signError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signError) {
      setLoading(false);
      setError(signError.message);
      return;
    }

    const { data: staff } = await supabase
      .from("crm_staff")
      .select("id")
      .eq("auth_user_id", signData.user.id)
      .eq("active", true)
      .maybeSingle();
    if (!staff) {
      await supabase.auth.signOut();
      setLoading(false);
      setError("Ce compte n’a pas accès au back-office agence.");
      return;
    }

    setLoading(false);
    const requestedDestination = safeInternalRedirect(
      searchParams.get("next"),
      ["/admin"],
      "/admin"
    );
    const destination = requestedDestination.startsWith("/admin/login")
      ? "/admin"
      : requestedDestination;
    router.push(destination);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      <label className="block space-y-1.5 text-sm">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">
          Email agent
        </span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border border-[var(--border)] bg-white px-3.5 py-3 outline-none focus:border-[var(--admin-navy)] focus:ring-2 focus:ring-[var(--admin-sky)]"
        />
      </label>
      <label className="block space-y-1.5 text-sm">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">
          Mot de passe
        </span>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-[var(--border)] bg-white px-3.5 py-3 outline-none focus:border-[var(--admin-navy)] focus:ring-2 focus:ring-[var(--admin-sky)]"
        />
      </label>
      {error ? <p className="text-sm text-[var(--admin-red)]">{error}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="admin-af-btn w-full rounded-xl px-4 py-3.5 text-sm disabled:opacity-60"
      >
        {loading ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}

export default function AdminLoginPage() {
  return (
    <div className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center">
      <div className="mb-6">
        <BrandMark href="/" subtitle="Back-office" />
      </div>
      <div className="admin-af-card rounded-[1.5rem] border-t-[3px] border-t-[var(--aura-blue)] p-8 sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--aura-blue)]">
          Accès agent
        </p>
        <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-[var(--admin-navy)]">
          Connexion
        </h1>
        <p className="mt-2 text-sm text-muted">
          Réservé à l’équipe Travel Business Agency.
        </p>
        <Suspense fallback={<p className="mt-8 text-sm text-muted">Chargement…</p>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
