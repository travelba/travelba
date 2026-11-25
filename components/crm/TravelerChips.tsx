"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/crm/icons";
import { travelerChipLimit, type TicketTravelerFace } from "@/lib/crm/document-passengers";

/**
 * Pastilles des voyageurs d’une carte. Le clic sur « +N » ne doit pas ouvrir
 * le résumé de la carte : le navigateur bascule `<summary>` avant l’écouteur React.
 */
function keepCardClosed(event: { preventDefault: () => void; stopPropagation: () => void }) {
  event.preventDefault();
  event.stopPropagation();
}

export function TravelerChips({ people }: { people: TicketTravelerFace[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [wide, setWide] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const apply = () => setWide(travelerChipLimit(node.getBoundingClientRect().width) > 4);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  if (!people.length) return null;
  const limit = wide ? 5 : 4;
  const visible = open ? people : people.slice(0, limit);
  const hidden = open ? [] : people.slice(limit);
  const label = people.length > 1 ? "Voyageurs" : "Voyageur";

  return (
    <div ref={ref} className="mt-2 min-w-0" data-voyageurs="">
      <p className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
        <Icon name="person" className="h-3 w-3 shrink-0" />
        {label}
      </p>
      <ul id={listId} className="flex min-w-0 list-none flex-wrap items-center gap-1.5 p-0" aria-label={label}>
        {visible.map((person) => (
          <li key={person.name} className="max-w-full">
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[#e5e3dc] bg-[#faf9f6] py-0.5 pl-0.5 pr-2.5">
              <span
                aria-hidden
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#0B192C] text-[9px] font-bold tracking-wide text-[#C5A880]"
              >
                {person.initials}
              </span>
              <span className="min-w-0 break-words text-xs font-semibold leading-tight text-[#0B192C]">
                {person.name}
                {person.detail ? (
                  <span className="mt-0.5 block text-[10px] font-medium leading-tight text-muted">{person.detail}</span>
                ) : null}
              </span>
            </span>
          </li>
        ))}
        {hidden.length ? (
          <li>
            <button
              type="button"
              data-voyageurs-action="ouvrir"
              aria-expanded={false}
              aria-controls={listId}
              aria-label={`Afficher ${hidden.length} voyageur${hidden.length > 1 ? "s" : ""} de plus : ${hidden.map((person) => person.name).join(", ")}`}
              onClickCapture={(event) => {
                keepCardClosed(event);
                setOpen(true);
              }}
              className="inline-flex h-7 items-center rounded-full border border-[#C5A880] bg-white px-2.5 text-xs font-bold text-[#0B192C]"
            >
              +{hidden.length}
            </button>
          </li>
        ) : null}
        {open && people.length > 4 ? (
          <li>
            <button
              type="button"
              data-voyageurs-action="reduire"
              aria-expanded
              aria-controls={listId}
              onClickCapture={(event) => {
                keepCardClosed(event);
                setOpen(false);
              }}
              className="inline-flex h-7 items-center rounded-full px-2 text-xs font-semibold text-muted"
            >
              Réduire
            </button>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
