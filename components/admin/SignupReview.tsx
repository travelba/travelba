"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { BusyBar } from "@/components/crm/BusyBar";

type Match = { id: string; first_name: string; last_name: string; email: string | null; phone: string | null };

export function SignupReview({
  id,
  status,
  matches,
  invited,
}: {
  id: string;
  status: string;
  matches: Match[];
  invited: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"rattacher" | "creer" | "">(matches.length === 0 ? "creer" : "");
  const [customerId, setCustomerId] = useState(matches.length === 1 ? matches[0].id : "");
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const closed = status === "validee" || status === "refusee";

  async function post(body: Record<string, unknown>) {
    setLoading(true);
    setError(null);
    setInfo(null);
    const response = await fetch(`/api/admin/inscriptions/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await response.json().catch(() => ({}))) as { error?: string; avertissement?: string | null };
    setLoading(false);
    if (!response.ok) {
      setError(json.error || "L’action n’a pas abouti.");
      return;
    }
    setInfo(json.avertissement || "C’est enregistré.");
    router.refresh();
  }

  function validate(event: FormEvent) {
    event.preventDefault();
    if (matches.length > 0 && mode !== "rattacher" && mode !== "creer") {
      setError("Choisissez de rattacher la fiche ou d’en créer une nouvelle.");
      return;
    }
    if (mode === "rattacher" && !customerId) {
      setError("Choisissez la fiche.");
      return;
    }
    void post({ action: "valider", mode: mode || "creer", customerId });
  }

  if (closed) return <p className="text-sm text-muted">Cette demande est terminée.</p>;

  return (
    <div className="space-y-8">
      {invited ? (
        <p className="rounded-2xl bg-[var(--admin-peach)] px-4 py-3 text-sm font-semibold text-[var(--admin-navy)]">
          Invitée par l’admin. La validation reste un clic, sauf si le réglage d’auto-validation est ouvert.
        </p>
      ) : null}
      <form onSubmit={validate} className="space-y-3 rounded-2xl border border-[var(--border)] p-4">
        <h2 className="font-semibold text-[var(--admin-navy)]">Valider</h2>
        {matches.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-[var(--admin-red)]">
              L’e-mail ou le téléphone correspond déjà à une fiche. Rien n’est rattaché tout seul.
            </p>
            {matches.map((match) => (
              <label key={match.id} className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="fiche"
                  checked={mode === "rattacher" && customerId === match.id}
                  onChange={() => {
                    setMode("rattacher");
                    setCustomerId(match.id);
                  }}
                />
                <span>
                  Rattacher à {match.first_name} {match.last_name}
                  <a className="ml-2 underline" href={`/admin/clients/${match.id}`}>
                    Ouvrir la fiche
                  </a>
                </span>
              </label>
            ))}
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="fiche" checked={mode === "creer"} onChange={() => setMode("creer")} />
              Créer une nouvelle fiche
            </label>
          </div>
        ) : (
          <p className="text-sm text-muted">Aucune fiche ne correspond. La validation en crée une, puis envoie l’invitation d’accès.</p>
        )}
        <button type="submit" disabled={loading} className="rounded-full bg-[var(--admin-navy)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">
          Valider
        </button>
      </form>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void post({ action: "completer", message });
        }}
        className="space-y-3 rounded-2xl border border-[var(--border)] p-4"
      >
        <h2 className="font-semibold text-[var(--admin-navy)]">Demander un complément</h2>
        <textarea className="min-h-24 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" value={message} onChange={(event) => setMessage(event.target.value)} required />
        <button type="submit" disabled={loading} className="rounded-full border border-[var(--border)] px-4 py-2.5 text-sm font-semibold disabled:opacity-60">
          Envoyer la demande
        </button>
      </form>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void post({ action: "refuser", reason, notify });
        }}
        className="space-y-3 rounded-2xl border border-[var(--border)] p-4"
      >
        <h2 className="font-semibold text-[var(--admin-navy)]">Refuser</h2>
        <textarea className="min-h-20 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Motif, facultatif" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={notify} onChange={(event) => setNotify(event.target.checked)} />
          Envoyer le motif au demandeur
        </label>
        <button type="submit" disabled={loading} className="rounded-full border border-[var(--admin-red)] px-4 py-2.5 text-sm font-semibold text-[var(--admin-red)] disabled:opacity-60">
          Refuser
        </button>
      </form>
      {error ? <p className="text-sm font-semibold text-[var(--admin-red)]">{error}</p> : null}
      {info ? <p className="text-sm text-[var(--admin-navy)]">{info}</p> : null}
      <BusyBar active={loading} label="Enregistrement…" />
    </div>
  );
}
