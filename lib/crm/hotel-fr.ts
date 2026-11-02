/**
 * Textes hôtel montrés au client. Les noms propres restent.
 * Une phrase inconnue n’est pas inventée : elle est traduite si on la reconnaît,
 * sinon elle attend le cache (fiche).
 */

const memory = new Map<string, string>();

const MONTHS: Record<string, string> = {
  jan: "janvier",
  january: "janvier",
  feb: "février",
  february: "février",
  mar: "mars",
  march: "mars",
  apr: "avril",
  april: "avril",
  may: "mai",
  jun: "juin",
  june: "juin",
  jul: "juillet",
  july: "juillet",
  aug: "août",
  august: "août",
  sep: "septembre",
  sept: "septembre",
  september: "septembre",
  oct: "octobre",
  october: "octobre",
  nov: "novembre",
  november: "novembre",
  dec: "décembre",
  december: "décembre",
};

const CITIES: Record<string, string> = {
  london: "Londres",
  rome: "Rome",
  milan: "Milan",
  venice: "Venise",
  florence: "Florence",
  lisbon: "Lisbonne",
  barcelona: "Barcelone",
  madrid: "Madrid",
  vienna: "Vienne",
  prague: "Prague",
  brussels: "Bruxelles",
  geneva: "Genève",
  munich: "Munich",
  athens: "Athènes",
  marrakesh: "Marrakech",
  marrakech: "Marrakech",
  dubai: "Dubaï",
  "new york": "New York",
  "tel aviv": "Tel Aviv",
};

const PHRASES: Record<string, string> = {
  "room only": "Chambre seule",
  "bed and breakfast": "Petit-déjeuner inclus",
  "bed & breakfast": "Petit-déjeuner inclus",
  "breakfast included": "Petit-déjeuner inclus",
  "breakfast for two": "Petit-déjeuner pour deux",
  "daily breakfast": "Petit-déjeuner quotidien",
  "daily breakfast for two guests": "Petit-déjeuner quotidien pour deux personnes",
  "complimentary breakfast": "Petit-déjeuner offert",
  "half board": "Demi-pension",
  "full board": "Pension complète",
  "all inclusive": "Tout compris",
  "flexible rate": "Tarif flexible",
  "member rate": "Tarif membre",
  "best available rate": "Meilleur tarif disponible",
  "advance purchase": "Achat anticipé",
  "non-refundable": "Non remboursable",
  "non refundable": "Non remboursable",
  "free cancellation": "Annulation gratuite",
  "room upgrade": "Surclassement",
  "upgrade": "Surclassement",
  "priority upgrade at check-in": "Surclassement prioritaire à l’arrivée",
  "early check-in": "Arrivée anticipée",
  "late check-out": "Départ tardif",
  "early check-in / late check-out": "Arrivée anticipée et départ tardif",
  "hotel credit": "Crédit hôtel",
  "hotel credit per stay": "Crédit hôtel par séjour",
  dining: "Table",
  location: "Situation",
  overview: "Le lieu",
  amenities: "Équipements",
  policies: "Conditions",
  rooms: "Chambres",
  "swimming pool": "Piscine",
  pool: "Piscine",
  spa: "Spa",
  gym: "Salle de sport",
  "fitness center": "Salle de sport",
  "fitness centre": "Salle de sport",
  restaurant: "Restaurant",
  bar: "Bar",
  parking: "Parking",
  concierge: "Conciergerie",
  "room service": "Service en chambre",
  "air conditioning": "Climatisation",
  wifi: "Wifi",
  "free wifi": "Wifi",
  minibar: "Minibar",
  safe: "Coffre",
  balcony: "Balcon",
  terrace: "Terrasse",
  garden: "Jardin",
  "valet parking": "Voiturier",
};

