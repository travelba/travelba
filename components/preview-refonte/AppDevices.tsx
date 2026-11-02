"use client";

import { useEffect, useState } from "react";
import { AppStage } from "./AppStage";

const HERO_PANELS = ["etapes", "embarquement", "documents", "fil"] as const;

const FACES = [
  {
    id: "pass",
    kicker: "Carte d’embarquement",
    title: "Paris → Marrakech",
    lines: [
      ["Départ", "CDG"],
      ["Arrivée", "RAK"],
      ["Horaire", "Celui du billet"],
      ["Référence", "Dans le carnet"],
    ],
  },
  {
    id: "docs",
    kicker: "Documents",
    title: "6 / 6",
    lines: [
      ["Passeport", "Au coffre"],
      ["Billet", "Au coffre"],
      ["Hôtel", "Au coffre"],
      ["Formalité", "Au coffre"],
    ],
  },
  {
    id: "fil",
    kicker: "WhatsApp · La maison",
    title: "Le Concierge",
    lines: [
      ["La maison", "Le carnet est ouvert."],
      ["Vous", "Le transfert est prévu ?"],
      ["La maison", "Oui. Après l’accueil."],
    ],
  },
] as const;

export function AppDevices({ live = true }: { live?: boolean }) {
  const [face, setFace] = useState(0);

  useEffect(() => {
    if (!live) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      setFace((current) => (current + 1) % FACES.length);
    }, 4200);
    return () => window.clearInterval(timer);
  }, [live]);

  const screen = FACES[face];

  return (
    <div className="tba-devices">
      <div className="tba-desk">
        <div className="tba-desk-chrome">
          <i />
          <i />
          <i />
          <span>Espace voyageur · exemple</span>
        </div>
        <AppStage compact live={live} panels={HERO_PANELS} />
      </div>
      <div className="tba-phone" aria-hidden="true">
        <div className="tba-phone-notch" />
        <p className="tba-phone-kicker">{screen.kicker}</p>
        <h3 key={screen.id}>{screen.title}</h3>
        <ul>
          {screen.lines.map(([label, value]) => (
            <li key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </li>
          ))}
        </ul>
        <p>Exemple. Rien n’est envoyé.</p>
      </div>
    </div>
  );
}
