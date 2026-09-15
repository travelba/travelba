"use client";

import { useState } from "react";

export function PortalInviteButton({ customerId, linked }: { customerId: string; linked: boolean }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function invite() {
    if (!window.confirm("Envoyer une invitation sécurisée au client ?")) return;
    setPending(true);
    const response = await fetch(`/api/admin/customers/${customerId}/invite`, { method: "POST" });
    const data = await response.json().catch(() => ({}));
    setPending(false);
    setMessage(response.ok ? "Invitation envoyée." : data.error || "Invitation impossible");
  }
  return <div className="admin-af-card flex flex-wrap items-center justify-between gap-3 p-5"><div><h2 className="font-display text-lg font-bold">Accès portail client</h2><p className="text-sm text-muted">{linked ? "Compte authentifié et rattaché." : "Aucun compte authentifié rattaché."}</p></div>{linked ? <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">Actif</span> : <button type="button" onClick={invite} disabled={pending} className="admin-af-btn rounded-full px-4 py-2 text-sm disabled:opacity-50">{pending ? "Invitation…" : "Inviter le client"}</button>}{message ? <p role="status" className="w-full text-sm text-muted">{message}</p> : null}</div>;
}
