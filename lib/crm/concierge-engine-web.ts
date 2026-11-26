/**
 * Recherche web du concierge, derrière une interface.
 * AI Gateway (Perplexity) d’abord, Tavily si la clé est là et pas la passerelle, sinon coupé.
 * Aucun nom, aucun téléphone, aucune référence de dossier dans la requête.
 */

export const PREFERRED_DOMAINS = [
  "diplomatie.gouv.fr",
  "esta.cbp.dhs.gov",
  "gov.uk",
  "canada.ca",
  "service-public.fr",
  "airfrance.fr",
  "aeroportsdeparis.fr",
  "meteofrance.com",
];

export const EXCLUDED_DOMAINS = [
  "booking.com",
  "expedia.com",
  "expedia.fr",
  "kayak.com",
  "kayak.fr",
  "skyscanner.com",
  "skyscanner.fr",
  "tripadvisor.com",
  "tripadvisor.fr",
  "hotels.com",
  "airbnb.com",
  "airbnb.fr",
  "opodo.com",
  "opodo.fr",
  "lastminute.com",
  "liligo.com",
];

const CACHE_MS = 10 * 60 * 1000;
const CACHE_MAX = 64;
const SEARCH_TIMEOUT_MS = 8_000;
const MAX_RESULTS = 5;
const PAGE_CHARS = 1_500;

export type WebHit = {
  title: string;
  url: string;
  snippet: string;
};

export type WebProvider = {
  name: "gateway" | "tavily" | "fixture" | "off";
  search(query: string): Promise<WebHit[]>;
  read(url: string): Promise<{ url: string; text: string } | null>;
};

const cache = new Map<string, { at: number; hits: WebHit[] }>();

function foldHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function hostBlocked(host: string) {
  return EXCLUDED_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function preferredRank(url: string) {
  const host = foldHost(url);
  const index = PREFERRED_DOMAINS.findIndex((domain) => host === domain || host.endsWith(`.${domain}`));
  return index === -1 ? PREFERRED_DOMAINS.length : index;
}

export function stripWebPrices(text: string) {
  return text
    .replace(/\d[\d\s\u00a0.,]*\s*(?:€|eur(?:os)?|\$|usd|gbp|£)/gi, "")
    .replace(/(?:€|\$|£)\s*\d[\d\s\u00a0.,]*/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Retire les comparateurs, les prix, et borne le nombre de résultats. */
export function prepareWebHits(hits: WebHit[]) {
  const clean: WebHit[] = [];
  for (const hit of hits) {
    const host = foldHost(hit.url);
    if (!host || hostBlocked(host)) continue;
    if (!hit.url.startsWith("https://")) continue;
    const snippet = stripWebPrices(hit.snippet || "").slice(0, 400);
    const title = stripWebPrices(hit.title || "").slice(0, 140);
    if (!title && !snippet) continue;
    clean.push({ title, url: hit.url, snippet });
  }
  clean.sort((a, b) => preferredRank(a.url) - preferredRank(b.url));
  return clean.slice(0, MAX_RESULTS);
}

function fromCache(key: string) {
  const row = cache.get(key);
  if (!row) return null;
  if (Date.now() - row.at > CACHE_MS) {
    cache.delete(key);
    return null;
  }
  return row.hits;
}

function remember(key: string, hits: WebHit[]) {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), hits });
}

export function publicHttps(url: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password) return null;
  const host = parsed.hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return null;
  if (hostBlocked(host)) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const [a, b] = host.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)) return null;
  }
  if (host.includes(":")) return null;
  return parsed;
}

function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, PAGE_CHARS);
}

export async function readPublicPage(url: string, fetchImpl: typeof fetch = fetch) {
  const parsed = publicHttps(url);
  if (!parsed) return null;
  try {
    const response = await fetchImpl(parsed.toString(), {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
      headers: { accept: "text/html,text/plain", "user-agent": "TravelbaConcierge/1" },
    });
    if (response.status >= 300 && response.status < 400) return null;
    if (!response.ok) return null;
    const type = response.headers.get("content-type") || "";
    if (!/text\/|json|xml/.test(type)) return null;
    const text = htmlToText(await response.text());
    if (!text) return null;
    return { url: parsed.toString(), text: stripWebPrices(text) };
  } catch {
    return null;
  }
}

async function tavilySearch(key: string, query: string): Promise<WebHit[]> {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    redirect: "manual",
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      query,
      max_results: MAX_RESULTS,
      search_depth: "basic",
      exclude_domains: EXCLUDED_DOMAINS,
    }),
  });
  if (!response.ok) return [];
  const body = (await response.json()) as { results?: { title?: string; url?: string; content?: string }[] };
  return (body.results || []).map((row) => ({
    title: row.title || "",
    url: row.url || "",
    snippet: row.content || "",
  }));
}

async function tavilyRead(key: string, url: string) {
  const response = await fetch("https://api.tavily.com/extract", {
    method: "POST",
    redirect: "manual",
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ urls: [url] }),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { results?: { url?: string; raw_content?: string }[] };
  const row = body.results?.[0];
  const text = stripWebPrices(row?.raw_content || "").slice(0, PAGE_CHARS);
  if (!text) return null;
  return { url: row?.url || url, text };
}

type GatewaySearch = (query: string) => Promise<WebHit[]>;

