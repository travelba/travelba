"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CustomerPickDialog } from "@/components/admin/CustomerPickDialog";
import type { PickableCustomer } from "@/lib/crm/customer-search";

export type TwinAccount = { id: string; nom: string };

type Preview = {
  apercu?: boolean;
  applique?: boolean;
  message?: string;
  jumeau?: TwinAccount;
  dossiers_visibles_client?: number;
  dossiers_visibles_jumeau?: number;
  references_visibles_client?: string[];
  references_visibles_jumeau?: string[];
};

export function TwinAccountPanel({
  customerId,
  customerName,
  twins,
}: {
  customerId: string;
  customerName: string;
  twins: TwinAccount[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState(false);
  const [customers, setCustomers] = useState<PickableCustomer[]>([]);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [unlinkId, setUnlinkId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function openSearch() {
    setError(null);
    setSearch(true);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/clients?pick=1");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSearch(false);
        setError(typeof json.error === "string" ? json.error : "Recherche impossible.");
        return;
      }
      const rows = Array.isArray(json.customers) ? (json.customers as PickableCustomer[]) : [];
      setCustomers(rows.filter((row) => row.id !== customerId && !twins.some((twin) => twin.id === row.id)));
    } catch {
      setSearch(false);
      setError("Connexion interrompue. Réessayez.");
    } finally {
      setLoading(false);
    }
  }

  async function ask(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/clients/${customerId}/jumeau`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "Jumelage impossible.");
        return null;
      }
      return json as Preview;
    } catch {
      setError("Connexion interrompue. Réessayez.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function choose(customer: PickableCustomer) {
    setSearch(false);
    setPendingId(customer.id);
    const result = await ask({ jumeau_id: customer.id, action: "lier" });
    if (result) setPreview(result);
  }

  async function confirmLink() {
    if (!pendingId) return;
    const result = await ask({ jumeau_id: pendingId, action: "lier", confirmer: true });
    if (!result?.applique && !result?.message) return;
    setPreview(null);
    setPendingId(null);
    router.refresh();
  }

  async function confirmUnlink() {
    if (!unlinkId) return;
    const result = await ask({ jumeau_id: unlinkId, action: "delier", confirmer: true });
    if (!result?.applique) return;
    setUnlinkId(null);
    router.refresh();
  }

  const refs = [
    ...(preview?.references_visibles_client || []),
    ...(preview?.references_visibles_jumeau || []),
  ].filter((ref, index, all) => all.indexOf(ref) === index);

  return (
    <section className="admin-af-card rounded-3xl px-5 py-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--admin-gold-dark)]">Accès</p>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-[var(--admin-navy)]">Compte jumeau</h2>
        </div>
        <button
          type="button"
          onClick={() => void openSearch()}
          className="admin-tap rounded-full border border-[var(--admin-navy)] px-3 py-1.5 text-sm font-semibold text-[var(--admin-navy)]"
        >
          Lier une fiche
        </button>
      </div>
      <p className="mt-2 text-sm text-muted">
        {customerName} garde son accès. La fiche liée aussi. Elles voient les mêmes réservations. Le dossier, le relevé
        et l’encours restent uniques. Aucun message n’est envoyé.
      </p>
      {twins.length ? (
        <ul className="mt-3 divide-y divide-border text-sm">
          {twins.map((twin) => (
            <li key={twin.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <Link href={`/admin/clients/${twin.id}`} className="font-semibold text-[var(--admin-navy)] underline-offset-2 hover:underline">
                {twin.nom}
              </Link>
              <button
                type="button"
                onClick={() => setUnlinkId(twin.id)}
                className="text-sm font-semibold text-[var(--admin-navy)] underline-offset-2 hover:underline"
              >
                Délier
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-[var(--admin-navy)]">Aucun compte jumeau.</p>
      )}
      {error ? <p className="mt-3 text-sm text-[var(--admin-red)]">{error}</p> : null}
      <CustomerPickDialog
        open={search}
        customers={customers}
        title={loading ? "Recherche…" : "Lier une fiche"}
        onSelect={(customer) => void choose(customer)}
        onClose={() => setSearch(false)}
      />
      {preview ? (
        <div className="mt-4 space-y-3 rounded-2xl border border-[#e8e4dc] bg-[#f8f3eb] px-4 py-3 text-sm text-[var(--admin-navy)]">
          <p>{preview.message}</p>
          {refs.length ? <p className="text-xs text-muted">Dossiers montrés : {refs.join(", ")}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void confirmLink()}
              className="rounded-full bg-[#0b192c] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy ? "Enregistrement…" : "Lier les deux fiches"}
            </button>
            <button type="button" onClick={() => setPreview(null)} className="rounded-full border border-[#e8e4dc] bg-white px-4 py-2 text-sm font-semibold">
              Annuler
            </button>
          </div>
        </div>
      ) : null}
      {unlinkId ? (
        <div className="mt-4 space-y-3 rounded-2xl border border-[#e8e4dc] bg-white px-4 py-3 text-sm text-[var(--admin-navy)]">
          <p>
            Délier {twins.find((twin) => twin.id === unlinkId)?.nom || "cette fiche"} ? Chacun ne verra plus que ses
            dossiers. Rien n’est envoyé.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void confirmUnlink()}
              className="rounded-full bg-[#0b192c] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy ? "Enregistrement…" : "Délier"}
            </button>
            <button type="button" onClick={() => setUnlinkId(null)} className="rounded-full border border-[#e8e4dc] px-4 py-2 text-sm font-semibold">
              Annuler
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
