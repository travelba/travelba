"use client";

import { FormEvent, useState } from "react";
import type { DeskRosterPerson } from "@/lib/crm/hotel-desk";

const fieldClass =
  "w-full rounded-xl border border-[#d9d1c3] bg-white px-3 py-2.5 text-sm text-[#0B192C] outline-none transition placeholder:text-[#3d4654] focus:border-[#0B192C]";

function personLabel(person: DeskRosterPerson) {
  const name = [person.firstName, person.lastName].filter(Boolean).join(" ").trim();
  return [person.role, name, person.email].filter(Boolean).join(" · ");
}

/** Cases du formulaire d’envoi. Pas sur la carte, l’aperçu client ni le lien public. */
export function HotelMailTo({
  people,
  selected,
  onChange,
  fieldClassName = fieldClass,
}: {
  people: DeskRosterPerson[];
  selected: string[];
  onChange: (emails: string[]) => void;
  fieldClassName?: string;
}) {
  const [draft, setDraft] = useState("");
  const [added, setAdded] = useState<DeskRosterPerson[]>([]);
  const [invalid, setInvalid] = useState(false);
  const shown = [...people];
  for (const person of added) {
    if (!shown.some((row) => row.email === person.email)) shown.push(person);
  }

  function toggle(email: string) {
    onChange(selected.includes(email) ? selected.filter((value) => value !== email) : [...selected, email]);
  }

  function add(event: FormEvent) {
    event.preventDefault();
    const email = draft.trim().toLowerCase();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (!people.some((person) => person.email === email) && !added.some((person) => person.email === email)) {
      setAdded((current) => [...current, { email, firstName: "", lastName: "", role: "" }]);
    }
    if (!selected.includes(email)) onChange([...selected, email]);
    setDraft("");
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-semibold text-[#0B192C]">Destinataires</legend>
      {shown.length ? (
        <ul className="space-y-1.5">
          {shown.map((person) => (
            <li key={person.email}>
              <label className="flex items-start gap-2 text-sm text-[#0B192C]">
                <input
                  type="checkbox"
                  className="mt-0.5 accent-[#0B192C]"
                  checked={selected.includes(person.email)}
                  onChange={() => toggle(person.email)}
                />
                <span className="min-w-0 break-all">{personLabel(person)}</span>
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-[#3d4654]">Cet hôtel n’a pas d’adresse connue.</p>
      )}
      <div className="flex items-end gap-2">
        <label className="min-w-0 flex-1 text-xs font-semibold text-[#0B192C]">
          Autre adresse
          <input
            type="email"
            className={`${fieldClassName} mt-1`}
            value={draft}
            autoComplete="off"
            placeholder="nom@hotel.com"
            onChange={(event) => {
              setDraft(event.target.value);
              setInvalid(false);
            }}
          />
        </label>
        <button
          type="button"
          className="rounded-full border border-[#d9d1c3] bg-white px-3 py-2.5 text-sm font-semibold text-[#0B192C]"
          onClick={(event) => add(event)}
        >
          Ajouter
        </button>
      </div>
      {invalid ? <p className="text-sm text-red-700">Cette adresse n’est pas valide.</p> : null}
      <p className="text-xs text-[#3d4654]">Le message part seulement vers les adresses cochées.</p>
    </fieldset>
  );
}
