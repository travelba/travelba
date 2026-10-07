"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BOOKING_SORTS,
  listHref,
  type BookingSort,
  type BookingStateFilter,
} from "@/lib/crm/admin-list";
import { smartSearchMatch } from "@/lib/crm/smart-search";

const STATE_LABELS: Record<BookingStateFilter, string> = {
  "a-venir": "À venir",
  preparation: "En préparation",
  montre: "Visible",
  archive: "Archivée",
};

const APPLY_MS = 160;

/** La saisie filtre tout de suite, puis l’URL aligne la liste serveur. */
export function BookingsFilters({
  q,
  etat,
  tri,
  revision,
}: {
  q: string;
  etat: BookingStateFilter | null;
  tri: BookingSort;
  /** Change quand la liste serveur est remplacée, pour réappliquer le filtre local. */
  revision: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [value, setValue] = useState(q);
  const [state, setState] = useState(etat || "");
  const [sort, setSort] = useState<BookingSort>(tri);
  const filtersKey = `${etat || ""}|${tri}`;
  const [seenFilters, setSeenFilters] = useState(filtersKey);
  if (filtersKey !== seenFilters) {
    setSeenFilters(filtersKey);
    setState(etat || "");
    setSort(tri);
  }
  const filtering = Boolean(q || etat || tri !== "depart");

  useEffect(() => {
    const list = document.getElementById("dossiers-liste");
    if (!list) return;
    const items = [...list.querySelectorAll<HTMLElement>("[data-search]")];
    const empty = list.querySelector<HTMLElement>("[data-search-empty]");
    void revision;
    if (!items.length) {
      if (empty) empty.hidden = true;
      return;
    }
    let visible = 0;
    for (const item of items) {
      const match = smartSearchMatch(value, item.dataset.search || "");
      item.hidden = !match;
      if (match) visible += 1;
    }
    if (empty) empty.hidden = !value.trim() || visible > 0;
  }, [value, q, revision]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  function apply(form: HTMLFormElement, patch: { q?: string; etat?: string; tri?: string } = {}) {
    const data = new FormData(form);
    const query = (patch.q ?? String(data.get("q") || "")).trim();
    const stateValue = patch.etat ?? String(data.get("etat") || "");
    const sortValue = patch.tri ?? String(data.get("tri") || "");
    const href = listHref("/admin/reservations", {
      q: query || null,
      etat: stateValue || null,
      tri: !sortValue || sortValue === "depart" ? null : sortValue,
    });
    router.replace(href, { scroll: false });
  }

  function applyNow(form: HTMLFormElement, patch: { q?: string; etat?: string; tri?: string } = {}) {
    if (timer.current) clearTimeout(timer.current);
    apply(form, patch);
  }

  return (
    <form
      ref={formRef}
      method="get"
      action="/admin/reservations"
      className="flex flex-col gap-2 sm:flex-row sm:flex-wrap"
      role="search"
      onSubmit={() => {
        if (timer.current) clearTimeout(timer.current);
      }}
    >
      <input
        ref={inputRef}
        type="search"
        name="q"
        value={value}
        placeholder="Référence, destination, titre, client…"
        aria-label="Rechercher un dossier"
        autoComplete="off"
        className="admin-af-input w-full text-sm sm:flex-1"
        onChange={(event) => {
          const next = event.target.value;
          setValue(next);
          const form = event.currentTarget.form;
          if (!form) return;
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => apply(form, { q: next }), APPLY_MS);
        }}
      />
      <select
        name="etat"
        value={state}
        aria-label="État du dossier"
        className="admin-af-input text-sm sm:w-48"
        onChange={(event) => {
          const next = event.target.value;
          setState(next);
          const form = event.currentTarget.form;
          if (form) applyNow(form, { etat: next });
        }}
      >
        <option value="">Tous les états</option>
        {(Object.keys(STATE_LABELS) as BookingStateFilter[]).map((stateId) => (
          <option key={stateId} value={stateId}>
            {STATE_LABELS[stateId]}
          </option>
        ))}
      </select>
      <select
        name="tri"
        value={sort}
        aria-label="Tri"
        className="admin-af-input text-sm sm:w-56"
        onChange={(event) => {
          const next = event.target.value as BookingSort;
          setSort(next);
          const form = event.currentTarget.form;
          if (form) applyNow(form, { tri: next });
        }}
      >
        {(Object.keys(BOOKING_SORTS) as BookingSort[]).map((sortId) => (
          <option key={sortId} value={sortId}>
            {BOOKING_SORTS[sortId].label}
          </option>
        ))}
      </select>
      {filtering ? (
        <Link
          href="/admin/reservations"
          onClick={() => setValue("")}
          className="admin-tap inline-flex items-center rounded-lg border border-[var(--border)] bg-white px-4 text-sm font-semibold text-[var(--admin-navy)]"
        >
          Effacer
        </Link>
      ) : null}
    </form>
  );
}
