import { generateText, stepCountIs, tool } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import {
  airportRule,
  checkinClientLine,
  checkinReply,
  countryFromPlace,
  describeSegment,
  flightAnomaly,
  focusFlight,
  foldEngine,
  formalityForCountry,
  namesToHide,
  nextSegment,
  normalizeDossier,
  pastFlightsSentence,
  sanitizeWebQuery,
  sortFlights,
  terminalSentence,
  truncateHistory,
  upcomingFlightSentence,
  type EngineCheckin,
  type EngineFlight,
  type EngineStayView,
  type EngineTraveler,
} from "@/lib/crm/concierge-engine-dossier";
import { parisMoment } from "@/lib/crm/concierge-when";
import {
  fixtureWebProvider,
  prepareWebHits,
  publicHttps,
  readPublicPage,
  resolveWebProvider,
  type WebProvider,
} from "@/lib/crm/concierge-engine-web";
import { looksLikePan } from "@/lib/crm/pan";
import { aiGatewayConfigured, openaiApiKey } from "@/lib/crm/ingest-types";
import { plannedWrite } from "@/lib/crm/concierge-grader";
import {
  asksForSpaceAccess,
  buildConciergeDossier,
  conciergeContextText,
  isConciergeStop,
  replyOverCap,
  type ConciergeDossier,
  type HandoffKind,
} from "@/lib/crm/whatsapp-concierge";
import {
  conciergeModelId,
  replyUsesUnknownFact,
  soundsRobotic,
  usesTutoiement,
  type ConciergeHistoryTurn,
} from "@/lib/crm/whatsapp-conversation";

export type { EngineCheckin, EngineTraveler };

const ENGINE_TIMEOUT_MS = 22_000;
const SAFE_REPLY = "Je n’ai pas cette précision dans votre dossier.";
const HANDOFF_KINDS = ["question", "quote", "change", "formality", "complaint", "payment", "chauffeur", "urgent"] as const;

const ROUTER_ACTIONS = new Set([
  "contact",
  "preference",
  "piece",
  "request",
  "retirer_carte",
  "enregistrer_carte",
  "ajouter_accompagnateur",
  "retirer_accompagnateur",
  "modifier_fiche",
  "retirer_piece",
]);

export type EngineTokens = { input: number; output: number };

export type EngineResult = {
  reply: string;
  handoff: HandoffKind | null;
  tools: string[];
  corpus: string;
  blocked: boolean;
  latencyMs: number;
  tokens: EngineTokens | null;
  model: string | null;
  webProvider: string;
  skipped: string | null;
  access: boolean;
  optOut: boolean;
  summary: string;
};

export type EngineCalls = {
  lire_sejour: () => { dit: string; sejours: EngineStayView[] };
  lire_vols: () => {
    dit: string;
    absent: boolean;
    prochain: EngineFlight | null;
    tousPasses: boolean;
    anomalie: string | null;
    phrase: string;
    terminalPhrase: string;
  };
  lire_solde: () => { dit: string };
  formalites_pays: (pays: string) => { dit: string; action: boolean; url: string | null };
  regles_aeroport: () => { dit: string };
  statut_checkin: () => { dit: string; reponse: string };
  ouvrir_demande: (resume: string, kind: string) => { accepted: boolean };
  recherche_web: (query: string) => Promise<{ dit: string; enabled: boolean; urls: string[] }>;
  lire_page: (url: string) => Promise<{ dit: string }>;
};

export type EngineGenerate = (input: {
  message: string;
  history: ConciergeHistoryTurn[];
  prompt: string;
  tools: EngineCalls;
}) => Promise<{ text: string; usage?: { inputTokens?: number; outputTokens?: number } | null }>;

export type EngineInput = {
  message: string;
  dossier: ConciergeDossier;
  history?: ConciergeHistoryTurn[];
  now?: Date;
  travelers?: EngineTraveler[];
  checkins?: EngineCheckin[];
  generate?: EngineGenerate;
  web?: WebProvider;
};

type Session = {
  called: string[];
  corpus: string[];
  handoff: HandoffKind | null;
  summary: string;
  hosts: Set<string>;
};

function note(session: Session, name: string, dit: string) {
  if (!session.called.includes(name)) session.called.push(name);
  session.corpus.push(dit);
  return dit;
}

function forbiddenReply(text: string) {
  return /little emperors|expedia|\btaap\b|\bpliant\b|\bfournisseur\b|\bcommission\b|\bprix net\b|\bco[uû]t net\b|\bnet price\b|hotelbeds|booking\.com|kayak|skyscanner|tripadvisor|opodo|airbnb/i.test(
    text
  );
}

