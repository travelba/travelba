"use client";

import { ConfirmAction } from "@/components/crm/ConfirmAction";
import { signOutAccount } from "@/lib/crm/account-sign-out";

/** Demande de suppression. L’agence la traite sous 30 jours. Aucun séjour n’est effacé ici. */
export function AccountDeletion() {
  async function requestDeletion() {
    const response = await fetch("/api/client/account/deletion", {
      method: "POST",
      credentials: "same-origin",
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) return body?.error || "La demande n’a pas pu être enregistrée. Réessayez.";
    await signOutAccount("local", "/connexion");
    return null;
  }

  return (
    <section className="rounded-xl border border-[#e3e2e0]/70 bg-white px-4 py-3">
      <h2 className="text-sm font-semibold text-[var(--admin-navy)]">Supprimer mon compte</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        La demande est transmise à l’agence et traitée sous 30 jours. Les séjours ne sont pas effacés immédiatement.
        Vous pouvez aussi écrire à contact@travelba.fr.{" "}
        <a className="font-semibold text-[var(--admin-navy)] underline" href="https://travelba.fr/fr/confidentialite">
          Politique de confidentialité
        </a>
      </p>
      <div className="mt-3">
        <ConfirmAction
          label="Supprimer mon compte"
          confirmLabel="Demander la suppression"
          question="Confirmer la demande de suppression du compte ?"
          hint="Vous serez déconnecté. L’agence traite la demande sous 30 jours."
          tone="danger"
          onConfirm={requestDeletion}
        />
      </div>
    </section>
  );
}
