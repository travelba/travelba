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
  const [success, setSuccess] = useState<string | null>(null);
  const [editing, setEditing] = useState<CrmTravelDocument | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    if (editing) formData.set("id", editing.id);
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/client/documents", {
        method: editing ? "PATCH" : "POST",
        body: formData,
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error || "Impossible d’enregistrer ce document.");
        return;
      }
      form.reset();
      setEditing(null);
      setSuccess(editing ? "Document modifié." : "Document ajouté.");
      router.refresh();
    } catch {
      setError("Le service est momentanément indisponible. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Supprimer ce document et son fichier ?")) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/client/documents?id=${id}`, { method: "DELETE" });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error || "Impossible de supprimer ce document.");
        return;
      }
      if (editing?.id === id) setEditing(null);
      setSuccess("Document supprimé.");
      router.refresh();
    } catch {
      setError("Le service est momentanément indisponible. Réessayez.");
    } finally {
      setBusy(false);
    }
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
                {d.companion_id
                  ? companions.find((c) => c.id === d.companion_id)
                    ? `${companions.find((c) => c.id === d.companion_id)!.first_name} ${
                        companions.find((c) => c.id === d.companion_id)!.last_name
                      } · `
                    : ""
                  : "Titulaire du compte · "}
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
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setEditing(d);
                  setError(null);
                  setSuccess(null);
                }}
                disabled={busy}
                className="text-xs font-semibold"
              >
                Modifier
              </button>
              <button type="button" disabled={busy} onClick={() => remove(d.id)} className="text-xs font-semibold text-accent">
                Supprimer
              </button>
            </div>
          </li>
        ))}
      </ul>
      <form
        key={editing?.id || "new"}
        onSubmit={onSubmit}
        className="admin-af-card grid gap-3 rounded-3xl p-5 sm:grid-cols-2"
      >
        <h2 className="font-display font-bold sm:col-span-2">
          {editing ? "Modifier le document" : "Ajouter un document"}
        </h2>
        <select name="doc_type" className="rounded-xl border border-border px-3 py-2" defaultValue={editing?.doc_type || "passport"}>
          {Object.entries(DOC_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select name="companion_id" className="rounded-xl border border-border px-3 py-2" defaultValue={editing?.companion_id || ""}>
          <option value="">Titulaire du compte</option>
          {companions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.first_name} {c.last_name}
            </option>
          ))}
        </select>
        <input name="number" defaultValue={editing?.number || ""} placeholder="Numéro" className="rounded-xl border border-border px-3 py-2" />
        <input name="issuing_country" defaultValue={editing?.issuing_country || ""} placeholder="Pays d’émission" className="rounded-xl border border-border px-3 py-2" />
        <label className="text-sm text-muted">
          Émis le
          <input name="issued_on" type="date" defaultValue={editing?.issued_on || ""} className="mt-1 w-full rounded-xl border border-border px-3 py-2" />
        </label>
        <label className="text-sm text-muted">
          Expire le
          <input name="expires_on" type="date" defaultValue={editing?.expires_on || ""} className="mt-1 w-full rounded-xl border border-border px-3 py-2" />
        </label>
        <label className="text-sm text-muted sm:col-span-2">
          {editing?.storage_path ? "Remplacer le fichier (facultatif)" : "Fichier (facultatif)"}
          <input name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="mt-1 block text-sm" />
        </label>
        {error ? <p className="sm:col-span-2 text-sm text-accent">{error}</p> : null}
        {success ? <p className="sm:col-span-2 text-sm text-emerald-700">{success}</p> : null}
        <div className="flex gap-2 sm:col-span-2">
          <button disabled={busy} className="admin-af-btn rounded-full px-4 py-2 text-sm disabled:opacity-60">
            {busy ? "Enregistrement…" : editing ? "Enregistrer les modifications" : "Ajouter un document"}
          </button>
          {editing ? (
            <button
              type="button"
              onClick={() => setEditing(null)}
              disabled={busy}
              className="rounded-full border border-border px-4 py-2 text-sm font-semibold"
            >
              Annuler
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
