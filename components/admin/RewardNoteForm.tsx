"use client";

import { FormEvent, useState } from "react";

export function RewardNoteForm({ id, note }: { id: string; note: string }) {
  const [value, setValue] = useState(note);
  const [saved, setSaved] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaved(false);
    const response = await fetch("/api/admin/inscriptions/parrainages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, note: value }),
    });
    setSaved(response.ok);
  }

  return (
    <form onSubmit={save} className="mt-2 flex flex-wrap items-center gap-2">
      <input
        className="min-w-48 flex-1 rounded-xl border border-[var(--border)] px-3 py-2"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Récompense, note libre"
        aria-label="Note de récompense"
      />
      <button type="submit" className="rounded-full border border-[var(--border)] px-3 py-2 text-sm font-semibold">
        Enregistrer
      </button>
      {saved ? <span className="text-xs text-muted">Noté.</span> : null}
    </form>
  );
}