const PROSE: [RegExp, string][] = [
  [/located in the heart of/gi, "au cœur de"],
  [/situated in the heart of/gi, "au cœur de"],
  [/in the heart of/gi, "au cœur de"],
  [/this luxury hotel offers/gi, "l’hôtel propose"],
  [/this hotel offers/gi, "l’hôtel propose"],
  [/this luxury hotel/gi, "cet hôtel"],
  [/this hotel/gi, "cet hôtel"],
  [/walking distance from/gi, "à quelques minutes à pied de"],
  [/just steps from/gi, "à deux pas de"],
  [/steps from/gi, "à deux pas de"],
  [/subject to availability/gi, "sous réserve de disponibilité"],
  [/air conditioning/gi, "climatisation"],
  [/\ba swimming pool\b/gi, "une piscine"],
  [/swimming pool/gi, "piscine"],
  [/fitness cent(?:er|re)/gi, "salle de sport"],
  [/room service/gi, "service en chambre"],
  [/free wi-?fi/gi, "wifi"],
  [/check-out/gi, "départ"],
  [/check-in/gi, "arrivée"],
  [/non-refundable/gi, "non remboursable"],
  [/free cancellation/gi, "annulation gratuite"],
  [/bed and breakfast/gi, "petit-déjeuner inclus"],
  [/half board/gi, "demi-pension"],
  [/full board/gi, "pension complète"],
  [/all inclusive/gi, "tout compris"],
  [/room only/gi, "chambre seule"],
  [/city cent(?:er|re)/gi, "centre-ville"],
  [/for two guests/gi, "pour deux personnes"],
  [/per stay/gi, "par séjour"],
  [/per night/gi, "par nuit"],
];

const VIEWS: [RegExp, string][] = [
  [/\beiffel(?:\s+tower)?\s+view\b/i, "vue tour Eiffel"],
  [/\bcity\s+view\b/i, "vue ville"],
  [/\bsea\s+view\b/i, "vue mer"],
  [/\bocean\s+view\b/i, "vue océan"],
  [/\bgarden\s+view\b/i, "vue jardin"],
  [/\bpool\s+view\b/i, "vue piscine"],
  [/\bcourtyard\s+view\b/i, "vue cour"],
  [/\briver\s+view\b/i, "vue fleuve"],
  [/\bpartial\s+view\b/i, "vue partielle"],
];

const BEDS: [RegExp, string][] = [
  [/\bking(?:\s+bed)?\b/i, "lit king"],
  [/\bqueen(?:\s+bed)?\b/i, "lit queen"],
  [/\btwin(?:\s+beds?)?\b/i, "lits jumeaux"],
  [/\b(?:2\s+)?doubles\b/i, "lits doubles"],
  [/\bdouble(?:\s+bed)?\b/i, "lit double"],
  [/\bsingle(?:\s+bed)?\b/i, "lit simple"],
  [/\bsofa\s+bed\b/i, "canapé-lit"],
];

const KINDS: [RegExp, string][] = [
  [/\bjunior\s+suite\b/i, "Suite junior"],
  [/\bpresidential\s+suite\b/i, "Suite présidentielle"],
  [/\bexecutive\s+suite\b/i, "Suite executive"],
  [/\bdeluxe\s+suite\b/i, "Suite deluxe"],
  [/\bsuperior\s+suite\b/i, "Suite supérieure"],
  [/\bsuite\b/i, "Suite"],
  [/\bstudio\b/i, "Studio"],
  [/\bapartment\b/i, "Appartement"],
  [/\bvilla\b/i, "Villa"],
  [/\broom\b/i, "Chambre"],
];

const ADJECTIVES: [RegExp, string][] = [
  [/\bdeluxe\b/i, "deluxe"],
  [/\bexecutive\b/i, "executive"],
  [/\bsuperior\b/i, "supérieure"],
  [/\bpremium\b/i, "premium"],
  [/\bclassic\b/i, "classique"],
  [/\bluxury\b/i, "de luxe"],
  [/\bfamily\b/i, "familiale"],
  [/\baccessible\b/i, "accessible"],
  [/\bconnecting\b/i, "communicante"],
  [/\bprestige\b/i, "prestige"],
  [/\bgrand\b/i, "grande"],
];

