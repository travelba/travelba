"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { DOC_TYPE_LABELS, type CrmCompanion, type CrmTravelDocument } from "@/lib/crm/types";
import { formatDateFr } from "@/lib/crm/money";

export function DocumentsManager({
  documents,
  companions,
}: {
  documents: CrmTravelDocument[];
  companions: CrmCompanion[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const res = await fetch("/api/client/documents", {
      method: "POST",
      body: new FormData(form),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Erreur");
      return;
    }
    form.reset();
    router.refresh();
  }

  async function remove(id: string) {
    await fetch(`/api/client/documents?id=${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="mt-6 space-y-4">
      <ul className="space-y-2">
        {documents.map((d) => (
          <li key={d.id} className="admin-af-card flex items-center justify-between rounded-2xl px-4 py-3">
            <div>
              <p className="font-medium">
                {DOC_TYPE_LABELS[d.doc_type]} {d.number ? `· ${d.number}` : ""}
              </p>
              <p className="text-xs text-muted">
                Expire le {formatDateFr(d.expires_on)}
                {d.storage_path ? (
                  <>
                    {" · "}
                    <a
                      className="underline"
                      href={`/api/files?path=${encodeURIComponent(d.storage_path)}`}
                    >
                      {d.file_name || "Fichier"}
                    </a>
                  </>
                ) : null}
              </p>
            </div>
            <button type="button" onClick={() => remove(d.id)} className="text-xs font-semibold text-accent">
              Supprimer
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={onSubmit} className="admin-af-card grid gap-3 rounded-3xl p-5 sm:grid-cols-2">
        <select name="doc_type" className="rounded-xl border border-border px-3 py-2" defaultValue="passport">
          {Object.entries(DOC_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select name="companion_id" className="rounded-xl border border-border px-3 py-2" defaultValue="">
          <option value="">Titulaire du compte</option>
          {companions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.first_name} {c.last_name}
            </option>
          ))}
        </select>
        <input name="number" placeholder="Numéro" className="rounded-xl border border-border px-3 py-2" />
        <input name="issuing_country" placeholder="Pays d’émission" className="rounded-xl border border-border px-3 py-2" />
        <label className="text-sm text-muted">
          Émis le
          <input name="issued_on" type="date" className="mt-1 w-full rounded-xl border border-border px-3 py-2" />
        </label>
        <label className="text-sm text-muted">
          Expire le
          <input name="expires_on" type="date" className="mt-1 w-full rounded-xl border border-border px-3 py-2" />
        </label>
        <input name="file" type="file" className="sm:col-span-2 text-sm" />
        {error ? <p className="sm:col-span-2 text-sm text-accent">{error}</p> : null}
        <button className="admin-af-btn rounded-full px-4 py-2 text-sm sm:col-span-2">
          Ajouter un document
        </button>
      </form>
    </div>
  );
}