export function filterEngineReply(input: {
  text: string;
  dossier: ConciergeDossier;
  history: ConciergeHistoryTurn[];
  corpus: string;
}) {
  const text = input.text.replace(/\s+\n/g, "\n").trim();
  if (!text) return { text: SAFE_REPLY, blocked: true };
  if (forbiddenReply(text) || looksLikePan(text) || /[A-Z0-9<]{20,}/.test(text) || /\bn[ée]e? le\b/i.test(text)) {
    return { text: SAFE_REPLY, blocked: true };
  }
  if (replyUsesUnknownFact(text, input.dossier, input.history, input.corpus)) {
    return { text: SAFE_REPLY, blocked: true };
  }
  if (usesTutoiement(text) || soundsRobotic(text)) return { text: SAFE_REPLY, blocked: true };
  if (replyOverCap(text)) {
    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 3)
      .join("\n");
    const cut = lines.length > 280 ? lines.slice(0, 277).replace(/\s+\S*$/, "") : lines;
    if (replyUsesUnknownFact(cut, input.dossier, input.history, input.corpus)) return { text: SAFE_REPLY, blocked: true };
    return { text: cut, blocked: false };
  }
  return { text, blocked: false };
}

function routerOwned(message: string) {
  if (isConciergeStop(message)) return "stop";
  if (asksForSpaceAccess(message)) return "acces";
  if (looksLikePan(message)) return "garde";
  if (/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/.test(message.replace(/\s+/g, ""))) return "iban";
  const write = plannedWrite(message);
  if (write && ROUTER_ACTIONS.has(write.action)) return "ecriture";
  return null;
}

function systemPrompt() {
  return [
    "Tu es Le Concierge de Travel Business Agency. Vouvoiement, une ou deux phrases, trois lignes au plus. Tu ne signes pas.",
    "Tu réponds avec les outils. Un fait d’heure, de vol, de solde, d’hôtel ou de formalité ne se dit que s’il sort d’un outil.",
    "Heure ou terminal : lire_vols, et seulement le prochain segment à venir. S’ils sont tous passés, dis-le. « Aujourd’hui » et « demain » seulement s’ils sont déjà dans la ligne du segment, et toujours avec la date absolue. Heure locale et heure de Paris, avec le fuseau. Une anomalie (retour daté avant l’aller) se signale telle quelle, sans l’interpréter.",
    "Si le vol demandé n’est pas dans lire_vols, dis que ce vol n’est pas encore dans le dossier.",
    "Enregistrement : statut_checkin. Ne promets que ce que l’outil dit (prévu, fait, cartes déposées, fenêtre). Sinon propose de transmettre la demande à l’agence, sans engagement.",
    "Restaurant : recherche_web, deux ou trois adresses près de l’hôtel, puis propose de transmettre la réservation à l’agence. Tu ne réserves pas.",
    "Une règle générale (aéroport, formalité, météo) se présente comme une règle générale. L’agence confirme les visas et les horaires critiques.",
    "Une action (tarif, chambre, grève) passe par ouvrir_demande, avec un résumé. Tu ne paies pas, tu n’annules pas, tu n’écris à personne.",
    "Recherche web seulement si le dossier et les règles ne suffisent pas. La requête ne contient ni nom, ni téléphone, ni référence de dossier.",
    "Jamais de commission, de prix net, de nom de fournisseur, de prix d’un comparateur, de numéro de pièce ni de date de naissance.",
  ].join("\n");
}

function userPrompt(input: {
  message: string;
  history: ConciergeHistoryTurn[];
  view: ReturnType<typeof normalizeDossier>;
  now: Date;
}) {
  const history = input.history
    .map((row) => `${row.direction === "inbound" ? "Client" : "Concierge"}: ${row.body.slice(0, 400)}`)
    .join("\n");
  const index = input.view.sejours
    .map((stay) => `${stay.phase} ${stay.destination} ${stay.debut || ""} ${stay.alias || ""}`.trim())
    .join(" ; ");
  const today = parisMoment(input.now);
  return [
    `Maintenant : ${today.label} (Europe/Paris).`,
    `Séjours, sans les horaires (ils sont dans les outils) : ${index || "aucun"}.`,
    "Historique :",
    history || "(aucun)",
    "Message :",
    input.message.slice(0, 1500),
  ].join("\n");
}

