"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { listHref, type ClientFilter } from "@/lib/crm/admin-list";
import { smartSearchMatch } from "@/lib/crm/smart-search";

const APPLY_MS = 160;

/** La saisie filtre tout de suite, puis l’URL aligne la liste serveur. */
export function ClientsFilters({
  q,
  filtre,
  revision,
}: {
  q: string;
  filtre: ClientFilter | null;
  /** Change quand la liste serveur est remplacée, pour réappliquer le filtre local. */
  revision: string;
}) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [value, setValue] = useState(q);
  const [filter, setFilter] = useState(filtre || "");
  const filtersKey = filtre || "";
  const [seenFilters, setSeenFilters] = useState(filtersKey);
  if (filtersKey !== seenFilters) {
    setSeenFilters(filtersKey);
    setFilter(filtre || "");
  }
  const filtering = Boolean(q || filtre);

  useEffect(() => {
    const list = document.getElementById("clients-liste");
    if (!list) return;
    const items = [...list.querySelectorAll<HTMLElement>("[data-search]")];
    const empties = [...list.querySelectorAll<HTMLElement>("[data-search-empty]")];
    void revision;
    // La liste serveur (téléphone, e-mail) prime dès que l’URL a rattrapé la saisie.
    const ahead = value.trim() !== q.trim();
    if (!items.length || !ahead) {
      for (const item of items) item.hidden = false;
      for (const empty of empties) empty.hidden = true;
      return;
    }
    let visible = 0;
    for (const item of items) {
      const match = smartSearchMatch(value, item.dataset.search || "");
      item.hidden = !match;
      if (match) visible += 1;
    }
    const showEmpty = Boolean(value.trim()) && visible === 0;
    for (const empty of empties) empty.hidden = !showEmpty;
  }, [value, q, revision]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  function apply(form: HTMLFormElement, patch: { q?: string; filtre?: string } = {}) {
    const data = new FormData(form);
    const query = (patch.q ?? String(data.get("q") || "")).trim();
    const filterValue = patch.filtre ?? String(data.get("filtre") || "");
    const href = listHref("/admin/clients", {
      q: query || null,
      filtre: filterValue || null,
    });
    router.replace(href, { scroll: false });
  }

  function applyNow(form: HTMLFormElement, patch: { q?: string; filtre?: string } = {}) {
    if (timer.current) clearTimeout(timer.current);
    apply(form, patch);
  }

  return (
    <form
      method="get"
      action="/admin/clients"
      className="flex flex-col gap-2 sm:flex-row sm:flex-wrap"
      role="search"
      onSubmit={() => {
        if (timer.current) clearTimeout(timer.current);
      }}
    >
      <input
        type="search"
        name="q"
        value={value}
        placeholder="Rechercher un client (nom, société, e-mail, téléphone)…"
        aria-label="Rechercher un client"
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
        name="filtre"
        value={filter}
        aria-label="Filtrer les clients"
        className="admin-af-input text-sm sm:w-48"
        onChange={(event) => {
          const next = event.target.value;
          setFilter(next);
          const form = event.currentTarget.form;
          if (form) applyNow(form, { filtre: next });
        }}
      >
        <option value="">Tous</option>
        <option value="veille">En veille</option>
      </select>
      {filtering ? (
        <Link
          href="/admin/clients"
          onClick={() => {
            if (timer.current) clearTimeout(timer.current);
            setValue("");
          }}
          className="admin-tap inline-flex items-center rounded-lg border border-[var(--border)] bg-white px-4 text-sm font-semibold text-[var(--admin-navy)]"
        >
          Effacer
        </Link>
      ) : null}
    </form>
  );
}
