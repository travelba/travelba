"use client";

import { FormEvent, useState } from "react";
import { Plus_Jakarta_Sans, Inter } from "next/font/google";
import { useRouter } from "next/navigation";
import { siteConfig } from "@/lib/site";
import { BrandMark } from "@/components/crm/ui";
import { MIN_PASSWORD_LENGTH } from "@/lib/crm/session";

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
  "w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-3 text-[var(--admin-navy)] outline-none focus:border-[var(--admin-gold)] focus:bg-white focus:ring-2 focus:ring-[var(--admin-gold)]/30";

export default function SetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/client/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, confirm }),
    });
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(json.error || "Impossible d’enregistrer le mot de passe");
      return;
    }
    router.push("/mon-compte");
    router.refresh();
  }

  return (
    <div className={`account-app admin-af min-h-screen ${display.variable} ${sans.variable}`}>
      <div className="mx-auto flex min-h-screen max-w-[420px] flex-col justify-center px-4 py-10">
        <div className="mb-8 flex items-center justify-between">
          <BrandMark href="/" subtitle="Espace client" />
          <span className="rounded-full bg-white px-3 py-1 text-[10px] font-semibold text-muted ring-1 ring-[var(--border)]">
            Sécurisé
          </span>
        </div>
        <div className="aura-card rounded-2xl border-t-[2px] border-t-[var(--admin-gold)] bg-white p-8 sm:p-10">
          <span className="inline-flex rounded-full border border-[var(--admin-gold)]/40 bg-[var(--admin-peach)] px-3 py-1 text-[11px] font-semibold text-[#533e1c]">
            Première connexion
          </span>
          <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight text-[var(--admin-navy)]">
            Définir votre mot de passe
          </h1>
          <p className="mt-2 text-sm text-muted">
            Choisissez un mot de passe d’au moins {MIN_PASSWORD_LENGTH}{" "}
            caractères. Vous resterez ensuite connecté sur cet appareil.
          </p>
          <div className="mt-4 h-1 w-12 rounded-full bg-[var(--admin-gold)]" />
          <form onSubmit={onSubmit} className="mt-6 space-y-5">
            <label className="block space-y-1.5 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                Mot de passe
              </span>
              <input
                type="password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                Confirmation
              </span>
              <input
                type="password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={fieldClass}
              />
            </label>
            {error ? <p className="text-sm text-[var(--admin-red)]">{error}</p> : null}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-[var(--admin-navy)] px-4 py-3.5 text-sm font-bold text-white transition hover:opacity-95 disabled:opacity-60"
            >
              {loading ? "Enregistrement…" : "Enregistrer et continuer"}
            </button>
          </form>
        </div>
        <p className="mt-6 text-center text-xs text-muted">
          Besoin d&apos;aide ? {siteConfig.phoneDisplay} · {siteConfig.contactEmail}
        </p>
      </div>
    </div>
  );
}
