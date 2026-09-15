"use client";

import { FormEvent, Suspense, useState } from "react";
import { Plus_Jakarta_Sans, Inter } from "next/font/google";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { siteConfig } from "@/lib/site";
import { BrandMark } from "@/components/crm/ui";
import { safeInternalRedirect } from "@/lib/safe-redirect";

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

function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [sent, setSent] = useState(false);
  const authError = searchParams.get("error");
  const [error, setError] = useState<string | null>(() =>
    authError === "auth"
      ? "Le lien ou le code de connexion est invalide ou expiré."
      : authError === "account"
        ? "Aucun espace client n’est rattaché à cette adresse. Contactez l’agence."
        : null
  );
  const [loading, setLoading] = useState(false);

  const next = safeInternalRedirect(
    searchParams.get("next"),
    ["/mon-compte"],
    "/mon-compte"
  );

  async function sendOtp(event?: FormEvent) {
    event?.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Impossible d’envoyer le code.");
        return;
      }
      setSent(true);
    } catch {
      setError("Impossible d’envoyer le code.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: token.trim(),
      type: "email",
    });
    setLoading(false);
    if (verifyError) {
      const msg = verifyError.message.toLowerCase();
      setError(
        msg.includes("rate limit")
          ? "Trop de tentatives. Réessayez dans quelques minutes."
          : verifyError.message
      );
      return;
    }
    window.location.assign(`/auth/callback?next=${encodeURIComponent(next)}`);
  }

  if (sent) {
    return (
      <form onSubmit={verifyOtp} className="mt-6 space-y-5">
        <div className="rounded-2xl bg-[var(--aura-blue-soft)]/70 px-3.5 py-3 text-sm text-[var(--admin-navy)]">
          Si cette adresse est rattachée à un espace client, un code a été
          envoyé à <strong>{email}</strong>.
        </div>
        <label className="block space-y-1.5 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">
            Code reçu par e-mail
          </span>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            maxLength={8}
            value={token}
            onChange={(e) => setToken(e.target.value.replace(/\D/g, "").slice(0, 8))}
            className="w-full rounded-2xl border border-[var(--border)] bg-white px-3.5 py-3 text-center font-display text-2xl font-extrabold tracking-[0.35em] text-[var(--admin-navy)] outline-none focus:border-[var(--aura-blue)] focus:ring-2 focus:ring-[var(--aura-blue-soft)]"
            placeholder="••••••••"
          />
        </label>
        {error ? <p className="text-sm text-[var(--admin-red)]">{error}</p> : null}
        <button
          type="submit"
          disabled={loading || token.length < 6}
          className="w-full rounded-full bg-[var(--admin-navy)] px-4 py-3.5 text-sm font-bold text-white transition hover:opacity-95 disabled:opacity-60"
        >
          {loading ? "Vérification…" : "Accéder à mon espace"}
        </button>
        <div className="flex flex-col gap-2 text-center text-sm">
          <button
            type="button"
            className="font-semibold text-[var(--aura-blue)]"
            onClick={sendOtp}
            disabled={loading}
          >
            Renvoyer le code
          </button>
          <button
            type="button"
            className="text-muted"
            onClick={() => {
              setSent(false);
              setToken("");
              setError(null);
            }}
          >
            Modifier l&apos;adresse e-mail
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={sendOtp} className="mt-6 space-y-5">
      <label className="block space-y-1.5 text-sm">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">
          Adresse e-mail
        </span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="marie.dupont@entreprise.com"
          className="w-full rounded-2xl border border-[var(--border)] bg-white px-3.5 py-3 text-[var(--admin-navy)] outline-none focus:border-[var(--aura-blue)] focus:ring-2 focus:ring-[var(--aura-blue-soft)]"
        />
      </label>
      {error ? <p className="text-sm text-[var(--admin-red)]">{error}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-full bg-[var(--admin-navy)] px-4 py-3.5 text-sm font-bold text-white transition hover:opacity-95 disabled:opacity-60"
      >
        {loading ? "Envoi…" : "Recevoir le code →"}
      </button>
      <p className="text-center text-xs text-muted">
        Connexion sécurisée sans mot de passe
      </p>
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
            Entrez votre e-mail pour recevoir un code et ouvrir votre portail
            Aura.
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
          <Link
            href="/demo/aura-accueil.html"
            className="block text-center text-xs font-semibold text-muted hover:text-[var(--admin-navy)]"
          >
            Maquette Accueil seule →
          </Link>
        </div>

        <p className="mt-6 text-center text-xs text-muted">
          Besoin d&apos;aide ? {siteConfig.phoneDisplay} · {siteConfig.contactEmail}
        </p>
      </div>
    </div>
  );
}