async function gatewaySearch(query: string): Promise<WebHit[]> {
  const { gateway, generateText, stepCountIs } = await import("ai");
  const { conciergeModelId } = await import("./whatsapp-conversation");
  const filter = EXCLUDED_DOMAINS.slice(0, 20).map((domain) => `-${domain}`);
  const result = await generateText({
    model: gateway(`openai/${conciergeModelId()}`),
    abortSignal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    maxRetries: 0,
    maxOutputTokens: 200,
    stopWhen: stepCountIs(2),
    toolChoice: { type: "tool", toolName: "perplexity_search" },
    tools: {
      perplexity_search: gateway.tools.perplexitySearch({
        searchDomainFilter: filter,
        maxResults: MAX_RESULTS,
      }),
    },
    providerOptions: { gateway: { tags: ["feature:whatsapp-concierge-shadow"] } },
    prompt: [
      "Appelle perplexity_search une seule fois.",
      `query: ${JSON.stringify(query)}`,
      `max_results: ${MAX_RESULTS}`,
      `search_domain_filter: ${JSON.stringify(filter)}`,
      "N’ajoute aucun nom de personne ni référence de dossier.",
    ].join("\n"),
  });
  const hits: WebHit[] = [];
  for (const step of result.steps || []) {
    for (const row of step.toolResults || []) {
      const recordRow = row as { output?: unknown; result?: unknown };
      const output = "output" in row ? recordRow.output : "result" in row ? recordRow.result : null;
      const results = output && typeof output === "object" && "results" in output ? output.results : null;
      if (!Array.isArray(results)) continue;
      for (const item of results) {
        if (!item || typeof item !== "object") continue;
        const record = item as { title?: string; url?: string; snippet?: string };
        hits.push({ title: record.title || "", url: record.url || "", snippet: record.snippet || "" });
      }
    }
  }
  return hits;
}

function cachedProvider(name: WebProvider["name"], search: GatewaySearch, read: WebProvider["read"]): WebProvider {
  return {
    name,
    async search(query) {
      const key = `${name}:${query}`;
      const hit = fromCache(key);
      if (hit) return hit;
      try {
        const fresh = prepareWebHits(await search(query));
        remember(key, fresh);
        return fresh;
      } catch {
        return [];
      }
    },
    read,
  };
}

export function tavilyWebProvider(key: string): WebProvider {
  return cachedProvider("tavily", (query) => tavilySearch(key, query), async (url) => {
    if (!publicHttps(url)) return null;
    try {
      return await tavilyRead(key, url);
    } catch {
      return null;
    }
  });
}

export function gatewayWebProvider(): WebProvider {
  return cachedProvider("gateway", gatewaySearch, async (url) => readPublicPage(url));
}

export function disabledWebProvider(): WebProvider {
  return {
    name: "off",
    async search() {
      return [];
    },
    async read() {
      return null;
    },
  };
}

export function gatewaySearchConfigured(env: Record<string, string | undefined> = process.env) {
  return Boolean(
    env.AI_GATEWAY_API_KEY?.trim() || env.VERCEL_OIDC_TOKEN?.trim() || env.VERCEL || env.OPENAI_API_KEY?.trim().startsWith("sk-")
  );
}

/** Passerelle d’abord, Tavily ensuite, sinon coupé. */
export function resolveWebProvider(env: Record<string, string | undefined> = process.env): WebProvider {
  if (gatewaySearchConfigured(env)) return gatewayWebProvider();
  const tavily = env.TAVILY_API_KEY?.trim();
  if (tavily) return tavilyWebProvider(tavily);
  return disabledWebProvider();
}

const FIXTURES: { test: RegExp; hit: WebHit }[] = [
  {
    test: /visa|formalit|mexique|mexico/,
    hit: {
      title: "Conseils aux voyageurs — Mexique",
      url: "https://www.diplomatie.gouv.fr/fr/conseils-aux-voyageurs/conseils-par-pays-destination/mexique/",
      snippet: "Pour un séjour touristique, un passeport français n’a pas besoin de visa.",
    },
  },
  {
    test: /m[eé]t[eé]o|cancun|canc[uú]n/,
    hit: {
      title: "Météo Cancún",
      url: "https://meteofrance.com/cancun",
      snippet: "Saison sèche à Cancún, autour de 28 °C, averses possibles en fin de journée.",
    },
  },
  {
    test: /retard|af\d{2,4}/,
    hit: {
      title: "Vol Air France",
      url: "https://www.airfrance.fr/fr",
      snippet: "Aucun retard publié pour le vol AF1204.",
    },
  },
  {
    test: /petit[- ]?d[eé]jeuner|breakfast|h[oô]tel/,
    hit: {
      title: "Petit-déjeuner",
      url: "https://www.hotel-exemple.test/petit-dejeuner",
      snippet: "Le petit-déjeuner est servi de 7h00 à 10h30.",
    },
  },
  {
    test: /gr[eè]ve|mouvement social|strike/,
    hit: {
      title: "Infos vols",
      url: "https://www.aeroportsdeparis.fr/fr/passagers",
      snippet: "Un mouvement social est annoncé. Les horaires peuvent changer.",
    },
  },
];

export function fixtureWebProvider(): WebProvider {
  return {
    name: "fixture",
    async search(query) {
      const folded = query.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
      const hits = FIXTURES.filter((row) => row.test.test(folded)).map((row) => row.hit);
      return prepareWebHits(hits);
    },
    async read(url) {
      const hit = FIXTURES.find((row) => row.hit.url === url);
      if (!hit) return null;
      return { url, text: hit.hit.snippet };
    },
  };
}