const RATE_BITS: [RegExp, string][] = [
  [/best available rate/i, "Meilleur tarif disponible"],
  [/flexible rate/i, "Tarif flexible"],
  [/member rate/i, "Tarif membre"],
  [/advance purchase/i, "Achat anticipé"],
  [/bed\s*(?:and|&)\s*breakfast/i, "Petit-déjeuner inclus"],
  [/breakfast included/i, "Petit-déjeuner inclus"],
  [/half board/i, "Demi-pension"],
  [/full board/i, "Pension complète"],
  [/all inclusive/i, "Tout compris"],
  [/room only/i, "Chambre seule"],
  [/non[-\s]?refundable/i, "Non remboursable"],
];

const BOARDS: [RegExp, string][] = [
  [/tout compris|all inclusive/i, "Tout compris"],
  [/pension complète|full board/i, "Pension complète"],
  [/demi-pension|half board/i, "Demi-pension"],
  [/petit-déjeuner|breakfast|bed\s*(?:and|&)\s*breakfast/i, "Petit-déjeuner inclus"],
  [/chambre seule|room only/i, "Chambre seule"],
];

const ENGLISH =
  /\b(the|and|with|from|this|that|your|our|free|cancellation|until|before|after|breakfast|included|refundable|located|offers|guests|nightly|rate|rates|room|rooms|view|views|bed|beds|king|queen|twin|upgrade|credit|daily|complimentary|subject|availability|including|hotel|only|half|full|board|flexible|member|walking|steps|heart|luxury|swimming|pool|fitness|center|centre|dining|overview|policies|amenities|wifi|parking|balcony|shower|minibar|safe|concierge|smoking|per)\b/i;

const FRENCH_START =
  /^(chambre|suite|studio|appartement|villa|petit-déjeuner|tarif|annulation|gratuite|non remboursable|demi-pension|pension|tout compris|crédit|surclassement|départ|arrivée|au cœur|situé|cet hôtel|l’hôtel|piscine|salle|service|climatisation|wifi|table|situation|le lieu|équipements|conditions|chambres|restaurant|parking|conciergerie|minibar|coffre|balcon|terrasse|jardin|voiturier|spa|bar)\b/i;

function clean(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function phraseKey(value: string) {
  return value
    .toLocaleLowerCase("fr")
    .replace(/[.’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function needsFrench(value: string) {
  const line = clean(value);
  if (!line || FRENCH_START.test(line)) return false;
  return ENGLISH.test(line);
}

export function rememberHotelFrench(source: string, french: string) {
  const from = clean(source);
  const to = clean(french);
  if (!from || !to || to.length > 1600 || needsFrench(to)) return;
  if (/little emperors|expedia|ratehawk|amadeus|\btaap\b/i.test(to)) return;
  memory.set(from, to);
}

export function frenchCity(value: string) {
  const line = clean(value);
  const head = line.split(",")[0]?.trim() || line;
  return CITIES[head.toLocaleLowerCase("fr")] || head;
}

function frenchClock(line: string) {
  const ampm = line.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (ampm) {
    let hour = Number(ampm[1]);
    const minutes = ampm[2] || "00";
    const mark = ampm[3].toLowerCase();
    if (mark === "pm" && hour < 12) hour += 12;
    if (mark === "am" && hour === 12) hour = 0;
    return minutes === "00" ? `${hour} h` : `${hour} h ${minutes}`;
  }
  const hm = line.match(/\b(\d{1,2}):(\d{2})\b/);
  if (!hm) return "";
  return hm[2] === "00" ? `${Number(hm[1])} h` : `${Number(hm[1])} h ${hm[2]}`;
}

function frenchDate(line: string) {
  const iso = line.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const month = Number(iso[2]);
    const names = [
      "janvier",
      "février",
      "mars",
      "avril",
      "mai",
      "juin",
      "juillet",
      "août",
      "septembre",
      "octobre",
      "novembre",
      "décembre",
    ];
    if (month >= 1 && month <= 12) return `${Number(iso[3])} ${names[month - 1]} ${iso[1]}`;
  }
  const dayFirst = line.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})\b/);
  if (dayFirst) {
    const month = MONTHS[dayFirst[2].toLowerCase()];
    if (month) return `${Number(dayFirst[1])} ${month} ${dayFirst[3]}`;
  }
  const monthFirst = line.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/);
  if (monthFirst) {
    const month = MONTHS[monthFirst[1].toLowerCase()];
    if (month) return `${Number(monthFirst[2])} ${month} ${monthFirst[3]}`;
  }
  return "";
}