function createCalls(input: EngineInput, view: ReturnType<typeof normalizeDossier>, web: WebProvider, session: Session): EngineCalls {
  const hidden = namesToHide(input.dossier, input.travelers || []);
  const nextFlight = view.sejours.flatMap((stay) => stay.vols).find((row) => row.sens === "aller") || view.sejours[0]?.vols[0];
  return {
    lire_sejour() {
      const lines = view.sejours.map((stay) => {
        const who = stay.passagers.length ? ` Passagers : ${stay.passagers.join(", ")}.` : "";
        const hotel = stay.hotel ? ` Hôtel : ${stay.hotel}.` : "";
        const alias = stay.alias ? ` ${stay.alias}.` : "";
        return `${stay.phase === "en_cours" ? "Séjour en cours" : stay.phase === "a_venir" ? "Séjour à venir" : "Séjour passé"} : ${stay.destination}.${hotel}${who}${alias}`;
      });
      const dit = lines.join(" ") || "Aucun séjour publié.";
      note(session, "lire_sejour", dit);
      return { dit, sejours: view.sejours };
    },
    lire_vols() {
      const absent = focusFlight(input.message, view.sejours);
      const now = input.now ?? new Date();
      const flights = sortFlights(view.sejours.flatMap((stay) => stay.vols));
      const prochain = nextSegment(flights);
      const tousPasses = flights.length > 0 && !prochain;
      const anomalie = flightAnomaly(flights);
      const past = flights.filter((row) => row.etat === "passe");
      const lines = [
        prochain ? `Prochain segment : ${describeSegment(prochain, now)}${prochain.terminal ? `, terminal ${prochain.terminal}` : ""}.` : "",
        past.length
          ? `Segments passés, à ne pas donner pour l’heure ou le terminal : ${past.map((row) => `${describeSegment(row, now)}${row.terminal ? `, terminal ${row.terminal}` : ""}`).join(" ; ")}.`
          : "",
        anomalie ? `Anomalie : ${anomalie} À signaler sans l’interpréter.` : "",
      ].filter(Boolean);
      const dit = absent
        ? `Ce vol n’est pas encore dans votre dossier. ${lines.join(" ")}`.trim()
        : lines.join(" ") || "Aucun vol dans le dossier.";
      const phrase = prochain
        ? upcomingFlightSentence(prochain, now)
        : tousPasses
          ? pastFlightsSentence(flights, now)
          : "Je n’ai pas l’heure de ce vol dans votre dossier.";
      const terminalPhrase = flights.length ? terminalSentence(flights, now) : "Je n’ai pas le terminal dans votre dossier.";
      note(session, "lire_vols", dit);
      return { dit, absent, prochain, tousPasses, anomalie, phrase, terminalPhrase };
    },
    lire_solde() {
      const balance = view.solde;
      const dit = !balance
        ? "Aucun solde publié."
        : balance.montant < 0
          ? `Solde ${balance.montant} ${balance.devise}, reste à payer.`
          : balance.montant > 0
            ? `Solde ${balance.montant} ${balance.devise}, crédit sur le compte.`
            : `Solde 0 ${balance.devise}.`;
      note(session, "lire_solde", dit);
      return { dit };
    },
    formalites_pays(pays: string) {
      const iso = countryFromPlace(pays) || countryFromPlace(input.message);
      if (!iso) {
        const dit = "La règle d’entrée n’est pas dans le tableau. L’agence vous confirme.";
        note(session, "formalites_pays", dit);
        return { dit, action: true, url: null };
      }
      const rule = formalityForCountry(iso);
      const dit = [rule.dit, rule.url || ""].filter(Boolean).join(" ");
      note(session, "formalites_pays", dit);
      return { dit, action: rule.action, url: rule.url };
    },
    regles_aeroport() {
      const dit = airportRule(nextFlight?.deCode || "", nextFlight?.versCode || "");
      note(session, "regles_aeroport", dit);
      return { dit };
    },
    statut_checkin() {
      const now = input.now ?? new Date();
      const flights = view.sejours.flatMap((stay) => stay.vols);
      const reponse = checkinReply(flights, now);
      const dit = flights.length
        ? flights.map((row) => `${row.etat === "passe" ? "Passé" : "À venir"} : ${checkinClientLine(row, now)}`).join(" ")
        : reponse;
      note(session, "statut_checkin", `${reponse}\n${dit}`);
      return { dit, reponse };
    },
    ouvrir_demande(resume: string, kind: string) {
      const summary = resume.replace(/\s+/g, " ").trim().slice(0, 400);
      if (!summary || /\d{6,}/.test(summary) || looksLikePan(summary)) return { accepted: false };
      if (!HANDOFF_KINDS.includes(kind as (typeof HANDOFF_KINDS)[number])) return { accepted: false };
      session.handoff = kind as HandoffKind;
      session.summary = summary;
      note(session, "ouvrir_demande", `Demande ${kind} : ${summary}`);
      return { accepted: true };
    },
    recherche_web: (query: string) => finishWeb(web, session, query, hidden),
    lire_page: (url: string) => finishPage(web, session, url),
  };
}

