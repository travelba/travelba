"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type OptionalLine = {
  id: string;
  title: string;
  selected: boolean;
  amount: number;
};

export function QuoteDecision({
  quoteId,
  optionalLines,
  currency,
}: {
  quoteId: string;
  optionalLines: OptionalLine[];
  currency: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [signature, setSignature] = useState("");
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>(
    optionalLines.filter((line) => line.selected).map((line) => line.id)
  );
  const [pending, setPending] = useState<"accept" | "decline" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function accept() {
    if (!name.trim() || !signature.trim() || !termsAccepted) {
      setMessage("Saisissez votre nom, votre signature et acceptez les CGV.");
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
        signature_data: signature.trim(),
        selected_option_ids: selectedOptionIds,
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
      {optionalLines.length ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">Options à retenir</legend>
          {optionalLines.map((line) => (
            <label
              key={line.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border p-3 text-sm"
            >
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedOptionIds.includes(line.id)}
                  onChange={(event) =>
                    setSelectedOptionIds((current) =>
                      event.target.checked
                        ? [...current, line.id]
                        : current.filter((id) => id !== line.id)
                    )
                  }
                />
                {line.title}
              </span>
              <strong>
                {line.amount.toLocaleString("fr-FR", {
                  style: "currency",
                  currency,
                })}
              </strong>
            </label>
          ))}
        </fieldset>
      ) : null}
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
