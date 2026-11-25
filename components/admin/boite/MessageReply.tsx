"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { BusyBar } from "@/components/crm/BusyBar";

export function MessageReply({ threadId }: { threadId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (pending || !body.trim()) return;
    setPending(true);
    setError(null);
    const response = await fetch("/api/admin/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ threadId, body }),
    });
    const json = (await response.json().catch(() => null)) as { error?: string } | null;
    setPending(false);
    if (!response.ok) {
      setError(json?.error || "La réponse n’a pas été envoyée.");
      return;
    }
    setBody("");
    router.refresh();
  }

  return (
    <form onSubmit={send} className="mt-4 space-y-2">
      <label htmlFor="agency-reply" className="text-sm font-semibold text-[var(--admin-navy)]">
        Réponse
      </label>
      <textarea
        id="agency-reply"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={3}
        maxLength={4000}
        className="w-full rounded-xl border border-[#e5e3dc] px-3 py-2 text-sm"
      />
      <button type="submit" disabled={pending || !body.trim()} className="rounded-full bg-[var(--admin-navy)] px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
        Répondre
      </button>
      {pending ? <BusyBar label="Envoi" /> : null}
      {error ? <p className="text-sm text-accent">{error}</p> : null}
    </form>
  );
}
