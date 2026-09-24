"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PortalAccess } from "@/lib/crm/invite";
import { formatDateTimeFr } from "@/lib/crm/money";
import { BusyBar } from "@/components/crm/BusyBar";

const STATUS_COPY: Record<PortalAccess["status"], { label: string; hint: string }> = {
  none: {
    label: "Non invité",
    hint: "Aucun accès à l’espace voyageur pour le moment.",
  },
  invited: {
    label: "Invitation envoyée",
    hint: "Lien valable 30 jours. Copiez-le ou renvoyez l’e-mail.",
  },
  ready: {
    label: "Espace actif",
    hint: "Le mot de passe a été défini. Le client peut se connecter.",
  },
};

export function InviteCustomerPanel({
  customerId,
  initial,
}: {
  customerId: string;
  initial: PortalAccess;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initial.status);
  const lastSignInAt = initial.lastSignInAt;
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const copy = STATUS_COPY[status];

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
    <section className="admin-af-card flex flex-col gap-3 rounded-3xl p-5 sm:flex-row sm:items-center sm:justify-between">
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
            Dernière connexion : {formatDateTimeFr(lastSignInAt)}
          </p>
        ) : null}
        {info ? <p className="mt-2 text-sm text-[var(--admin-navy)]">{info}</p> : null}
        {error ? <p className="mt-2 text-sm text-[var(--admin-red)]">{error}</p> : null}
        {link ? (
          <p className="mt-2 truncate text-xs text-muted" title={link}>
            Lien généré — valable 30 jours.
          </p>
        ) : null}
      </div>
      <BusyBar active={loading} label="Envoi…" />
      <div className="flex shrink-0 flex-wrap gap-2">
        {link ? (
          <button
            type="button"
            onClick={() => void copyLink()}
            className="rounded-full border border-border px-4 py-2.5 text-sm font-semibold"
          >
            {copied ? "Lien copié" : "Copier le lien"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={sendInvite}
          disabled={loading}
          className="admin-af-btn shrink-0 rounded-full px-4 py-2.5 text-sm disabled:opacity-60"
        >
          {loading
            ? "Envoi…"
            : status === "none"
              ? "Envoyer l’invitation"
              : "Renvoyer l’invitation"}
        </button>
      </div>
    </section>
  );
}
