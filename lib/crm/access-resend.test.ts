import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ACCESS_LINK_TTL_MS,
  EXAMPLE_ACCESS_TOKEN,
  accessContentDrafts,
  accessContentVariables,
  accessExpiresAt,
  accessLinkGate,
  accessOtpType,
  accessPreviewMarkup,
  accessRowAlive,
  accessSafeDetail,
  accessTemplatePreview,
  createAccessToken,
  deliverAccessResend,
  hashAccessToken,
  isAccessToken,
  loginEmailFromSearch,
} from "./access-resend";

const TOKEN = EXAMPLE_ACCESS_TOKEN;
const EMAIL = "camille.exemple@travelba.fr";

test("le jeton est fort, et seule son empreinte se conserve", () => {
  assert.equal(TOKEN.length, 43);
  assert.equal(isAccessToken(TOKEN), true);
  assert.equal(isAccessToken("court"), false);
  const a = createAccessToken();
  const b = createAccessToken();
  assert.equal(isAccessToken(a), true);
  assert.notEqual(a, b);
  const hash = hashAccessToken(a);
  assert.equal(hash.length, 64);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash.includes(a), false);
  assert.equal(hashAccessToken(a), hashAccessToken(a));
});

test("le lien personnel dure 30 jours", () => {
  const now = new Date("2026-11-02T12:00:00.000Z");
  assert.equal(accessExpiresAt(now).getTime() - now.getTime(), ACCESS_LINK_TTL_MS);
  assert.equal(ACCESS_LINK_TTL_MS, 30 * 24 * 60 * 60 * 1000);
  assert.equal(
    accessRowAlive({ expires_at: accessExpiresAt(now).toISOString(), revoked_at: null, used_at: null }, now),
    true
  );
  assert.equal(
    accessRowAlive({ expires_at: now.toISOString(), revoked_at: null, used_at: null }, new Date(now.getTime() + 1)),
    false
  );
  assert.equal(
    accessRowAlive({ expires_at: accessExpiresAt(now).toISOString(), revoked_at: now.toISOString(), used_at: null }, now),
    false
  );
});

test("la page de connexion lit l’e-mail du paramètre", () => {
  assert.equal(loginEmailFromSearch("Camille.Exemple@travelba.fr"), EMAIL);
  assert.equal(loginEmailFromSearch(encodeURIComponent(EMAIL)), EMAIL);
  assert.equal(loginEmailFromSearch("pas une adresse"), "");
  assert.equal(loginEmailFromSearch(""), "");
  const page = readFileSync(new URL("../../app/connexion/page.tsx", import.meta.url), "utf8");
  assert.match(page, /loginEmailFromSearch\(searchParams\.get\("email"\)\)/);
});

test("le modèle français a un seul bouton, Ouvrir mon espace", () => {
  const draft = accessContentDrafts()[0];
  const actions = draft.create.types["twilio/call-to-action"].actions;
  assert.equal(draft.friendlyName, "espace_client_lien");
  assert.equal(draft.env, "TWILIO_CONTENT_ACCES_CLIENT");
  assert.equal(draft.create.language, "fr");
  assert.equal(actions.length, 1);
  assert.equal(actions[0].title, "Ouvrir mon espace");
  assert.equal(actions[0].url, "https://travelba.fr/acces/{{2}}");
  const body = draft.create.types["twilio/call-to-action"].body;
  assert.equal(body.includes("http"), false);
  assert.equal(body.includes("Se connecter"), false);
  assert.match(body, /Comme demandé, voici le lien vers votre espace client Travel BA/);
  assert.match(body, /Ce lien personnel reste valable 30 jours\./);
  assert.equal(/\b(mot de passe|code|connexion|accès|acces|usage unique)\b/i.test(body), false);
  assert.match(body, /Le Concierge$/);
  assert.equal(draft.create.variables["2"], TOKEN);
  assert.equal("3" in draft.create.variables, false);
  const variables = accessContentVariables("Camille", EMAIL, TOKEN);
  assert.equal(variables?.["2"], TOKEN);
  assert.equal(accessContentVariables("Camille", "non", TOKEN), null);
  const preview = accessTemplatePreview("Camille");
  assert.match(preview || "", /Bonjour Camille/);
  assert.equal((preview || "").includes(TOKEN), false);
  assert.equal((preview || "").includes("http"), false);
  const script = readFileSync(new URL("../../scripts/arm-whatsapp-concierge.ts", import.meta.url), "utf8");
  assert.match(script, /accessContentDrafts\(\)/);
});

