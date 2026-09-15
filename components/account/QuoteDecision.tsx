"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function QuoteDecision({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [signature, setSignature] = useState("");
  const [pending, setPending] = useState<"accept" | "decline" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function accept() {
    if (!name.trim() || !termsAccepted) {
      setMessage("Saisissez votre nom et acceptez les CGV.");
      return;
    }
    setPending("accept");
    setMessage(null);
    const response = await fetch(`/api/client/quotes/${quoteId}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision: "accept",
        acceptance_name: name.trim(),
        terms_accepted: true,
        signature_data: signature.trim() || null,
      }),
    });
    const data = await response.json().catch(() => ({}));
    setPending(null);
    if (!response.ok) {
      setMessage(data.error || "Acceptation impossible");
      return;
    }
    setMessage("Devis accepté. Votre preuve d’acceptation a été enregistrée.");
    router.refresh();
  }

  async function decline() {
    if (!window.confirm("Refuser définitivement ce devis ?")) return;
    setPending("decline");
    setMessage(null);
    const response = await fetch(`/api/client/quotes/${quoteId}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "decline" }),
    });
    const data = await response.json().catch(() => ({}));
    setPending(null);
    if (!response.ok) {
      setMessage(data.error || "Refus impossible");
      return;
    }
    setMessage("Devis refusé.");
    router.refresh();
  }

  return (
    <section className="account-card space-y-4 p-5">
      <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">
        Décision et signature
      </h2>
      <label className="block text-sm font-semibold">
        Nom du signataire
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 font-normal"
          autoComplete="name"
        />
      </label>
      <label className="block text-sm font-semibold">
        Signature (nom complet ou mention manuscrite)
        <textarea
          value={signature}
          onChange={(event) => setSignature(event.target.value)}
          className="mt-1 min-h-20 w-full rounded-xl border border-border bg-white px-3 py-2 font-normal"
        />
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={termsAccepted}
          onChange={(event) => setTermsAccepted(event.target.checked)}
          className="mt-1"
        />
        <span>J’ai lu et j’accepte explicitement les conditions générales du devis.</span>
      </label>
      {message ? <p role="status" className="text-sm text-muted">{message}</p> : null}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={accept}
          disabled={pending !== null}
          className="rounded-full bg-[var(--admin-navy)] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {pending === "accept" ? "Signature…" : "Accepter et signer"}
        </button>
        <button
          type="button"
          onClick={decline}
          disabled={pending !== null}
          className="rounded-full border border-red-300 px-5 py-2.5 text-sm font-semibold text-red-700 disabled:opacity-50"
        >
          {pending === "decline" ? "Refus…" : "Refuser"}
        </button>
      </div>
    </section>
  );
}
