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
          Le rôle décrit le wallet du client. Le compte de facturation est un autre wallet (ex. OZB)
          qui peut payer les voyages de plusieurs titulaires — Jérémy, le gérant de Roselle, etc.
        </p>
      </div>
      <Field label="Rôle (son wallet)">
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
      {role === "admin" ? (
        <p className="text-xs text-[#9e7e51]">
          Wallet société propre (Revolut, encours). Il peut quand même voyager sur un autre compte
          ci-dessous.
        </p>
      ) : null}
      <Field
        label="Compte de facturation par défaut"
        hint="Voyages professionnels. Chaque dossier peut encore être basculé « à sa charge »."
      >
        <select
          value={billingParentId}
          onChange={(e) => onBillingParentChange(e.target.value)}
          required={role === "member"}
          className={fieldControlClass}
        >
          <option value="">Aucun — facturé à lui-même</option>
          {companyAdmins
            .filter((c) => c.id !== selfId)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.company_name || customerFullName(c)}
                {c.company_name ? ` · ${customerFullName(c)}` : ""} — {c.email}
              </option>
            ))}
        </select>
      </Field>
    </section>
  );
}
