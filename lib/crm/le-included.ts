import { frenchLeBenefitLine } from "@/lib/crm/ingest-parse";

const SUITE_PREFIX = /^suite bookings\s*:\s*/i;
const AVAILABILITY = /\(selon disponibilité\)\s*$/i;

export function leRoomLabels(input: {
  room_types?: Array<string | null | undefined> | null;
  rooms?: Array<{ room_type?: string | null; room?: string | null; type?: string | null } | null> | null;
  room?: string | null;
}): string[] {
  const labels: string[] = [];
  const push = (value: string | null | undefined) => {
    const line = (value || "").replace(/\s+/g, " ").trim();
    if (line && !labels.some((row) => row.localeCompare(line, "fr", { sensitivity: "accent" }) === 0)) {
      labels.push(line);
    }
  };
  for (const type of input.room_types || []) push(type);
  for (const room of input.rooms || []) {
    if (!room) continue;
    push(room.room_type);
    push(room.type);
    push(room.room);
  }
  push(input.room);
  return labels;
}

/** La chambre réservée est une suite. Sans type de chambre, les lignes « Suite Bookings » restent de côté. */
export function leRoomIsSuite(labels: string[]): boolean {
  return labels.some((label) => /\bsuites?\b/i.test(label));
}

function prepared(raw: string) {
  const compact = raw.replace(/\s+/g, " ").trim();
  const starred = /\*/.test(compact);
  const line = compact
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .replace(/^(?:[-•]\s*)+/, "")
    .trim();
  return { line, starred };
}

function amountLabel(raw: string) {
  const norm = raw.replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(norm)) return raw.replace(".", ",");
  const value = Number(norm);
  if (!Number.isFinite(value)) return raw.replace(".", ",");
  if (Number.isInteger(value)) return String(value);
  return String(value).replace(".", ",");
}

function currencyLabel(code: string, amount: string) {
  const value = amountLabel(amount);
  const mark = code.toUpperCase();
  if (mark === "EUR" || mark === "€") return `${value} €`;
  if (mark === "GBP" || mark === "£") return `${value} £`;
  if (mark === "USD" || mark === "$" || mark === "US$") return `${value} USD`;
  return `${value} ${mark}`;
}

