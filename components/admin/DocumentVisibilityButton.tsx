"use client";

import { useState } from "react";

export function DocumentVisibilityButton({ bookingId, documentId, initialVisible }: { bookingId: string; documentId: string; initialVisible: boolean }) {
  const [visible, setVisible] = useState(initialVisible);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function toggle() {
    setPending(true);
    setError(null);
    const response = await fetch(`/api/admin/bookings/${bookingId}/documents`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: documentId, visible_to_client: !visible }) });
    const data = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) return setError(data.error || "Modification impossible");
    setVisible(Boolean(data.document.visible_to_client));
  }
  return <div><button type="button" onClick={toggle} disabled={pending} className="rounded-full border border-border px-3 py-1.5 text-xs font-bold disabled:opacity-50">{pending ? "…" : visible ? "Retirer du portail" : "Publier au client"}</button>{error ? <p role="alert" className="mt-1 text-xs text-red-700">{error}</p> : null}</div>;
}
