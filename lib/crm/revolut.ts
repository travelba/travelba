import { createPrivateKey, createSign, createHmac, timingSafeEqual } from "crypto";
import { createServiceClient } from "@/lib/supabase/admin";

const PROVIDER = "revolut";

function apiBase() {
  if (process.env.REVOLUT_SANDBOX === "1") {
    return "https://sandbox-b2b.revolut.com";
  }
  return (process.env.REVOLUT_API_URL || "https://b2b.revolut.com").replace(/\/$/, "");
}

function pemKey() {
  return (process.env.REVOLUT_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim();
}

export function revolutConfigured() {
  return Boolean(process.env.REVOLUT_CLIENT_ID && pemKey());
}

export async function revolutConnected() {
  const row = await loadTokens();
  return Boolean(row?.refresh_token || row?.access_token);
}

export function createClientAssertion() {
  const clientId = process.env.REVOLUT_CLIENT_ID;
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
  legs?: Array<{
    amount: number;
    currency: string;
    account_id?: string;
    counterparty?: { name?: string; account_no?: string; iban?: string };
  }>;
};

export async function fetchRevolutTransactions(fromIso: string) {
  const token = await getRevolutAccessToken();
  const out: RevolutTx[] = [];
  let to: string | undefined;
  for (let i = 0; i < 20; i++) {
    const url = new URL(`${apiBase()}/api/1.0/transactions`);
    url.searchParams.set("from", fromIso);
    url.searchParams.set("count", "1000");
    url.searchParams.set("type", "transfer");
    if (to) url.searchParams.set("to", to);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
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
    const leg = tx.legs?.[0];
    const amount = Number(leg?.amount || 0);
    if (!tx.id || amount <= 0) continue;
    const { error, data } = await supabase
      .from("crm_revolut_transactions")
      .upsert(
        {
          revolut_transaction_id: tx.id,
          amount,
          currency: leg?.currency || "EUR",
          counterparty_name: leg?.counterparty?.name || null,
          counterparty_iban:
            leg?.counterparty?.iban || leg?.counterparty?.account_no || null,
          reference: tx.reference || null,
          booked_at: tx.completed_at || tx.created_at || null,
          raw: tx,
        },
        { onConflict: "revolut_transaction_id", ignoreDuplicates: true }
      )
      .select("id");
    if (!error && data?.length) inserted += data.length;
  }
  return inserted;
}

export function verifyRevolutWebhook(rawBody: string, timestamp: string, signatureHeader: string) {
  const secret = process.env.REVOLUT_WEBHOOK_SECRET?.trim();
  if (!secret) throw new Error("REVOLUT_WEBHOOK_SECRET manquant");
  const payloadToSign = `v1.${timestamp}.${rawBody}`;
  const digest = createHmac("sha256", secret).update(payloadToSign).digest("hex");
  const expected = `v1=${digest}`;
  const candidates = signatureHeader.split(" ").filter(Boolean);
  return candidates.some((sig) => {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}