const AGENCY_CANCELLATION = "Confirmée par l’agence avant tout paiement";

function statedCancellation(value: string) {
  const line = frenchCancellation(value);
  if (!line || line === AGENCY_CANCELLATION) return "";
  if (/^non remboursable$/i.test(line)) return line;
  if (/^annulation gratuite\b/i.test(line)) return line;
  if (/^gratuite\b/i.test(line)) return line.localeCompare("Gratuite", "fr", { sensitivity: "accent" }) === 0 ? "Annulation gratuite" : line;
  return "";
}

export function frenchCancellation(value: string): string {
  const line = clean(value);
  if (!line) return "";
  const known = memory.get(line);
  if (known) return known;
  if (/^gratuite\b/i.test(line) || /^non remboursable$/i.test(line) || /^annulation gratuite\b/i.test(line)) {
    return line;
  }
  if (/non[-\s]?refundable|non remboursable/i.test(line)) return "Non remboursable";
  if (/free\s+cancellation|annulation gratuite|fully\s+refundable/i.test(line)) {
    const date = frenchDate(line);
    const time = frenchClock(line);
    if (date && time) return `Gratuite jusqu’au ${date}, ${time}`;
    if (date) return `Gratuite jusqu’au ${date}`;
    return "Gratuite";
  }
  const translated = frenchHotelLine(line);
  if (!translated || /^(chambre|suite|studio)$/i.test(translated) || needsFrench(translated)) {
    return AGENCY_CANCELLATION;
  }
  return translated;
}

function frenchBedroomCount(value: string) {
  const match = value.match(/\b(one|two|three|four|five|\d+)\s+bedrooms?\b/i);
  if (!match || value.length > 80) return "";
  if (/\b(suite|villa|apartment|studio)\b/i.test(value) && !/\bryads?\b|\briads?\b/i.test(value)) return "";
  const words: Record<string, string> = { one: "une", two: "deux", three: "trois", four: "quatre", five: "cinq" };
  const count = words[match[1].toLocaleLowerCase("fr")] || match[1];
  const noun = count === "une" || count === "1" ? "chambre" : "chambres";
  if (/\bryads?\b|\briads?\b/i.test(value)) return `Ryad, ${count} ${noun}`;
  return `${count} ${noun}`;
}

function frenchRoom(value: string) {
  const bedrooms = frenchBedroomCount(value);
  if (bedrooms) return bedrooms;
  if (!/\b(room|suite|studio|apartment|villa|king|queen|twin)\b/i.test(value)) return "";
  if (FRENCH_START.test(value)) return "";
  let work = value;
  const views: string[] = [];
  for (const [pattern, label] of VIEWS) {
    if (pattern.test(work)) {
      views.push(label);
      work = work.replace(pattern, " ");
    }
  }
  const beds: string[] = [];
  for (const [pattern, label] of BEDS) {
    if (pattern.test(work)) {
      beds.push(label);
      work = work.replace(pattern, " ");
    }
  }
  let kind = "";
  for (const [pattern, label] of KINDS) {
    if (pattern.test(work)) {
      kind = label;
      work = work.replace(pattern, " ");
      break;
    }
  }
  if (!kind && beds.length) kind = "Chambre";
  if (!kind) return "";
  const adjectives: string[] = [];
  for (const [pattern, label] of ADJECTIVES) {
    if (pattern.test(work)) {
      adjectives.push(label);
      work = work.replace(pattern, " ");
    }
  }
  const specific = !/^(chambre|suite|studio|appartement|villa)$/i.test(kind);
  if (!specific && !adjectives.length && !beds.length && !views.length) {
    if (/^\s*rooms?\s*$/i.test(value)) return "";
    return kind;
  }
  return [ [kind, ...adjectives].join(" "), ...beds, ...views ].filter(Boolean).join(", ");
}

