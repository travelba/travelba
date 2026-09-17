"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CountryCode } from "libphonenumber-js";
import { countriesForSelect, countryName, flagImageUrl, resolveCountryCode } from "@/lib/crm/countries";
import {
  formatAsYouType,
  isValidPhone,
  parseStoredPhone,
  PHONE_COUNTRIES,
  toE164,
} from "@/lib/crm/phone";
import { RELATIONSHIP_OPTIONS, SEX_OPTIONS } from "@/lib/crm/identity";

export const fieldControlClass =
  "w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm text-[var(--admin-navy)] outline-none transition focus:border-[var(--admin-navy)]";

function FlagImg({ iso2 }: { iso2: string }) {
  return (
    <img
      src={flagImageUrl(iso2, 40)}
      srcSet={`${flagImageUrl(iso2, 40)} 1x, ${flagImageUrl(iso2, 80)} 2x`}
      alt=""
      width={20}
      height={15}
      className="h-[15px] w-5 shrink-0 rounded-[2px] object-cover shadow-[0_0_0_1px_rgba(11,25,44,0.12)]"
    />
  );
}

function useDismiss(open: boolean, onClose: () => void) {
  const rootRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) onCloseRef.current();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseRef.current();
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return rootRef;
}

export function Field({
  label,
  hint,
  error,
  className = "",
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`block space-y-1.5 text-sm ${className}`}>
      <span className="font-medium text-[var(--admin-navy)]">{label}</span>
      {children}
      {hint && !error ? <span className="block text-xs text-muted">{hint}</span> : null}
      {error ? <span className="block text-xs text-accent">{error}</span> : null}
    </label>
  );
}