async function finishWeb(web: WebProvider, session: Session, query: string, hidden: string[]) {
  const clean = sanitizeWebQuery(query, hidden);
  if (!clean || web.name === "off") {
    const dit = "Recherche web indisponible.";
    note(session, "recherche_web", dit);
    return { dit, enabled: false, urls: [] as string[] };
  }
  const hits = prepareWebHits(await web.search(clean));
  for (const hit of hits) {
    try {
      session.hosts.add(new URL(hit.url).hostname);
    } catch {
      /* ignore */
    }
  }
  const dit = hits.length
    ? hits.map((hit) => `${hit.title} ${hit.url} ${hit.snippet}`).join("\n")
    : "Aucun résultat publié.";
  note(session, "recherche_web", dit);
  return { dit, enabled: true, urls: hits.map((hit) => hit.url) };
}

async function finishPage(web: WebProvider, session: Session, url: string) {
  const parsed = publicHttps(url);
  if (!parsed) {
    const dit = "Page refusée.";
    note(session, "lire_page", dit);
    return { dit };
  }
  const host = parsed.hostname;
  const allowed = session.hosts.has(host) || [...session.hosts].some((known) => host.endsWith(known));
  if (!allowed && web.name !== "fixture") {
    const dit = "Page hors des résultats.";
    note(session, "lire_page", dit);
    return { dit };
  }
  const page = web.name === "fixture" ? await web.read(url) : await readPublicPage(url);
  const dit = page?.text ? `${page.url} ${page.text}` : "Page illisible.";
  note(session, "lire_page", dit);
  return { dit };
}

function asyncTools(base: EngineCalls, web: WebProvider, session: Session, hidden: string[]) {
  return {
    lire_sejour: tool({
      description: "Séjours publiés, en cours d’abord. Alias de destination. Sans passeport.",
      inputSchema: z.object({}),
      execute: async () => base.lire_sejour(),
    }),
    lire_vols: tool({
      description:
        "Prochain segment à venir, puis les segments passés à part. Heure locale, heure de Paris, fuseau, date absolue. Aujourd’hui ou demain seulement si c’est exact.",
      inputSchema: z.object({}),
      execute: async () => base.lire_vols(),
    }),
    lire_solde: tool({
      description: "Solde publié. Négatif : reste à payer. Positif : crédit.",
      inputSchema: z.object({}),
      execute: async () => base.lire_solde(),
    }),
    formalites_pays: tool({
      description: "Règle d’entrée pour un passeport français, présentée comme règle générale.",
      inputSchema: z.object({ pays: z.string() }),
      execute: async ({ pays }) => base.formalites_pays(pays),
    }),
    regles_aeroport: tool({
      description: "Règle générale d’arrivée à l’aéroport, deux ou trois heures selon le vol.",
      inputSchema: z.object({}),
      execute: async () => base.regles_aeroport(),
    }),
    statut_checkin: tool({
      description:
        "État réel de l’enregistrement : prévu, fait, cartes déposées, fenêtre. reponse est la phrase client. Ne promet pas au-delà.",
      inputSchema: z.object({}),
      execute: async () => base.statut_checkin(),
    }),
    ouvrir_demande: tool({
      description: "Ouvre une demande pour l’agence, sans rien envoyer ni réserver. Le résumé est rédigé par toi.",
      inputSchema: z.object({
        resume: z.string(),
        kind: z.enum(HANDOFF_KINDS),
      }),
      execute: async ({ resume, kind }) => base.ouvrir_demande(resume, kind),
    }),
    recherche_web: tool({
      description:
        "Recherche publique si le dossier ne suffit pas. Restaurants : deux ou trois adresses près de l’hôtel. Sans nom, sans téléphone, sans référence.",
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => finishWeb(web, session, query, hidden),
    }),
    lire_page: tool({
      description: "Lit une page https déjà revenue dans la recherche.",
      inputSchema: z.object({ url: z.string() }),
      execute: async ({ url }) => finishPage(web, session, url),
    }),
  };
}

function withAnomaly(text: string, anomaly: string | null) {
  if (!anomaly || text.includes(anomaly)) return text;
  return `${text} ${anomaly}`.replace(/\s+/g, " ").trim();
}

function timeReply(vols: ReturnType<EngineCalls["lire_vols"]>) {
  return vols.phrase;
}

