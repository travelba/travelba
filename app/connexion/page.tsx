"use client";

import { FormEvent, Suspense, useState } from "react";
import { Montserrat, Source_Sans_3 } from "next/font/google";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { siteConfig } from "@/lib/site";
import { BrandMark } from "@/components/crm/ui";

const display = Montserrat({
  subsets: ["latin"],
  variable: "--font-admin-display",
  weight: ["600", "700", "800"],
  display: "swap",
});

const sans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-admin-sans",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const next = searchParams.get("next") || "/mon-compte";

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
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
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
      type: "magiclink",
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
    router.push(next.startsWith("/") ? next : "/mon-compte");
    router.refresh();
  }

  if (sent) {
    return (
      <form onSubmit={verifyOtp} className="mt-6 space-y-5">
        <div className="rounded-xl bg-[var(--admin-sky)]/70 px-3.5 py-3 text-sm text-[var(--admin-navy)]">
          Code envoyé à <strong>{email}</strong>
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
            className="w-full rounded-xl border border-[var(--border)] bg-white px-3.5 py-3 text-center font-display text-2xl font-extrabold tracking-[0.35em] text-[var(--admin-navy)] outline-none focus:border-[var(--admin-navy)] focus:ring-2 focus:ring-[var(--admin-sky)]"
            placeholder="••••••••"
          />
        </label>
        {error ? <p className="text-sm text-[var(--admin-red)]">{error}</p> : null}
        <button
          type="submit"
          disabled={loading || token.length < 6}
          className="w-full rounded-xl bg-[var(--admin-navy)] px-4 py-3.5 text-sm font-bold text-white transition hover:bg-[var(--admin-navy-deep)] disabled:opacity-60"
        >
          {loading ? "Vérification…" : "Vérifier le code"}
        </button>
        <div className="flex flex-col gap-2 text-center text-sm">
          <button
            type="button"
            className="font-semibold text-[var(--admin-red)]"
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
          className="w-full rounded-xl border border-[var(--border)] bg-white px-3.5 py-3 text-[var(--admin-navy)] outline-none focus:border-[var(--admin-navy)] focus:ring-2 focus:ring-[var(--admin-sky)]"
        />
      </label>
      {error ? <p className="text-sm text-[var(--admin-red)]">{error}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="admin-af-btn w-full rounded-xl px-4 py-3.5 text-sm disabled:opacity-60"
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
      className={`admin-af min-h-screen ${display.variable} ${sans.variable}`}
    >
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
        <div className="mb-8 flex items-center justify-between">
          <BrandMark href="/" subtitle="Voyage d'affaires" />
          <span className="rounded-full bg-white px-3 py-1 text-[10px] font-semibold text-muted ring-1 ring-[var(--border)]">
            Sécurisé
          </span>
        </div>
        <div className="admin-af-card rounded-2xl border-t-[3px] border-t-[var(--admin-red)] p-8 sm:p-10">
          <span className="inline-flex rounded-full bg-[var(--admin-sky)] px-3 py-1 text-[11px] font-semibold text-[var(--admin-navy)]">
            Espace membre
          </span>
          <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight text-[var(--admin-navy)]">
            Connexion
          </h1>
          <p className="mt-2 text-sm text-muted">
            Entrez votre e-mail pour recevoir un code de connexion.
          </p>
          <div className="mt-4 h-1 w-12 rounded-full bg-[var(--admin-red)]" />
          <Suspense fallback={<p className="mt-8 text-sm text-muted">Chargement…</p>}>
            <LoginForm />
          </Suspense>
        </div>
        <a
          href="/demo/aura-accueil.html"
          className="mt-5 block rounded-2xl border border-[var(--border)] bg-white px-4 py-3.5 text-center shadow-sm transition hover:border-[var(--admin-navy)]"
        >
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--admin-red)]">
            Aperçu sans connexion
          </span>
          <span className="mt-0.5 block font-display text-sm font-bold text-[var(--admin-navy)]">
            Voir l&apos;Accueil Aura (maquette live)
          </span>
          <span className="mt-1 block text-xs text-muted">
            La page Connexion n&apos;est pas le design Accueil — le portail
            s&apos;affiche après le code e-mail.
          </span>
        </a>
        <p className="mt-6 text-center text-xs text-muted">
          Besoin d&apos;aide ? {siteConfig.phoneDisplay} · {siteConfig.contactEmail}
        </p>
      </div>
    </div>
  );
}
