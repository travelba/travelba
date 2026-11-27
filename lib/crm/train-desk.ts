import { trainAccrocheBody, trainGreeting, type TrainOffer } from "./train-whatsapp";
import type { TrainBotEvent } from "./train-bot";
import { appendTrainJournal, readTrainJournal, type TrainJournalEntry } from "./train-journal";

export const TRAIN_DESK_ACTIONS = [
  "relancer",
  "reverifier",
  "horaires",
  "tarifs",
  "pause",
  "reprendre",
  "annuler",
  "changer",
  "billets",
  "message",
  "prendre",
  "rendre",
  "ia",
  "ia_globale",
] as const;

export type TrainDeskAction = (typeof TRAIN_DESK_ACTIONS)[number];

export type TrainDeskRow = {
  id: string;
  booking_id: string;
  status: string;
  depart_ville: string;
  arrivee_ville: string;
  aller_date: string;
  aller_creneau: string;
  retour_date: string | null;
  retour_creneau: string | null;
  aller: TrainOffer[];
  retour: TrainOffer[];
  choix_aller: number | null;
  choix_retour: number | null;
  classe: string | null;
  tarif: string | null;
  pause: boolean;
  prise_en_main: boolean;
  ia: boolean | null;
  journal: unknown;
};

export type TrainDeskPlan = {
  patch: Record<string, unknown>;
  journal: TrainJournalEntry[];
  bot: TrainBotEvent | null;
  envoie: "aucun" | "accroche" | "rappel" | "tarifs" | "message" | "billets";
  texte: string;
};

function clock(value: string | null | undefined) {
  const match = String(value || "").match(/^(\d{1,2})[:h](\d{2})$/);
  if (!match) return "";
  return `${match[1].padStart(2, "0")}h${match[2]}`;
}

function choiceLine(row: TrainDeskRow) {
  const aller = row.choix_aller == null ? null : row.aller[row.choix_aller];
  const retour = row.choix_retour == null ? null : row.retour[row.choix_retour];
  const bits = [
    aller ? `aller ${aller.numero || ""} ${clock(aller.heure_depart)}`.trim() : "",
    retour ? `retour ${retour.numero || ""} ${clock(retour.heure_depart)}`.trim() : "",
    row.classe === "1re" ? "1re" : row.classe === "2de" ? "2de" : "",
    row.tarif === "flex" ? "Flex" : row.tarif === "non_remboursable" ? "Standard" : "",
  ].filter(Boolean);
  return bits.join(", ");
}

function readJournalSafe(row: TrainDeskRow) {
  return readTrainJournal(row.journal);
}

function note(row: TrainDeskRow, texte: string, kind: string, ia = false): TrainJournalEntry[] {
  return appendTrainJournal(row.journal, { at: new Date().toISOString(), texte, ia, kind });
}

