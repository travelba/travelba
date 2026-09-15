"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Customer = { id: string; first_name: string; last_name: string; email: string };

export function CustomerMerge({ customers }: { customers: Customer[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const source = String(form.get("source") || "");
    const target = String(form.get("target") || "");
    if (!source || !target || source === target) return setMessage("Sélectionnez deux clients différents.");
    if (!window.confirm("Toutes les données du client source seront transférées puis sa fiche sera supprimée. Continuer ?")) return;
    setPending(true);
    const { error } = await createClient().rpc("crm_merge_customers", { p_source_id: source, p_target_id: target });
    setPending(false);
    if (error) return setMessage(error.message);
    setMessage("Fusion terminée.");
    router.push(`/admin/clients/${target}`);
    router.refresh();
  }
  const options = customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.last_name} {customer.first_name} · {customer.email}</option>);
  return <form onSubmit={submit} className="admin-af-card max-w-2xl space-y-5 p-6"><label className="block text-sm font-semibold">Client source (sera supprimé)<select name="source" required className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2"><option value="">Choisir…</option>{options}</select></label><label className="block text-sm font-semibold">Client cible (sera conservé)<select name="target" required className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2"><option value="">Choisir…</option>{options}</select></label><p className="text-sm text-muted">Les voyages, documents, écritures, devis et demandes seront transférés atomiquement. La fusion est bloquée si deux comptes portail distincts existent.</p><button disabled={pending} className="rounded-full bg-red-700 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{pending ? "Fusion…" : "Fusionner les fiches"}</button>{message ? <p role="status" className="text-sm text-muted">{message}</p> : null}</form>;
}
