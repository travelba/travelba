"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ConciergeKnowledgeDesk({ pendingMigration }: { pendingMigration: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("faq");
  const [text, setText] = useState("");
  const [examples, setExamples] = useState("");
  const [note, setNote] = useState("");

  async function post(action: string, payload: Record<string, string>) {
    setNote("");
    const response = await fetch("/api/admin/concierge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
    const body = (await response.json().catch(() => null)) as { error?: string; count?: number } | null;
    if (!response.ok) {
      setNote(body?.error || "L’enregistrement n’a pas abouti.");
      return;
    }
    setNote(action === "import" ? `${body?.count || 0} exemples enregistrés. Ils règlent le ton, pas les faits.` : "Enregistré.");
    setText("");
    setExamples("");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {pendingMigration ? <p className="text-sm text-muted">La base s’ouvre après la migration du Concierge.</p> : null}
      <form
        className="admin-af-card space-y-3 rounded-3xl px-5 py-4"
        onSubmit={(event) => {
          event.preventDefault();
          void post("save", { kind, title, text });
        }}
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">Ajouter un texte</p>
        <select value={kind} onChange={(event) => setKind(event.target.value)} className="rounded-2xl border border-[var(--border)] px-3 py-2 text-sm">
          <option value="service">Service</option>
          <option value="tone">Ton</option>
          <option value="conditions">Conditions</option>
          <option value="faq">Question fréquente</option>
          <option value="partner">Partenaire</option>
          <option value="formality">Formalité</option>
        </select>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Titre"
          className="w-full rounded-2xl border border-[var(--border)] px-3 py-2 text-sm"
        />
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={4}
          placeholder="Texte que le Concierge peut citer"
          className="w-full rounded-2xl border border-[var(--border)] px-3 py-2 text-sm"
        />
        <button type="submit" className="admin-af-btn admin-tap rounded-full px-4 py-2 text-sm">
          Enregistrer
        </button>
      </form>
      <form
        className="admin-af-card space-y-3 rounded-3xl px-5 py-4"
        onSubmit={(event) => {
          event.preventDefault();
          void post("import", { text: examples });
        }}
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">Importer des exemples</p>
        <p className="text-sm text-muted">Séparez les conversations par une ligne ---. Elles servent au ton, jamais comme un prix.</p>
        <textarea
          value={examples}
          onChange={(event) => setExamples(event.target.value)}
          rows={6}
          placeholder={"Client: Bonjour\nConcierge: Je vous écoute.\n---\nClient: Merci"}
          className="w-full rounded-2xl border border-[var(--border)] px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="admin-af-btn admin-tap rounded-full px-4 py-2 text-sm">
            Importer
          </button>
          <button type="button" className="admin-af-btn admin-tap rounded-full px-4 py-2 text-sm" onClick={() => void post("seed", {})}>
            Charger les textes du dépôt
          </button>
        </div>
      </form>
      {note ? <p className="text-sm text-muted">{note}</p> : null}
    </div>
  );
}
