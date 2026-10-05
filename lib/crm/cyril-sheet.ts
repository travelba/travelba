import "server-only";
import { createPrivateKey, createSign } from "crypto";
import { CYRIL_SHEET_HEADERS } from "@/lib/crm/cyril-flights";
import { productionOnlySecret } from "@/lib/crm/preview-secrets";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_TIMEOUT_MS = 10_000;
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const TAB = "Réponses";

type ServiceAccount = { client_email: string; private_key: string };

export class CyrilSheetError extends Error {
  constructor(
    message: string,
    readonly code: "unconfigured" | "upstream"
  ) {
    super(message);
  }
}

function sheetId() {
  return productionOnlySecret(process.env.CYRIL_SHEET_ID);
}

function writerSubject() {
  return productionOnlySecret(process.env.GMAIL_IMPERSONATE);
}

function loadServiceAccount(): ServiceAccount {
  const raw = productionOnlySecret(process.env.GOOGLE_SA_JSON);
  if (!raw || !sheetId()) {
    throw new CyrilSheetError("Classeur non configuré", "unconfigured");
  }
  let json = raw;
  if (!raw.startsWith("{")) {
    json = Buffer.from(raw, "base64").toString("utf8");
  }
  let parsed: { client_email?: string; private_key?: string };
  try {
    parsed = JSON.parse(json) as { client_email?: string; private_key?: string };
  } catch {
    throw new CyrilSheetError("Classeur non configuré", "unconfigured");
  }
  const clientEmail = (parsed.client_email || "").trim();
  const privateKey = (parsed.private_key || "").replace(/\\n/g, "\n");
  if (!clientEmail || !privateKey) {
    throw new CyrilSheetError("Classeur non configuré", "unconfigured");
  }
  return { client_email: clientEmail, private_key: privateKey };
}

let cachedToken: { token: string; exp: number; subject: string } | null = null;

function googleStatus(body: string) {
  try {
    const parsed = JSON.parse(body) as {
      error?: string | { status?: string; message?: string };
      error_description?: string;
    };
    if (typeof parsed.error === "string") {
      return `${parsed.error} ${parsed.error_description || ""}`.trim().slice(0, 220);
    }
    const status = parsed.error?.status || "";
    const message = parsed.error?.message || "";
    return `${status} ${message}`.trim().slice(0, 220);
  } catch {
    return "";
  }
}

async function requestToken(subject: string) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.subject === subject && cachedToken.exp - 60 > now) {
    return cachedToken.token;
  }
  const sa = loadServiceAccount();
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload: Record<string, string | number> = {
    iss: sa.client_email,
    scope: SHEETS_SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };
  if (subject) payload.sub = subject;
  const claim = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const data = `${header}.${claim}`;
  const signer = createSign("RSA-SHA256");
  signer.update(data);
  const signature = signer.sign(createPrivateKey(sa.private_key), "base64url");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    signal: AbortSignal.timeout(SHEETS_TIMEOUT_MS),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${data}.${signature}`,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("[anniversaire-cyril] auth", res.status, googleStatus(detail), sa.client_email);
    return null;
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) return null;
  cachedToken = { token: json.access_token, exp: now + (json.expires_in || 3600), subject };
  return cachedToken.token;
}

async function tokensToTry() {
  const tokens: string[] = [];
  const subject = writerSubject();
  if (subject) {
    const impersonated = await requestToken(subject);
    if (impersonated) tokens.push(impersonated);
  }
  const own = await requestToken("");
  if (own && !tokens.includes(own)) tokens.push(own);
  if (!tokens.length) throw new CyrilSheetError("Auth classeur", "upstream");
  return tokens;
}

function sheetColumn(count: number) {
  let n = count;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function valuesUrl(id: string, range: string, suffix = "") {
  return `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}${suffix}`;
}

let headersReady = false;

async function ensureHeaders(token: string, id: string) {
  if (headersReady) return;
  const end = sheetColumn(CYRIL_SHEET_HEADERS.length);
  const range = `'${TAB}'!A1:${end}1`;
  const read = await fetch(valuesUrl(id, range), {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(SHEETS_TIMEOUT_MS),
  });
  if (!read.ok) {
    const detail = await read.text().catch(() => "");
    console.error("[anniversaire-cyril] lecture", read.status, googleStatus(detail));
    throw new CyrilSheetError("Lecture classeur", "upstream");
  }
  const json = (await read.json()) as { values?: string[][] };
  const first = json.values?.[0]?.[0];
  if (!first) {
    const write = await fetch(`${valuesUrl(id, range)}?valueInputOption=RAW`, {
      method: "PUT",
      signal: AbortSignal.timeout(SHEETS_TIMEOUT_MS),
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ values: [Array.from(CYRIL_SHEET_HEADERS)] }),
    });
    if (!write.ok) throw new CyrilSheetError("En-têtes classeur", "upstream");
  }
  headersReady = true;
}

async function appendWithToken(token: string, id: string, row: string[]) {
  await ensureHeaders(token, id);
  const res = await fetch(
    valuesUrl(
      id,
      `'${TAB}'!A:${sheetColumn(CYRIL_SHEET_HEADERS.length)}`,
      ":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS"
    ),
    {
      method: "POST",
      signal: AbortSignal.timeout(SHEETS_TIMEOUT_MS),
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ values: [row] }),
    }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("[anniversaire-cyril] ajout", res.status, googleStatus(detail));
    throw new CyrilSheetError("Ajout classeur", "upstream");
  }
}

export async function appendCyrilRow(row: string[]) {
  const id = sheetId();
  if (!id) throw new CyrilSheetError("Classeur non configuré", "unconfigured");
  const tokens = await tokensToTry();
  let last: CyrilSheetError | null = null;
  for (const token of tokens) {
    try {
      await appendWithToken(token, id, row);
      return;
    } catch (error) {
      if (!(error instanceof CyrilSheetError) || error.code !== "upstream") throw error;
      headersReady = false;
      last = error;
    }
  }
  throw last || new CyrilSheetError("Ajout classeur", "upstream");
}
