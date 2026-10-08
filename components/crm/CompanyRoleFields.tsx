"use client";

import type { CompanyRole } from "@/lib/crm/types";
import type { PickableCustomer } from "@/lib/crm/customer-search";
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
  spendingAllowance,
  onSpendingAllowanceChange,
  heading = true,
}: {
  role: CompanyRole | null;
  onRoleChange: (role: CompanyRole | null) => void;
  billingParentId: string;
  onBillingParentChange: (id: string) => void;
  companyAdmins: PickableCustomer[];
  selfId: string;
  spendingAllowance: string;
  onSpendingAllowanceChange: (value: string) => void;
  /** Faux quand un repli porte déjà le titre. */
  heading?: boolean;
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-[#e5e3dc] bg-[#faf9f6] p-4">
      <div>
        {heading ? (
          <p className="font-display text-base font-bold text-[var(--admin-navy)]">
            Société et paiement
          </p>
        ) : null}
        <p className={`text-sm text-muted ${heading ? "mt-1" : ""}`}>
          Un voyageur peut être payé par une société. Les admins associés partagent le wallet et
          voient les voyages les uns des autres. Le collaborateur voit son droit de dépense et les
          frais de ses voyages, pas les versements de la société.
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
      {role === "admin" || role === "member" ? (
        <Field
          label={role === "admin" ? "Associé de" : "Facturé par (admin société)"}
          hint={
            role === "admin"
              ? "Même wallet. Les admins associés voient les voyages les uns des autres. Vide : ce client est le wallet."
              : "Wallet qui reçoit les virements et les débits des dossiers"
          }
        >
          <select
            value={billingParentId}
            onChange={(e) => onBillingParentChange(e.target.value)}
            required={role === "member"}
            className={fieldControlClass}
          >
            <option value="">
              {role === "admin" ? "Ce client est le wallet" : "Choisir l’admin société…"}
            </option>
            {companyAdmins
              .filter((c) => c.id !== selfId && !c.billing_parent_id)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {customerFullName(c)}
                  {c.company_name ? ` · ${c.company_name}` : ""} — {c.email}
                </option>
              ))}
          </select>
        </Field>
      ) : null}
      {role === "admin" || role === "member" ? (
        <Field
          label="Droit de dépense"
          hint="Plafond personnel en euros sur le wallet société. Vide : pas de droit séparé. Le virement reste un seul crédit."
        >
          <input
            value={spendingAllowance}
            onChange={(e) => onSpendingAllowanceChange(e.target.value)}
            inputMode="decimal"
            className={fieldControlClass}
            placeholder="10 000"
          />
        </Field>
      ) : null}
      {role === "admin" && !billingParentId ? (
        <p className="text-xs text-[#9e7e51]">
          Ce client est le wallet société : rapprochements Revolut et encours global ici.
        </p>
      ) : null}
      {role === "admin" && billingParentId ? (
        <p className="text-xs text-[#9e7e51]">
          Cet admin partage le wallet choisi et voit les voyages des autres admins de la société.
        </p>
      ) : null}
    </section>
  );
}
