"use client";

import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { formatSiretInput } from "@/lib/crm/billing";
import type { OfficialCompany } from "@/lib/crm/entreprises";

function readyToSearch(query: string) {
  const trimmed = query.trim();
  const digits = trimmed.replace(/\D/g, "");
  const compact = trimmed.replace(/\s/g, "");
  const numeric = digits.length > 0 && digits.length === compact.length;
  return numeric ? digits.length >= 9 : trimmed.length >= 3;
}

export function useCompanySuggest({
  query,
  onPick,
}: {
  query: string;
  onPick: (company: OfficialCompany) => void;
}) {
  const listId = useId();
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [results, setResults] = useState<OfficialCompany[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    if (!readyToSearch(query)) return;
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
        const companies = (json.companies || []) as OfficialCompany[];
        setResults(companies);
        setActiveIndex(companies.length ? 0 : -1);
        setSearched(true);
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
  }, [query]);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (results.length === 0) {
      if (event.key === "Escape") onPickCancel();
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
      if (picked) onPick(picked);
    } else if (event.key === "Escape") {
      onPickCancel();
    }
  }

  function onPickCancel() {
    setResults([]);
    setSearched(false);
  }

  const showList = readyToSearch(query) && (loading || Boolean(lookupError) || results.length > 0 || searched);
  if (!showList) {
    return { onKeyDown, list: null, listId };
  }

  const list = (
    <ul
      id={listId}
      role="listbox"
      className="absolute top-full z-20 mt-1 max-h-[28rem] w-full overflow-auto rounded-xl border border-border bg-white py-1 shadow-lg"
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
            onClick={() => onPick(company)}
            className={`flex w-full flex-col px-3 py-2 text-left hover:bg-[var(--admin-navy)]/5 ${
              index === activeIndex ? "bg-[var(--admin-navy)]/5" : ""
            }`}
          >
            <span className="font-medium text-[var(--admin-navy)]">
              {company.legalName}
              {company.tradeName ? (
                <span className="font-normal text-muted"> · {company.tradeName}</span>
              ) : null}
              {!company.active ? (
                <span className="ml-2 text-xs font-semibold text-accent">Cessée</span>
              ) : null}
            </span>
            {company.legalForm || company.activity ? (
              <span className="text-xs text-[var(--admin-navy)]">
                {[company.legalForm, company.activity].filter(Boolean).join(" · ")}
              </span>
            ) : null}
            <span className="text-xs text-muted">
              {[company.addressLine, [company.postalCode, company.city].filter(Boolean).join(" ")]
                .filter(Boolean)
                .join(", ") || "Adresse non publiée"}
            </span>
            <span className="text-xs text-muted">
              {company.site} · SIRET {formatSiretInput(company.siret)}
              {company.headOfficeCity ? ` · siège à ${company.headOfficeCity}` : ""}
              {company.createdOn ? ` · créée en ${company.createdOn.slice(0, 4)}` : ""}
              {company.openSites ? ` · ${company.openSites} établissements` : ""}
            </span>
            {company.directors ? (
              <span className="text-xs text-muted">{company.directors}</span>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  );

  return { onKeyDown, list, listId };
}