function terminalReply(vols: ReturnType<EngineCalls["lire_vols"]>) {
  return vols.terminalPhrase;
}

function restaurantNames(dit: string) {
  const names: string[] = [];
  for (const line of dit.split("\n")) {
    const title = line.split(" https://")[0]?.trim();
    if (!title || /petit-d[ée]jeuner|m[ée]t[ée]o|conseil|visa|aucun r[ée]sultat/i.test(title)) continue;
    if (!names.includes(title)) names.push(title);
  }
  return names;
}

export async function simulateEngineReply(input: {
  message: string;
  history: ConciergeHistoryTurn[];
  tools: EngineCalls;
}): Promise<{ text: string }> {
  const text = foldEngine(input.message);
  const past = foldEngine(input.history.map((row) => row.body).join("\n"));
  const fare = /tarif|paris\s*-?\s*nice|prix d'un vol|prix d un vol/.test(text) && !/solde|encours/.test(text);
  if (/c'est une question|cest une question/.test(text)) {
    input.tools.ouvrir_demande("Le client précise qu’il pose une question, pas une demande de solde.", "quote");
    const subject = /tarif|paris/.test(past) ? " sur le tarif Paris-Nice" : "";
    return { text: `Oui, je le prends comme une question${subject}. Je transmets à l’agence.` };
  }
  if (fare) {
    const vols = input.tools.lire_vols();
    input.tools.ouvrir_demande("Tarif demandé pour Paris-Nice.", "quote");
    return {
      text: vols.absent
        ? "Ce vol n’est pas encore dans votre dossier. Je transmets à l’agence pour un chiffrage."
        : "Je transmets à l’agence pour un chiffrage.",
    };
  }
  if (/a[eé]roport/.test(text) && /heure|quelle/.test(text)) {
    const rule = input.tools.regles_aeroport();
    const vols = input.tools.lire_vols();
    const hour = vols.dit.includes("AF1204") ? " Le vol AF1204 part à 10h30, heure locale et heure de Paris." : "";
    return { text: `${rule.dit}${hour} L’agence vous confirme l’heure sur place.` };
  }
  if (/visa|formalit/.test(text)) {
    const stay = input.tools.lire_sejour();
    const rule = input.tools.formalites_pays(text);
    const web = await input.tools.recherche_web(`formalités visa passeport français ${text.includes("canc") ? "Mexique" : text}`);
    const link = web.urls[0] ? ` ${web.urls[0]}` : "";
    const place = stay.dit.includes("Mayakoba") ? "Pour votre séjour à Mayakoba, " : "";
    if (rule.action) input.tools.ouvrir_demande("Formalité à confirmer pour le séjour.", "formality");
    const ruleText = /mexique/.test(text)
      ? "règle générale : un passeport français n’a pas de visa pour le Mexique."
      : rule.dit;
    return { text: `${place}${ruleText} L’agence vous confirme.${link}`.replace(/\s+/g, " ").trim() };
  }
  if (/check-?in|enregistrement/.test(text)) {
    const status = input.tools.statut_checkin();
    if (/sans engagement|transmettre/.test(status.reponse)) {
      input.tools.ouvrir_demande("Le client demande l’enregistrement. Aucun engagement au-delà du dossier.", "question");
    }
    return { text: status.reponse };
  }
  if (/chambre/.test(text) && /t[oô]t|plus t[oô]t|tot|avance/.test(text)) {
    input.tools.lire_sejour();
    const where = /mayakoba|cancun|mexique/.test(past + text) ? " pour Mayakoba" : "";
    input.tools.ouvrir_demande(`Chambre disponible plus tôt${where}.`, "question");
    return { text: `Je transmets à l’agence la demande de chambre plus tôt${where}.` };
  }
  if (/m[eé]t[eé]o|temps qu'il/.test(text)) {
    input.tools.lire_sejour();
    const web = await input.tools.recherche_web("météo Cancún la semaine du séjour");
    const bit = web.dit.includes("28") ? " Saison sèche, autour de 28 °C." : "";
    const link = web.urls[0] ? ` ${web.urls[0]}` : "";
    return { text: `Règle météo lue pour la semaine du séjour à Mayakoba.${bit}${link}`.trim() };
  }
  if (/retard/.test(text)) {
    const vols = input.tools.lire_vols();
    const web = await input.tools.recherche_web("retard vol AF1204");
    const number = vols.dit.includes("AF1204") ? "AF1204" : "demandé";
    const link = web.urls[0] ? ` ${web.urls[0]}` : "";
    return { text: `Je ne vois pas de retard publié pour le vol ${number}. L’agence vous confirme si cela change.${link}` };
  }
  if (/petit[- ]?d[eé]jeuner|breakfast/.test(text) && /heure|horaire|servi|quand/.test(text)) {
    const web = await input.tools.recherche_web("horaires petit-déjeuner hôtel");
    const link = web.urls[0] ? ` ${web.urls[0]}` : "";
    return { text: `Le site de l’hôtel indique un petit-déjeuner de 7h00 à 10h30. L’agence vous confirme.${link}` };
  }
  if (/\bannul/.test(text)) {
    input.tools.ouvrir_demande("Le client demande une annulation. Rien n’est annulé.", "question");
    return { text: "Je transmets à l’agence. Le séjour reste en place." };
  }
  if (/\bsolde\b|encours|reste a payer/.test(text)) {
    const balance = input.tools.lire_solde();
    return { text: balance.dit };
  }
  if (/terminal/.test(text)) {
    const vols = input.tools.lire_vols();
    if (vols.absent) return { text: "Ce vol n’est pas encore dans votre dossier." };
    return { text: withAnomaly(terminalReply(vols), vols.anomalie) };
  }
  if (/heure|horaire/.test(text) && /vol|depart|decoll/.test(text)) {
    const vols = input.tools.lire_vols();
    if (vols.absent) return { text: "Ce vol n’est pas encore dans votre dossier." };
    return { text: withAnomaly(timeReply(vols), vols.anomalie) };
  }
  if (/bagage/.test(text)) {
    input.tools.ouvrir_demande("Question sur les bagages.", "question");
    return { text: "Je n’ai pas le détail des bagages dans votre dossier. Je transmets à l’agence." };
  }
  if (/\bspa\b/.test(text)) {
    input.tools.ouvrir_demande("Demande de spa.", "question");
    return { text: "Je transmets à l’agence. Rien n’est réservé." };
  }
  if (/restaurant/.test(text)) {
    const stay = input.tools.lire_sejour();
    const place = stay.sejours.find((row) => row.hotel)?.hotel || stay.sejours[0]?.destination || "l’hôtel";
    const web = await input.tools.recherche_web(`restaurants près de ${place}`);
    const names = restaurantNames(web.dit);
    if (names.length >= 2) {
      const list = names.slice(0, 3).join(", ");
      return {
        text: `Près de l’hôtel : ${list}. Souhaitez-vous que je transmette la réservation à l’agence ? Rien n’est réservé.`,
      };
    }
    return {
      text: "Je n’ai pas trouvé d’adresse publiée près de l’hôtel. Souhaitez-vous que je transmette la demande à l’agence ? Rien n’est réservé.",
    };
  }
  if (/transfert|chauffeur/.test(text)) {
    input.tools.lire_sejour();
    input.tools.ouvrir_demande("Demande de transfert.", "question");
    return { text: "Je transmets à l’agence pour le transfert. Rien n’est commandé." };
  }
  if (/accompagn/.test(text)) {
    input.tools.ouvrir_demande("Ajout d’un accompagnant.", "question");
    return { text: "Je transmets à l’agence. Personne n’est ajouté au dossier." };
  }
  if (/\b(s[uû]r|sure)\b/.test(text)) {
    const vols = input.tools.lire_vols();
    if (vols.prochain || vols.tousPasses) {
      const line = /terminal/.test(past) ? terminalReply(vols) : timeReply(vols);
      return { text: `Oui. ${withAnomaly(line, vols.anomalie)}` };
    }
    return { text: "Je m’en tiens à ce qui est écrit dans votre dossier." };
  }
  if (/gr[eè]ve|mouvement social/.test(text)) {
    const web = await input.tools.recherche_web("grève aéroport jour du départ");
    input.tools.ouvrir_demande("Grève signalée, à confirmer pour le vol du client.", "question");
    const link = web.urls[0] ? ` ${web.urls[0]}` : "";
    return { text: `Une grève est signalée. Je transmets à l’agence.${link}` };
  }
  if (/cancun|mayakoba|mexique/.test(text)) {
    const stay = input.tools.lire_sejour();
    return { text: stay.dit.includes("Mayakoba") ? "Oui, cela concerne votre séjour à Mayakoba." : stay.dit };
  }
  input.tools.lire_sejour();
  return { text: "Je regarde votre dossier et je vous réponds sur ce qui y est écrit." };
}

