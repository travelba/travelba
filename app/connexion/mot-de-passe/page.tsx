"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { siteConfig } from "@/lib/site";
import { BrandMark } from "@/components/crm/ui";
import { MIN_PASSWORD_LENGTH } from "@/lib/crm/session";

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
    <div className="admin-af min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
        <div className="mb-8 flex items-center justify-between">
          <BrandMark href="/" subtitle="Espace voyageur" />
          <span className="rounded-full bg-white px-3 py-1 font-label text-[10px] font-bold uppercase tracking-[0.12em] text-muted ring-1 ring-[var(--border)]">
            Sécurisé
          </span>
        </div>
        <div className="admin-af-card rounded-[1.5rem] p-8 sm:p-10">
          <span className="inline-flex rounded-full bg-[var(--admin-sky)] px-3 py-1 font-label text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--admin-navy)]">
            Première connexion
          </span>
          <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-[var(--admin-navy)]">
            Définir votre mot de passe
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Choisissez un mot de passe d’au moins {MIN_PASSWORD_LENGTH}{" "}
            caractères. Vous resterez ensuite connecté sur cet appareil.
          </p>
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
                className="admin-af-input w-full text-[var(--admin-navy)]"
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
                className="admin-af-input w-full text-[var(--admin-navy)]"
              />
            </label>
            {error ? <p className="text-sm text-[var(--admin-red)]">{error}</p> : null}
            <button
              type="submit"
              disabled={loading}
              className="admin-af-btn w-full rounded-full px-4 py-3.5 text-sm disabled:opacity-60"
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