const RATE_WORD: Record<string, string> = {
  preferential: "préférentiel",
  preferred: "préférentiel",
  promotional: "promotionnel",
  standard: "standard",
  public: "public",
  rack: "public",
  corporate: "entreprise",
  package: "forfait",
  saver: "économique",
  special: "spécial",
  exclusive: "exclusif",
  luxury: "prestige",
  flexible: "flexible",
  member: "membre",
  advance: "anticipé",
  purchase: "",
  best: "meilleur",
  available: "disponible",
  the: "",
  a: "",
  and: "",
};

function frenchNamedRate(value: string) {
  const words = value
    .toLocaleLowerCase("fr")
    .replace(/[^a-zàâäéèêëïîôùûüç\s-]/gi, " ")
    .split(/[\s-]+/)
    .filter(Boolean);
  if (!words.length || words.length > 6 || !words.some((word) => word === "rate" || word === "rates")) return "";
  const adjectives = words.filter((word) => word !== "rate" && word !== "rates");
  if (!adjectives.length || adjectives.some((word) => !(word in RATE_WORD))) return "";
  const label = adjectives.map((word) => RATE_WORD[word]).filter(Boolean).join(" ");
  if (label === "meilleur disponible") return "Meilleur tarif disponible";
  if (!label) return "Tarif";
  return `Tarif ${label}`;
}

function frenchRateTitle(value: string) {
  let work = value;
  const bits: string[] = [];
  for (const [pattern, label] of RATE_BITS) {
    if (pattern.test(work)) {
      bits.push(label);
      work = work.replace(pattern, " ");
    }
  }
  if (!bits.length) return "";
  return [...new Set(bits)].join(" · ");
}

export function frenchHotelLine(value: string): string {
  const line = clean(value);
  if (!line) return "";
  const known = memory.get(line);
  if (known) return known;
  const phrase = PHRASES[phraseKey(line)];
  if (phrase) return phrase;
  if (FRENCH_START.test(line) && !ENGLISH.test(line)) return line;
  if (/free\s+cancellation|non[-\s]?refundable/i.test(line) && line.length < 180) {
    const cancellation: string = frenchCancellation(line);
    if (cancellation && cancellation !== line) return cancellation === "Gratuite" ? "Annulation gratuite" : cancellation;
  }
  const rate = frenchRateTitle(line) || frenchNamedRate(line);
  if (rate) return rate;
  const room = frenchRoom(line);
  if (room) return room;
  const loose = frenchLooseRoom(line);
  if (loose) return loose;
  return line;
}

function frenchLooseRoom(value: string) {
  if (value.length > 60 || FRENCH_START.test(value) || /\b(chambre|lit|lits|vue|the|with|and|for|located)\b/i.test(value)) return "";
  if (!/\b(deluxe|club|family|balcony)\b/i.test(value)) return "";
  const adjectives: string[] = [];
  if (/\bdeluxe\b/i.test(value)) adjectives.push("deluxe");
  if (/\bclub\b/i.test(value)) adjectives.push("club");
  if (/\bfamily\b/i.test(value)) adjectives.push("familiale");
  const extras: string[] = [];
  if (/\bbalcony\b/i.test(value)) extras.push("balcon");
  if (!adjectives.length && !extras.length) return "";
  return [["Chambre", ...adjectives].join(" "), ...extras].join(", ");
}

