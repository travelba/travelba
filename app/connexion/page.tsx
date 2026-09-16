"use client";

import { FormEvent, Suspense, useState } from "react";
import { Plus_Jakarta_Sans, Inter } from "next/font/google";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { siteConfig } from "@/lib/site";
import { BrandMark } from "@/components/crm/ui";

const display = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-admin-display",
  weight: ["600", "700", "800"],
  display: "swap",
});

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-admin-sans",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const fieldClass =
  "w-full rounded-2xl border border-[var(--border)] bg-white px-3.5 py-3 text-[var(--admin-navy)] outline-none focus:border-[var(--aura-blue)] focus:ring-2 focus:ring-[var(--aura-blue-soft)]";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "forgot" | "sent">("login");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const next = searchParams.get("next") || "/mon-compte";
  const authError = searchParams.get("error") === "auth";
  const noAccount = searchParams.get("error") === "no-account";

  async function loginWithPassword(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: signError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (signError) {
      setError("E-mail ou mot de passe incorrect.");
      return;
    }
    router.push(next.startsWith("/") && !next.startsWith("//") ? next : "/mon-compte");
    router.refresh();
  }

  async function sendReset(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const origin = window.location.origin;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent("/connexion/mot-de-passe")}`,
    });
    setLoading(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setMode("sent");
  }

  if (mode === "sent") {
    return (
      <div className="mt-6 space-y-5">
        <div className="rounded-2xl bg-[var(--aura-blue-soft)]/70 px-3.5 py-3 text-sm text-[var(--admin-navy)]">
          Si un compte existe pour <strong>{email}</strong>, un lien pour
          redéfinir le mot de passe vient d’être envoyé.
        </div>
        <button
          type="button"
          className="w-full text-center text-sm text-muted"
          onClick={() => {
            setMode("login");
            setError(null);
          }}
        >
          Retour à la connexion
        </button>
      </div>
    );
  }

  if (mode === "forgot") {
    return (
      <form onSubmit={sendReset} className="mt-6 space-y-5">
        <label className="block space-y-1.5 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">
            Adresse e-mail
          </span>
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="marie.dupont@entreprise.com"
            className={fieldClass}
          />
        </label>
        {error ? <p className="text-sm text-[var(--admin-red)]">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-[var(--admin-navy)] px-4 py-3.5 text-sm font-bold text-white transition hover:opacity-95 disabled:opacity-60"
        >
          {loading ? "Envoi…" : "Envoyer le lien"}
        </button>
        <button
          type="button"
          className="w-full text-center text-sm text-muted"
          onClick={() => {
            setMode("login");
            setError(null);
          }}
        >
          Retour à la connexion
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={loginWithPassword} className="mt-6 space-y-5">
      {noAccount ? (
        <p className="text-sm text-[var(--admin-red)]">
          Aucun espace voyageur n’est associé à ce compte. Contactez l’agence
          pour recevoir une invitation.
        </p>
      ) : null}
      {authError ? (
        <p className="text-sm text-[var(--admin-red)]">
          Lien invalide ou expiré. Demandez une nouvelle invitation ou
          réinitialisez votre mot de passe.
        </p>
      ) : null}
      <label className="block space-y-1.5 text-sm">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">
          Adresse e-mail
        </span>
        <input
          type="email"
          required
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="marie.dupont@entreprise.com"
          className={fieldClass}
        />
      </label>
      <label className="block space-y-1.5 text-sm">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">
          Mot de passe
        </span>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={fieldClass}
        />
      </label>
      {error ? <p className="text-sm text-[var(--admin-red)]">{error}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-full bg-[var(--admin-navy)] px-4 py-3.5 text-sm font-bold text-white transition hover:opacity-95 disabled:opacity-60"
      >
        {loading ? "Connexion…" : "Se connecter"}
      </button>
      <button
        type="button"
        className="w-full text-center text-sm text-muted"
        onClick={() => {
          setMode("forgot");
          setError(null);
        }}
      >
        Mot de passe oublié
      </button>
    </form>
  );
}

export default function ConnexionPage() {
  return (
    <div
      className={`account-app min-h-screen ${display.variable} ${sans.variable}`}
    >
      <div className="mx-auto flex min-h-screen max-w-[420px] flex-col justify-center px-4 py-10">
        <div className="mb-8 flex items-center justify-between">
          <BrandMark href="/" subtitle="Aura · Espace client" />
          <span className="rounded-full bg-white px-3 py-1 text-[10px] font-semibold text-muted ring-1 ring-[var(--border)]">
            Sécurisé
          </span>
        </div>
        <div className="aura-card rounded-[1.5rem] border-t-[3px] border-t-[var(--admin-red)] bg-white p-8 shadow-[0_12px_32px_rgba(15,23,42,0.06)] sm:p-10">
          <span className="inline-flex rounded-full bg-[var(--aura-blue-soft)] px-3 py-1 text-[11px] font-semibold text-[var(--aura-blue)]">
            Espace membre
          </span>
          <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight text-[var(--admin-navy)]">
            Connexion
          </h1>
          <p className="mt-2 text-sm text-muted">
            Connectez-vous avec l’e-mail de votre invitation et votre mot de
            passe. Vous resterez connecté sur cet appareil.
          </p>
          <div className="mt-4 h-1 w-12 rounded-full bg-[var(--admin-red)]" />
          <Suspense fallback={<p className="mt-8 text-sm text-muted">Chargement…</p>}>
            <LoginForm />
          </Suspense>
        </div>

        <div className="mt-5 grid gap-3">
          <Link
            href="/demo/espace-client"
            className="block rounded-[1.25rem] border border-[var(--border)] bg-white px-4 py-3.5 text-center shadow-sm transition hover:border-[var(--aura-blue)]"
          >
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--aura-blue)]">
              Espace client exemple
            </span>
            <span className="mt-0.5 block font-display text-sm font-bold text-[var(--admin-navy)]">
              Voir le portail Aura en démo
            </span>
          </Link>
        </div>

        <p className="mt-6 text-center text-xs text-muted">
          Besoin d&apos;aide ? {siteConfig.phoneDisplay} · {siteConfig.contactEmail}
        </p>
      </div>
    </div>
  );
}