export async function generateEngineReply(input: {
  message: string;
  history: ConciergeHistoryTurn[];
  prompt: string;
  tools: EngineCalls;
  web: WebProvider;
  session: Session;
  base: EngineCalls;
  hidden: string[];
}): Promise<{ text: string; usage: EngineTokens | null; model: string | null }> {
  if (!aiGatewayConfigured()) return { text: "", usage: null, model: null };
  const id = conciergeModelId();
  const key = openaiApiKey();
  const model = key ? createOpenAI({ apiKey: key })(id) : `openai/${id}`;
  const result = await generateText({
    model,
    abortSignal: AbortSignal.timeout(ENGINE_TIMEOUT_MS),
    maxRetries: 0,
    temperature: 0.2,
    maxOutputTokens: 500,
    stopWhen: stepCountIs(5),
    tools: asyncTools(input.base, input.web, input.session, input.hidden),
    providerOptions: {
      openai: { reasoningEffort: "low" },
      ...(key ? {} : { gateway: { tags: ["feature:whatsapp-concierge-shadow"] } }),
    },
    messages: [
      { role: "system", content: systemPrompt() },
      { role: "user", content: input.prompt },
    ],
  });
  const usage = result.totalUsage || result.usage;
  return {
    text: result.text.trim(),
    usage: usage
      ? { input: Number(usage.inputTokens || 0), output: Number(usage.outputTokens || 0) }
      : null,
    model: id,
  };
}

