"use client";

import { useState } from "react";

const SCREENS = ["accueil", "carnet", "documents", "table", "fil"] as const;
export type AppScreen = (typeof SCREENS)[number];

const LABELS: Record<AppScreen, string> = {
  accueil: "Accueil",
  carnet: "Carnet",
  documents: "Documents",
  table: "Table",
  fil: "Fil",
};

function Bar({ title }: { title: string }) {
  return (
    <div className="vz-app-bar">
      <div className="vz-app-brand">
        {/* eslint-disable-next-line @next/next/no-img-element -- logo local */}
        <img src="/brand/logo-tba-256.png" alt="" />
        <div>
          <b>Travel Business Agency</b>
          <span>{title}</span>
        </div>
      </div>
      <div className="vz-app-tools">
        <span aria-hidden>✆</span>
        <span className="vz-avatar">
          CB<u />
        </span>
      </div>
    </div>
  );
}

function Tabs({ active }: { active: string }) {
  const items = [
    ["Accueil", "⌂", active === "Accueil"],
    ["Réservations", "✈", active === "Réservations"],
    ["Transactions", "☰", active === "Transactions"],
    ["Mon compte", "○", active === "Mon compte"],
  ] as const;
  const index = Math.max(0, items.findIndex((item) => item[2]));
  return (
    <div className="vz-tabs" aria-hidden>
      {items.map(([label, icon, on]) => (
        <span key={label} className={on ? "on" : ""}>
          <i>{icon}</i>
          {label}
        </span>
      ))}
      <u style={{ left: `${6 + index * 25}%` }} />
    </div>
  );
}

function Screen({ id }: { id: AppScreen }) {
  if (id === "accueil") {
    return (
      <>
        <Bar title="Accueil" />
        <div className="vz-app-body">
          <p className="vz-app-kicker">Travel Business Agency · Espace membre</p>
          <h3>Bonjour Claire</h3>
          <section className="vz-pass">
            <small>Prochain vol · exemple</small>
            <strong>Paris → Tokyo</strong>
            <em>CDG → HND</em>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
              <span>4 avril · 11 h 35</span>
              <span>Affaires</span>
            </div>
            <div className="vz-pill">Ajouter au calendrier</div>
          </section>
          <article className="vz-stay">
            <PhotoFill />
            <div>
              <span className="vz-chip">Exemple · avril 2027</span>
              <p className="vz-app-kicker" style={{ color: "#c5a880" }}>
                4–13 avril
              </p>
              <strong style={{ fontSize: 18 }}>Tokyo, Hakone, Kyoto</strong>
              <p style={{ margin: 0, fontSize: 12 }}>Aman Tokyo · Gora Kadan · Aman Kyoto</p>
            </div>
          </article>
        </div>
        <Tabs active="Accueil" />
      </>
    );
  }
  if (id === "carnet") {
    return (
      <>
        <Bar title="Le voyage" />
        <div className="vz-app-body">
          <p className="vz-day">Dimanche 4 avril</p>
          <article className="vz-card">
            <small>Vol · exemple</small>
            <b>Paris → Tokyo</b>
            <span>CDG → HND · 11 h 35 · Affaires</span>
          </article>
          <article className="vz-card">
            <small>Accueil</small>
            <b>Sortie de l’avion, Haneda</b>
            <span>Puis voiture jusqu’à l’hôtel</span>
          </article>
          <p className="vz-day">À partir du 4 avril</p>
          <article className="vz-card">
            <small>Hôtel · 3 nuits</small>
            <b>Aman Tokyo</b>
            <span>Otemachi · Tokyo</span>
          </article>
          <article className="vz-card">
            <small>Ensuite</small>
            <b>Gora Kadan · Aman Kyoto</b>
            <span>Hakone, puis Kyoto · Kikunoi le 10</span>
          </article>
        </div>
        <Tabs active="Réservations" />
      </>
    );
  }
  if (id === "documents") {
    return (
      <>
        <Bar title="Documents" />
        <div className="vz-app-body">
          <p className="vz-app-kicker">Séjour d’exemple · aucun document réel</p>
          <h3>Pièces du voyage</h3>
          <article className="vz-card">
            <b>Carte d’embarquement</b>
            <span>Paris → Tokyo · 4 avril · exemple</span>
          </article>
          <article className="vz-card">
            <b>Aman Tokyo</b>
            <span>Confirmation d’exemple · Otemachi</span>
          </article>
          <article className="vz-card">
            <b>Kikunoi</b>
            <span>Table d’exemple · 10 avril · 19 h 30</span>
          </article>
          <article className="vz-card">
            <b>Formalités</b>
            <span>Rien à déposer pour cet exemple</span>
          </article>
        </div>
        <Tabs active="Réservations" />
      </>
    );
  }
  if (id === "table") {
    return (
      <>
        <Bar title="Le voyage" />
        <div className="vz-app-body">
          <p className="vz-app-kicker">Vendredi 10 avril</p>
          <h3>Ce soir</h3>
          <article className="vz-card">
            <small>Restaurant</small>
            <b>Kikunoi</b>
            <span>Kyoto · 19 h 30 · deux couverts</span>
          </article>
          <article className="vz-card">
            <small>Transfert</small>
            <b>Voiture depuis Aman Kyoto</b>
            <span>Retour prévu après le dîner</span>
          </article>
          <article className="vz-card">
            <small>Voyageurs d’exemple</small>
            <b>Claire Berger · Thomas Berger</b>
            <span>Tout est dans le carnet</span>
          </article>
        </div>
        <Tabs active="Réservations" />
      </>
    );
  }
  return (
    <>
      <Bar title="Messages" />
      <div className="vz-app-body vz-thread">
        <p className="vz-app-kicker">Bureau Travel BA</p>
        <p>Bonjour Claire. L’accueil à Haneda est confirmé. On vous retrouve à la sortie de l’avion, puis la voiture va jusqu’à l’Aman.</p>
        <p className="me">Merci. Thomas sera avec moi.</p>
        <p>C’est noté. La table chez Kikunoi est tenue pour le 10 avril, 19 h 30.</p>
        <p className="vz-app-kicker">Conseiller joignable à toute heure</p>
      </div>
      <Tabs active="Accueil" />
    </>
  );
}

function PhotoFill() {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- photo éditoriale du séjour d’exemple
    <img
      src="https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=800&q=70"
      alt=""
      referrerPolicy="no-referrer"
    />
  );
}

export function Phone({
  screen = "accueil",
  controls = false,
}: {
  screen?: AppScreen;
  controls?: boolean;
}) {
  const [current, setCurrent] = useState<AppScreen>(screen);
  const shown = controls ? current : screen;
  return (
    <div className="vz-device">
      <div className="vz-device-bezel" aria-hidden={controls ? undefined : true}>
        <div className="vz-device-screen" role="img" aria-label={`Aperçu d’exemple, écran ${LABELS[shown]}, séjour au Japon de Claire et Thomas Berger`}>
          <Screen id={shown} />
        </div>
      </div>
      {controls ? (
        <div className="vz-dots" role="tablist" aria-label="Écrans de l’application">
          {SCREENS.map((id) => (
            <button key={id} type="button" className={shown === id ? "on" : ""} onClick={() => setCurrent(id)} role="tab" aria-selected={shown === id}>
              {LABELS[id]}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
