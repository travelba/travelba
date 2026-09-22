"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { CompanyRole, CrmCustomer } from "@/lib/crm/types";
import { customerFullName } from "@/lib/crm/types";
import { companyRoleLabel } from "@/lib/crm/company-role";

const fieldClass = "rounded-xl border border-border bg-white px-3 py-2.5";
const labelClass = "flex flex-col gap-1 text-xs font-semibold text-muted";

export function NewCustomerForm({
  companyAdmins = [],
}: {
  companyAdmins?: CrmCustomer[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [role, setRole] = useState<CompanyRole | "">("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form).entries());
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Création impossible. Réessayez.");
        return;
      }
      router.push(`/admin/clients/${json.customer.id}`);
    } catch {
      setError("Connexion interrompue. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="admin-af-card grid gap-3 rounded-2xl p-5 sm:grid-cols-4">
      <label className={labelClass}>
        Prénom
        <input name="first_name" required autoComplete="off" disabled={saving} className={fieldClass} />
      </label>
      <label className={labelClass}>
        Nom
        <input name="last_name" required autoComplete="off" disabled={saving} className={fieldClass} />
      </label>
      <label className={labelClass}>
        E-mail
        <input
          name="email"
          type="email"
          required
          autoComplete="off"
          disabled={saving}
          placeholder="client@exemple.fr"
          className={fieldClass}
        />
      </label>
      <label className={labelClass}>
        Rôle
        <select
          name="company_role"
          value={role}
          onChange={(e) => {
            const v = e.target.value;
            setRole(v === "admin" || v === "member" ? v : "");
          }}
          disabled={saving}
          className={fieldClass}
        >
          <option value="">{companyRoleLabel(null)}</option>
          <option value="admin">{companyRoleLabel("admin")}</option>
          <option value="member">{companyRoleLabel("member")}</option>
        </select>
      </label>
      {role === "admin" ? (
        <label className={`${labelClass} sm:col-span-2`}>
          Société (wallet du gérant)
          <input
            name="company_name"
            autoComplete="off"
            disabled={saving}
            placeholder="OZB Optique"
            className={fieldClass}
          />
        </label>
      ) : null}
      {companyAdmins.length ? (
        <label className={labelClass}>
          Compte de facturation
          <select
            name="billing_parent_id"
            required={role === "member"}
            disabled={saving}
            className={fieldClass}
          >
            <option value="">Aucun — à sa charge</option>
            {companyAdmins.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company_name || customerFullName(c)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {role === "admin" ? (
        <p className="text-xs text-muted sm:col-span-4">
          Le gérant voyage aussi : ses dossiers débiteront ce wallet société.
        </p>
      ) : null}
      <button
        type="submit"
        disabled={saving}
        className="admin-af-btn self-end rounded-full px-4 py-2.5 text-sm sm:col-span-4 sm:justify-self-start"
      >
        {saving ? "Création…" : "Créer"}
      </button>
      {error ? <p className="text-sm text-accent sm:col-span-4">{error}</p> : null}
    </form>
  );
}