export function frenchHotelProse(value: string) {
  const line = clean(value).slice(0, 1600);
  if (!line) return "";
  const known = memory.get(line);
  if (known) return known;
  if (!needsFrench(line)) return line;
  let next = line;
  for (const [pattern, label] of PROSE) next = next.replace(pattern, label);
  next = next.replace(/\s+/g, " ").trim();
  if (next === line) return line;
  return next.charAt(0).toLocaleUpperCase("fr") + next.slice(1);
}

const ENGLISH_LEFT =
  /\b(the|and|with|from|this|that|your|our|located|offers|guests|swimming|complimentary|including|overview|policies|breakfast|free|cancellation)\b/i;

/** Texte montré au client : une phrase encore anglaise ne s’affiche pas. */
export function frenchClientProse(value: string) {
  const shown = frenchHotelProse(value);
  if (!shown || ENGLISH_LEFT.test(shown)) return "";
  return shown;
}

export function hotelTextNeedsModel(value: string) {
  const shown = frenchHotelProse(value);
  return shown.length > 48 && needsFrench(shown);
}

export function readStayRate(input: { title: string; cancellation: string; benefits: string[] }) {
  const rawTitle = input.title.replace(/\s+/g, " ").trim();
  const title = rawTitle ? clientRateTitle(rawTitle) : "Séjour";
  const fromPolicy = frenchCancellation(input.cancellation);
  const cancellation = (fromPolicy && fromPolicy !== AGENCY_CANCELLATION ? fromPolicy : "") || statedCancellation(input.title) || statedCancellation(title) || AGENCY_CANCELLATION;
  const blob = `${title} ${input.benefits.join(" ")} ${input.cancellation}`;
  let board = "";
  for (const [pattern, label] of BOARDS) {
    if (pattern.test(blob)) {
      board = label;
      break;
    }
  }
  const parts = title
    .split(" · ")
    .filter((part) => !board || part.localeCompare(board, "fr", { sensitivity: "accent" }) !== 0);
  return {
    title: parts.join(" · ") || "Séjour",
    board: board || "Précisée à la confirmation",
    cancellation,
  };
}

const ADVANTAGE_GROUPS: { title: string; test: RegExp }[] = [
  { title: "Table", test: /petit-déjeuner|demi-pension|pension complète|tout compris|repas/i },
  { title: "Chambre", test: /surclassement/i },
  { title: "Horaires", test: /arrivée|départ|anticip|tardif/i },
  { title: "Crédit", test: /crédit/i },
];

const PROGRAM = /little emperors|luminous|virtuoso|fine hotels|tablet|amex|hyatt privil|hilton impuls|\bslh\b|leading hotels|\bfhr\b/i;

const VIEW_TOKEN: Record<string, string> = {
  river: "vue fleuve",
  garden: "vue jardin",
  gardens: "vue jardin",
  sea: "vue mer",
  ocean: "vue océan",
  city: "vue ville",
  pool: "vue piscine",
  courtyard: "vue cour",
  partial: "vue partielle",
};

function frenchViewToken(value: string) {
  const key = value.trim().toLowerCase().replace(/\s+view$/, "");
  return VIEW_TOKEN[key] || "";
}

function frenchBedToken(value: string) {
  const line = value.trim();
  if (!line) return "";
  if (/^kings?$/i.test(line)) return "lit king";
  if (/^queens?$/i.test(line)) return "lit queen";
  if (/^twins?$/i.test(line)) return "lits jumeaux";
  if (/^(?:2\s+)?doubles$/i.test(line)) return "lits doubles";
  if (/^doubles?$/i.test(line)) return "lit double";
  if (/^singles?$/i.test(line)) return "lit simple";
  return "";
}

