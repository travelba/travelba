import "server-only";
import { createPrivateKey, createSign } from "crypto";
import { CYRIL_SHEET_HEADERS } from "@/lib/crm/cyril-flights";
import { productionOnlySecret } from "@/lib/crm/preview-secrets";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
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

let cachedToken: { token: string; exp: number } | null = null;

async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;
  const sa = loadServiceAccount();
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const claim = Buffer.from(
    JSON.stringify({
      iss: sa.client_email,
      scope: SHEETS_SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    })
  ).toString("base64url");
  const data = `${header}.${claim}`;
  const signer = createSign("RSA-SHA256");
  signer.update(data);
  const signature = signer.sign(createPrivateKey(sa.private_key), "base64url");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${data}.${signature}`,
    }),
  });
  if (!res.ok) {
    throw new CyrilSheetError("Auth classeur", "upstream");
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new CyrilSheetError("Auth classeur", "upstream");
  cachedToken = { token: json.access_token, exp: now + (json.expires_in || 3600) };
  return cachedToken.token;
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
  });
  if (!read.ok) throw new CyrilSheetError("Lecture classeur", "upstream");
  const json = (await read.json()) as { values?: string[][] };
  const first = json.values?.[0]?.[0];
  if (!first) {
    const write = await fetch(`${valuesUrl(id, range)}?valueInputOption=RAW`, {
      method: "PUT",
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

export async function appendCyrilRow(row: string[]) {
  const id = sheetId();
  if (!id) throw new CyrilSheetError("Classeur non configuré", "unconfigured");
  const token = await accessToken();
  await ensureHeaders(token, id);
  const res = await fetch(
    valuesUrl(
      id,
      `'${TAB}'!A:${sheetColumn(CYRIL_SHEET_HEADERS.length)}`,
      ":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS"
    ),
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ values: [row] }),
    }
  );
  if (!res.ok) throw new CyrilSheetError("Ajout classeur", "upstream");
}
