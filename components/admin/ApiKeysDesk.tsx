"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { BusyBar } from "@/components/crm/BusyBar";
import { ConfirmAction } from "@/components/crm/ConfirmAction";
import { adminAction } from "@/lib/crm/admin-action";
import { formatDateTimeFr } from "@/lib/crm/money";
import { staffRoleLabel, type StaffRole } from "@/lib/crm/staff-team";

export type ApiKeyRow = {
  id: string;
  label: string;
  prefix: string;
  staffName: string;
  staffRole: StaffRole | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  expiresAt: string | null;
};

export type ApiKeyMember = {
  id: string;
  fullName: string;
  email: string;
  role: StaffRole;
};

const fieldClass = "admin-af-input w-full text-sm";
const labelClass = "flex flex-col gap-1 text-xs font-semibold text-muted";

function stateOf(row: ApiKeyRow, now = Date.now()) {
  if (row.revokedAt) return "Révoquée";
  if (row.expiresAt && Date.parse(row.expiresAt) <= now) return "Expirée";
  return "Active";
}

export function ApiKeysDesk({ keys, members }: { keys: ApiKeyRow[]; members: ApiKeyMember[] }) {
  const router = useRouter();
  const [staffId, setStaffId] = useState(members[0]?.id || "");
  const [label, setLabel] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setCopied(false);
    const result = await adminAction<{ cle?: string }>("/api/admin/cles", {
      method: "POST",
      body: { staff_id: staffId, libelle: label, expire_le: expiresOn },
    });
    setSaving(false);
    if (!result.ok || !result.data?.cle) {
      setError(result.error || "Impossible de créer la clé.");
      return;
    }
    setSecret(result.data.cle);
    setLabel("");
    setExpiresOn("");
    router.refresh();
  }

  async function copySecret() {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mt-6 space-y-6">
      <section className="admin-af-card space-y-4 rounded-3xl p-5">
        <div>
          <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">Brancher un assistant</h2>
          <p className="mt-1 text-sm text-muted">
            L’assistant envoie la clé dans l’en-tête. Elle n’est affichée qu’une fois, à la création.
          </p>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">URL</dt>
            <dd className="mt-1 font-mono text-[var(--admin-navy)]">https://travelba.fr/api/mcp</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">En-tête</dt>
            <dd className="mt-1 font-mono text-[var(--admin-navy)]">Authorization: Bearer tbk_…</dd>
          </div>
        </dl>
        <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
          <label className={labelClass}>
            Membre
            <select className={fieldClass} value={staffId} onChange={(event) => setStaffId(event.target.value)} required>
              {members.length === 0 ? <option value="">Aucun membre</option> : null}
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.fullName} · {staffRoleLabel(member.role)}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Libellé
            <input
              className={fieldClass}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              maxLength={80}
              required
              placeholder="Assistant de Raphael"
            />
          </label>
          <label className={labelClass}>
            Expiration
            <input className={fieldClass} type="date" value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              className="admin-af-btn w-full rounded-full px-4 py-2.5 text-sm disabled:opacity-60 sm:w-auto"
              disabled={saving || !members.length}
            >
              {saving ? "Création…" : "Créer la clé"}
            </button>
          </div>
        </form>
        {saving ? <BusyBar /> : null}
        {error ? <p className="text-sm font-semibold text-[var(--admin-red)]">{error}</p> : null}
        {secret ? (
          <div className="rounded-2xl bg-[var(--admin-peach)] px-4 py-3 text-sm text-[var(--admin-navy)]">
            <p className="font-semibold">Copiez cette clé maintenant. Elle ne sera plus affichée.</p>
            <p className="mt-2 break-all font-mono text-xs">{secret}</p>
            <button type="button" className="mt-3 text-sm font-bold underline" onClick={() => void copySecret()}>
              {copied ? "Copiée" : "Copier"}
            </button>
          </div>
        ) : null}
      </section>

      <section className="admin-af-card overflow-x-auto rounded-3xl p-5">
        <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">Clés</h2>
        {keys.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Aucune clé pour l’instant.</p>
        ) : (
          <table className="mt-3 w-full min-w-[40rem] text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.06em] text-muted">
              <tr>
                <th className="py-2 pr-3 font-semibold">Libellé</th>
                <th className="py-2 pr-3 font-semibold">Préfixe</th>
                <th className="py-2 pr-3 font-semibold">Membre</th>
                <th className="py-2 pr-3 font-semibold">Créée</th>
                <th className="py-2 pr-3 font-semibold">Dernier usage</th>
                <th className="py-2 pr-3 font-semibold">État</th>
                <th className="py-2 font-semibold"> </th>
              </tr>
            </thead>
            <tbody>
              {keys.map((row) => {
                const state = stateOf(row);
                return (
                  <tr key={row.id} className="border-t border-[var(--border)]">
                    <td className="py-3 pr-3 font-semibold text-[var(--admin-navy)]">{row.label}</td>
                    <td className="py-3 pr-3 font-mono text-xs">{row.prefix}</td>
                    <td className="py-3 pr-3">
                      {row.staffName}
                      {row.staffRole ? <span className="text-muted"> · {staffRoleLabel(row.staffRole)}</span> : null}
                    </td>
                    <td className="py-3 pr-3 text-muted">{formatDateTimeFr(row.createdAt)}</td>
                    <td className="py-3 pr-3 text-muted">{row.lastUsedAt ? formatDateTimeFr(row.lastUsedAt) : "—"}</td>
                    <td className="py-3 pr-3">{state}</td>
                    <td className="py-3 text-right">
                      {state === "Active" ? (
                        <ConfirmAction
                          label="Révoquer"
                          question="Révoquer cette clé ? Elle sera refusée tout de suite."
                          confirmLabel="Révoquer"
                          tone="danger"
                          size="sm"
                          onConfirm={async () => {
                            const result = await adminAction(`/api/admin/cles/${row.id}/revoquer`, { method: "POST" });
                            if (!result.ok) return result.error || "Révocation impossible.";
                            router.refresh();
                          }}
                        />
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
