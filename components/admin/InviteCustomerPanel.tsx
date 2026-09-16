"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PortalAccess } from "@/lib/crm/invite";
import { formatDateTimeFr } from "@/lib/crm/money";

const STATUS_COPY: Record<PortalAccess["status"], { label: string; hint: string }> = {
  none: {
    label: "Non invité",
    hint: "Aucun accès à l’espace voyageur pour le moment.",
  },
  invited: {
    label: "Invitation envoyée",
    hint: "Le client doit encore définir son mot de passe.",
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
  const [loading, setLoading] = useState(false);

  const copy = STATUS_COPY[status];

  async function sendInvite() {
    setLoading(true);
    setError(null);
    setInfo(null);
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
    setInfo(
      json.invited
        ? "Invitation envoyée par e-mail."
        : "Compte préparé. E-mail non envoyé (clé Resend manquante en local)."
    );
    router.refresh();
  }

  return (
    <section className="admin-af-card flex flex-col gap-3 rounded-3xl p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
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
      </div>
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
    </section>
  );
}