test("l’aperçu WhatsApp ne contient pas le jeton et ne l’ouvre pas tout seul", () => {
  const html = accessPreviewMarkup();
  assert.equal(html.includes(TOKEN), false);
  assert.equal(html.includes("http"), false);
  assert.match(html, /ouvrir/);
  assert.match(html, /30 jours/);
  assert.equal(accessLinkGate({
    tokenOk: true,
    alive: true,
    openRequested: false,
    previewBot: true,
    sessionEmail: null,
    accountEmail: EMAIL,
  }), "preview");
  assert.equal(accessLinkGate({
    tokenOk: true,
    alive: false,
    openRequested: true,
    previewBot: false,
    sessionEmail: null,
    accountEmail: EMAIL,
  }), "refuse");
  assert.equal(accessLinkGate({
    tokenOk: true,
    alive: true,
    openRequested: true,
    previewBot: false,
    sessionEmail: "autre@travelba.fr",
    accountEmail: EMAIL,
  }), "busy");
  assert.equal(accessLinkGate({
    tokenOk: true,
    alive: true,
    openRequested: true,
    previewBot: false,
    sessionEmail: EMAIL,
    accountEmail: EMAIL,
  }), "same");
  assert.equal(accessLinkGate({
    tokenOk: true,
    alive: true,
    openRequested: true,
    previewBot: false,
    sessionEmail: null,
    accountEmail: EMAIL,
  }), "open");
  assert.equal(accessOtpType(true), "recovery");
  assert.equal(accessOtpType(false), "magiclink");
});

test("l’envoi révoque l’ancien jeton, journalise l’auteur, et n’écrit pas le lien", async () => {
  const rows: { body: string; status: string; error: string | null; author_staff_id: string | null }[] = [];
  const audits: string[] = [];
  const stored: { tokenHash: string }[] = [];
  let revokedActive = 0;
  let revokedHash = "";
  const result = await deliverAccessResend(
    {
      customerId: "11111111-1111-4111-8111-111111111111",
      email: EMAIL,
      firstName: "Camille",
      phone: "+33601020304",
      token: TOKEN,
      staffId: "22222222-2222-4222-8222-222222222222",
      actor: "Raphael",
    },
    {
      async revokeActive() {
        revokedActive += 1;
        return true;
      },
      async insertToken(row) {
        stored.push({ tokenHash: row.tokenHash });
        return true;
      },
      async revokeHash(hash) {
        revokedHash = hash;
      },
      async send(variables) {
        assert.equal(variables["2"], TOKEN);
        return { ok: true, sid: "SM123" };
      },
      async remember(row) {
        rows.push({ body: row.body, status: row.status, error: row.error, author_staff_id: row.author_staff_id });
        return true;
      },
      audit: async (summary) => {
        audits.push(summary);
      },
    }
  );
  assert.equal(result.ok, true);
  assert.equal(revokedActive, 1);
  assert.equal(revokedHash, "");
  assert.equal(stored[0].tokenHash, hashAccessToken(TOKEN));
  assert.equal(stored[0].tokenHash.includes(TOKEN), false);
  assert.equal(JSON.stringify(rows).includes(TOKEN), false);
  assert.equal(JSON.stringify(rows).includes("http"), false);
  assert.equal(JSON.stringify(audits).includes(TOKEN), false);
  assert.equal(rows[0].status, "queued");
  assert.equal(rows[1].status, "sent");
  assert.equal(rows[1].author_staff_id, "22222222-2222-4222-8222-222222222222");
  assert.match(audits[0], /Raphael/);
});

test("un échec Twilio retire le jeton et n’en garde pas la trace", async () => {
  let revokedHash = "";
  const rows: { status: string; error: string | null }[] = [];
  const result = await deliverAccessResend(
    {
      customerId: "11111111-1111-4111-8111-111111111111",
      email: EMAIL,
      firstName: "Camille",
      phone: "+33601020304",
      token: TOKEN,
      staffId: null,
      actor: "mcp",
    },
    {
      async revokeActive() {
        return true;
      },
      async insertToken() {
        return true;
      },
      async revokeHash(hash) {
        revokedHash = hash;
      },
      async send() {
        return { ok: false, reason: "rejected", detail: `refusé https://travelba.fr/acces/${TOKEN} ${TOKEN}` };
      },
      async remember(row) {
        rows.push({ status: row.status, error: row.error });
        return true;
      },
      audit: async () => undefined,
    }
  );
  assert.equal(result.ok, false);
  assert.equal(revokedHash, hashAccessToken(TOKEN));
  assert.equal(rows.at(-1)?.status, "failed");
  assert.equal((rows.at(-1)?.error || "").includes(TOKEN), false);
  assert.equal((rows.at(-1)?.error || "").includes("http"), false);
  assert.equal(accessSafeDetail(`voir ${TOKEN}`, TOKEN).includes(TOKEN), false);
});

test("le bouton et la route publique sont en place", () => {
  const panel = readFileSync(new URL("../../components/admin/InviteCustomerPanel.tsx", import.meta.url), "utf8");
  assert.match(panel, /Renvoyer ses accès par WhatsApp/);
  assert.match(panel, /ConfirmAction/);
  assert.match(panel, /acces-whatsapp/);
  const proxy = readFileSync(new URL("../../proxy.ts", import.meta.url), "utf8");
  assert.match(proxy, /path === "\/acces"/);
  const open = readFileSync(new URL("./access-open.ts", import.meta.url), "utf8");
  assert.match(open, /generateLink/);
  assert.match(open, /verifyOtp/);
  assert.equal(open.includes("console.log"), false);
  assert.equal(open.includes("action_link"), false);
});
