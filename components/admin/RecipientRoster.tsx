"use client";

import { useState } from "react";
import { Icon } from "@/components/crm/icons";
import { fieldControlClass } from "@/components/crm/fields";
import type { DeskRosterPerson } from "@/lib/crm/hotel-desk";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#9e7e51]">{label}</dt>
      <dd className="text-sm font-semibold text-[#0B192C] [overflow-wrap:anywhere]">{value || "—"}</dd>
    </div>
  );
}

function PersonCard({
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
  return (
    <article
      className={`flex flex-col rounded-2xl border p-3 ${
        selected ? "border-[#0B192C] bg-white" : "border-dashed border-[#C5A880] bg-[#f8f3eb]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="rounded-full bg-[#0B192C] px-2 py-0.5 text-[10px] font-bold uppercase leading-snug tracking-[0.14em] text-[#C5A880]">
          {person.role || "Contact"}
        </p>
        <button
          type="button"
          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold disabled:opacity-50 ${
            selected ? "bg-[#0B192C] text-white" : "bg-[#C5A880] text-[#0B192C]"
          }`}
          disabled={disabled}
          aria-label={selected ? `Retirer ${who}` : `Ajouter ${who}`}
          onClick={onToggle}
        >
          <Icon name={selected ? "close" : "add"} className="h-3.5 w-3.5" />
          {selected ? "Retirer" : "Ajouter"}
        </button>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
        <Field label="Nom" value={person.lastName} />
        <Field label="Prénom" value={person.firstName} />
        <div className="col-span-2">
          <Field label="Rôle" value={person.role} />
        </div>
      </dl>
      <p className="mt-2 text-xs text-[#9e7e51] [overflow-wrap:anywhere]">{person.email}</p>
    </article>
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
    <div className="space-y-3">
      <section className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#C5A880]">Dans l'envoi · {inMail.length}</p>
        {inMail.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {inMail.map((person) => (
              <PersonCard key={person.email} person={person} selected disabled={disabled} onToggle={() => toggle(person.email)} />
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-[#e5e3dc] px-3 py-4 text-sm text-[#9e7e51]">
            Personne dans l'envoi. Ajoutez un contact ci-dessous.
          </p>
        )}
      </section>
      <section className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#C5A880]">Hors de l'envoi · {aside.length}</p>
        {aside.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {aside.map((person) => (
              <PersonCard key={person.email} person={person} selected={false} disabled={disabled} onToggle={() => toggle(person.email)} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-[#9e7e51]">Tous les contacts de l'hôtel sont dans l'envoi.</p>
        )}
      </section>
      <form
        className="space-y-2 rounded-2xl border border-[#e5e3dc] bg-[#f8f3eb] p-3"
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
          onChange([...selected, address], person);
        }}
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#C5A880]">Nouveau destinataire</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs font-semibold text-[#0B192C]">
            Nom
            <input className={`${fieldControlClass} mt-1`} value={lastName} onChange={(event) => setLastName(event.target.value)} />
          </label>
          <label className="text-xs font-semibold text-[#0B192C]">
            Prénom
            <input className={`${fieldControlClass} mt-1`} value={firstName} onChange={(event) => setFirstName(event.target.value)} />
          </label>
          <label className="text-xs font-semibold text-[#0B192C]">
            Rôle
            <input className={`${fieldControlClass} mt-1`} value={role} onChange={(event) => setRole(event.target.value)} />
          </label>
          <label className="text-xs font-semibold text-[#0B192C]">
            E-mail
            <input className={`${fieldControlClass} mt-1`} value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
        </div>
        {formError ? <p className="text-sm text-red-700">{formError}</p> : null}
        <button type="submit" className="inline-flex items-center gap-1 rounded-full bg-[#C5A880] px-3 py-2 text-sm font-semibold text-[#0B192C] disabled:opacity-50" disabled={disabled}>
          <Icon name="person_add" className="h-4 w-4" />
          Ajouter au courrier
        </button>
      </form>
    </div>
  );
}
