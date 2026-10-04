"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { MIN_PASSWORD_LENGTH } from "@/lib/crm/session";
import { postJson } from "@/lib/crm/client-fetch";
import { Field, fieldControlClass } from "@/components/crm/fields";
import { BusyBar } from "@/components/crm/BusyBar";
import { ConfirmAction } from "@/components/crm/ConfirmAction";

/**
 * Mon compte › Sécurité : nouveau mot de passe (la session suffit, pas d’ancien mot de passe)
 * et fermeture de toutes les sessions. Replié par défaut, comme les autres plis du profil.
 */
export function PasswordChangeForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setError(null);
    setDone(false);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`);
      return;
    }
    if (password !== confirm) {
      setError("Les deux saisies ne correspondent pas.");
      return;
    }
    setSaving(true);
    try {
      const result = await postJson("/api/client/password", { password, confirm, change: true });
      if (result.status === 401) {
        setError("Votre session a expiré. Reconnectez-vous pour changer le mot de passe.");
        return;
      }
      if (!result.ok) {
        setError(result.error || "Le mot de passe n’a pas pu être modifié. Réessayez.");
        return;
      }
      setPassword("");
      setConfirm("");
      setDone(true);
    } finally {
      setSaving(false);
    }
  }

  async function signOutEverywhere() {
    const supabase = createClient();
    const { error: signOutError } = await supabase.auth.signOut({ scope: "global" });
    if (signOutError) return { ok: false, error: "La déconnexion n’a pas abouti. Réessayez." };
    router.push("/connexion");
    router.refresh();
    return { ok: true };
  }

  return (
    <section className="rounded-xl border border-[#e3e2e0]/70 bg-white px-4">
      <div className="py-3">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center justify-between gap-3 text-left"
          aria-expanded={open}
        >
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-[var(--admin-navy)]">Sécurité</span>
            {open ? null : (
              <span className="block truncate text-xs text-muted">Mot de passe et appareils connectés</span>
            )}
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 transition ${open ? "rotate-180" : ""}`} />
        </button>
        {open ? (
          <div className="mt-3 grid gap-4">
            <form onSubmit={onSubmit} className="grid gap-4">
              <Field label="Nouveau mot de passe" hint={`Au moins ${MIN_PASSWORD_LENGTH} caractères.`}>
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={MIN_PASSWORD_LENGTH}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className={fieldControlClass}
                />
              </Field>
              <Field label="Confirmation">
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={MIN_PASSWORD_LENGTH}
                  required
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  className={fieldControlClass}
                />
              </Field>
              <div aria-live="polite">
                {done ? <p className="text-sm text-[var(--admin-navy)]">Mot de passe modifié.</p> : null}
                {error ? <p className="text-sm text-accent">{error}</p> : null}
              </div>
              <BusyBar active={saving} label="Enregistrement…" />
              <button className="admin-af-btn min-h-11 w-full rounded-full px-5 text-sm" disabled={saving}>
                {saving ? "Enregistrement…" : "Changer le mot de passe"}
              </button>
            </form>
            <div className="border-t border-[#e5e3dc] pt-3">
              <p className="text-xs text-muted">
                Vous restez connecté sur cet appareil. Pour fermer les autres sessions ouvertes avec ce compte :
              </p>
              <div className="mt-2">
                <ConfirmAction
                  label="Se déconnecter de tous les appareils"
                  question="Fermer toutes les sessions, y compris celle-ci ?"
                  hint="Vous serez renvoyé vers la page de connexion."
                  confirmLabel="Tout déconnecter"
                  busyLabel="Déconnexion…"
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-[#e5e3dc] bg-[var(--surface-2)] px-4 text-sm font-bold text-[var(--admin-navy)] transition hover:bg-white"
                  onConfirm={signOutEverywhere}
                />
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
