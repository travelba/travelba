"use client";

import { useState } from "react";
import { CustomerPickDialog } from "@/components/admin/CustomerPickDialog";
import { fieldControlClass } from "@/components/crm/fields";
import { Icon } from "@/components/crm/icons";
import {
  customerPickLabel,
  type PickableCustomer,
} from "@/lib/crm/customer-search";

export function CustomerPickField({
  name,
  label,
  selected,
  title = "Choisir un client",
  formatLabel = customerPickLabel,
  onPick,
  onClear,
  clearLabel = "Tous",
  placeholder = "Choisir un client…",
  controlClass = fieldControlClass,
}: {
  name: string;
  label: string;
  selected: PickableCustomer | null;
  title?: string;
  formatLabel?: (customer: PickableCustomer) => string;
  onPick?: (customer: PickableCustomer) => void;
  /** Filtre : propose d’effacer le choix (« Tous »). */
  onClear?: () => void;
  clearLabel?: string;
  placeholder?: string;
  controlClass?: string;
}) {
  const [value, setValue] = useState<PickableCustomer | null>(selected);
  const [open, setOpen] = useState(false);
  const [customers, setCustomers] = useState<PickableCustomer[]>(selected ? [selected] : []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPicker() {
    setOpen(true);
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/clients?pick=1");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "Recherche clients impossible.");
        return;
      }
      const rows = Array.isArray(json.customers) ? (json.customers as PickableCustomer[]) : [];
      if (value && !rows.some((row) => row.id === value.id)) {
        setCustomers([value, ...rows]);
      } else {
        setCustomers(rows);
      }
    } catch {
      setError("Connexion interrompue. Réessayez.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <label className="flex flex-col gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
      {label}
      <input type="hidden" name={name} value={value?.id || ""} />
      <span className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void openPicker()}
          className={`${controlClass} flex items-center justify-between gap-3 text-left text-sm font-semibold normal-case tracking-normal text-[var(--admin-navy)]`}
        >
          <span className="min-w-0 truncate">{value ? formatLabel(value) : placeholder}</span>
          <Icon name="search" className="h-4 w-4 shrink-0 text-muted" />
        </button>
        {onClear && value ? (
          <button
            type="button"
            onClick={() => {
              setValue(null);
              onClear();
            }}
            className="admin-tap shrink-0 rounded-full border border-[var(--border)] bg-white px-3 py-2 text-xs font-semibold normal-case tracking-normal text-[var(--admin-navy)]"
            aria-label={`${clearLabel} les clients`}
          >
            {clearLabel}
          </button>
        ) : null}
      </span>
      {error ? <span className="text-xs font-medium text-red-700">{error}</span> : null}
      <CustomerPickDialog
        open={open}
        customers={customers}
        selectedId={value?.id || ""}
        title={loading ? `${title}…` : title}
        onSelect={(customer) => {
          setValue(customer);
          onPick?.(customer);
        }}
        onClose={() => setOpen(false)}
      />
    </label>
  );
}
