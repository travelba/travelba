"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { CrmCompanion, CrmCustomer, CrmTravelDocument } from "@/lib/crm/types";
import { DOC_TYPE_LABELS } from "@/lib/crm/types";
import { PortalInviteButton } from "@/components/admin/PortalInviteButton";

type Notice = { tone: "error" | "success"; text: string } | null;

async function apiRequest(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `Erreur serveur (${response.status})`);
}

export function CustomerEditor({
  customer,
  companions,
  documents,
}: {
  customer: CrmCustomer;
  companions: CrmCompanion[];
  documents: CrmTravelDocument[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  async function run(key: string, success: string, action: () => Promise<void>) {
    setPending(key);
    setNotice(null);
    try {
      await action();
      setNotice({ tone: "success", text: success });
      router.refresh();
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Une erreur est survenue.",
      });
    } finally {
      setPending(null);
    }
  }

  async function submitJson(
    event: FormEvent<HTMLFormElement>,
    key: string,
    url: string,
    method: "POST" | "PATCH",
    success: string,
    extra?: Record<string, unknown>
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = { ...Object.fromEntries(new FormData(form).entries()), ...extra };
    await run(key, success, async () => {
      await apiRequest(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (method === "POST") form.reset();
    });
  }

  async function addDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.set("customer_id", customer.id);
    await run("document-add", "Document ajouté.", async () => {
      await apiRequest("/api/admin/travel-documents", { method: "POST", body: formData });
      form.reset();
    });
  }

  async function remove(kind: "companion" | "document", id: string) {
    const label = kind === "companion" ? "ce compagnon" : "ce document";
    if (!window.confirm(`Supprimer ${label} ? Cette action est irréversible.`)) return;
    const url = kind === "companion" ? "/api/admin/companions" : "/api/admin/travel-documents";
    await run(`${kind}-delete-${id}`, "Suppression effectuée.", async () => {
      await apiRequest(
        `${url}?id=${encodeURIComponent(id)}&customerId=${encodeURIComponent(customer.id)}`,
        { method: "DELETE" }
      );
    });
  }

  const disabled = pending !== null;
  const fieldClass = "rounded-xl border border-border px-3 py-2";

  return (
    <div className="space-y-6">
      <div aria-live="polite" aria-atomic="true">
        {pending ? <p className="text-sm text-muted">Traitement en cours…</p> : null}
        {notice ? (
          <p className={`text-sm ${notice.tone === "error" ? "text-[var(--admin-red)]" : "text-emerald-700"}`}>
            {notice.text}
          </p>
        ) : null}
      </div>

      <PortalInviteButton customerId={customer.id} linked={Boolean(customer.auth_user_id)} />

      <form
        onSubmit={(event) =>
          submitJson(event, "customer-save", `/api/admin/clients/${customer.id}`, "PATCH", "Client enregistré.")
        }
        className="admin-af-card grid gap-3 rounded-3xl p-5 sm:grid-cols-2"
      >
        <input name="first_name" required defaultValue={customer.first_name} placeholder="Prénom" className={fieldClass} />
        <input name="last_name" required defaultValue={customer.last_name} placeholder="Nom" className={fieldClass} />
        <input name="email" type="email" required defaultValue={customer.email} className={fieldClass} />
        <input name="phone" defaultValue={customer.phone || ""} placeholder="Téléphone" className={fieldClass} />
        <input name="whatsapp" defaultValue={customer.whatsapp || ""} placeholder="WhatsApp" className={fieldClass} />
        <input name="nationality" defaultValue={customer.nationality || ""} placeholder="Nationalité" className={fieldClass} />
        <input name="address_line" defaultValue={customer.address_line || ""} placeholder="Adresse" className={`sm:col-span-2 ${fieldClass}`} />
        <button disabled={disabled} className="admin-af-btn rounded-full px-4 py-2 text-sm sm:col-span-2 disabled:opacity-50">
          {pending === "customer-save" ? "Enregistrement…" : "Enregistrer"}
        </button>
      </form>

      <section className="admin-af-card rounded-3xl p-5">
        <h2 className="font-display text-lg font-bold">Compagnons</h2>
        <ul className="mt-3 space-y-3">
          {companions.map((companion) => (
            <li key={companion.id} className="rounded-2xl border border-border p-3">
              <form
                onSubmit={(event) =>
                  submitJson(event, `companion-save-${companion.id}`, "/api/admin/companions", "PATCH", "Compagnon enregistré.", {
                    id: companion.id,
                    customer_id: customer.id,
                  })
                }
                className="grid gap-2 sm:grid-cols-3"
              >
                <input name="first_name" required defaultValue={companion.first_name} placeholder="Prénom" className={fieldClass} />
                <input name="last_name" required defaultValue={companion.last_name} placeholder="Nom" className={fieldClass} />
                <input name="birth_date" type="date" defaultValue={companion.birth_date || ""} className={fieldClass} />
                <input name="nationality" defaultValue={companion.nationality || ""} placeholder="Nationalité" className={fieldClass} />
                <input name="relationship" defaultValue={companion.relationship || ""} placeholder="Lien" className={fieldClass} />
                <div className="flex items-center gap-3">
                  <button disabled={disabled} className="text-xs font-semibold disabled:opacity-50">Modifier</button>
                  <button type="button" disabled={disabled} onClick={() => remove("companion", companion.id)} className="text-xs font-semibold text-[var(--admin-red)] disabled:opacity-50">Supprimer</button>
                </div>
              </form>
            </li>
          ))}
        </ul>
        <form
          onSubmit={(event) =>
            submitJson(event, "companion-add", "/api/admin/companions", "POST", "Compagnon ajouté.", { customer_id: customer.id })
          }
          className="mt-3 flex flex-wrap gap-2"
        >
          <input name="first_name" required placeholder="Prénom" className={fieldClass} />
          <input name="last_name" required placeholder="Nom" className={fieldClass} />
          <button disabled={disabled} className="admin-af-btn rounded-full px-3 py-2 text-sm disabled:opacity-50">Ajouter</button>
        </form>
      </section>

      <section className="admin-af-card rounded-3xl p-5">
        <h2 className="font-display text-lg font-bold">Documents</h2>
        <ul className="mt-3 space-y-3">
          {documents.map((document) => (
            <li key={document.id} className="rounded-2xl border border-border p-3">
              <form
                onSubmit={(event) =>
                  submitJson(event, `document-save-${document.id}`, "/api/admin/travel-documents", "PATCH", "Document enregistré.", {
                    id: document.id,
                    customer_id: customer.id,
                  })
                }
                className="grid gap-2 sm:grid-cols-3"
              >
                <select name="doc_type" defaultValue={document.doc_type} className={fieldClass}>
                  {Object.entries(DOC_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <input name="number" defaultValue={document.number || ""} placeholder="Numéro" className={fieldClass} />
                <input name="issuing_country" defaultValue={document.issuing_country || ""} placeholder="Pays émetteur" className={fieldClass} />
                <input name="issued_on" type="date" defaultValue={document.issued_on || ""} className={fieldClass} />
                <input name="expires_on" type="date" defaultValue={document.expires_on || ""} className={fieldClass} />
                <select name="companion_id" defaultValue={document.companion_id || ""} className={fieldClass}>
                  <option value="">Client principal</option>
                  {companions.map((companion) => <option key={companion.id} value={companion.id}>{companion.first_name} {companion.last_name}</option>)}
                </select>
                <div className="flex items-center gap-3 sm:col-span-3">
                  {document.storage_path ? (
                    <a className="text-xs font-semibold underline" href={`/api/files?path=${encodeURIComponent(document.storage_path)}`}>
                      {document.file_name || "Voir le fichier"}
                    </a>
                  ) : null}
                  <button disabled={disabled} className="text-xs font-semibold disabled:opacity-50">Modifier</button>
                  <button type="button" disabled={disabled} onClick={() => remove("document", document.id)} className="text-xs font-semibold text-[var(--admin-red)] disabled:opacity-50">Supprimer</button>
                </div>
              </form>
            </li>
          ))}
        </ul>
        <form onSubmit={addDocument} className="mt-3 grid gap-2 sm:grid-cols-3">
          <select name="doc_type" defaultValue="passport" className={fieldClass}>
            {Object.entries(DOC_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <input name="number" placeholder="Numéro" className={fieldClass} />
          <input name="expires_on" type="date" className={fieldClass} />
          <select name="companion_id" className={fieldClass}>
            <option value="">Client principal</option>
            {companions.map((companion) => <option key={companion.id} value={companion.id}>{companion.first_name} {companion.last_name}</option>)}
          </select>
          <input name="file" type="file" className="text-sm sm:col-span-2" />
          <button disabled={disabled} className="admin-af-btn rounded-full px-3 py-2 text-sm sm:col-span-3 disabled:opacity-50">Ajouter</button>
        </form>
      </section>
    </div>
  );
}
