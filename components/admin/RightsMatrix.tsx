"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BusyBar } from "@/components/crm/BusyBar";
import {
  CONFIGURABLE_ROLES,
  PERMISSION_LABELS,
  PERMISSIONS,
  type ConfigurableRole,
  type Permission,
} from "@/lib/crm/agency-access";
import { staffRoleLabel } from "@/lib/crm/staff-team";

export type RightsGrid = Record<ConfigurableRole, Record<Permission, boolean>>;

/** Matrice sur la page Équipe. L’administrateur n’y figure pas : il garde tous les droits. */
export function RightsMatrix({ grid, preview = false }: { grid: RightsGrid; preview?: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = useState(grid);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function toggle(role: ConfigurableRole, permission: Permission) {
    setSaved(false);
    setDraft((current) => ({
      ...current,
      [role]: { ...current[role], [permission]: !current[role][permission] },
    }));
  }

  async function save() {
    if (preview) return;
    setSaving(true);
    setError(null);
    const updates = CONFIGURABLE_ROLES.flatMap((role) =>
      PERMISSIONS.map((permission) => ({ role, permission, allowed: draft[role][permission] }))
    );
    try {
      const res = await fetch("/api/admin/equipe/droits", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Enregistrement impossible.");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("Connexion interrompue. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="admin-af-card space-y-4 rounded-2xl p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-display text-lg font-bold text-[var(--admin-navy)]">Droits</p>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Tous les rôles voient tous les dossiers de l’agence. L’administrateur garde tous les droits. Les autres
            rôles se règlent ici. Le partenaire MyLER n’ouvre que Little Emperors.
          </p>
        </div>
        <button
          type="button"
          disabled={saving || preview}
          onClick={() => void save()}
          className="admin-af-btn rounded-full px-4 py-2 text-sm disabled:opacity-60"
        >
          {saving ? "Enregistrement…" : "Enregistrer les droits"}
        </button>
      </div>
      <BusyBar active={saving} label="Enregistrement des droits…" />
      {error ? <p className="text-sm text-[var(--admin-red)]">{error}</p> : null}
      {saved ? <p className="text-sm font-semibold text-[var(--admin-navy)]">Droits enregistrés.</p> : null}
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="font-label text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
            <tr>
              <th className="px-3 py-2">Droit</th>
              {CONFIGURABLE_ROLES.map((role) => (
                <th key={role} className="px-3 py-2">
                  {staffRoleLabel(role)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSIONS.map((permission) => (
              <tr key={permission} className="border-t border-[var(--border)]">
                <th className="px-3 py-2 text-left font-medium text-[var(--admin-navy)]">
                  {PERMISSION_LABELS[permission]}
                </th>
                {CONFIGURABLE_ROLES.map((role) => (
                  <td key={role} className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={draft[role][permission]}
                      aria-label={`${PERMISSION_LABELS[permission]} pour ${staffRoleLabel(role)}`}
                      onChange={() => toggle(role, permission)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
