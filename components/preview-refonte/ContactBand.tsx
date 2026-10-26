"use client";

import { useState } from "react";
import { waCopy, whatsappHref } from "./photos";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ContactBand({
  whatsappText = waCopy.home,
  universe = "",
}: {
  whatsappText?: string;
  universe?: string;
}) {
  const wa = whatsappHref(whatsappText);

  return (
    <section className="tba-contact" aria-labelledby="contact-titre">
      <div>
        <p className="tba-kicker">Écrire</p>
        <h2 id="contact-titre">Trois façons de commencer.</h2>
        <p>La maison répond en personne. Cet aperçu ne transmet ni le brief ni le rendez-vous.</p>
        <p style={{ marginTop: "1.4rem" }}>
          <a className="tba-btn" href={wa} target="_blank" rel="noopener noreferrer">
            Demande sur WhatsApp
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
    const phone = String(data.get("telephone") || "").trim();
    if (name.length < 2) {
      setError("Indiquez votre nom.");
      return;
    }
    if (!EMAIL.test(email)) {
      setError("Indiquez un e-mail valide.");
      return;
    }
    if (phone && phone.replace(/\D/g, "").length < 8) {
      setError("Le téléphone semble incomplet.");
      return;
    }
    if (message.length < 8) {
      setError("Écrivez quelques lignes sur le projet.");
      return;
    }
    setError("");
    setDone(true);
  }

  return (
    <div id="brief">
      <p className="tba-kicker">Brief</p>
      <h3>Déposer un brief.</h3>
      <p>Destination, dates, nombre de personnes, ton du séjour. Sans prix, sans engagement.</p>
      {done ? (
        <div className="tba-form-ok" role="status">
          <strong>Brief préparé.</strong>
          <p>Cet aperçu ne l’envoie pas. Écrivez sur WhatsApp pour qu’il parte vraiment.</p>
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
            Téléphone
            <input name="telephone" type="tel" autoComplete="tel" inputMode="tel" />
          </label>
          <label>
            Univers
            <select name="univers" defaultValue={universe}>
              <option value="">Choisir</option>
              <option value="sur-mesure">Sur-mesure</option>
              <option value="seminaire">Séminaire ou événement</option>
              <option value="ski">Ski premium</option>
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
          <button className="tba-btn" type="submit">
            Préparer le brief
          </button>
          <p className="tba-screen-note">Aperçu : le formulaire ne transmet rien.</p>
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
      setError("Indiquez un jour souhaité.");
      return;
    }
    setError("");
    setDone(true);
  }

  return (
    <div id="rendez-vous">
      <p className="tba-kicker">Rendez-vous</p>
      <h3>Prendre rendez-vous.</h3>
      <p>Dites le jour qui vous arrangerait. La maison confirme le moment. Aucun créneau n’est affiché comme libre.</p>
      {done ? (
        <div className="tba-form-ok" role="status">
          <strong>Demande notée ici.</strong>
          <p>Aucun rendez-vous n’est enregistré. Écrivez sur WhatsApp pour le confirmer.</p>
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
            Jour souhaité
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
          <button className="tba-btn" type="submit">
            Noter le rendez-vous
          </button>
          <p className="tba-screen-note">Aperçu : rien n’est inscrit à l’agenda.</p>
        </form>
      )}
    </div>
  );
}
