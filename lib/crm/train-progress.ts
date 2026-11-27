import type { TrainOffer } from "./train-whatsapp";

/** Lecture du dossier. Aucune heure inventée : seulement created_at, updated_at et les jours de billet. */
export type TrainProgressInput = {
  status: string;
  step: string;
  createdAt: string | null;
  updatedAt: string | null;
  aller: TrainOffer[];
  retour: TrainOffer[];
  choixAller: number | null;
  choixRetour: number | null;
  classe: string | null;
  tarif: string | null;
  reference: string | null;
  prix: number | null;
  billets: string[];
  retourDate: string | null;
};

export type TrainProgressState = "fait" | "cours" | "apres";

export type TrainProgressStep = {
  id: string;
  label: string;
  state: TrainProgressState;
  quand: string | null;
  detail: string | null;
};

export type TrainProgressOffer = {
  sens: "Aller" | "Retour";
  lignes: { titre: string; choisi: boolean }[];
};

export type TrainProgress = {
  etapes: TrainProgressStep[];
  branche: { id: string; label: string; quand: string | null } | null;
  maintenant: string;
  trains: TrainProgressOffer[];
};

const SENT = new Set(["propositions", "en_attente", "prix_a_reconfirmer", "choix", "commande"]);

function clock(value: string | null | undefined) {
  const match = String(value || "").trim().match(/^(\d{1,2})\s*[:hH]\s*(\d{2})$/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return "";
  return `${String(hour).padStart(2, "0")}h${match[2]}`;
}

function offerLine(offer: TrainOffer) {
  const depart = clock(offer.heure_depart) || offer.heure_depart || "";
  const arrivee = clock(offer.heure_arrivee) || offer.heure_arrivee || "";
  const hours = depart && arrivee ? `${depart} → ${arrivee}` : depart || arrivee;
  const number = offer.numero ? `train ${offer.numero}` : "";
  return [hours, number].filter(Boolean).join(" · ") || "Horaire";
}

export function trainProgressStamp(iso: string | null | undefined) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(iso.slice(0, 10)) && iso.length <= 10;
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    day: "numeric",
    month: "short",
    ...(day ? {} : { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
  }).format(date);
}

function money(value: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value);
}

function chosen(offers: TrainOffer[], index: number | null) {
  if (index == null || index < 0 || index >= offers.length) return null;
  return offerLine(offers[index]);
}

/** Phrase de la ligne fermée, à partir du seul statut déjà sur la carte. */
export function trainAgentHint(status: string) {
  if (status === "nouvelle") return "Rien à faire, le bot va prendre la demande.";
  if (status === "recherche") return "Rien à faire, le bot cherche.";
  if (status === "propositions") return "Rien à faire, le client choisit sur WhatsApp.";
  if (status === "en_attente") return "Rien à faire, le client réfléchit.";
  if (status === "prix_a_reconfirmer") return "Rien à faire, le bot revérifie le prix.";
  if (status === "choix") return "Rien à faire, le bot achète.";
  if (status === "commande") return "Rien à faire, le billet part le matin du départ.";
  if (status === "annulee") return "Rien à faire, la demande est annulée.";
  return "Suivi de la demande.";
}