export function CountrySelect({
  name,
  value,
  onChange,
  allowEmpty = true,
  emptyLabel = "Choisir",
  className = fieldControlClass,
}: {
  name: string;
  value: string;
  onChange: (iso2: string) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
  className?: string;
}) {
  const options = useMemo(() => countriesForSelect(), []);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const close = () => {
    setOpen(false);
    setQuery("");
  };
  const rootRef = useDismiss(open, close);
  const selected = options.find((country) => country.iso2 === value);
  const filtered = options.filter((country) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      country.name.toLowerCase().includes(q) ||
      country.iso2.toLowerCase().includes(q)
    );
  });

  return (
    <div ref={rootRef} className="relative">
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        aria-label="Pays"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`${className} flex items-center gap-2 text-left`}
      >
        {selected ? <FlagImg iso2={selected.iso2} /> : null}
        <span className="min-w-0 flex-1 truncate">
          {selected?.name || emptyLabel}
        </span>
        <span className="text-[10px] text-muted">▾</span>
      </button>
      {open ? (
        <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-xl border border-border bg-white shadow-lg">
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher un pays"
            className="w-full border-b border-border px-3 py-2 text-sm outline-none"
          />
          <ul role="listbox" className="max-h-60 overflow-auto py-1">
            {allowEmpty ? (
              <li>
                <button
                  type="button"
                  className="flex w-full px-3 py-2 text-left text-sm text-muted hover:bg-[var(--admin-sky)]"
                  onClick={() => {
                    onChange("");
                    close();
                  }}
                >
                  {emptyLabel}
                </button>
              </li>
            ) : null}
            {filtered.map((country) => (
              <li key={country.iso2}>
                <button
                  type="button"
                  role="option"
                  aria-selected={country.iso2 === value}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--admin-sky)] ${
                    country.iso2 === value ? "bg-[var(--admin-sky)]/70" : ""
                  }`}
                  onClick={() => {
                    onChange(country.iso2);
                    close();
                  }}
                >
                  <FlagImg iso2={country.iso2} />
                  <span className="truncate">{country.name}</span>
                </button>
              </li>
            ))}
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted">Aucun pays</li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function PhoneCountrySelect({
  value,
  onChange,
  className,
}: {
  value: CountryCode;
  onChange: (iso2: CountryCode) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const close = () => {
    setOpen(false);
    setQuery("");
  };
  const rootRef = useDismiss(open, close);
  const selected =
    PHONE_COUNTRIES.find((item) => item.iso2 === value) || PHONE_COUNTRIES[0];
  const filtered = PHONE_COUNTRIES.filter((item) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      item.name.toLowerCase().includes(q) ||
      item.dial.includes(q.replace(/^\+/, "")) ||
      item.iso2.toLowerCase().includes(q)
    );
  });

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-label="Indicatif international"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`${className} flex items-center gap-2 text-left`}
      >
        <FlagImg iso2={selected.iso2} />
        <span className="min-w-0 flex-1 truncate font-medium">{selected.dial}</span>
        <span className="text-[10px] text-muted">▾</span>
      </button>
      {open ? (
        <div className="absolute z-40 mt-1 w-[min(calc(100vw-2rem),20rem)] overflow-hidden rounded-xl border border-border bg-white shadow-lg">
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Pays ou indicatif"
            className="w-full border-b border-border px-3 py-2 text-sm outline-none"
          />
          <ul role="listbox" className="max-h-60 overflow-auto py-1">
            {filtered.map((item) => (
              <li key={item.iso2}>
                <button
                  type="button"
                  role="option"
                  aria-selected={item.iso2 === value}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--admin-sky)] ${
                    item.iso2 === value ? "bg-[var(--admin-sky)]/70" : ""
                  }`}
                  onClick={() => {
                    onChange(item.iso2);
                    close();
                  }}
                >
                  <FlagImg iso2={item.iso2} />
                  <span className="w-12 shrink-0 font-medium">{item.dial}</span>
                  <span className="truncate text-muted">{item.name}</span>
                </button>
              </li>
            ))}
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted">Aucun pays</li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function PhoneField({
  name,
  label = "Téléphone",
  value,
  onChange,
  required = false,
  className = "",
  controlClassName = fieldControlClass,
  labelClassName = "mb-1.5 block text-sm font-medium text-[var(--admin-navy)]",
}: {
  name: string;
  label?: string;
  value: string;
  onChange: (e164: string) => void;
  required?: boolean;
  className?: string;
  controlClassName?: string;
  labelClassName?: string;
}) {
  const initial = parseStoredPhone(value);
  const [country, setCountry] = useState<CountryCode>(initial.country);
  const [national, setNational] = useState(initial.national);
  const telRef = useRef<HTMLInputElement>(null);
  const valid = isValidPhone(national, country);
  const e164 = national.trim() ? toE164(national, country) || "" : "";

  function update(nextCountry: CountryCode, nextNational: string) {
    const formatted = formatAsYouType(nextNational, nextCountry);
    setCountry(nextCountry);
    setNational(formatted);
    const ok = !formatted.trim() || isValidPhone(formatted, nextCountry);
    const next = ok && formatted.trim() ? toE164(formatted, nextCountry) || "" : "";
    onChange(next);
    queueMicrotask(() => {
      telRef.current?.setCustomValidity(ok ? "" : "Numéro invalide pour cet indicatif.");
    });
  }

  return (
    <div className={className}>
      <span className={labelClassName}>{label}</span>
      <div className="flex w-full gap-2">
        <PhoneCountrySelect
          value={country}
          onChange={(next) => update(next, national)}
          className={`${controlClassName.replace(/\bw-full\b/g, "")} w-[8.75rem] shrink-0 px-2`}
        />
        <input
          ref={telRef}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          required={required}
          value={national}
          placeholder="6 12 34 56 78"
          onChange={(event) => update(country, event.target.value)}
          className={controlClassName}
        />
      </div>
      <input type="hidden" name={name} value={e164} />
      {national && !valid ? (
        <p className="mt-1 text-xs text-accent">Numéro invalide pour cet indicatif.</p>
      ) : null}
    </div>
  );
}

