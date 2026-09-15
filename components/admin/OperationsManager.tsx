"use client";

import { FormEvent, useRef, useState } from "react";

type Row = Record<string, unknown> & { id: string };
type Field = {
  name: string;
  label: string;
  type?: "text" | "date" | "datetime-local" | "number" | "textarea" | "select" | "checkbox";
  options?: { value: string; label: string }[];
  required?: boolean;
};

export function OperationsManager({ resource, initialItems, fields, allowCreate = true }: {
  resource: string;
  initialItems: Row[];
  fields: Field[];
  allowCreate?: boolean;
}) {
  const [items, setItems] = useState(initialItems);
  const [editing, setEditing] = useState<Row | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);

  async function mutate(method: "POST" | "PATCH", payload: Record<string, unknown>) {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/operations/${resource}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(data.error || "Action impossible");
        return null;
      }
      return {
        item: data.item as Row,
        warning: data.delivery_warning ? String(data.delivery_warning) : null,
      };
    } catch {
      setMessage("Le service est momentanément indisponible. Réessayez.");
      return null;
    } finally {
      setPending(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload: Record<string, unknown> = {};
    for (const field of fields) {
      const value = field.type === "checkbox" ? form.get(field.name) === "on" : form.get(field.name);
      payload[field.name] = value === "" ? null : field.type === "number" ? Number(value) : value;
    }
    if (editing) payload.id = editing.id;
    requestId.current ||= crypto.randomUUID();
    payload._request_id = requestId.current;
    const result = await mutate(editing ? "PATCH" : "POST", payload);
    if (!result) return;
    const saved = result.item;
    setItems((current) => editing ? current.map((row) => row.id === saved.id ? saved : row) : [saved, ...current]);
    if (result.warning) {
      setEditing(saved);
      setMessage(`${result.warning} Enregistrez à nouveau pour réessayer l’envoi.`);
      return;
    }
    requestId.current = null;
    setEditing(null);
    formElement.reset();
    setMessage(editing ? "Modification enregistrée." : "Élément créé.");
  }

  async function remove(row: Row) {
    if (!window.confirm("Supprimer définitivement cet élément ?")) return;
    setPending(true);
    setMessage(null);
    const response = await fetch(`/api/admin/operations/${resource}?id=${encodeURIComponent(row.id)}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) return setMessage(data.error || "Suppression impossible");
    setItems((current) => current.filter((item) => item.id !== row.id));
    setMessage("Élément supprimé.");
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-3">
        {items.length ? items.map((row) => (
          <article key={row.id} className="admin-af-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                {fields.slice(0, 5).map((field, index) => {
                  const value = row[field.name];
                  if (value == null || value === "") return null;
                  return index === 0
                    ? <h2 key={field.name} className="font-display text-lg font-bold text-[var(--admin-navy)]">{String(value)}</h2>
                    : <p key={field.name} className="truncate text-sm text-muted"><strong>{field.label} :</strong> {String(value)}</p>;
                })}
              </div>
              <div className="flex gap-2">
                {resource === "invoices" ? <a href={`/api/admin/invoices/${row.id}/pdf`} className="rounded-lg border border-border px-2 py-1 text-xs font-semibold">PDF</a> : null}
                <button type="button" onClick={() => setEditing(row)} className="rounded-lg border border-border px-2 py-1 text-xs font-semibold">Modifier</button>
                <button type="button" onClick={() => void remove(row)} className="rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-700">Supprimer</button>
              </div>
            </div>
          </article>
        )) : <div className="admin-af-card p-8 text-center text-sm text-muted">Aucun élément.</div>}
      </div>
      {(allowCreate || editing) ? (
        <form key={editing?.id || "new"} onSubmit={submit} className="admin-af-card h-fit space-y-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">{editing ? "Modifier" : "Ajouter"}</h2>
            {editing ? <button type="button" onClick={() => setEditing(null)} className="text-xs text-muted">Annuler</button> : null}
          </div>
          {fields.map((field) => (
            <label key={field.name} className="block text-sm font-semibold">
              {field.label}
              {field.type === "textarea" ? (
                <textarea name={field.name} defaultValue={String(editing?.[field.name] || "")} required={field.required} className="mt-1 min-h-24 w-full rounded-xl border border-border bg-white px-3 py-2 font-normal" />
              ) : field.type === "select" ? (
                <select name={field.name} defaultValue={String(editing?.[field.name] || field.options?.[0]?.value || "")} required={field.required} className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 font-normal">
                  {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              ) : field.type === "checkbox" ? (
                <input name={field.name} type="checkbox" defaultChecked={Boolean(editing?.[field.name])} className="ml-3" />
              ) : (
                <input name={field.name} type={field.type || "text"} defaultValue={String(editing?.[field.name] || "")} required={field.required} className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 font-normal" />
              )}
            </label>
          ))}
          {message ? <p role="status" className="text-sm text-muted">{message}</p> : null}
          <button disabled={pending} className="admin-af-btn w-full rounded-full px-4 py-2.5 text-sm disabled:opacity-50">{pending ? "Enregistrement…" : "Enregistrer"}</button>
        </form>
      ) : null}
    </div>
  );
}