export function trainProgress(input: TrainProgressInput): TrainProgress {
  const status = input.status;
  const hasReturn = Boolean(input.retourDate || input.retour.length);
  const offers = input.aller.length > 0;
  const sent = SENT.has(status);
  const aller = input.choixAller != null;
  const tarif = Boolean(input.tarif);
  const retour = !hasReturn || input.choixRetour != null;
  const classe = Boolean(input.classe);
  const recap = input.step === "accord" || status === "choix" || status === "commande" || (sent && aller && tarif && retour && classe);
  const accord = status === "choix" || status === "commande";
  const commande = status === "commande";
  const billet = input.billets.length > 0;
  const indispo = status === "recherche" && offers && input.choixAller == null;
  const created = trainProgressStamp(input.createdAt);
  const moved = trainProgressStamp(input.updatedAt);
  const ticketDay = trainProgressStamp(input.billets[0] || null);

  const flags = [
    { id: "creee", label: "Demande créée", done: true, quand: created, detail: null as string | null },
    { id: "recherche", label: "Recherche en cours (bot SNCF)", done: status !== "nouvelle" || offers, quand: null, detail: null },
    { id: "pretes", label: "Propositions prêtes (à valider par l’agent)", done: offers && sent, quand: null, detail: offers ? `${input.aller.length} aller${input.retour.length ? `, ${input.retour.length} retour` : ""}` : null },
    { id: "envoyees", label: "Envoyées au client sur WhatsApp", done: sent, quand: null, detail: null },
    { id: "aller", label: "Aller choisi", done: aller, quand: null, detail: chosen(input.aller, input.choixAller) },
    { id: "tarif", label: "Tarif choisi", done: tarif, quand: null, detail: input.tarif === "flex" ? "Flex" : input.tarif === "non_remboursable" ? "Non remboursable" : null },
    { id: "retour", label: "Retour choisi", done: hasReturn ? input.choixRetour != null : sent && aller, quand: null, detail: hasReturn ? chosen(input.retour, input.choixRetour) : "Aller simple" },
    { id: "classe", label: "Classe choisie", done: classe, quand: null, detail: input.classe === "1re" ? "1re classe" : input.classe === "2de" ? "2de classe" : null },
    { id: "recap", label: "Récap envoyé / prix reconfirmé", done: recap && status !== "prix_a_reconfirmer", quand: null, detail: null },
    { id: "accord", label: "Accord du client", done: accord, quand: null, detail: null },
    { id: "achat", label: "Achat en cours", done: commande, quand: null, detail: status === "choix" ? "Le bot achète sur SNCF Connect." : null },
    {
      id: "commande",
      label: "Commandé",
      done: commande,
      quand: commande ? moved : null,
      detail: commande ? [input.reference ? `Réf. ${input.reference}` : "", input.prix != null ? money(input.prix) : ""].filter(Boolean).join(" · ") || null : null,
    },
    { id: "billet", label: "Billet envoyé le jour J", done: billet, quand: ticketDay, detail: billet ? "Le PDF est parti le matin du départ." : null },
  ];

  let branche: TrainProgress["branche"] = null;
  if (status === "en_attente") branche = { id: "attente", label: "En attente", quand: moved };
  else if (status === "prix_a_reconfirmer") branche = { id: "reconfirmer", label: "Prix à reconfirmer", quand: moved };
  else if (indispo) branche = { id: "indisponible", label: "Train indisponible", quand: moved };
  else if (status === "annulee" && input.step === "fait") branche = { id: "refuse", label: "Refusé", quand: moved };
  else if (status === "annulee") branche = { id: "annule", label: "Annulé", quand: moved };

  const cursor = branche
    ? ""
    : billet
      ? "billet"
      : commande
        ? "commande"
        : status === "choix"
          ? "achat"
          : recap
            ? "accord"
            : classe
              ? "recap"
              : (hasReturn ? input.choixRetour != null : aller && tarif)
                ? "classe"
                : tarif && hasReturn
                  ? "retour"
                  : aller
                    ? "tarif"
                    : sent
                      ? "envoyees"
                      : status === "recherche"
                        ? "recherche"
                        : "creee";
  const etapes = flags.map((step) => ({
    id: step.id,
    label: step.label,
    state: (branche ? (step.done ? "fait" : "apres") : step.id === cursor ? "cours" : step.done ? "fait" : "apres") as TrainProgressState,
    quand: step.quand || (!branche && step.id === cursor ? moved : null),
    detail: step.detail,
  }));

  const maintenant = branche
    ? branche.id === "attente"
      ? "Rien à faire, le client réfléchit."
      : branche.id === "reconfirmer"
        ? "Rien à faire, le bot revérifie le prix."
        : branche.id === "indisponible"
          ? "Rien à faire, le bot relance la recherche."
          : branche.id === "refuse"
            ? "Rien à faire, le client a refusé."
            : "Rien à faire, la demande est annulée."
    : cursor === "creee"
      ? "Rien à faire, le bot va prendre la demande."
      : cursor === "recherche"
        ? "Rien à faire, le bot cherche."
        : cursor === "achat"
            ? "Rien à faire, le bot achète."
            : cursor === "commande"
              ? "Rien à faire, le billet part le matin du départ."
              : cursor === "billet"
                ? "Rien à faire, le billet est parti."
                : "Rien à faire, le client choisit sur WhatsApp.";

  const trains: TrainProgressOffer[] = [];
  if (input.aller.length) trains.push({ sens: "Aller", lignes: input.aller.map((offer, index) => ({ titre: offerLine(offer), choisi: index === input.choixAller })) });
  if (input.retour.length) trains.push({ sens: "Retour", lignes: input.retour.map((offer, index) => ({ titre: offerLine(offer), choisi: index === input.choixRetour })) });

  return { etapes, branche, maintenant, trains };
}
