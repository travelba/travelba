"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { CrmCustomer } from "@/lib/crm/types";

export function ProfileForm({ customer }: { customer: CrmCustomer }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    try {
      const res = await fetch("/api/client/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error || "Impossible d’enregistrer votre profil.");
        return;
      }
      setSuccess("Profil enregistré.");
      router.refresh();
    } catch {
      setError("Le service est momentanément indisponible. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
      {(
        [
          ["first_name", "Prénom", customer.first_name],
          ["last_name", "Nom", customer.last_name],
          ["phone", "Téléphone", customer.phone || ""],
          ["whatsapp", "WhatsApp", customer.whatsapp || ""],
          ["birth_date", "Date de naissance", customer.birth_date || "", "date"],
          ["nationality", "Nationalité", customer.nationality || ""],
          ["address_line", "Adresse", customer.address_line || ""],
          ["postal_code", "Code postal", customer.postal_code || ""],
          ["city", "Ville", customer.city || ""],
          ["country", "Pays", customer.country || ""],
        ] as Array<[string, string, string, string?]>
      ).map(([name, label, value, type]) => (
        <label key={name} className="block space-y-1 text-sm">
          <span className="font-medium text-muted">{label}</span>
          <input
            name={name}
            type={type || "text"}
            defaultValue={value}
            className="w-full rounded-xl border border-border bg-white px-3 py-2"
          />
        </label>
      ))}
      <p className="sm:col-span-2 text-xs text-muted">Email : {customer.email}</p>
      {error ? <p className="sm:col-span-2 text-sm text-accent">{error}</p> : null}
      {success ? <p className="sm:col-span-2 text-sm text-emerald-700">{success}</p> : null}
      <div className="sm:col-span-2">
        <button className="admin-af-btn rounded-full px-5 py-2 text-sm" disabled={saving}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}
