import { createPrivateKey, createSign, createHmac } from "crypto";
import { secretEquals } from "./secret-equals";
import { productionOnlySecret } from "@/lib/crm/preview-secrets";
import { createServiceClient } from "@/lib/supabase/admin";
import { revolutInboxDraft } from "@/lib/crm/revolut-inbox";
import { revolutBalancePockets } from "@/lib/crm/account-balances";
import { isRevolutAccountId, parseRevolutAccounts, pickEurSepaWire, type AgencyWire } from "@/lib/crm/revolut-wire";

const PROVIDER = "revolut";
const REVOLUT_TIMEOUT_MS = 15_000;

function apiBase() {
  if (process.env.REVOLUT_SANDBOX === "1") {
    return "https://sandbox-b2b.revolut.com";
  }
  return (process.env.REVOLUT_API_URL || "https://b2b.revolut.com").replace(/\/$/, "");
}

function pemKey() {
  return productionOnlySecret(process.env.REVOLUT_PRIVATE_KEY).replace(/\\n/g, "\n");
}

export function revolutClientId() {
  return productionOnlySecret(process.env.REVOLUT_CLIENT_ID);
}

export function revolutConfigured() {
  return Boolean(revolutClientId() && pemKey());
}

export async function revolutConnected() {
  const row = await loadTokens();
  return Boolean(row?.refresh_token || row?.access_token);
}

export function createClientAssertion() {
  const clientId = revolutClientId();
  const iss = process.env.REVOLUT_ISS || clientId;
  const key = pemKey();
  if (!clientId || !key) throw new Error("Revolut n’est pas configuré");

  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString(
    "base64url"
  );
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      iss,
      sub: clientId,
      aud: "https://revolut.com",
      iat: now,
      exp: now + 60 * 60 * 24 * 30,
    })
  ).toString("base64url");
  const data = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(data);
  const sig = signer.sign(createPrivateKey(key), "base64url");
  return `${data}.${sig}`;
}

type TokenRow = {
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
};

async function loadTokens() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("crm_integrations")
    .select("*")
    .eq("provider", PROVIDER)
    .maybeSingle();
  return data as TokenRow | null;
}

async function saveTokens(patch: Partial<TokenRow> & { extra?: unknown }) {
  const supabase = createServiceClient();
  const { data: existing } = await supabase
    .from("crm_integrations")
    .select("id")
    .eq("provider", PROVIDER)
    .maybeSingle();
  if (existing?.id) {
    await supabase.from("crm_integrations").update(patch).eq("id", existing.id);
  } else {
    await supabase.from("crm_integrations").insert({ provider: PROVIDER, ...patch });
  }
}

