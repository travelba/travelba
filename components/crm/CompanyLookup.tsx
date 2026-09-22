"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Field, fieldControlClass } from "@/components/crm/fields";
import { formatSiret, type OfficialCompany } from "@/lib/crm/entreprises";

export type CompanyBilling = {
  legalName: string;
  siret: string;
  vat: string;
  addressLine: string;
  postalCode: string;
  city: string;
};

export function billingFromCustomer(customer: {
  billing_legal_name: string | null;
  billing_siret: string | null;
  billing_vat: string | null;
  billing_address_line: string | null;
  billing_postal_code: string | null;
  billing_city: string | null;
}): CompanyBilling {
  return {
    legalName: customer.billing_legal_name || "",
    siret: customer.billing_siret || "",
    vat: customer.billing_vat || "",
    addressLine: customer.billing_address_line || "",
    postalCode: customer.billing_postal_code || "",
    city: customer.billing_city || "",
  };
}

function readyToSearch(query: string) {
  const trimmed = query.trim();
  const digits = trimmed.replace(/\D/g, "");
  const compact = trimmed.replace(/\s/g, "");
  const numeric = digits.length > 0 && digits.length === compact.length;
  return numeric ? digits.length >= 9 : trimmed.length >= 3;
}

export function CompanyLookup({
  value,
  onChange,
}: {
  value: CompanyBilling;
  onChange: (next: CompanyBilling) => void;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const dirty = useRef(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [results, setResults] = useState<OfficialCompany[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    if (!dirty.current || !readyToSearch(value.legalName)) return;
    const query = value.legalName;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setLookupError(null);
      try {
        const res = await fetch(`/api/entreprises?q=${encodeURIComponent(query.trim())}`, {
          signal: ctrl.signal,
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Annuaire indisponible");
        setResults(json.companies || []);
        setActiveIndex(json.companies?.length ? 0 : -1);
        setSearched(true);
        setOpen(true);
      } catch (err) {
        if (ctrl.signal.aborted) return;
        setResults([]);
        setSearched(true);
        setLookupError(err instanceof Error ? err.message : "Annuaire indisponible");
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 280);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [value.legalName]);

  useEffect(() => {
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, []);

  function choose(company: OfficialCompany) {
    dirty.current = false;
    setOpen(false);
    setLoading(false);
    setResults([]);
    setSearched(false);
    onChange({
      legalName: company.legalName,
      siret: company.siret,
      vat: company.vat || "",
      addressLine: company.addressLine,
      postalCode: company.postalCode,
      city: company.city,
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) {
      if (event.key === "Escape") setOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? results.length - 1 : index - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const picked = results[activeIndex] || results[0];
      if (picked) choose(picked);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  const showList = open && (loading || Boolean(lookupError) || results.length > 0 || searched);

  return (
    <section className="space-y-4">
      <div>
        <p className="font-display text-base font-bold text-[var(--admin-navy)]">Facturation société</p>
        <p className="mt-1 text-sm text-muted">
          Raison sociale, SIRET et adresse à faire figurer sur les factures.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5 text-sm sm:col-span-2">
          <span className="font-medium text-[var(--admin-navy)]">Nom ou SIRET</span>
          <div ref={rootRef} className="relative">
            <input
              value={value.legalName}
              onChange={(event) => {
                const text = event.target.value;
                dirty.current = true;
                setOpen(true);
                if (!readyToSearch(text)) {
                  setResults([]);
                  setLoading(false);
                  setSearched(false);
                  setLookupError(null);
                }
                onChange({ ...value, legalName: text });
              }}
              onFocus={() => {
                if (results.length > 0) setOpen(true);
              }}
              onKeyDown={onKeyDown}
              role="combobox"
              aria-expanded={showList}
              aria-controls={listId}
              aria-autocomplete="list"
              autoComplete="off"
              spellCheck={false}
              placeholder="Nom de la société ou SIRET"
              className={fieldControlClass}
            />
            {showList ? (
              <ul
                id={listId}
                role="listbox"
                className="absolute top-full z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-border bg-white py-1 shadow-lg"
              >
                {loading ? <li className="px-3 py-2 text-sm text-muted">Recherche…</li> : null}
                {lookupError ? <li className="px-3 py-2 text-sm text-accent">{lookupError}</li> : null}
                {!loading && !lookupError && searched && results.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-muted">Aucune société immatriculée</li>
                ) : null}
                {results.map((company, index) => (
                  <li key={company.siret} role="option" aria-selected={index === activeIndex}>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => choose(company)}
                      className={`flex w-full flex-col px-3 py-2 text-left hover:bg-[var(--admin-navy)]/5 ${
                        index === activeIndex ? "bg-[var(--admin-navy)]/5" : ""
                      }`}
                    >
                      <span className="font-medium text-[var(--admin-navy)]">
                        {company.legalName}
                        {!company.active ? (
                          <span className="ml-2 text-xs font-semibold text-accent">Cessée</span>
                        ) : null}
                      </span>
                      <span className="text-xs text-muted">
                        {formatSiret(company.siret)}
                        {company.city ? ` · ${company.city}` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </label>
        <Field label="SIRET">
          <input
            inputMode="numeric"
            autoComplete="off"
            value={formatSiret(value.siret)}
            onChange={(event) =>
              onChange({ ...value, siret: event.target.value.replace(/\D/g, "").slice(0, 14) })
            }
            placeholder="14 chiffres"
            className={fieldControlClass}
          />
        </Field>
        <Field label="TVA intracommunautaire">
          <input
            value={value.vat}
            onChange={(event) => onChange({ ...value, vat: event.target.value })}
            autoComplete="off"
            spellCheck={false}
            className={fieldControlClass}
          />
        </Field>
        <Field label="Adresse de facturation" className="sm:col-span-2">
          <input
            value={value.addressLine}
            onChange={(event) => onChange({ ...value, addressLine: event.target.value })}
            autoComplete="street-address"
            className={fieldControlClass}
          />
        </Field>
        <Field label="Code postal">
          <input
            value={value.postalCode}
            onChange={(event) => onChange({ ...value, postalCode: event.target.value })}
            autoComplete="postal-code"
            className={fieldControlClass}
          />
        </Field>
        <Field label="Ville">
          <input
            value={value.city}
            onChange={(event) => onChange({ ...value, city: event.target.value })}
            autoComplete="address-level2"
            className={fieldControlClass}
          />
        </Field>
      </div>
    </section>
  );
}
