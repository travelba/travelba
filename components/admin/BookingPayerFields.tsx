"use client";

import type { CrmCustomer } from "@/lib/crm/types";
import { customerFullName } from "@/lib/crm/types";
import {
  companyDisplayName,
  isCompanyMember,
  resolveBillingCustomerId,
} from "@/lib/crm/company-role";
import { Field, fieldControlClass } from "@/components/crm/fields";

export function BookingPayerFields({
  customers,
  travelerId,
  billingCustomerId,
  onTravelerChange,
  onBillingChange,
  travelerName = "customer_id",
  billingName = "billing_customer_id",
  disabled,
  travelerRequired = true,
}: {
  customers: CrmCustomer[];
  travelerId: string;
  billingCustomerId: string;
  onTravelerChange: (id: string) => void;
  onBillingChange: (id: string) => void;
  travelerName?: string;
  billingName?: string;
  disabled?: boolean;
  travelerRequired?: boolean;
}) {
  const traveler = customers.find((c) => c.id === travelerId);
  const parentId = traveler?.billing_parent_id || "";
  const parent = parentId ? customers.find((c) => c.id === parentId) : undefined;
  const member = Boolean(traveler && isCompanyMember(traveler) && parentId);
  const companyName = parent ? companyDisplayName(parent) : "la société";
  const travelerLabel = traveler ? customerFullName(traveler) : "le voyageur";

  let preset: "company" | "personal" | "other" = "personal";
  if (member && billingCustomerId === parentId) preset = "company";
  else if (billingCustomerId && travelerId && billingCustomerId === travelerId) preset = "personal";
  else if (billingCustomerId) preset = "other";
  else preset = member ? "company" : "personal";

  return (
    <div className="space-y-3 sm:col-span-2">
      <Field label="Client voyageur (titulaire)">
        <select
          name={travelerName}
          required={travelerRequired}
          disabled={disabled}
          value={travelerId}
          onChange={(e) => {
            const next = e.target.value;
            onTravelerChange(next);
            const nextTraveler = customers.find((c) => c.id === next);
            if (nextTraveler) onBillingChange(resolveBillingCustomerId(nextTraveler));
            else onBillingChange("");
          }}
          className={`${fieldControlClass} bg-white`}
        >
          <option value="">Choisir un client…</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {customerFullName(c)} — {c.email}
              {c.company_role === "member" ? " · rattaché" : ""}
              {c.company_role === "admin" ? " · admin société" : ""}
            </option>
          ))}
        </select>
      </Field>

      {member ? (
        <fieldset className="space-y-2 rounded-2xl border border-[#e5e3dc] bg-[#faf9f6] p-3">
          <legend className="px-1 text-xs font-semibold text-muted">Qui paie ce séjour ?</legend>
          <label className="flex items-start gap-2 text-sm text-[var(--admin-navy)]">
            <input
              type="radio"
              checked={preset === "company"}
              disabled={disabled}
              onChange={() => onBillingChange(parentId)}
              className="mt-1"
            />
            <span>
              <strong>{companyName}</strong> — société
              <span className="mt-0.5 block text-xs font-normal text-muted">
                Débit sur le wallet société. Le voyageur voit ce dossier, pas le solde {companyName}.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-[var(--admin-navy)]">
            <input
              type="radio"
              checked={preset === "personal"}
              disabled={disabled}
              onChange={() => onBillingChange(travelerId)}
              className="mt-1"
            />
            <span>
              <strong>{travelerLabel}</strong> — à sa charge
              <span className="mt-0.5 block text-xs font-normal text-muted">
                Encours personnel. Pour un séjour qu’il finance lui-même.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-[var(--admin-navy)]">
            <input
              type="radio"
              checked={preset === "other"}
              disabled={disabled}
              onChange={() => {
                if (preset !== "other") onBillingChange("");
              }}
              className="mt-1"
            />
            <span>Autre payeur</span>
          </label>
          {preset === "other" ? (
            <select
              value={billingCustomerId}
              disabled={disabled}
              required
              onChange={(e) => onBillingChange(e.target.value)}
              className={`${fieldControlClass} bg-white`}
            >
              <option value="">Choisir…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {customerFullName(c)}
                  {c.company_name ? ` · ${c.company_name}` : ""}
                  {c.company_role === "admin" ? " · admin société" : ""}
                </option>
              ))}
            </select>
          ) : null}
        </fieldset>
      ) : travelerId ? (
        <p className="text-xs text-muted">Facturé au voyageur (encours personnel).</p>
      ) : null}

      <input type="hidden" name={billingName} value={billingCustomerId} />
    </div>
  );
}