async function refreshAccessToken(refreshToken: string) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_assertion_type:
      "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion: createClientAssertion(),
  });
  const res = await fetch(`${apiBase()}/api/1.0/auth/token`, {
    method: "POST",
    signal: AbortSignal.timeout(REVOLUT_TIMEOUT_MS),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Revolut token refresh ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  await saveTokens({
    access_token: json.access_token,
    refresh_token: json.refresh_token || refreshToken,
    expires_at: new Date(Date.now() + (json.expires_in || 2400) * 1000).toISOString(),
  });
  return json.access_token;
}

export async function exchangeRevolutAuthCode(code: string) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_assertion_type:
      "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion: createClientAssertion(),
  });
  const res = await fetch(`${apiBase()}/api/1.0/auth/token`, {
    method: "POST",
    signal: AbortSignal.timeout(REVOLUT_TIMEOUT_MS),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Revolut auth ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  await saveTokens({
    access_token: json.access_token,
    refresh_token: json.refresh_token || null,
    expires_at: new Date(Date.now() + (json.expires_in || 2400) * 1000).toISOString(),
  });
}

export async function getRevolutAccessToken() {
  const row = await loadTokens();
  if (!row?.refresh_token && !row?.access_token) {
    throw new Error("Revolut n’est pas connecté");
  }
  if (row.access_token && row.expires_at) {
    if (new Date(row.expires_at).getTime() - 60_000 > Date.now()) {
      return row.access_token;
    }
  }
  if (!row.refresh_token) throw new Error("Refresh token Revolut manquant");
  return refreshAccessToken(row.refresh_token);
}

export type RevolutTx = {
  id: string;
  type?: string;
  state?: string;
  created_at?: string;
  updated_at?: string;
  completed_at?: string | null;
  reference?: string;
  merchant?: { name?: string; city?: string } | null;
  legs?: Array<{
    amount: number;
    currency: string;
    description?: string;
    account_id?: string;
    counterparty?: { name?: string; account_no?: string; iban?: string };
  }>;
};

export async function fetchRevolutTransactions(fromIso: string) {
  const token = await getRevolutAccessToken();
  const out: RevolutTx[] = [];
  let to: string | undefined;
  // Sans filtre type : les crédits clients SEPA arrivent souvent en `topup`,
  // alors que `type=transfer` ne renvoie que les sorties (montants négatifs).
  for (let i = 0; i < 20; i++) {
    const url = new URL(`${apiBase()}/api/1.0/transactions`);
    url.searchParams.set("from", fromIso);
    url.searchParams.set("count", "1000");
    if (to) url.searchParams.set("to", to);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(REVOLUT_TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      let detail = "";
      try {
        const json = JSON.parse(body) as { code?: number; message?: string };
        if (json.code === 9002) {
          detail =
            " : whitelist IP / scope sensible — reconnectez avec le scope READ uniquement (liste IP vide).";
        } else if (json.message) {
          detail = ` : ${json.message}`;
        }
      } catch {
        if (body) detail = ` : ${body.slice(0, 180)}`;
      }
      throw new Error(`Revolut transactions ${res.status}${detail}`);
    }
    const page = (await res.json()) as RevolutTx[];
    if (!page.length) break;
    out.push(...page);
    if (page.length < 1000) break;
    to = page[page.length - 1]?.created_at;
    if (!to) break;
  }
  return out;
}

export async function upsertRevolutInbox(txs: RevolutTx[]) {
  const supabase = createServiceClient();
  let inserted = 0;
  for (const tx of txs) {
    const draft = revolutInboxDraft(tx);
    if (!draft) continue;
    const fields = {
      amount: draft.amount,
      currency: draft.currency,
      direction: draft.direction,
      counterparty_name: draft.counterparty_name,
      counterparty_iban: draft.counterparty_iban,
      reference: draft.reference,
      booked_at: draft.booked_at,
      raw: tx,
    };
    // Un débit ne doit jamais rester « à rapprocher » : le statut ignored le sort de la file.
    const patch =
      draft.direction === "debit" ? { ...fields, status: "ignored" as const } : fields;
    const { error, data } = await supabase
      .from("crm_revolut_transactions")
      .upsert(
        {
          revolut_transaction_id: tx.id,
          ...patch,
        },
        { onConflict: "revolut_transaction_id", ignoreDuplicates: true }
      )
      .select("id");
    if (!error && data?.length) inserted += data.length;
    else {
      // Ne pas retourner un crédit déjà rangé en débit, ni l’inverse.
      await supabase
        .from("crm_revolut_transactions")
        .update(patch)
        .eq("revolut_transaction_id", tx.id)
        .eq("direction", draft.direction);
    }
  }
  return inserted;
}

export class RevolutHttpError extends Error {
  status: number;
  constructor(status: number) {
    super("Revolut");
    this.status = status;
  }
}

async function revolutGet(path: string, timeoutMs = REVOLUT_TIMEOUT_MS): Promise<unknown> {
  const token = await getRevolutAccessToken();
  const res = await fetch(`${apiBase()}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    await res.arrayBuffer().catch(() => undefined);
    throw new RevolutHttpError(res.status);
  }
  return res.json();
}

export async function fetchRevolutAccounts(timeoutMs = REVOLUT_TIMEOUT_MS) {
  return parseRevolutAccounts(await revolutGet("/api/1.0/accounts", timeoutMs));
}

/** Soldes des comptes actifs. Null si Revolut n’est pas ouvert. Échec : montant indisponible. */
export async function loadRevolutAccountBalances() {
  try {
    if (!revolutConfigured() || !(await revolutConnected())) return null;
    return revolutBalancePockets(await fetchRevolutAccounts(8_000));
  } catch (err) {
    console.error("[revolut] solde", err instanceof Error ? err.message : "échec");
    return revolutBalancePockets([]);
  }
}

export async function fetchRevolutAccountBankDetails(accountId: string) {
  if (!isRevolutAccountId(accountId)) throw new RevolutHttpError(400);
  const data = await revolutGet(`/api/1.0/accounts/${accountId}/bank-details`);
  const list = Array.isArray(data) ? data : data && typeof data === "object" ? [data] : [];
  return list.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const rec = row as Record<string, unknown>;
    const schemes = Array.isArray(rec.schemes)
      ? rec.schemes.filter((scheme): scheme is string => typeof scheme === "string")
      : [];
    return [
      {
        iban: typeof rec.iban === "string" ? rec.iban : undefined,
        bic: typeof rec.bic === "string" ? rec.bic : undefined,
        beneficiary: typeof rec.beneficiary === "string" ? rec.beneficiary : undefined,
        schemes,
      },
    ];
  });
}

const WIRE_TTL_MS = 10 * 60 * 1000;
let wireCache: { at: number; wire: AgencyWire } | null = null;

/** IBAN SEPA du compte euros Main. Mis en cache un court moment. Jamais journalisé. */
export async function loadAgencyEurWire() {
  if (wireCache && Date.now() - wireCache.at < WIRE_TTL_MS) return wireCache.wire;
  const accounts = await fetchRevolutAccounts();
  const eur = accounts.filter(
    (account) => (account.state || "active") === "active" && (account.currency || "").toUpperCase() === "EUR"
  );
  const details = [];
  for (const account of eur) {
    details.push({ accountId: account.id, rows: await fetchRevolutAccountBankDetails(account.id) });
  }
  const wire = pickEurSepaWire(accounts, details);
  if (!wire) return null;
  wireCache = { at: Date.now(), wire };
  return wire;
}

export function verifyRevolutWebhook(rawBody: string, timestamp: string, signatureHeader: string) {
  const secret = productionOnlySecret(process.env.REVOLUT_WEBHOOK_SECRET);
  if (!secret) throw new Error("REVOLUT_WEBHOOK_SECRET manquant");
  const payloadToSign = `v1.${timestamp}.${rawBody}`;
  const digest = createHmac("sha256", secret).update(payloadToSign).digest("hex");
  const expected = `v1=${digest}`;
  const candidates = signatureHeader.split(" ").filter(Boolean);
  return candidates.some((sig) => secretEquals(sig, expected));
}