function skippedResult(kind: string, started: number): EngineResult {
  const reply =
    kind === "stop"
      ? "Les messages de l’agence sont coupés. Écrivez quand vous voulez, je vous réponds."
      : kind === "acces"
        ? "Le lien de votre espace part par le parcours habituel."
        : "";
  return {
    reply,
    handoff: null,
    tools: ["routeur"],
    corpus: "",
    blocked: false,
    latencyMs: Date.now() - started,
    tokens: null,
    model: null,
    webProvider: "off",
    skipped: kind,
    access: kind === "acces",
    optOut: kind === "stop",
    summary: "",
  };
}

/** Calcule une réponse. N’envoie rien, n’écrit ni le séjour ni le grand livre. */
export async function runConciergeEngine(input: EngineInput): Promise<EngineResult> {
  const started = Date.now();
  const owned = routerOwned(input.message);
  if (owned) return skippedResult(owned, started);
  const now = input.now ?? new Date();
  const history = truncateHistory(input.history || []);
  const view = normalizeDossier({
    dossier: input.dossier,
    message: input.message,
    now,
    travelers: input.travelers,
    checkins: input.checkins,
  });
  const web = input.web || fixtureWebProvider();
  const session: Session = { called: [], corpus: [], handoff: null, summary: "", hosts: new Set() };
  const calls = createCalls({ ...input, now }, view, web, session);
  const prompt = userPrompt({ message: input.message, history, view, now });
  const hidden = namesToHide(input.dossier, input.travelers || []);
  let drafted = "";
  let tokens: EngineTokens | null = null;
  let model: string | null = null;
  try {
    if (input.generate) {
      const simulated = await input.generate({ message: input.message, history, prompt, tools: calls });
      drafted = simulated.text;
      if (simulated.usage) {
        tokens = {
          input: Number(simulated.usage.inputTokens || 0),
          output: Number(simulated.usage.outputTokens || 0),
        };
      }
    } else {
      const live = await generateEngineReply({
        message: input.message,
        history,
        prompt,
        tools: calls,
        web,
        session,
        base: calls,
        hidden,
      });
      drafted = live.text;
      tokens = live.usage;
      model = live.model;
    }
  } catch {
    drafted = "";
  }
  const corpus = `${session.corpus.join("\n")}\n${conciergeContextText(input.dossier)}`;
  const filtered = filterEngineReply({ text: drafted, dossier: input.dossier, history, corpus });
  return {
    reply: filtered.text,
    handoff: session.handoff,
    tools: session.called,
    corpus,
    blocked: filtered.blocked,
    latencyMs: Date.now() - started,
    tokens,
    model,
    webProvider: web.name,
    skipped: drafted ? null : "vide",
    access: false,
    optOut: false,
    summary: session.summary,
  };
}

export type ShadowEvent = {
  customerId: string | null;
  firstName: string;
  phone: string;
  messageId: string;
  message: string;
  now: Date;
  bookingIds: string[] | null;
};

type QueryError = { code?: string; message?: string } | null;
type QueryResult = { data: unknown[] | null; error: QueryError };

export type ShadowAdmin = {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        order(column: string, options: { ascending: boolean }): {
          limit(count: number): PromiseLike<QueryResult>;
        };
      };
      in(column: string, values: string[]): PromiseLike<QueryResult>;
    };
    insert(row: Record<string, unknown>): PromiseLike<{ error: QueryError }>;
  };
};