export function SexSelect({
  name,
  value,
  onChange,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <select name={name} value={value} onChange={(event) => onChange(event.target.value)} className={fieldControlClass}>
      <option value="">—</option>
      {SEX_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function RelationshipSelect({
  name,
  value,
  onChange,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const known = RELATIONSHIP_OPTIONS.some((option) => option.value === value);
  return (
    <select name={name} value={value} onChange={(event) => onChange(event.target.value)} className={fieldControlClass}>
      <option value="">Lien</option>
      {RELATIONSHIP_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
      {value && !known ? <option value={value}>{value}</option> : null}
    </select>
  );
}

type BanFeature = {
  properties: {
    label: string;
    name: string;
    postcode: string;
    city: string;
    housenumber?: string;
    street?: string;
  };
};

export function AddressFields({
  country,
  onCountryChange,
  line,
  postal,
  city,
  onLineChange,
  onPostalChange,
  onCityChange,
}: {
  country: string;
  onCountryChange: (iso2: string) => void;
  line: string;
  postal: string;
  city: string;
  onLineChange: (value: string) => void;
  onPostalChange: (value: string) => void;
  onCityChange: (value: string) => void;
}) {
  const [hints, setHints] = useState<BanFeature[]>([]);
  const isFrance = (resolveCountryCode(country) || country) === "FR";

  async function search(query: string) {
    onLineChange(query);
    if (!isFrance || query.trim().length < 3) {
      setHints([]);
      return;
    }
    try {
      const res = await fetch(
        `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=5`
      );
      const json = (await res.json()) as { features?: BanFeature[] };
      setHints(json.features || []);
    } catch {
      setHints([]);
    }
  }

  async function fillCityFromPostal(code: string) {
    onPostalChange(code);
    if (!isFrance || code.replace(/\D/g, "").length !== 5) return;
    try {
      const res = await fetch(
        `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(code)}&postcode=${encodeURIComponent(code)}&type=municipality&limit=1`
      );
      const json = (await res.json()) as { features?: BanFeature[] };
      const nextCity = json.features?.[0]?.properties.city;
      if (nextCity) onCityChange(nextCity);
    } catch {
      /* ignore */
    }
  }

  function pick(feature: BanFeature) {
    const street = [feature.properties.housenumber, feature.properties.street || feature.properties.name]
      .filter(Boolean)
      .join(" ");
    onLineChange(street || feature.properties.label);
    onPostalChange(feature.properties.postcode || "");
    onCityChange(feature.properties.city || "");
    setHints([]);
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Pays" className="sm:col-span-2">
        <CountrySelect name="country" value={country} onChange={onCountryChange} allowEmpty={false} />
      </Field>
      <Field
        label="Adresse"
        hint={isFrance ? "Saisie assistée (adresse française)" : undefined}
        className="sm:col-span-2"
      >
        <div className="relative">
          <input
            name="address_line"
            autoComplete="street-address"
            value={line}
            onChange={(event) => search(event.target.value)}
            className={fieldControlClass}
            placeholder={isFrance ? "N° et rue" : "Adresse"}
          />
          {hints.length > 0 ? (
            <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-border bg-white py-1 shadow-lg">
              {hints.map((hint) => (
                <li key={hint.properties.label}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--admin-sky)]"
                    onClick={() => pick(hint)}
                  >
                    {hint.properties.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Field>
      <Field label="Code postal">
        <input
          name="postal_code"
          autoComplete="postal-code"
          inputMode={isFrance ? "numeric" : "text"}
          maxLength={isFrance ? 5 : 12}
          value={postal}
          onChange={(event) => fillCityFromPostal(event.target.value)}
          className={fieldControlClass}
        />
      </Field>
      <Field label="Ville">
        <input
          name="city"
          autoComplete="address-level2"
          value={city}
          onChange={(event) => onCityChange(event.target.value)}
          className={fieldControlClass}
        />
      </Field>
    </div>
  );
}

export function countryLabel(iso2: string | null | undefined) {
  return countryName(iso2);
}
