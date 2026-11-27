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
  depart?: string | null;
  arrivee?: string | null;
  prenom?: string | null;
  envoiAt?: string | null;
};

export type TrainProgressState = "fait" | "cours" | "apres";

export type TrainProgressStep = {
  id: string;
  label: string;
  court: string;
  state: TrainProgressState;
  quand: string | null;
  detail: string | null;
};

export type TrainPriceChip = { label: string; montant: string };

export type TrainProgressCard = {
  sens: "Aller" | "Retour";
  departHeure: string;
  arriveeHeure: string;
  departGare: string;
  arriveeGare: string;
  numero: string;
  date: string | null;
  duree: string | null;
  liaison: string | null;
  prix: TrainPriceChip[];
  choisi: boolean;
};

export type TrainProgressMessage = {
  titre: string;
  detail: string;
  texte: string;
  quand: string | null;
};

export type TrainProgress = {
  etapes: TrainProgressStep[];
  branche: { id: string; label: string; quand: string | null } | null;
  maintenant: string;
  cartes: TrainProgressCard[];
  message: TrainProgressMessage | null;
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

function prettyDuration(offer: TrainOffer) {
  const raw = (offer.duree || "").trim();
  const compact = raw.match(/^(\d+)\s*h\s*(\d{1,2})$/i);
  if (compact) return `${Number(compact[1])} h ${String(Number(compact[2])).padStart(2, "0")}`;
  if (raw) return raw;
  const start = clock(offer.heure_depart);
  const end = clock(offer.heure_arrivee);
  if (!start || !end) return null;
  const a = Number(start.slice(0, 2)) * 60 + Number(start.slice(3));
  let b = Number(end.slice(0, 2)) * 60 + Number(end.slice(3));
  if (b <= a) b += 24 * 60;
  const hours = Math.floor((b - a) / 60);
  const minutes = (b - a) % 60;
  return minutes ? `${hours} h ${String(minutes).padStart(2, "0")}` : `${hours} h`;
}

function liaison(offer: TrainOffer) {
  const value = (offer as TrainOffer & { correspondances?: number | null }).correspondances;
  if (value == null || Number.isNaN(Number(value))) return null;
  const count = Number(value);
  if (count <= 0) return "Direct";
  if (count === 1) return "1 correspondance";
  return `${count} correspondances`;
}

function chipMoney(value: number) {
  const rounded = Math.round(value * 100) / 100;
  const text = rounded.toLocaleString("fr-FR", {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${text} €`;
}

function chips(offer: TrainOffer): TrainPriceChip[] {
  const rows: [string, number | null | undefined][] = [
    ["2de", offer.prix?.["2de"]?.non_remboursable],
    ["2de Flex", offer.prix?.["2de"]?.flex],
    ["1re", offer.prix?.["1re"]?.non_remboursable],
    ["1re Flex", offer.prix?.["1re"]?.flex],
  ];
  return rows.flatMap(([label, amount]) => (typeof amount === "number" ? [{ label, montant: chipMoney(amount) }] : []));
}

function dayLabel(iso: string | null | undefined) {
  const day = String(iso || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const date = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "short" }).format(date);
}

function cardOf(sens: "Aller" | "Retour", offer: TrainOffer, choisi: boolean): TrainProgressCard {
  return {
    sens,
    departHeure: clock(offer.heure_depart) || offer.heure_depart || "—",
    arriveeHeure: clock(offer.heure_arrivee) || offer.heure_arrivee || "—",
    departGare: offer.depart_gare || "",
    arriveeGare: offer.arrivee_gare || "",
    numero: offer.numero ? `train ${offer.numero}` : "",
    date: dayLabel(offer.date),
    duree: prettyDuration(offer),
    liaison: liaison(offer),
    prix: chips(offer),
    choisi,
  };
}

function hookText(route: string, prenom: string) {
  const hello = prenom ? `Bonjour ${prenom},` : "Bonjour,";
  return [hello, "", `J’ai des horaires de train pour ${route}.`, "Réponds ici, je te les montre."].join("\n");
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
    { id: "creee", court: "Créée", label: "Demande créée", done: true, quand: created, detail: null as string | null },
    { id: "recherche", court: "Recherche", label: "Recherche en cours (bot SNCF)", done: status !== "nouvelle" || offers, quand: null, detail: null },
    { id: "pretes", court: "Prêtes", label: "Propositions prêtes (à valider par l’agent)", done: offers && sent, quand: null, detail: offers ? `${input.aller.length} aller${input.retour.length ? `, ${input.retour.length} retour` : ""}` : null },
    { id: "envoyees", court: "WhatsApp", label: "Envoyées au client sur WhatsApp", done: sent, quand: null, detail: null },
    { id: "aller", court: "Aller", label: "Aller choisi", done: aller, quand: null, detail: chosen(input.aller, input.choixAller) },
    { id: "tarif", court: "Tarif", label: "Tarif choisi", done: tarif, quand: null, detail: input.tarif === "flex" ? "Flex" : input.tarif === "non_remboursable" ? "Non remboursable" : null },
    { id: "retour", court: "Retour", label: "Retour choisi", done: hasReturn ? input.choixRetour != null : sent && aller, quand: null, detail: hasReturn ? chosen(input.retour, input.choixRetour) : "Aller simple" },
    { id: "classe", court: "Classe", label: "Classe choisie", done: classe, quand: null, detail: input.classe === "1re" ? "1re classe" : input.classe === "2de" ? "2de classe" : null },
    { id: "recap", court: "Récap", label: "Récap envoyé / prix reconfirmé", done: recap && status !== "prix_a_reconfirmer", quand: null, detail: null },
    { id: "accord", court: "Accord", label: "Accord du client", done: accord, quand: null, detail: null },
    { id: "achat", court: "Achat", label: "Achat en cours", done: commande, quand: null, detail: status === "choix" ? "Le bot achète sur SNCF Connect." : null },
    {
      id: "commande",
      court: "Commandé",
      label: "Commandé",
      done: commande,
      quand: commande ? moved : null,
      detail: commande ? [input.reference ? `Réf. ${input.reference}` : "", input.prix != null ? money(input.prix) : ""].filter(Boolean).join(" · ") || null : null,
    },
    { id: "billet", court: "Billet", label: "Billet envoyé le jour J", done: billet, quand: ticketDay, detail: billet ? "Le PDF est parti le matin du départ." : null },
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
    court: step.court,
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

  const cartes = [
    ...input.aller.map((offer, index) => cardOf("Aller", offer, index === input.choixAller)),
    ...input.retour.map((offer, index) => cardOf("Retour", offer, index === input.choixRetour)),
  ];
  const route = [input.depart, input.arrivee].filter(Boolean).join(" → ") || [input.aller[0]?.depart_gare, input.aller[0]?.arrivee_gare].filter(Boolean).join(" → ");
  const prenom = (input.prenom || "").trim().split(/\s+/)[0] || "";
  const message = sent
    ? {
        titre: "Accroche WhatsApp",
        detail: "Ce texte part quand la session de 24 h est fermée. Les horaires sont la liste ci-dessous.",
        texte: hookText(route || "ton trajet", prenom),
        quand: trainProgressStamp(input.envoiAt),
      }
    : null;

  return { etapes, branche, maintenant, cartes, message };
}
