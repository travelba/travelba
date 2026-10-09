"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { siteConfig } from "@/lib/site";
import { BrandMark } from "@/components/crm/ui";
import { BusyBar } from "@/components/crm/BusyBar";
import { MIN_PASSWORD_LENGTH, pathAfterPassword } from "@/lib/crm/session";
import { postJson } from "@/lib/crm/client-fetch";

const fieldClass =
  "w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-3 text-[var(--admin-navy)] outline-none focus:border-[var(--admin-gold)] focus:bg-white focus:ring-2 focus:ring-[var(--admin-gold)]/30";

export function SetPasswordForm({ desk = "client" }: { desk?: "client" | "agence" | "partner" }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [loading, setLoading] = useState(false);
  const agence = desk === "agence" || desk === "partner";
  const partner = desk === "partner";

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await postJson<{ next?: string; needsPhone?: boolean }>("/api/client/password", {
        password,
        confirm,
      });
      if (result.status === 401) {
        setExpired(true);
        setError(
          partner
            ? "This session has expired. Ask for a new sign-in link."
            : "Votre session a expiré. Demandez un nouveau lien de connexion."
        );
        return;
      }
      if (!result.ok) {
        setError(
          result.error ||
            (partner ? "The password could not be saved. Try again." : "Impossible d’enregistrer le mot de passe. Réessayez.")
        );
        return;
      }
      const json = result.data || {};
      router.push(json.next || pathAfterPassword(json.needsPhone ? "" : "1", agence ? "staff" : "client"));
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="account-app admin-af min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-[420px] flex-col justify-center px-4 py-10">
        <div className="mb-8 flex items-center justify-between">
          <BrandMark
            href={partner ? "/admin/little-emperors" : agence ? "/admin" : "/"}
            subtitle={partner ? "Little Emperors" : agence ? "Espace agence" : "Espace client"}
          />
          <span className="rounded-full bg-white px-3 py-1 text-[10px] font-semibold text-muted ring-1 ring-[var(--border)]">
            {partner ? "Secure" : "Sécurisé"}
          </span>
        </div>
        <div className="aura-card rounded-2xl border-t-[2px] border-t-[var(--admin-gold)] bg-white p-8 sm:p-10">
          <span className="inline-flex rounded-full border border-[var(--admin-gold)]/40 bg-[var(--admin-peach)] px-3 py-1 text-[11px] font-semibold text-[#533e1c]">
            {partner ? "First sign-in" : "Première connexion"}
          </span>
          <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight text-[var(--admin-navy)]">
            {partner ? "Set your password" : "Définir votre mot de passe"}
          </h1>
          <p className="mt-2 text-sm text-muted">
            {partner
              ? `Choose a password of at least ${MIN_PASSWORD_LENGTH} characters. You will then open Little Emperors. SSO POST /v1/login is not used.`
              : `Choisissez un mot de passe d’au moins ${MIN_PASSWORD_LENGTH} caractères. ${
                  agence
                    ? "Vous arriverez ensuite dans l’espace agence."
                    : "Vous resterez ensuite connecté sur cet appareil."
                }`}
          </p>
          <div className="mt-4 h-1 w-12 rounded-full bg-[var(--admin-gold)]" />
          <form onSubmit={onSubmit} className="mt-6 space-y-5">
            <label className="block space-y-1.5 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                {partner ? "Password" : "Mot de passe"}
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
                {partner ? "Confirm" : "Confirmation"}
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
          <BusyBar active={loading} label={partner ? "Saving…" : "Enregistrement…"} />
          <button
            type="submit"
            disabled={loading || expired}
            className="w-full rounded-full bg-[var(--admin-navy)] px-4 py-3.5 text-sm font-bold text-white transition hover:opacity-95 disabled:opacity-60"
          >
            {loading ? (partner ? "Saving…" : "Enregistrement…") : partner ? "Save and continue" : "Enregistrer et continuer"}
          </button>
          {expired ? (
            <Link
              href={partner ? "/admin/login?espace=myler" : agence ? "/admin/login" : "/connexion"}
              className="block w-full text-center text-sm font-semibold text-[var(--admin-navy)]"
            >
              {partner ? "Back to Little Emperors" : agence ? "Retour à l’espace agence" : "Retour à la connexion"}
            </Link>
          ) : null}
          </form>
        </div>
        <p className="mt-6 text-center text-xs text-muted">
          {partner ? "Need help?" : "Besoin d'aide ?"} {siteConfig.phoneDisplay} · {siteConfig.contactEmail}
        </p>
      </div>
    </div>
  );
}