function aperitifBenefit(line: string) {
  const drink = line.match(
    /^(?:complimentary\s+|free\s+)?(glass of champagne|champagne|aperitif|apéritif|cocktail|drink)\b(.*)$/i
  );
  if (!drink) return null;
  const names: Record<string, string> = {
    "glass of champagne": "Coupe de champagne",
    champagne: "Coupe de champagne",
    aperitif: "Apéritif",
    apéritif: "Apéritif",
    cocktail: "Cocktail",
    drink: "Boisson",
  };
  const label = names[drink[1].toLowerCase()];
  if (!label) return null;
  const rest = drink[2];
  const forTwo = /\bfor\s+(?:two|2)\b/i.test(rest);
  let place = "";
  if (/\b(?:on|at|in) the terrace\b/i.test(rest)) place = "en terrasse";
  else if (/\b(?:on|at|in) the bar\b/i.test(rest)) place = "au bar";
  else if (/\b(?:on|at|in) the restaurant\b/i.test(rest)) place = "au restaurant";
  else if (/\b(?:on|at|in) the pool\b/i.test(rest)) place = "à la piscine";
  const leftover = rest
    .replace(/\bfor\s+(?:two|2)\b(?:\s+(?:guests?|people|persons?|adults?))?/gi, " ")
    .replace(/\b(?:on|at|in) the (?:terrace|bar|restaurant|pool)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (leftover) return null;
  return [label, forTwo ? "pour deux" : "", place].filter(Boolean).join(" ");
}

function discountBenefit(line: string) {
  const match = line.match(/^(\d+(?:[.,]\d+)?)\s*%\s+(?:discount|off)\s+at\s+(?:the\s+)?(.+)$/i);
  if (!match) return null;
  const amount = amountLabel(match[1]);
  let place = match[2].trim();
  let kind = "";
  const tail = place.match(/^(.*?)[\s,]*\b(restaurant|spa|bar)\b\.?$/i);
  if (tail) {
    kind = tail[2].toLowerCase();
    place = tail[1].trim();
  } else {
    const head = place.match(/^(restaurant|spa|bar)\b\s*(.*)$/i);
    if (!head) return null;
    kind = head[1].toLowerCase();
    place = head[2].trim();
  }
  const where = kind === "restaurant" ? "au restaurant" : kind === "spa" ? "au spa" : "au bar";
  const name = place.replace(/^(?:the)\s+/i, "").trim();
  return name ? `${amount} % de remise ${where} ${name}` : `${amount} % de remise ${where}`;
}

function creditBenefit(line: string) {
  const match = line.match(
    /^(?:(USD|EUR|GBP|US\$|€|\$|£)\s*)?(\d+(?:[.,]\d+)?)(?:\s*(USD|EUR|GBP|€|\$|£))?\s+(.+?)\s+credits?(?:\s+per\s+(stay|night|day|person))?$/i
  );
  if (!match || (!match[1] && !match[3])) return null;
  const subject = match[4].toLowerCase().replace(/\s+/g, " ").trim();
  const kinds: Record<string, string> = {
    hotel: "Crédit hôtel",
    "food and beverage": "Crédit restauration",
    "f&b": "Crédit restauration",
    "f & b": "Crédit restauration",
    dining: "Crédit restauration",
    restaurant: "Crédit restauration",
    breakfast: "Crédit petit-déjeuner",
    spa: "Crédit spa",
    bar: "Crédit bar",
    minibar: "Crédit minibar",
    "mini-bar": "Crédit minibar",
  };
  const label = kinds[subject];
  if (!label) return null;
  const money = currencyLabel(match[1] || match[3], match[2]);
  const period = match[5]
    ? { stay: "par séjour", night: "par nuit", day: "par jour", person: "par personne" }[match[5].toLowerCase()]
    : "";
  return [label, "de", money, period].filter(Boolean).join(" ");
}

function knownBenefit(line: string) {
  const exact = frenchLeBenefitLine(line);
  if (!exact || exact.localeCompare(line, "fr", { sensitivity: "accent" }) === 0) return null;
  return exact;
}

function simpleBenefit(line: string) {
  const offered = /^(?:complimentary|free)\s+/i.test(line);
  const core = line.replace(/^(?:complimentary|free)\s+/i, "");
  if (/^wi-?fi$|^wireless(?:\s+internet)?$/i.test(core)) return "Wifi offert";
  if (/^early\s+check-?\s?in\s*(?:\/|and|&)\s*late\s+check-?\s?out$/i.test(core)) {
    return "Enregistrement anticipé et départ tardif";
  }
  if (/^early\s+check-?\s?in$/i.test(core)) return "Enregistrement anticipé";
  if (/^late\s+check-?\s?out$/i.test(core)) return "Départ tardif";
  if (/^vip\s+welcome$|^welcome\s+vip$/i.test(core)) return "Accueil VIP";
  if (/^spa\s+access$|^access\s+to\s+(?:the\s+)?spa$/i.test(core)) return "Accès au spa";
  if (/^(?:one-way\s+|return\s+)?airport\s+transfers?$/i.test(core)) return "Transfert aéroport";
  if (/^welcome\s+amenity$/i.test(core)) return "Attention de bienvenue";
  if (/^welcome\s+gift$/i.test(core)) return "Cadeau de bienvenue";
  if (/^valet\s+parking$/i.test(core)) return "Voiturier";
  if (/^parking$/i.test(core)) return offered ? "Parking offert" : "Parking";
  if (/^room\s+upgrade$|^upgrade$/i.test(core)) return offered ? "Surclassement offert" : "Surclassement";
  if (/^daily\s+breakfast\s+for\s+(?:two|2)(?:\s+(?:guests?|people|persons?|adults?))?$/i.test(core)) {
    return "Petit-déjeuner quotidien pour deux personnes";
  }
  if (/^breakfast\s+for\s+(?:two|2)(?:\s+(?:guests?|people|persons?|adults?))?$/i.test(core)) {
    return offered ? "Petit-déjeuner offert pour deux" : "Petit-déjeuner pour deux";
  }
  if (/^daily\s+breakfast$/i.test(core)) return "Petit-déjeuner quotidien";
  if (/^breakfast\s+included$/i.test(core)) return "Petit-déjeuner inclus";
  if (/^full\s+breakfast$/i.test(core)) return "Petit-déjeuner complet";
  if (/^continental\s+breakfast$/i.test(core)) return "Petit-déjeuner continental";
  if (/^buffet\s+breakfast$/i.test(core)) return "Petit-déjeuner buffet";
  if (/^breakfast$/i.test(core)) return offered ? "Petit-déjeuner offert" : "Petit-déjeuner";
  return null;
}

/** Phrase connue, puis motif. Une ligne anglaise inconnue reste telle quelle. */
export function translateLeBenefit(line: string) {
  const trimmed = line.replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  return aperitifBenefit(trimmed) || discountBenefit(trimmed) || creditBenefit(trimmed) || knownBenefit(trimmed) || simpleBenefit(trimmed) || trimmed;
}

/**
 * Avantages Little Emperors pour `details.included`.
 * Une phrase ou un motif connu est traduit. Une ligne anglaise inconnue reste.
 * L’astérisque devient « (selon disponibilité) ». « Suite Bookings: » ne reste
 * que si la chambre réservée est une suite.
 */
export function leIncludedLines(benefits: string[], rooms: string[] = []): string[] {
  const suite = leRoomIsSuite(rooms);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of benefits) {
    if (typeof raw !== "string") continue;
    const { line, starred } = prepared(raw);
    if (!line) continue;
    const suiteLine = SUITE_PREFIX.test(line);
    if (suiteLine && !suite) continue;
    const body = suiteLine ? line.replace(SUITE_PREFIX, "").trim() : line;
    if (!body) continue;
    let french = translateLeBenefit(body);
    if (!french) continue;
    if (starred && !AVAILABILITY.test(french)) french = `${french} (selon disponibilité)`;
    const key = french.toLocaleLowerCase("fr");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(french);
  }
  return out;
}

function writtenIncluded(details: { included?: unknown } | null | undefined): string[] {
  if (!details || !Array.isArray(details.included)) return [];
  return details.included.map((line) => (typeof line === "string" ? line.trim() : "")).filter(Boolean);
}

/** Pose la liste. Une liste déjà écrite, même d’une seule ligne, n’est pas remplacée. */
export function assignLeIncluded(
  details: Record<string, unknown>,
  benefits: string[],
  rooms: string[] = []
): boolean {
  if (writtenIncluded(details).length) return false;
  const next = leIncludedLines(benefits, rooms);
  if (!next.length) return false;
  details.included = next;
  return true;
}
