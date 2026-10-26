"use client";

import { useState, type FormEvent } from "react";
import { whatsappHref } from "./photos";
import { universes } from "./universes";

export function DevisForm() {
  const [ready, setReady] = useState(false);
  const [fields, setFields] = useState({
    prenom: "",
    nom: "",
    email: "",
    telephone: "",
    dates: "",
    enveloppe: "",
    univers: universes[0].qui as (typeof universes)[number]["qui"],
    message: "",
  });

  function set<K extends keyof typeof fields>(key: K, value: (typeof fields)[K]) {
    setFields((current) => ({ ...current, [key]: value }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setReady(true);
  }

  const text = [
    "Bonjour, je souhaite un devis avec Travel BA.",
    `Prénom : ${fields.prenom.trim()}`,
    `Nom : ${fields.nom.trim()}`,
    `E-mail : ${fields.email.trim()}`,
    `Téléphone : ${fields.telephone.trim() || "Non précisé"}`,
    `Dates : ${fields.dates.trim() || "À préciser"}`,
    `Enveloppe : ${fields.enveloppe.trim() || "Non précisée"}`,
    `Univers : ${fields.univers}`,
    fields.message.trim() ? `Message : ${fields.message.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  if (ready) {
    return (
      <div className="tba-devis-ready">
        <h3>La demande est prête.</h3>
        <p>Elle reste dans cette page. Elle n’est pas envoyée. Pour qu’elle parte, ouvrez WhatsApp, ou appelez la maison.</p>
        <pre>{text}</pre>
        <div className="tba-actions">
          <a className="tba-word" href={whatsappHref(text)}>
            Ouvrir WhatsApp
          </a>
          <a className="tba-word is-quiet" href="tel:+33772158257">
            07 72 15 82 57
          </a>
        </div>
      </div>
    );
  }

  return (
    <form className="tba-devis" onSubmit={submit}>
      <div className="tba-devis-grid">
        <label>
          Prénom
          <input required value={fields.prenom} onChange={(event) => set("prenom", event.target.value)} autoComplete="given-name" />
        </label>
        <label>
          Nom
          <input required value={fields.nom} onChange={(event) => set("nom", event.target.value)} autoComplete="family-name" />
        </label>
        <label>
          E-mail
          <input required type="email" value={fields.email} onChange={(event) => set("email", event.target.value)} autoComplete="email" />
        </label>
        <label>
          Téléphone
          <input value={fields.telephone} onChange={(event) => set("telephone", event.target.value)} autoComplete="tel" />
        </label>
        <label>
          Dates approximatives
          <input value={fields.dates} onChange={(event) => set("dates", event.target.value)} />
        </label>
        <label>
          Enveloppe, si vous en avez une
          <input
            value={fields.enveloppe}
            onChange={(event) => set("enveloppe", event.target.value)}
            aria-describedby="devis-enveloppe"
          />
        </label>
      </div>
      <p id="devis-enveloppe" className="tba-devis-help">
        Rien n’est chiffré ici. L’enveloppe cadre le projet. Vous pouvez la laisser vide.
      </p>
      <fieldset>
        <legend>Le voyage</legend>
        <div>
          {universes.map((item) => (
            <label key={item.qui} className={fields.univers === item.qui ? "is-on" : undefined}>
              <input
                type="radio"
                name="univers"
                value={item.qui}
                checked={fields.univers === item.qui}
                onChange={() => set("univers", item.qui)}
              />
              {item.title}
            </label>
          ))}
        </div>
      </fieldset>
      <label>
        Message
        <textarea rows={4} value={fields.message} onChange={(event) => set("message", event.target.value)} />
      </label>
      <button className="tba-word" type="submit">
        Préparer la demande
      </button>
    </form>
  );
}
