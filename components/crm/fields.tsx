"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { FrCalendar } from "@/components/crm/FrCalendar";
import { Phone, Plus } from "lucide-react";
import type { CountryCode } from "libphonenumber-js";
import type { AddressHit } from "@/lib/crm/address-suggest";
import { countriesForSelect, countryName, flagImageUrl, resolveCountryCode } from "@/lib/crm/countries";
import {
  formatAsYouType,
  isValidPhone,
  parseStoredPhone,
  PHONE_COUNTRIES,
  toE164,
} from "@/lib/crm/phone";
import { ageAndSexCaption, RELATIONSHIP_OPTIONS, SEX_OPTIONS } from "@/lib/crm/identity";
import { frInputToIso, isoToFrInput, maskFrDate, parisTodayIso } from "@/lib/crm/dates";
import { maskMoneyTyping, moneyToInput, parseMoney } from "@/lib/crm/money";

export const fieldControlClass =
  "w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm text-[var(--admin-navy)] outline-none transition focus:border-[var(--admin-navy)]";

function FlagImg({ iso2 }: { iso2: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- drapeaux flagcdn.com, domaine distant hors next.config
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
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
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

export function DateFrInput({
  name,
  value,
  defaultValue,
  onChange,
  max,
  min,
  required = false,
  className = fieldControlClass,
  autoComplete,
  "aria-label": ariaLabel,
}: {
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (iso: string) => void;
  max?: string;
  min?: string;
  required?: boolean;
  className?: string;
  autoComplete?: string;
  "aria-label"?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [iso, setIso] = useState(value ?? defaultValue ?? "");
  const [text, setText] = useState(() => isoToFrInput(value ?? defaultValue ?? ""));
  const [syncedValue, setSyncedValue] = useState(value);
  if (value !== undefined && value !== syncedValue) {
    setSyncedValue(value);
    setIso(value);
    setText(isoToFrInput(value));
  }

  function commit(nextIso: string) {
    if (nextIso && max && nextIso > max) return;
    if (nextIso && min && nextIso < min) return;
    setIso(nextIso);
    setText(isoToFrInput(nextIso));
    onChange?.(nextIso);
  }

  function openCalendar() {
    const rect = rootRef.current?.getBoundingClientRect();
    if (rect) setAnchor(rect);
    setOpen(true);
  }

  return (
    <div className="relative" ref={rootRef}>
      {name ? <input type="hidden" name={name} value={iso} /> : null}
      <input
        type="text"
        inputMode="numeric"
        autoComplete={autoComplete}
        aria-label={ariaLabel}
        required={required}
        placeholder="jj/mm/aaaa"
        lang="fr-FR"
        value={text}
        onChange={(event) => {
          const next = maskFrDate(event.target.value);
          setText(next);
          const parsed = frInputToIso(next);
          if (parsed !== null) commit(parsed);
        }}
        onBlur={() => {
          const parsed = frInputToIso(text);
          if (parsed === null) {
            setText(isoToFrInput(iso));
            return;
          }
          commit(parsed);
        }}
        className={`${className} pr-10`}
      />
      <button
        type="button"
        data-fr-calendar-trigger
        aria-label={ariaLabel ? `Calendrier, ${ariaLabel}` : "Ouvrir le calendrier"}
        aria-expanded={open}
        onMouseDown={(event) => event.preventDefault()}
        onClick={openCalendar}
        className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-[var(--admin-navy)] hover:bg-[var(--admin-peach)]"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      </button>
      <FrCalendar
        open={open}
        anchor={anchor}
        value={iso}
        min={min}
        max={max}
        onPick={commit}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}

/** Date de naissance, avec l’âge du jour et le sexe à côté. */
export function BirthDateField({
  label = "Naissance",
  value,
  onChange,
  sex,
  max,
  autoComplete,
  className,
}: {
  label?: string;
  value: string;
  onChange: (iso: string) => void;
  sex?: string | null;
  max?: string;
  autoComplete?: string;
  className?: string;
}) {
  const aside = ageAndSexCaption(value, sex);
  return (
    <Field label={label} className={className}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <DateFrInput
            value={value}
            onChange={onChange}
            max={max ?? parisTodayIso()}
            autoComplete={autoComplete}
          />
        </div>
        {aside ? (
          <p className="shrink-0 text-sm font-semibold text-[var(--admin-navy)]">{aside}</p>
        ) : null}
      </div>
    </Field>
  );
}

export function MoneyInput({
  name,
  value,
  defaultValue,
  onChange,
  required = false,
  disabled = false,
  placeholder = "0,00",
  className = fieldControlClass,
  "aria-label": ariaLabel,
}: {
  name?: string;
  value?: number | string | null;
  defaultValue?: number | string | null;
  onChange?: (amount: number | null) => void;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const initial = parseMoney(value ?? defaultValue ?? null);
  const [amount, setAmount] = useState<number | null>(initial);
  const [text, setText] = useState(initial == null ? "" : moneyToInput(initial));
  const inputRef = useRef<HTMLInputElement>(null);
  const [syncedValue, setSyncedValue] = useState(value);

  if (value !== undefined && value !== syncedValue) {
    setSyncedValue(value);
    const next = parseMoney(value);
    if (parseMoney(text) !== next) {
      setAmount(next);
      setText(next == null ? "" : moneyToInput(next));
    }
  }

  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form || value !== undefined) return;
    function onReset() {
      const next = parseMoney(defaultValue ?? null);
      setAmount(next);
      setText(next == null ? "" : moneyToInput(next));
    }
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [defaultValue, value]);

  function publish(nextText: string, commitFormat: boolean) {
    const parsed = parseMoney(nextText);
    setAmount(parsed);
    setText(commitFormat ? (parsed == null ? "" : moneyToInput(parsed)) : nextText);
    onChange?.(parsed);
  }

  return (
    <>
      {name ? <input type="hidden" name={name} value={amount == null ? "" : String(amount)} /> : null}
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        lang="fr-FR"
        autoComplete="off"
        aria-label={ariaLabel}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        value={text}
        onChange={(event) => publish(maskMoneyTyping(event.target.value), false)}
        onBlur={() => publish(text, true)}
        className={className}
      />
    </>
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
    const ok = formatted.trim()
      ? isValidPhone(formatted, nextCountry)
      : !required;
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

export function OptionalSecondPhone({
  name = "phone_secondary",
  label = "Téléphone 2",
  value,
  onChange,
}: {
  name?: string;
  label?: string;
  value: string;
  onChange: (e164: string) => void;
}) {
  const [opened, setOpen] = useState(false);
  const open = opened || Boolean(value.trim());

  if (!open) {
    return (
      <div className="flex h-full items-end">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ajouter un téléphone"
          title="Ajouter un téléphone"
          className="inline-flex h-[42px] w-[42px] items-center justify-center rounded-full border border-border bg-white text-[var(--admin-navy)] transition hover:border-[var(--admin-gold)] hover:bg-[var(--admin-sky)]/50"
        >
          <span className="relative inline-flex">
            <Phone className="h-4 w-4" />
            <Plus className="absolute -right-2 -top-2 h-3 w-3" strokeWidth={2.5} />
          </span>
        </button>
      </div>
    );
  }

  return (
    <div>
      <PhoneField name={name} label={label} value={value} onChange={onChange} />
      <button
        type="button"
        className="mt-1.5 text-xs font-semibold text-muted"
        onClick={() => {
          onChange("");
          setOpen(false);
        }}
      >
        Retirer
      </button>
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

type AddressValue = {
  country: string;
  line: string;
  postal: string;
  city: string;
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
  onCommit,
  lineLabel = "Adresse",
}: {
  country: string;
  onCountryChange: (iso2: string) => void;
  line: string;
  postal: string;
  city: string;
  onLineChange: (value: string) => void;
  onPostalChange: (value: string) => void;
  onCityChange: (value: string) => void;
  /** Une seule mise à jour. Indispensable quand l’adresse de facturation se détache du domicile. */
  onCommit?: (next: AddressValue) => void;
  lineLabel?: string;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const timer = useRef<number | null>(null);
  const abort = useRef<AbortController | null>(null);
  const [hints, setHints] = useState<AddressHit[]>([]);
  const [open, setOpen] = useState(false);
  const [empty, setEmpty] = useState(false);
  const isFrance = (resolveCountryCode(country) || country) === "FR";

  useEffect(() => {
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, []);

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
      abort.current?.abort();
    };
  }, []);

  function publish(partial: Partial<AddressValue>) {
    const next = { country, line, postal, city, ...partial };
    if (onCommit) {
      onCommit(next);
      return;
    }
    if (next.country !== country) onCountryChange(next.country);
    if (next.line !== line) onLineChange(next.line);
    if (next.postal !== postal) onPostalChange(next.postal);
    if (next.city !== city) onCityChange(next.city);
  }

  function search(query: string) {
    publish({ line: query });
    if (timer.current) window.clearTimeout(timer.current);
    abort.current?.abort();
    const q = query.trim();
    if (q.length < 3) {
      setHints([]);
      setEmpty(false);
      setOpen(false);
      return;
    }
    timer.current = window.setTimeout(() => {
      const controller = new AbortController();
      abort.current = controller;
      const params = new URLSearchParams({ q });
      const iso = resolveCountryCode(country);
      if (iso) params.set("country", iso);
      if (city.trim()) params.set("near", city.trim());
      void fetch(`/api/addresses?${params}`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : { hits: [] }))
        .then((json: { hits?: AddressHit[] }) => {
          if (controller.signal.aborted) return;
          const rows = Array.isArray(json.hits) ? json.hits : [];
          setHints(rows);
          setEmpty(rows.length === 0);
          setOpen(fieldRef.current === document.activeElement);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setHints([]);
          setEmpty(true);
          setOpen(fieldRef.current === document.activeElement);
        });
    }, 160);
  }

  async function fillCityFromPostal(code: string) {
    publish({ postal: code });
    if (!isFrance || code.replace(/\D/g, "").length !== 5) return;
    try {
      const res = await fetch(
        `/api/addresses?${new URLSearchParams({ q: code, country: "FR", near: code })}`
      );
      const json = (await res.json()) as { hits?: AddressHit[] };
      const nextCity = json.hits?.find((hit) => hit.city)?.city;
      if (nextCity) publish({ postal: code, city: nextCity });
    } catch {
      /* La ville reste celle qui est saisie. */
    }
  }

  function pick(hit: AddressHit) {
    const abroad = Boolean(hit.country) && hit.country !== "FR";
    publish({
      line: hit.line || hit.title,
      postal: abroad ? hit.postal : hit.postal || postal,
      city: hit.city || city,
      country: hit.country || country,
    });
    setHints([]);
    setEmpty(false);
    setOpen(false);
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Pays" className="sm:col-span-2">
        <CountrySelect name="country" value={country} onChange={(iso2) => publish({ country: iso2 })} allowEmpty={false} />
      </Field>
      <Field
        label={lineLabel}
        hint="Saisie libre, même sans suggestion."
        className="sm:col-span-2"
      >
        <div ref={rootRef} className="relative">
          <input
            ref={fieldRef}
            name="address_line"
            autoComplete="street-address"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open && (hints.length > 0 || empty)}
            aria-controls={listId}
            value={line}
            onChange={(event) => search(event.target.value)}
            onFocus={() => {
              if (hints.length || empty) setOpen(true);
            }}
            onBlur={() => {
              window.setTimeout(() => setOpen(false), 120);
            }}
            className={fieldControlClass}
            placeholder={isFrance ? "N° et rue" : "Adresse"}
          />
          {open && (hints.length > 0 || empty) ? (
            <ul
              id={listId}
              role="listbox"
              className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-border bg-white py-1 shadow-lg"
            >
              {hints.map((hint) => (
                <li key={hint.id || hint.label} role="option" aria-selected={false}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--admin-sky)]"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      pick(hint);
                    }}
                  >
                    {hint.label}
                  </button>
                </li>
              ))}
              {empty ? (
                <li className="px-3 py-2.5 text-sm text-muted">Aucune adresse. Votre saisie est conservée.</li>
              ) : null}
            </ul>
          ) : null}
        </div>
      </Field>
      <Field label="Code postal" hint={isFrance ? "5 chiffres" : "Facultatif. Boîte postale acceptée."}>
        <input
          name="postal_code"
          autoComplete="postal-code"
          inputMode={isFrance ? "numeric" : "text"}
          maxLength={isFrance ? 5 : 32}
          value={postal}
          onChange={(event) => fillCityFromPostal(event.target.value)}
          placeholder={isFrance ? "75017" : "Facultatif"}
          className={fieldControlClass}
        />
      </Field>
      <Field label="Ville">
        <input
          name="city"
          autoComplete="address-level2"
          value={city}
          onChange={(event) => publish({ city: event.target.value })}
          className={fieldControlClass}
        />
      </Field>
    </div>
  );
}

export function countryLabel(iso2: string | null | undefined) {
  return countryName(iso2);
}