/** Surface, couchage et vue seulement s’ils sont écrits. Rien n’est deviné. */
export function roomSpec(value: string) {
  const areaMatch = value.match(/(\d{2,3})\s*(?:m²|m2|sqm|sq\.?\s*m)/i);
  const beds: string[] = [];
  for (const [pattern, label] of BEDS) {
    if (pattern.test(value) && !beds.includes(label)) beds.push(label);
  }
  const views: string[] = [];
  for (const [pattern, label] of VIEWS) {
    if (pattern.test(value) && !views.includes(label)) views.push(label);
  }
  if (/\bbalcon(?:y)?\b/i.test(value) && !views.includes("balcon")) views.push("balcon");
  const frenchBed = value.match(/lits?\s+[a-zàâéèêëîïôùûüç]+/i)?.[0] || "";
  const frenchView = value.match(/vue\s+[a-zàâéèêëîïôùûüç]+/i)?.[0] || "";
  return {
    area: areaMatch ? `${areaMatch[1]} m²` : "",
    bed: beds[0] || frenchBed,
    outlook: [...views, frenchView].filter((item, index, all) => item && all.indexOf(item) === index).join(", "),
  };
}

/** Faits de chambre lus sur des champs séparés, puis sur le texte. */
export function roomFacts(input: { name?: string; description?: string; size?: string; bed?: string; view?: string; exterior?: string }) {
  const spec = roomSpec([input.name, input.description, input.size, input.bed, input.view, input.exterior].filter(Boolean).join(". "));
  const outlook = [frenchViewToken(input.view || ""), spec.outlook, /\bbalcon(?:y)?\b/i.test(input.exterior || "") ? "balcon" : ""]
    .flatMap((item) => item.split(",").map((part) => part.trim()))
    .filter((item, index, all) => item && all.indexOf(item) === index);
  return {
    area: spec.area,
    bed: frenchBedToken(input.bed || "") || spec.bed,
    outlook: outlook.join(", "),
  };
}

/** Le nom du tarif, en français, sans programme qui désigne un fournisseur. */
export function clientRateTitle(value: string) {
  const raw = value.replace(/\s+/g, " ").trim();
  if (/\bsaver\b/i.test(raw)) return "Tarif économique";
  if (!raw || PROGRAM.test(raw) || /^public$/i.test(raw)) return /préférentiel|preferential|member/i.test(raw) ? "Tarif préférentiel" : "Meilleur tarif disponible";
  const french = frenchHotelLine(raw);
  if (!french || PROGRAM.test(french) || needsFrench(french) || (!FRENCH_START.test(french) && !/[àâéèêëîïôùûüç]/i.test(french))) {
    return /préférentiel|preferential|member/i.test(raw) ? "Tarif préférentiel" : "Meilleur tarif disponible";
  }
  if (/tarif préférentiel/i.test(french)) return "Tarif préférentiel";
  if (/meilleur tarif disponible/i.test(french)) return "Meilleur tarif disponible";
  return french;
}

export function cancellationPhrase(value: string) {
  const line = value.replace(/\s+/g, " ").trim();
  if (!line) return "";
  if (/non remboursable/i.test(line)) return "Non remboursable";
  if (/^gratuite\b/i.test(line)) {
    const phrase = `Annulation ${line.charAt(0).toLocaleLowerCase("fr")}${line.slice(1)}`;
    return phrase.replace(/(\d+)\s+h\s+(\d+)/, "$1h$2");
  }
  return line;
}

export function groupAdvantages(lines: string[]) {
  const used = new Set<string>();
  const groups = ADVANTAGE_GROUPS.map((group) => ({ title: group.title, lines: [] as string[] }));
  const rest: string[] = [];
  for (const line of lines) {
    const group = ADVANTAGE_GROUPS.findIndex((item) => item.test.test(line));
    if (group >= 0) {
      groups[group].lines.push(line);
      used.add(line);
    } else {
      rest.push(line);
    }
  }
  if (rest.length) groups.push({ title: "Le séjour", lines: rest });
  const filled = groups.filter((group) => group.lines.length);
  if (filled.length < 2) return [];
  return filled;
}
