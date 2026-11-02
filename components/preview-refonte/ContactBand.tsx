"use client";

import { useState } from "react";
import { previewServices } from "./catalog";
import { waCopy, whatsappHref } from "./photos";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ContactBand({
  whatsappText = waCopy.home,
  universe = "",
}: {
  whatsappText?: string;
  universe?: string;
}) {
  return (
    <section className="tba-contact" aria-labelledby="contact-titre">
      <div>
        <h2 id="contact-titre">Écrire à la maison.</h2>
        <p>WhatsApp, un brief, ou un moment pour se parler. L’étude prépare le geste. Elle ne l’expédie pas.</p>
        <p style={{ marginTop: "1.6rem" }}>
          <a className="tba-word" href={whatsappHref(whatsappText)} target="_blank" rel="noopener noreferrer">
            WhatsApp
          </a>
        </p>
      </div>
      <BriefForm universe={universe} />
      <RendezVous />
    </section>
  );
}

function BriefForm({ universe }: { universe: string }) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("nom") || "").trim();
    const email = String(data.get("email") || "").trim();
    const message = String(data.get("message") || "").trim();
    if (name.length < 2) {
      setError("Indiquez votre nom.");
      return;
    }
    if (!EMAIL.test(email)) {
      setError("Indiquez un e-mail valide.");
      return;
    }
    if (message.length < 8) {
      setError("Quelques lignes suffisent.");
      return;
    }
    setError("");
    setDone(true);
  }

  return (
    <div id="brief">
      <h2>Le brief.</h2>
      {done ? (
        <div className="tba-form-ok" role="status">
          <strong>Il est prêt.</strong>
          <p>Pour qu’il parte, écrivez sur WhatsApp.</p>
        </div>
      ) : (
        <form className="tba-form" onSubmit={onSubmit} noValidate>
          <label>
            Nom
            <input name="nom" autoComplete="name" required />
          </label>
          <label>
            E-mail
            <input name="email" type="email" autoComplete="email" inputMode="email" required />
          </label>
          <label>
            Univers
            <select name="univers" defaultValue={universe}>
              <option value="">Choisir</option>
              {previewServices.map((service) => (
                <option key={service.universe} value={service.universe}>
                  {service.menu}
                </option>
              ))}
            </select>
          </label>
          <label>
            Le projet
            <textarea name="message" required />
          </label>
          {error ? (
            <p className="tba-form-error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit">Préparer</button>
        </form>
      )}
    </div>
  );
}

function RendezVous() {
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("nom") || "").trim();
    const email = String(data.get("email") || "").trim();
    const day = String(data.get("jour") || "").trim();
    if (name.length < 2) {
      setError("Indiquez votre nom.");
      return;
    }
    if (!EMAIL.test(email)) {
      setError("Indiquez un e-mail valide.");
      return;
    }
    if (day.length < 3) {
      setError("Indiquez un jour.");
      return;
    }
    setError("");
    setDone(true);
  }

  return (
    <div id="rendez-vous">
      <h2>Un moment.</h2>
      <p>Le jour qui vous arrangerait. La maison confirme.</p>
      {done ? (
        <div className="tba-form-ok" role="status">
          <strong>Noté ici.</strong>
          <p>Le rendez-vous se confirme sur WhatsApp.</p>
        </div>
      ) : (
        <form className="tba-form" onSubmit={onSubmit} noValidate>
          <label>
            Nom
            <input name="nom" autoComplete="name" required />
          </label>
          <label>
            E-mail
            <input name="email" type="email" autoComplete="email" inputMode="email" required />
          </label>
          <label>
            Jour
            <input name="jour" autoComplete="off" required />
          </label>
          <label>
            Moment
            <select name="moment" defaultValue="peu-importe">
              <option value="matin">Matin</option>
              <option value="milieu">Milieu de journée</option>
              <option value="apres-midi">Après-midi</option>
              <option value="peu-importe">Peu importe</option>
            </select>
          </label>
          {error ? (
            <p className="tba-form-error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit">Noter</button>
        </form>
      )}
    </div>
  );
}
