"use client";

import { useState, type FormEvent } from "react";

const PANELS = [
  { id: "etapes", label: "Étapes" },
  { id: "vol", label: "Vol" },
  { id: "hotel", label: "Hôtel" },
  { id: "transferts", label: "Transferts" },
  { id: "documents", label: "Documents" },
  { id: "budget", label: "Budget" },
  { id: "fil", label: "Fil" },
] as const;

type PanelId = (typeof PANELS)[number]["id"];

const DOCUMENTS = ["Passeport", "Billet", "Hôtel", "Transfert", "Formalité", "Assurance"];

const STEPS = [
  ["01", "Arrivée", "Vol · Paris → Marrakech"],
  ["02", "Séjour", "La Mamounia"],
  ["03", "Journée", "Palmeraie"],
  ["04", "Départ", "Vol · horaire du billet"],
];

const seed = [
  ["house", "Le carnet de Marrakech est ouvert. La Mamounia est notée."],
  ["you", "Le transfert à l’arrivée est-il prévu ?"],
  ["house", "Oui. Le chauffeur prend le relais après l’accueil."],
] as const;

export function AppStage() {
  const [panel, setPanel] = useState<PanelId>("etapes");
  const [thread, setThread] = useState<{ who: "house" | "you"; text: string }[]>(
    seed.map(([who, text]) => ({ who, text })),
  );
  const [draft, setDraft] = useState("");

  function send(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    setThread((lines) => [
      ...lines,
      { who: "you", text },
      { who: "house", text: "Noté dans ce fil d’exemple. Rien n’a été envoyé." },
    ]);
  }

  return (
    <div className="tba-app">
      <aside>
        <p className="tba-app-brand">Travel BA · espace</p>
        <p className="tba-app-where">Marrakech</p>
        <p className="tba-app-count">
          <span>J-12</span>
          <small>Exemple</small>
        </p>
        <p className="tba-app-meta">12 – 16 mars · deux voyageurs</p>
        <nav aria-label="Le dossier d’exemple">
          {PANELS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={panel === item.id}
              onClick={() => setPanel(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>
      <div className="tba-app-main" key={panel}>
        {panel === "etapes" ? (
          <ol className="tba-app-steps">
            {STEPS.map(([n, title, detail]) => (
              <li key={n}>
                <span>{n}</span>
                <strong>{title}</strong>
                <em>{detail}</em>
              </li>
            ))}
          </ol>
        ) : null}
        {panel === "vol" ? (
          <article>
            <p className="tba-kicker">Vol</p>
            <h3>Paris → Marrakech</h3>
            <p>CDG → RAK</p>
            <ul>
              <li>
                <span>Classe</span>
                <strong>Dans le carnet</strong>
              </li>
              <li>
                <span>Référence</span>
                <strong>Dans le carnet</strong>
              </li>
              <li>
                <span>Horaire</span>
                <strong>Celui du billet</strong>
              </li>
            </ul>
          </article>
        ) : null}
        {panel === "hotel" ? (
          <article>
            <p className="tba-kicker">Hôtel</p>
            <h3>La Mamounia</h3>
            <p>Marrakech · 12 – 16 mars</p>
            <ul>
              <li>
                <span>Chambre</span>
                <strong>Dans la confirmation</strong>
              </li>
              <li>
                <span>Avantages</span>
                <strong>S’ils sont inclus, et confirmés</strong>
              </li>
            </ul>
          </article>
        ) : null}
        {panel === "transferts" ? (
          <article>
            <p className="tba-kicker">Transferts</p>
            <h3>De la piste à l’hôtel.</h3>
            <ul>
              <li>
                <span>Arrivée</span>
                <strong>Accueil, puis chauffeur</strong>
              </li>
              <li>
                <span>Sur place</span>
                <strong>Les trajets confirmés</strong>
              </li>
              <li>
                <span>Retour</span>
                <strong>Chauffeur · horaire du vol</strong>
              </li>
            </ul>
          </article>
        ) : null}
        {panel === "documents" ? (
          <article>
            <p className="tba-kicker">Documents</p>
            <h3>6 / 6</h3>
            <ul className="tba-app-docs">
              {DOCUMENTS.map((name) => (
                <li key={name}>
                  <i aria-hidden="true" />
                  <span>{name}</span>
                  <strong>Au coffre</strong>
                </li>
              ))}
            </ul>
            <p className="tba-app-note">Exemple. Les numéros ne figurent pas ici.</p>
          </article>
        ) : null}
        {panel === "budget" ? (
          <article>
            <p className="tba-kicker">Budget</p>
            <h3>Le séjour, tenu.</h3>
            <ul>
              <li>
                <span>Vol</span>
                <strong>Dans le carnet</strong>
              </li>
              <li>
                <span>Hôtel</span>
                <strong>Dans le carnet</strong>
              </li>
              <li>
                <span>Transferts</span>
                <strong>Tenus</strong>
              </li>
            </ul>
            <p className="tba-app-note">Le montant est dans l’espace du client. Cette étude ne l’affiche pas.</p>
          </article>
        ) : null}
        {panel === "fil" ? (
          <article className="tba-app-fil">
            <p className="tba-kicker">Le Concierge</p>
            <div>
              {thread.map((line) => (
                <p key={`${line.who}-${line.text}`} className={line.who === "house" ? "is-house" : "is-you"}>
                  <small>{line.who === "house" ? "La maison" : "Vous"}</small>
                  {line.text}
                </p>
              ))}
            </div>
            <form onSubmit={send}>
              <label>
                Écrire à la maison
                <input value={draft} onChange={(event) => setDraft(event.target.value)} />
              </label>
              <button type="submit">Noter</button>
            </form>
            <p className="tba-app-note">Le fil d’exemple reste dans la page. Rien n’est envoyé.</p>
          </article>
        ) : null}
      </div>
    </div>
  );
}