/** Décide l’écriture. L’envoi WhatsApp est fait par l’appelant, seulement si on le demande. */
export function planTrainDesk(
  row: TrainDeskRow,
  action: TrainDeskAction,
  extra: { texte?: string; sessionOuverte?: boolean; prenom?: string; ia?: boolean | null; aller_date?: string; retour_date?: string; aller_creneau?: string; retour_creneau?: string } = {}
): TrainDeskPlan {
  const base = { patch: {} as Record<string, unknown>, bot: null as TrainBotEvent | null, envoie: "aucun" as TrainDeskPlan["envoie"] };
  if (action === "ia_globale") {
    return { ...base, texte: extra.ia === false ? "IA globale coupée." : "IA globale ouverte.", journal: readJournalSafe(row), patch: {} };
  }
  if (action === "relancer") {
    const line = choiceLine(row);
    const texte = extra.sessionOuverte
      ? line
        ? `Petit rappel : ${line}. Dis-moi si tu veux changer.`
        : "Je te remets les horaires dès que tu réponds."
      : trainAccrocheBody().replace("{{1}}", trainGreeting({ firstName: extra.prenom })).replace("{{2}}", `${row.depart_ville} → ${row.arrivee_ville}`);
    const journal = note(row, "Relance du client.", "relance");
    return { ...base, envoie: extra.sessionOuverte ? "rappel" : "accroche", texte, journal, patch: { journal } };
  }
  if (action === "reverifier") {
    const journal = note(row, "Prix à revérifier.", "prix");
    return { ...base, bot: "prix_a_reconfirmer", texte: "Le bot revérifie le prix.", journal, patch: { status: "prix_a_reconfirmer", journal } };
  }
  if (action === "horaires") {
    const journal = note(row, "Horaires à revoir. Le bot cherche.", "horaires");
    return {
      ...base,
      bot: "recherche",
      texte: "La demande repart en recherche.",
      journal,
      patch: { status: "recherche", step: "aller", choix_aller: null, choix_retour: null, classe: null, tarif: null, journal },
    };
  }
  if (action === "tarifs") {
    const journal = note(row, "Tarifs renvoyés au client.", "tarifs");
    return {
      ...base,
      envoie: "tarifs",
      texte: "Les combinaisons disponibles repartent.",
      journal,
      patch: { status: "propositions", step: "tarif", classe: null, tarif: null, journal },
    };
  }
  if (action === "pause") {
    const journal = note(row, "Demande en pause. Rien ne part tout seul.", "pause");
    return { ...base, texte: "Pause.", journal, patch: { pause: true, journal } };
  }
  if (action === "reprendre") {
    const journal = note(row, "Pause levée.", "reprise");
    return { ...base, texte: "Reprise.", journal, patch: { pause: false, journal } };
  }
  if (action === "annuler") {
    const journal = note(row, extra.texte ? `Demande annulée. ${extra.texte}` : "Demande annulée.", "annulation");
    return {
      ...base,
      bot: "refus",
      envoie: extra.texte ? "message" : "aucun",
      texte: extra.texte || "La demande est annulée.",
      journal,
      patch: { status: "annulee", journal },
    };
  }
  if (action === "changer") {
    const journal = note(row, "Dates ou voyageurs changés. Le bot cherche.", "recherche");
    return {
      ...base,
      bot: "recherche",
      texte: "La demande repart en recherche.",
      journal,
      patch: {
        status: "recherche",
        step: "aller",
        choix_aller: null,
        choix_retour: null,
        classe: null,
        tarif: null,
        ...(extra.aller_date ? { aller_date: extra.aller_date } : {}),
        ...(extra.retour_date ? { retour_date: extra.retour_date } : {}),
        ...(extra.aller_creneau ? { aller_creneau: extra.aller_creneau } : {}),
        ...(extra.retour_creneau ? { retour_creneau: extra.retour_creneau } : {}),
        journal,
      },
    };
  }
  if (action === "billets") {
    const journal = note(row, "Renvoi des billets demandé.", "billets");
    return { ...base, envoie: "billets", texte: "Le billet repart si le fichier est là.", journal, patch: { journal } };
  }
  if (action === "message") {
    const texte = (extra.texte || "").trim().slice(0, 400);
    const journal = note(row, texte ? `Message : ${texte}` : "Message vide.", "message");
    return { ...base, envoie: texte ? "message" : "aucun", texte, journal, patch: { journal } };
  }
  if (action === "prendre") {
    const journal = note(row, "Prise en main. L’automatique est coupé.", "main");
    return { ...base, texte: "Prise en main.", journal, patch: { prise_en_main: true, journal } };
  }
  if (action === "rendre") {
    const journal = note(row, "Main rendue.", "main");
    return { ...base, texte: "Main rendue.", journal, patch: { prise_en_main: false, journal } };
  }
  const journal = note(row, extra.ia === false ? "IA coupée sur cette demande." : "IA ouverte sur cette demande.", "ia");
  return { ...base, texte: extra.ia === false ? "IA coupée." : "IA ouverte.", journal, patch: { ia: extra.ia === false ? false : true, journal } };
}
