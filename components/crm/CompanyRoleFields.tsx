"use client";

import type { CompanyRole, CrmCustomer } from "@/lib/crm/types";
import { companyRoleLabel } from "@/lib/crm/company-role";
import { customerFullName } from "@/lib/crm/types";
import { Field, fieldControlClass } from "@/components/crm/fields";

export function CompanyRoleFields({
  role,
  onRoleChange,
  billingParentId,
  onBillingParentChange,
  companyAdmins,
  selfId,
}: {
  role: CompanyRole | null;
  onRoleChange: (role: CompanyRole | null) => void;
  billingParentId: string;
  onBillingParentChange: (id: string) => void;
  companyAdmins: CrmCustomer[];
  selfId: string;
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-[#e5e3dc] bg-[#faf9f6] p-4">
      <div>
        <p className="font-display text-base font-bold text-[var(--admin-navy)]">
          Société et paiement
        </p>
        <p className="mt-1 text-sm text-muted">
          Deux comptes possibles : la société paie les voyages pro (le collaborateur voit ses frais,
          jamais le solde société). Un séjour à sa charge utilise son encours personnel.
        </p>
      </div>
      <Field label="Rôle">
        <select
          value={role || ""}
          onChange={(e) => {
            const v = e.target.value;
            onRoleChange(v === "admin" || v === "member" ? v : null);
          }}
          className={fieldControlClass}
        >
          <option value="">{companyRoleLabel(null)}</option>
          <option value="admin">{companyRoleLabel("admin")}</option>
          <option value="member">{companyRoleLabel("member")}</option>
        </select>
      </Field>
      {role === "member" ? (
        <Field
          label="Facturé par (admin société)"
          hint="Wallet des voyages professionnels. Un dossier peut quand même être facturé au voyageur."
        >
          <select
            value={billingParentId}
            onChange={(e) => onBillingParentChange(e.target.value)}
            required
            className={fieldControlClass}
          >
            <option value="">Choisir l’admin société…</option>
            {companyAdmins
              .filter((c) => c.id !== selfId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {customerFullName(c)}
                  {c.company_name ? ` · ${c.company_name}` : ""} — {c.email}
                </option>
              ))}
          </select>
        </Field>
      ) : null}
      {role === "admin" ? (
        <p className="text-xs text-[#9e7e51]">
          Ce client est le wallet société : rapprochements Revolut et encours global ici.
        </p>
      ) : null}
    </section>
  );
}
