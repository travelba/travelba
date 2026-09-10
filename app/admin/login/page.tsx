"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: signError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);
    if (signError) {
      setError(signError.message);
      return;
    }

    const next = searchParams.get("next");
    const destination =
      next && next.startsWith("/admin") && !next.startsWith("/admin/login")
        ? next
        : "/admin";
    router.push(destination);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4">
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium text-muted">Email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border border-border bg-white px-3.5 py-2.5 text-foreground outline-none ring-accent/40 focus:ring-2"
        />
      </label>
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium text-muted">Mot de passe</span>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-border bg-white px-3.5 py-2.5 text-foreground outline-none ring-accent/40 focus:ring-2"
        />
      </label>
      {error ? <p className="text-sm text-accent">{error}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="admin-af-btn w-full rounded-full px-4 py-3 text-sm disabled:opacity-60"
      >
        {loading ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}

export default function AdminLoginPage() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center">
      <div className="admin-af-card rounded-3xl p-8 sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
          Accès agent
        </p>
        <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-[var(--admin-navy)]">
          Connexion
        </h1>
        <p className="mt-2 text-sm text-muted">
          Réservé à Travel Business Agency.
        </p>
        <Suspense fallback={<p className="mt-8 text-sm text-muted">Chargement…</p>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
