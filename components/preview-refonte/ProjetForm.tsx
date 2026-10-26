"use client";

import { useState, type FormEvent } from "react";
import { whatsappHref } from "./photos";
import { universes } from "./universes";

const STEPS = ["Qui", "Quoi", "Quand", "Enveloppe"] as const;

export function ProjetForm() {
  const [step, setStep] = useState(0);
  const [qui, setQui] = useState<(typeof universes)[number]["qui"] | "">("");
  const [quoi, setQuoi] = useState("");
  const [quand, setQuand] = useState("");
  const [enveloppe, setEnveloppe] = useState("");
  const [ready, setReady] = useState(false);

  const quoiOk = quoi.trim().length > 1;
  const quandOk = quand.trim().length > 1;

  function advance(event: FormEvent) {
    event.preventDefault();
    if (step === 0 && !qui) return;
    if (step === 1 && !quoiOk) return;
    if (step === 2 && !quandOk) return;
    if (step < 3) {
      setStep((value) => value + 1);
      return;
    }
    setReady(true);
  }

  const message = [
    "Bonjour, je raconte un projet à Travel BA.",
    `Qui : ${qui}`,
    `Quoi : ${quoi.trim()}`,
    `Quand : ${quand.trim()}`,
    `Enveloppe : ${enveloppe.trim() || "Non précisée"}`,
  ].join("\n");

  if (ready) {
    return (
      <div className="tba-projet-recit">
        <p className="tba-kicker">Le récit</p>
        <h2>Il est prêt.</h2>
        <p>Ce texte reste dans votre navigateur. Cette étude ne l’envoie pas. Pour qu’il parte, ouvrez WhatsApp : la maison le lit là.</p>
        <pre>{message}</pre>
        <div className="tba-actions">
          <a className="tba-word" href={whatsappHref(message)}>
            Ouvrir WhatsApp
          </a>
          <button type="button" className="tba-word is-quiet" onClick={() => setReady(false)}>
            Revenir
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="tba-projet" onSubmit={advance}>
      <p className="tba-kicker">
        {STEPS[step]} · {step + 1} / {STEPS.length}
      </p>
      {step === 0 ? (
        <fieldset>
          <legend>Qui voyage ?</legend>
          <div className="tba-qui">
            {universes.map((item) => (
              <label key={item.qui} className={qui === item.qui ? "is-on" : undefined}>
                <input
                  type="radio"
                  name="qui"
                  value={item.qui}
                  checked={qui === item.qui}
                  onChange={() => setQui(item.qui)}
                />
                {item.title}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      {step === 1 ? (
        <label className="tba-champ">
          Qu’aimeriez-vous vivre ?
          <textarea value={quoi} onChange={(event) => setQuoi(event.target.value)} rows={5} required />
        </label>
      ) : null}
      {step === 2 ? (
        <label className="tba-champ">
          Quand, et pour combien de temps ?
          <input value={quand} onChange={(event) => setQuand(event.target.value)} required />
        </label>
      ) : null}
      {step === 3 ? (
        <label className="tba-champ">
          Une enveloppe, si vous en avez une
          <input
            value={enveloppe}
            onChange={(event) => setEnveloppe(event.target.value)}
            aria-describedby="enveloppe-note"
          />
          <small id="enveloppe-note">Rien n’est chiffré sur cette page. L’enveloppe cadre le projet. Vous pouvez la laisser vide.</small>
        </label>
      ) : null}
      <div className="tba-actions">
        {step > 0 ? (
          <button type="button" className="tba-word is-quiet" onClick={() => setStep((value) => value - 1)}>
            Retour
          </button>
        ) : null}
        <button type="submit" className="tba-word" disabled={(step === 0 && !qui) || (step === 1 && !quoiOk) || (step === 2 && !quandOk)}>
          {step === 3 ? "Préparer le récit" : "Continuer"}
        </button>
      </div>
    </form>
  );
}
