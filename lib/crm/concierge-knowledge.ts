import { siteConfig, SERVICE_KEYS } from "@/lib/site";
import { destinationCountryName, entryForFrenchPassport, frenchEntryNeedsFormality, officialVisaApplyUrl } from "@/lib/crm/visa-fr";

export const KNOWLEDGE_KINDS = ["service", "tone", "conditions", "faq", "partner", "formality", "example"] as const;
export type KnowledgeKind = (typeof KNOWLEDGE_KINDS)[number];

export type KnowledgeChunk = {
  id: string;
  kind: KnowledgeKind;
  title: string;
  body: string;
  locale: string;
  tags: string[];
  published: boolean;
};

const SERVICE_COPY: Record<(typeof SERVICE_KEYS)[number], string> = {
  jet: "Vols privés et jets, sur demande. L’agence confirme l’appareil et le prix.",
  seminars: "Séminaires et réunions, salles et rythme préparés avec le client.",
  events: "Événements privés, calendrier et prestataires tenus par l’agence.",
  prestige: "Séjours d’exception, adresses choisies avec le client.",
  hotels: "Hôtels. Le catalogue Little Emperors reste interne : ni téléphone ni e-mail d’hôtel au client.",
  restaurants: "Tables. Une demande de restaurant part à l’agence, rien n’est réservé seul.",
  clubs: "Clubs et adresses du soir, sur demande.",
  chauffeur: "Chauffeur et transferts. Le devis part après accord de l’agence.",
  vip: "Accueil VIP en aéroport, sur demande.",
  bespoke: "Voyage sur mesure. Le Concierge pose les questions, l’agence envoie la proposition.",
};

const FORMALITY_CODES = ["US", "GB", "IL", "CA", "AU", "NZ", "KR", "KE", "IN"] as const;

function chunk(id: string, kind: KnowledgeKind, title: string, body: string, tags: string[]): KnowledgeChunk {
  return { id, kind, title, body, locale: "fr", tags, published: true };
}

/** Textes déjà dans le dépôt. Pas une conversation client. */
export function knowledgeSeed(): KnowledgeChunk[] {
  const services = SERVICE_KEYS.map((key) =>
    chunk(`service-${key}`, "service", key, SERVICE_COPY[key], ["service", key])
  );
  const tone = chunk(
    "tone-concierge",
    "tone",
    "Voix",
    "Le Concierge vouvoie, en phrases courtes, sans emoji. Signature : Le Concierge. Il ne tutoie pas. Il ne promet ni prix ni disponibilité tant que l’agence n’a pas approuvé.",
    ["ton"]
  );
  const conditions = chunk(
    "conditions-agence",
    "conditions",
    "Conditions",
    `${siteConfig.legal.legalName}, ${siteConfig.legal.legalForm}, ${siteConfig.address.full}. Garantie financière : ${siteConfig.legal.garantieFinanciere}. Agrément ${siteConfig.legal.accreditation}. Rien n’est réservé ni encaissé sans l’accord de l’agence.`,
    ["conditions"]
  );
  const faq = [
    chunk(
      "faq-modifier",
      "faq",
      "Modifier un séjour",
      "Une modification se transmet à l’agence. Le Concierge ne change pas le dossier seul.",
      ["faq", "modification"]
    ),
    chunk(
      "faq-payer",
      "faq",
      "Régler",
      "Le règlement reprend l’encours publié du dossier. Le lien Stripe n’est créé qu’après l’accord de l’agence. Aucun numéro de carte n’est demandé sur WhatsApp.",
      ["faq", "paiement"]
    ),
    chunk(
      "faq-stop",
      "faq",
      "Stop",
      "STOP coupe les messages proactifs. La conversation reste ouverte.",
      ["faq", "stop"]
    ),
  ];
  const partner = chunk(
    "partner-catalogue",
    "partner",
    "Hôtels partenaires",
    "Les hôtels partenaires sont le catalogue Little Emperors, lu seulement par l’agence. Le Concierge peut citer un nom déjà publié dans le dossier du client. Il ne donne pas le correspondant de l’hôtel.",
    ["hotel", "partenaire"]
  );
  const formalities = FORMALITY_CODES.map((code) => {
    const rule = entryForFrenchPassport(code);
    const name = destinationCountryName(code);
    const url = officialVisaApplyUrl(code);
    const needed = frenchEntryNeedsFormality(rule);
    const body = needed
      ? `Passeport français, ${name} : ${rule.formality || "formalité"}. L’agence dépose la demande. ${url ? `Portail : ${url}` : ""}`.trim()
      : `Passeport français, ${name} : pas de formalité dans le tableau du dépôt.`;
    return chunk(`formality-${code}`, "formality", name, body, ["formalite", code.toLowerCase()]);
  });
  return [...services, tone, conditions, ...faq, partner, ...formalities];
}

