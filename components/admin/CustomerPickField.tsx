"use client";

import { useState } from "react";
import { CustomerPickDialog } from "@/components/admin/CustomerPickDialog";
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
}: {
  name: string;
  label: string;
  selected: PickableCustomer | null;
  title?: string;
  formatLabel?: (customer: PickableCustomer) => string;
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
    <label className="flex flex-col gap-1 text-xs font-semibold text-muted sm:col-span-2">
      {label}
      <input type="hidden" name={name} value={value?.id || ""} />
      <button
        type="button"
        onClick={() => void openPicker()}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-white px-3 py-2 text-left text-sm font-medium text-[var(--admin-navy)]"
      >
        <span className="min-w-0 truncate">
          {value ? formatLabel(value) : "Choisir un client…"}
        </span>
        <Icon name="search" className="h-4 w-4 shrink-0 text-muted" />
      </button>
      {error ? <span className="text-xs font-medium text-red-700">{error}</span> : null}
      <CustomerPickDialog
        open={open}
        customers={customers}
        selectedId={value?.id || ""}
        title={loading ? `${title}…` : title}
        onSelect={setValue}
        onClose={() => setOpen(false)}
      />
    </label>
  );
}
