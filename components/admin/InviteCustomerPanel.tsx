"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PortalAccess } from "@/lib/crm/invite";
import { formatCustomerLoginAt } from "@/lib/crm/customer-login";
import { BusyBar } from "@/components/crm/BusyBar";
import { adminAction } from "@/lib/crm/admin-action";

const STATUS_COPY: Record<PortalAccess["status"], { label: string; hint: string }> = {
  none: {
    label: "Non invité",
    hint: "Aucun accès à l’espace voyageur pour le moment.",
  },
  invited: {
    label: "Invitation envoyée",
    hint: "Lien valable 30 jours. Copiez-le ou renvoyez l’invitation.",
  },
  ready: {
    label: "Espace actif",
    hint: "Le mot de passe a été défini. Un lien d’accès l’ouvre sans le changer.",
  },
};

export function InviteCustomerPanel({
  customerId,
  initial,
  stacked = false,
}: {
  customerId: string;
  initial: PortalAccess;
  /** Colonne étroite : les actions passent sous le statut. */
  stacked?: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initial.status);
  const lastSignInAt = initial.lastSignInAt;
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sendingAccess, setSendingAccess] = useState(false);
  // Ouverture par l’agence (B-06) : lien à usage unique, 10 minutes, rien n’est envoyé au client.
  const [deskLink, setDeskLink] = useState<string | null>(null);
  const [deskBusy, setDeskBusy] = useState(false);
  const [deskCopied, setDeskCopied] = useState(false);

  const copy = STATUS_COPY[status];

  /** Espace actif : lien magique par WhatsApp, sans reposer le mot de passe (A-52, A-53). */
  async function sendAccessLink() {
    if (sendingAccess) return;
    setSendingAccess(true);
    setError(null);
    setInfo(null);
    const result = await adminAction(`/api/admin/clients/${customerId}/acces`, { method: "POST" });
    setSendingAccess(false);
    if (!result.ok) {
      setError(result.error || "Lien non envoyé.");
      return;
    }
    setInfo("Lien d’accès envoyé par WhatsApp. Le mot de passe du client ne change pas.");
    router.refresh();
  }

  async function openSpace() {
    if (deskBusy) return;
    setDeskBusy(true);
    setError(null);
    setInfo(null);
    setDeskCopied(false);
    const result = await adminAction<{ url?: string }>(`/api/admin/clients/${customerId}/ouvrir`, {
      method: "POST",
    });
    setDeskBusy(false);
    if (!result.ok || typeof result.data?.url !== "string") {
      setDeskLink(null);
      setError(result.error || "Lien indisponible. Réessayez.");
      return;
    }
    setDeskLink(result.data.url);
    router.refresh();
  }

  async function copyDeskLink() {
    if (!deskLink) return;
    try {
      await navigator.clipboard.writeText(deskLink);
      setDeskCopied(true);
    } catch {
      setError("Copie impossible — sélectionnez le lien manuellement.");
    }
  }

  async function sendInvite() {
    setLoading(true);
    setError(null);
    setInfo(null);
    setCopied(false);
    const res = await fetch(`/api/admin/clients/${customerId}/invite`, {
      method: "POST",
    });
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(json.error || "Envoi impossible");
      return;
    }
    setStatus("invited");
    setLink(typeof json.link === "string" ? json.link : null);
    setInfo(
      typeof json.notice === "string"
        ? json.notice
        : json.invited
          ? "Invitation envoyée par e-mail."
          : "Compte préparé. E-mail non envoyé (clé Resend manquante en local)."
    );
    router.refresh();
  }

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setError("Copie impossible — sélectionnez le lien manuellement.");
    }
  }

  return (
    <section
      className={`admin-af-card flex flex-col gap-3 rounded-3xl p-5 ${stacked ? "" : "sm:flex-row sm:items-center sm:justify-between"}`}
    >
      <div className="min-w-0">
        <p className="font-label text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
          Espace voyageur
        </p>
        <p className="mt-1 font-display text-lg font-bold text-[var(--admin-navy)]">
          {copy.label}
        </p>
        <p className="text-sm text-muted">{copy.hint}</p>
        {lastSignInAt ? (
          <p className="mt-1 text-xs text-muted">
            Dernière connexion : {formatCustomerLoginAt(lastSignInAt)}
          </p>
        ) : null}
        {info ? <p className="mt-2 text-sm text-[var(--admin-navy)]">{info}</p> : null}
        {error ? <p className="mt-2 text-sm text-[var(--admin-red)]">{error}</p> : null}
        {link ? (
          <p className="mt-2 truncate text-xs text-muted" title={link}>
            Lien généré — valable 30 jours.
          </p>
        ) : null}
        {deskLink ? (
          <div className="mt-3 rounded-2xl bg-[var(--admin-peach)] px-3 py-2 text-xs text-[var(--admin-navy)]">
            <p className="font-semibold">Lien d’ouverture prêt : 10 minutes, une seule ouverture.</p>
            <p className="mt-1">
              Ouvrez-le dans une fenêtre privée ou sur le téléphone du client : ce navigateur reste connecté à
              l’agence. L’ouverture est enregistrée à votre nom dans l’historique du client.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void copyDeskLink()}
                className="rounded-full border border-border bg-white px-3 py-1.5 font-semibold"
              >
                {deskCopied ? "Lien copié" : "Copier le lien"}
              </button>
              <a
                href={deskLink}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-border bg-white px-3 py-1.5 font-semibold"
              >
                Ouvrir dans un onglet
              </a>
            </div>
          </div>
        ) : null}
      </div>
      <BusyBar active={loading || sendingAccess || deskBusy} label={deskBusy ? "Préparation du lien…" : "Envoi…"} />
      <div className={`flex shrink-0 flex-col gap-2 ${stacked ? "items-start" : "items-end"}`}>
        <div className="flex flex-wrap justify-end gap-2">
          {link ? (
            <button
              type="button"
              onClick={() => void copyLink()}
              className="rounded-full border border-border px-4 py-2.5 text-sm font-semibold"
            >
              {copied ? "Lien copié" : "Copier le lien"}
            </button>
          ) : null}
          {status === "ready" ? (
            <button
              type="button"
              onClick={() => void sendAccessLink()}
              disabled={loading || sendingAccess}
              className="admin-af-btn admin-tap shrink-0 rounded-full px-4 py-2.5 text-sm disabled:opacity-60"
            >
              {sendingAccess ? "Envoi…" : "Envoyer un lien d’accès"}
            </button>
          ) : (
            <button
              type="button"
              onClick={sendInvite}
              disabled={loading || sendingAccess}
              className="admin-af-btn admin-tap shrink-0 rounded-full px-4 py-2.5 text-sm disabled:opacity-60"
            >
              {loading ? "Envoi…" : status === "none" ? "Envoyer l’invitation" : "Renvoyer l’invitation"}
            </button>
          )}
        </div>
        {status === "ready" ? (
          <button
            type="button"
            onClick={sendInvite}
            disabled={loading || sendingAccess}
            className="text-xs font-semibold text-muted underline-offset-2 hover:underline disabled:opacity-60"
          >
            Mot de passe perdu ? Renvoyer l’invitation
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void openSpace()}
          disabled={deskBusy}
          className="text-xs font-semibold text-[var(--admin-navy)] underline-offset-2 hover:underline disabled:opacity-60"
        >
          {deskBusy ? "Préparation…" : "Ouvrir l’espace client"}
        </button>
      </div>
    </section>
  );
}