const DIMS = 64;

function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

function tokens(value: string) {
  return fold(value)
    .split(/[^a-z0-9\u0590-\u05ff]+/u)
    .filter((token) => token.length > 1);
}

/** Vecteur déterministe. Le cosinus sert sans clé d’embedding. */
export function hashEmbedding(text: string, dims = DIMS) {
  const vector = new Array<number>(dims).fill(0);
  for (const token of tokens(text)) {
    let hash = 0;
    for (let i = 0; i < token.length; i += 1) hash = (hash * 33 + token.charCodeAt(i)) >>> 0;
    const index = hash % dims;
    const sign = hash & 1 ? 1 : -1;
    vector[index] += sign;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!norm) return vector;
  return vector.map((value) => value / norm);
}

/** Littéral pgvector. Même vecteur que le classement en mémoire. */
export function embeddingLiteral(text: string) {
  return `[${hashEmbedding(text).map((value) => value.toFixed(6)).join(",")}]`;
}

export function cosine(left: number[], right: number[]) {
  const length = Math.min(left.length, right.length);
  let sum = 0;
  for (let i = 0; i < length; i += 1) sum += left[i] * right[i];
  return sum;
}

export type RankedChunk = KnowledgeChunk & { score: number; toneOnly: boolean };

/** Les exemples règlent le ton. Ils ne sont pas des faits. */
export function rankKnowledge(chunks: KnowledgeChunk[], query: string, limit = 4): RankedChunk[] {
  const published = chunks.filter((chunk) => chunk.published);
  const queryTokens = new Set(tokens(query));
  const queryVector = hashEmbedding(query);
  const ranked = published.map((item) => {
    const overlap = tokens(`${item.title} ${item.body} ${item.tags.join(" ")}`).filter((token) => queryTokens.has(token)).length;
    const near = cosine(queryVector, hashEmbedding(`${item.title}\n${item.body}`));
    const examplePenalty = item.kind === "example" ? 0.15 : 1;
    return { ...item, score: (overlap + Math.max(0, near)) * examplePenalty, toneOnly: item.kind === "example" };
  });
  return ranked
    .filter((item) => item.score > 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function knowledgePrompt(chunks: RankedChunk[]) {
  if (!chunks.length) return "";
  const lines = chunks.map((item) => {
    const prefix = item.toneOnly ? "Ton seulement, pas un fait" : item.kind;
    return `${prefix} — ${item.title} : ${item.body.replace(/\s+/g, " ").trim()}`;
  });
  return lines.join("\n");
}

/** Blocs séparés par une ligne ---. Client: / Concierge: */
export function parseExampleImport(text: string): KnowledgeChunk[] {
  const blocks = text
    .split(/\n---\n/)
    .map((block) => block.trim())
    .filter(Boolean);
  return blocks.slice(0, 40).map((block, index) => {
    const title = block.split("\n")[0].replace(/^(client|concierge)\s*:\s*/i, "").slice(0, 80) || `Exemple ${index + 1}`;
    return chunk(`example-import-${index + 1}`, "example", title, block.slice(0, 4000), ["exemple", "ton"]);
  });
}

export function isKnowledgeKind(value: string): value is KnowledgeKind {
  return (KNOWLEDGE_KINDS as readonly string[]).includes(value);
}
