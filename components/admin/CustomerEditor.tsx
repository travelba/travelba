"use client";

import { FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { CrmCompanion, CrmCustomer, CrmTravelDocument } from "@/lib/crm/types";
import { DOC_TYPE_LABELS } from "@/lib/crm/types";
import { formatDateFr } from "@/lib/crm/money";

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

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    await fetch(`/api/admin/clients/${customer.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    router.refresh();
  }

  async function addCompanion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form).entries());
    await fetch("/api/admin/companions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, customer_id: customer.id }),
    });
    form.reset();
    router.refresh();
  }

  async function addDoc(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fd = new FormData(form);
    fd.set("customer_id", customer.id);
    await fetch("/api/admin/travel-documents", { method: "POST", body: fd });
    form.reset();
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={save} className="admin-af-card grid gap-3 rounded-3xl p-5 sm:grid-cols-2">
        <input name="first_name" defaultValue={customer.first_name} placeholder="Prénom" className="rounded-xl border border-border px-3 py-2" />
        <input name="last_name" defaultValue={customer.last_name} placeholder="Nom" className="rounded-xl border border-border px-3 py-2" />
        <input name="email" defaultValue={customer.email} className="rounded-xl border border-border px-3 py-2" />
        <input name="phone" defaultValue={customer.phone || ""} placeholder="Téléphone" className="rounded-xl border border-border px-3 py-2" />
        <input name="whatsapp" defaultValue={customer.whatsapp || ""} placeholder="WhatsApp" className="rounded-xl border border-border px-3 py-2" />
        <input name="nationality" defaultValue={customer.nationality || ""} placeholder="Nationalité" className="rounded-xl border border-border px-3 py-2" />
        <input name="address_line" defaultValue={customer.address_line || ""} placeholder="Adresse" className="sm:col-span-2 rounded-xl border border-border px-3 py-2" />
        <button className="admin-af-btn rounded-full px-4 py-2 text-sm sm:col-span-2">Enregistrer</button>
      </form>

      <section className="admin-af-card rounded-3xl p-5">
        <h2 className="font-display text-lg font-bold">Compagnons</h2>
        <ul className="mt-2 text-sm">
          {companions.map((c) => (
            <li key={c.id}>
              {c.first_name} {c.last_name}
            </li>
          ))}
        </ul>
        <form onSubmit={addCompanion} className="mt-3 flex flex-wrap gap-2">
          <input name="first_name" required placeholder="Prénom" className="rounded-xl border border-border px-3 py-2" />
          <input name="last_name" required placeholder="Nom" className="rounded-xl border border-border px-3 py-2" />
          <button className="admin-af-btn rounded-full px-3 py-2 text-sm">Ajouter</button>
        </form>
      </section>

      <section className="admin-af-card rounded-3xl p-5">
        <h2 className="font-display text-lg font-bold">Documents</h2>
        <ul className="mt-2 text-sm">
          {documents.map((d) => (
            <li key={d.id}>
              {DOC_TYPE_LABELS[d.doc_type]} {d.number || ""} — exp. {formatDateFr(d.expires_on)}
            </li>
          ))}
        </ul>
        <form onSubmit={addDoc} className="mt-3 grid gap-2 sm:grid-cols-3">
          <select name="doc_type" defaultValue="passport" className="rounded-xl border border-border px-3 py-2">
            {Object.entries(DOC_TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <input name="number" placeholder="Numéro" className="rounded-xl border border-border px-3 py-2" />
          <input name="expires_on" type="date" className="rounded-xl border border-border px-3 py-2" />
          <input name="file" type="file" className="sm:col-span-2 text-sm" />
          <button className="admin-af-btn rounded-full px-3 py-2 text-sm">Ajouter</button>
        </form>
      </section>
    </div>
  );
}
