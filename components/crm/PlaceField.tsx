"use client";

import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { applyPlace, destinationQuery, type PlaceSuggestion } from "@/lib/crm/places";
import { fieldControlClass } from "@/components/crm/fields";

export function PlaceField({
  name = "destination",
  value,
  defaultValue = "",
  onValueChange,
  disabled,
  className = fieldControlClass,
  placeholder = "Ville, pays",
}: {
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const listId = useId();
  const [draft, setDraft] = useState(defaultValue);
  const text = value ?? draft;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<PlaceSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const query = destinationQuery(text);

  function setText(next: string) {
    if (value === undefined) setDraft(next);
    onValueChange?.(next);
  }

  function pick(place: PlaceSuggestion) {
    setText(applyPlace(text, place.label));
    setResults([]);
    setOpen(false);
  }

  useEffect(() => {
    if (!open || query.length < 2) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/places?q=${encodeURIComponent(query)}`, {
          signal: ctrl.signal,
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Villes indisponibles");
        const places = (json.places || []) as PlaceSuggestion[];
        setResults(places);
        setActiveIndex(places.length ? 0 : -1);
      } catch {
        if (ctrl.signal.aborted) return;
        setResults([]);
        setActiveIndex(-1);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 280);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [open, query]);

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
      if (picked) pick(picked);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  const showList = open && query.length >= 2 && (loading || results.length > 0);

  return (
    <div className="relative">
      <input
        name={name}
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        className={className}
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {showList ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-full z-20 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-border bg-white py-1 shadow-lg"
        >
          {loading && results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">Recherche…</li>
          ) : null}
          {results.map((place, index) => (
            <li key={place.id} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(place)}
                className={`block w-full px-3 py-2 text-left text-sm text-[var(--admin-navy)] hover:bg-[var(--admin-navy)]/5 ${
                  index === activeIndex ? "bg-[var(--admin-navy)]/5" : ""
                }`}
              >
                {place.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
