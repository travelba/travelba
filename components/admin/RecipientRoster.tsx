"use client";

import { useState } from "react";
import { Icon } from "@/components/crm/icons";
import type { DeskRosterPerson } from "@/lib/crm/hotel-desk";

const COLS = "grid grid-cols-[minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,1.2fr)_1.5rem] items-center gap-x-2";
const inputClass =
  "h-7 w-full min-w-0 rounded-md border border-[#e5e3dc] bg-white px-1.5 text-xs text-[#0B192C] outline-none focus:border-[#0B192C]";

function PersonRow({
  person,
  selected,
  disabled,
  onToggle,
}: {
  person: DeskRosterPerson;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const who = [person.firstName, person.lastName].filter(Boolean).join(" ") || person.role || person.email;
  function actionButton() {
    return (
      <button
        type="button"
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#0B192C] disabled:opacity-50 sm:h-6 sm:w-6"
        disabled={disabled}
        aria-label={selected ? `Retirer ${who}` : `Ajouter ${who}`}
        onClick={onToggle}
      >
        <Icon name={selected ? "close" : "add"} className="h-3.5 w-3.5" />
      </button>
    );
  }
  return (
    <li className={`px-2 py-2 sm:py-0.5 ${selected ? "" : "bg-[#f8f3eb]"}`}>
      <div className="flex items-start justify-between gap-2 sm:hidden">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#0B192C]">
            {[person.lastName, person.firstName].filter(Boolean).join(" ") || "—"}
          </p>
          <p className="text-xs text-[#9e7e51]">{person.role || "—"}</p>
          <p className="break-all text-xs text-[#9e7e51]">{person.email}</p>
        </div>
        {actionButton()}
      </div>
      <div className={`${COLS} hidden sm:grid`}>
        <span className="truncate text-xs font-semibold text-[#0B192C]" title={person.lastName}>{person.lastName || "—"}</span>
        <span className="truncate text-xs text-[#0B192C]" title={person.firstName}>{person.firstName || "—"}</span>
        <span className="truncate text-xs text-[#9e7e51]" title={person.role}>{person.role || "—"}</span>
        <span className="truncate text-[11px] text-[#9e7e51]" title={person.email}>
          {person.email}
        </span>
        {actionButton()}
      </div>
    </li>
  );
}

export function RecipientRoster({
  people,
  selected,
  disabled,
  onChange,
}: {
  people: DeskRosterPerson[];
  selected: string[];
  disabled: boolean;
  onChange: (next: string[], created?: DeskRosterPerson) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const chosen = new Set(selected.map((value) => value.trim().toLowerCase()));
  const known = new Map(people.map((person) => [person.email, person]));
  const inMail = selected.map(
    (value) => known.get(value.trim().toLowerCase()) || { email: value.trim().toLowerCase(), firstName: "", lastName: "", role: "" }
  );
  const aside = people.filter((person) => !chosen.has(person.email));

  function toggle(address: string) {
    const email = address.trim().toLowerCase();
    onChange(chosen.has(email) ? selected.filter((value) => value.trim().toLowerCase() !== email) : [...selected, email]);
  }

  return (
    <div>
      <div className={`${COLS} hidden px-2 pb-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#C5A880] sm:grid`}>
        <span>Nom</span>
        <span>Prénom</span>
        <span>Rôle</span>
        <span>E-mail</span>
        <span className="sr-only">Action</span>
      </div>
      <ul className="divide-y divide-[#e5e3dc] overflow-hidden rounded-lg border border-[#e5e3dc]">
        {inMail.map((person) => (
          <PersonRow key={person.email} person={person} selected disabled={disabled} onToggle={() => toggle(person.email)} />
        ))}
        {aside.map((person) => (
          <PersonRow key={person.email} person={person} selected={false} disabled={disabled} onToggle={() => toggle(person.email)} />
        ))}
        {!inMail.length && !aside.length ? (
          <li className="px-2 py-1 text-xs text-[#9e7e51]">Aucun destinataire.</li>
        ) : null}
      </ul>
      {adding ? (
        <form
          className="mt-1"
          onSubmit={(event) => {
            event.preventDefault();
            const address = email.trim().toLowerCase();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
              setFormError("Indiquez une adresse e-mail.");
              return;
            }
            if (!lastName.trim() && !firstName.trim() && !role.trim()) {
              setFormError("Indiquez au moins un nom, un prénom ou un rôle.");
              return;
            }
            if (chosen.has(address)) {
              setFormError("Cette adresse est déjà dans l'envoi.");
              return;
            }
            const person = {
              email: address,
              firstName: firstName.trim(),
              lastName: lastName.trim(),
              role: role.trim(),
            };
            setFormError(null);
            setLastName("");
            setFirstName("");
            setRole("");
            setEmail("");
            setAdding(false);
            onChange([...selected, address], person);
          }}
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,1.2fr)_auto] sm:items-center sm:gap-x-2">
            <input className={inputClass} aria-label="Nom" placeholder="Nom" value={lastName} onChange={(event) => setLastName(event.target.value)} />
            <input className={inputClass} aria-label="Prénom" placeholder="Prénom" value={firstName} onChange={(event) => setFirstName(event.target.value)} />
            <input className={inputClass} aria-label="Rôle" placeholder="Rôle" value={role} onChange={(event) => setRole(event.target.value)} />
            <input className={inputClass} aria-label="E-mail" placeholder="E-mail" value={email} onChange={(event) => setEmail(event.target.value)} />
            <button type="submit" className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#C5A880] text-[#0B192C] disabled:opacity-50 sm:h-6 sm:w-6" disabled={disabled} aria-label="Ajouter au courrier">
              <Icon name="person_add" className="h-3.5 w-3.5" />
            </button>
          </div>
          {formError ? <p className="mt-1 text-xs text-red-700">{formError}</p> : null}
        </form>
      ) : (
        <button
          type="button"
          className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[#0B192C] disabled:opacity-50"
          disabled={disabled}
          onClick={() => setAdding(true)}
        >
          <Icon name="add" className="h-3.5 w-3.5" />
          Ajouter
        </button>
      )}
    </div>
  );
}