function missingTable(error: QueryError) {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || /schema cache|does not exist|relation/i.test(error.message || "");
}

/** Historique long, enregistrements, puis calcul. L’insert échoue en silence si la table n’est pas là. */
export async function recordConciergeShadow(
  admin: ShadowAdmin,
  loadDossier: (customerId: string) => Promise<Parameters<typeof buildConciergeDossier>[0]>,
  event: ShadowEvent,
  options: { generate?: EngineGenerate; web?: WebProvider } = {}
) {
  if (!event.customerId || !event.message.trim()) return { stored: false, skipped: "sans fiche" };
  let history: ConciergeHistoryTurn[] = [];
  let checkins: EngineCheckin[] = [];
  let dossier: ConciergeDossier = {
    firstName: event.firstName,
    preferences: [],
    language: "fr",
    stays: [],
    documents: [],
    movements: [],
    balances: [],
  };
  let travelers: EngineTraveler[] = [];
  try {
    const raw = await loadDossier(event.customerId);
    const scoped = event.bookingIds?.length
      ? {
          ...raw,
          bookings: (raw.bookings || []).filter((row) => event.bookingIds?.includes(row.id)),
          items: (raw.items || []).filter((row) => event.bookingIds?.includes(row.booking_id)),
        }
      : raw;
    dossier = buildConciergeDossier({ ...scoped, firstName: event.firstName });
    travelers = (scoped.travelers || []).map((row) => ({
      bookingId: row.bookingId,
      firstName: row.firstName,
      lastName: row.lastName,
    }));
    const ids = dossier.stays.map((stay) => stay.id);
    const [messages, checks, items] = await Promise.all([
      admin
        .from("crm_whatsapp_messages")
        .select("direction, body, created_at")
        .eq("customer_id", event.customerId)
        .order("created_at", { ascending: false })
        .limit(80),
      ids.length
        ? admin.from("crm_flight_checkins").select("booking_item_id, status, actor").in("booking_id", ids)
        : Promise.resolve({ data: [], error: null }),
      ids.length
        ? admin.from("crm_booking_items").select("id, kind, details").in("booking_id", ids)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (!messages.error && messages.data) {
      history = [...messages.data]
        .reverse()
        .flatMap((row) => {
          const item = row as { direction?: string; body?: string; created_at?: string };
          if (item.direction !== "inbound" && item.direction !== "outbound") return [];
          return [{ direction: item.direction, body: String(item.body || ""), at: item.created_at || null }];
        });
    }
    const numbers = new Map<string, string>();
    for (const row of (items.data || []) as { id?: string; kind?: string; details?: { flight_number?: string } }[]) {
      if (row.kind === "flight" && row.id && row.details?.flight_number) numbers.set(row.id, row.details.flight_number);
    }
    checkins = ((checks.data || []) as { booking_item_id?: string; status?: string; actor?: string }[]).flatMap((row) => {
      const flightNumber = numbers.get(row.booking_item_id || "") || "";
      if (!flightNumber || !row.status) return [];
      const actor = row.actor === "agence" || row.actor === "bot" ? row.actor : "";
      return [{ flightNumber, status: row.status, actor }];
    });
  } catch {
    history = [];
  }
  const result = await runConciergeEngine({
    message: event.message,
    dossier,
    history,
    now: event.now,
    travelers,
    checkins,
    generate: options.generate,
    web: options.web || (options.generate ? fixtureWebProvider() : resolveWebProvider()),
  });
  const inserted = await admin.from("crm_concierge_shadow").insert({
    customer_id: event.customerId,
    message_id: /^[0-9a-f-]{36}$/i.test(event.messageId) ? event.messageId : null,
    engine: "shadow",
    model: result.model,
    reply: result.reply.slice(0, 2000),
    handoff: result.handoff,
    tools: result.tools,
    request_summary: result.summary.slice(0, 500) || null,
    latency_ms: result.latencyMs,
    tokens: result.tokens,
    blocked: result.blocked,
    web_provider: result.webProvider,
  });
  if (missingTable(inserted.error)) return { stored: false, skipped: "table absente", result };
  if (inserted.error) return { stored: false, skipped: "insert", result };
  return { stored: true, result };
}

/** shadow par défaut. off coupe le calcul. Toute autre valeur reste l’ombre : rien n’est envoyé. */
export function conciergeEngineMode(env: Record<string, string | undefined> = process.env): "off" | "shadow" {
  const raw = (env.CONCIERGE_ENGINE ?? "shadow").trim().toLowerCase();
  if (raw === "off" || raw === "0" || raw === "false") return "off";
  return "shadow";
}
