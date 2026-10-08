import assert from "node:assert/strict";
import test from "node:test";
import {
  ENTRY_CODE_LENGTH,
  MAX_ENTRY_OPENS,
  entryCode,
  entryCodeFromLink,
  entryButtonSuffix,
  entryCoverAllowed,
  entryLinkExpiresAt,
  entryLinkTtlMs,
  entryLinkUrl,
  entryOpenRequested,
  entryOptInFromLink,
  entryReopenDecision,
  isMissingColumnError,
  isPreviewBot,
  shouldOpenFromGet,
  entryDestination,
  entryPreviewHtml,
  isLinkCrawler,
  referenceFromNextPath,
  safeNextPath,
  shouldServePreview,
  stayPreviewCopy,
  storedEntryEmail,
  isEntryChannel,
} from "./entry-link";

test("le code tient en huit signes", () => {
  const code = entryCode();
  assert.equal(code.length, ENTRY_CODE_LENGTH);
  assert.match(code, /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/);
});

test("l’adresse publique est courte", () => {
  assert.equal(entryLinkUrl("https://travelba.fr/", "K7MQ2PX4"), "https://travelba.fr/e/c/K7MQ2PX4");
  assert.equal(entryButtonSuffix("K7MQ2PX4"), "c/K7MQ2PX4");
  assert.equal("https://travelba.fr/e/c/K7MQ2PX4".length < 40, true);
  assert.equal(entryCodeFromLink("https://travelba.fr/e/c/K7MQ2PX4"), "K7MQ2PX4");
  assert.equal(entryCodeFromLink("https://travelba.fr/e/K7MQ2PX4"), "K7MQ2PX4");
  assert.equal(entryCodeFromLink("https://travelba.fr/auth/callback?token_hash=secret"), null);
});

test("WhatsApp reçoit le titre sans consommer le jeton", () => {
  assert.equal(isLinkCrawler("WhatsApp/2.23"), true);
  assert.equal(isLinkCrawler("facebookexternalhit/1.1"), true);
  assert.equal(shouldServePreview("WhatsApp/2.23.20.72 A", null), true);
  assert.equal(shouldServePreview("Mozilla/5.0", "?1", { mode: "navigate", dest: "document" }), true);
  assert.equal(entryOpenRequested("?ouvrir=1"), true);
  assert.equal(entryOpenRequested(""), false);
  assert.equal(isPreviewBot("WhatsApp/2.23.20.72 A"), true);
  assert.equal(isPreviewBot("Mozilla/5.0 (iPhone) Mobile WhatsApp/24.1"), false);
  assert.equal(
    shouldOpenFromGet({
      search: "",
      userAgent: "WhatsApp/2.23.20.72 A",
      secFetchUser: "?1",
      secFetchDest: "document",
      purpose: null,
    }),
    false
  );
  assert.equal(
    shouldOpenFromGet({
      search: "?ouvrir=1",
      userAgent: "WhatsApp/2.23.20.72 A",
      secFetchUser: null,
      secFetchDest: null,
      purpose: null,
    }),
    false
  );
  assert.equal(
    shouldOpenFromGet({
      search: "",
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
      secFetchUser: "?1",
      secFetchDest: "document",
      purpose: null,
    }),
    true
  );
  assert.equal(
    shouldOpenFromGet({
      search: "?ouvrir=1",
      userAgent: "Mozilla/5.0 (iPhone) Mobile",
      secFetchUser: null,
      secFetchDest: null,
      purpose: null,
    }),
    true
  );
  assert.equal(
    shouldOpenFromGet({
      search: "",
      userAgent: "Mozilla/5.0",
      secFetchUser: "?1",
      secFetchDest: "document",
      purpose: "prefetch",
    }),
    false
  );
  assert.equal(
    stayPreviewCopy({ origin: "https://travelba.fr", reference: "TB-2026-0004", place: "Avoriaz", hasCover: true }).image,
    null
  );
  const stay = stayPreviewCopy({
    origin: "https://travelba.fr",
    reference: "TB-2026-0004",
    place: "Avoriaz",
    hasCover: true,
    entryCode: "K7MQ2PX4",
  });
  assert.equal(stay.title, "Séjour à Avoriaz");
  assert.equal(stay.description, "Réservation TB-2026-0004 · Travel Business Agency");
  // Le code du lien, jamais le code de partage /v/ : l’aperçu ne doit pas donner le lien public.
  assert.equal(stay.image, "https://travelba.fr/api/covers/sejour/TB-2026-0004?e=K7MQ2PX4");
  assert.equal(stay.image?.includes("partage"), false);
  assert.equal(referenceFromNextPath("/mon-compte/reservations/TB-2026-0004"), "TB-2026-0004");
  assert.equal(referenceFromNextPath("/mon-compte"), null);
  const html = entryPreviewHtml("https://travelba.fr", "K7MQ2PX4", stay);
  assert.match(html, /<title>Séjour à Avoriaz<\/title>/);
  assert.match(html, /og:title" content="Séjour à Avoriaz"/);
  assert.match(html, /og:description" content="Réservation TB-2026-0004 · Travel Business Agency"/);
  assert.match(html, /og:url" content="https:\/\/travelba\.fr\/e\/c\/K7MQ2PX4"/);
  assert.match(html, /og:image" content="https:\/\/travelba\.fr\/api\/covers\/sejour\/TB-2026-0004\?e=K7MQ2PX4"/);
  assert.match(html, /og:image:width" content="1200"/);
  assert.match(html, /og:image:height" content="630"/);
  assert.match(html, /favicon\.ico/);
  assert.equal(html.includes("og-concierge"), false);
  assert.equal(html.includes("tba-mark"), false);
  assert.match(html, /method="post"/);
  assert.match(html, /name="ouvrir"/);
  assert.match(html, /value="1"/);
  assert.match(html, /<script>location\.replace\(location\.pathname\+"\?ouvrir=1"\)<\/script>/);
  assert.equal(html.includes("forms[0].submit"), false);
  assert.match(html, /name="viewport" content="width=device-width, initial-scale=1"/);
  assert.match(html, /<img src="https:\/\/travelba\.fr\/api\/covers\/sejour\/TB-2026-0004\?e=K7MQ2PX4"/);
  assert.match(html, /class="door photo"/);
  assert.match(html, /<p class="lead">Réservation TB-2026-0004<\/p>/);
  assert.equal(html.includes("http-equiv"), false);
  assert.equal(/location\.replace\("https?:/.test(html), false);
  assert.equal(html.includes("/connexion"), false);
  assert.equal(html.includes("noindex"), false);
  assert.equal(html.includes("token"), false);
  assert.equal(html.includes("hashed"), false);
  const bare = entryPreviewHtml("https://travelba.fr", "K7MQ2PX4");
  assert.match(bare, /<title>Le Concierge<\/title>/);
  assert.equal(bare.includes("og:image"), false);
  assert.equal(bare.includes("og-concierge"), false);
  assert.match(bare, /favicon\.ico/);
  const noCover = entryPreviewHtml(
    "https://travelba.fr",
    "K7MQ2PX4",
    stayPreviewCopy({
      origin: "https://travelba.fr",
      reference: "TB-2026-0004",
      place: "Avoriaz",
      hasCover: false,
    })
  );
  assert.match(noCover, /Séjour à Avoriaz/);
  assert.equal(noCover.includes("og:image"), false);
  assert.equal(noCover.includes("<img"), false);
  assert.match(noCover, /class="door plain"/);
  assert.match(bare, /class="door plain"/);
  assert.match(bare, /Votre espace personnel vous attend/);
});

test("le chemin de retour reste interne", () => {
  assert.equal(safeNextPath("/mon-compte"), "/mon-compte");
  assert.equal(safeNextPath("https://evil.example"), "/mon-compte");
  assert.equal(safeNextPath("//evil.example"), "/mon-compte");
  assert.equal(safeNextPath("/\\evil.example"), "/mon-compte");
  assert.equal(safeNextPath("/%5Cevil.example"), "/mon-compte");
});

test("l’e-mail du lien est celui du titulaire, et l’entrée n’ouvre pas la connexion", () => {
  assert.equal(storedEntryEmail("  Benjamin@Travelba.fr "), "benjamin@travelba.fr");
  assert.equal(storedEntryEmail("pas une adresse"), null);
  assert.equal(storedEntryEmail("a@\nb.fr"), null);
  assert.equal(
    entryDestination({
      nextPath: "/mon-compte/reservations/TB-2026-0028",
      otpType: "magiclink",
      staff: false,
      mustSetPassword: false,
    }),
    "/mon-compte/reservations/TB-2026-0028"
  );
  assert.equal(
    entryDestination({
      nextPath: "/connexion?error=auth",
      otpType: "magiclink",
      staff: false,
      mustSetPassword: false,
    }),
    "/mon-compte"
  );
  assert.equal(
    entryDestination({
      nextPath: "/mon-compte",
      otpType: "invite",
      staff: false,
      mustSetPassword: false,
    }),
    "/connexion/mot-de-passe"
  );
  assert.equal(
    entryDestination({
      nextPath: "/admin/little-emperors",
      otpType: "invite",
      staff: true,
      mustSetPassword: true,
    }),
    "/connexion/mot-de-passe"
  );
  const held = entryPreviewHtml("https://travelba.fr", "K7MQ2PX4", null, false);
  assert.equal(held.includes("<script"), false);
  assert.equal(held.includes("Ouvrir mon espace"), false);
  assert.equal(held.includes("<form"), false);
  assert.match(held, /Demandez-en un nouveau à l'agence/);
  // Lien mort : on propose la connexion ordinaire, sans rien d’autre.
  assert.match(held, /<a class="login" href="https:\/\/travelba\.fr\/connexion">Se connecter<\/a>/);
});

test("le lien court vit 24 h en magique, 30 jours en invitation ou réinitialisation", () => {
  const hour = 60 * 60 * 1000;
  assert.equal(entryLinkTtlMs("magiclink"), 24 * hour);
  assert.equal(entryLinkTtlMs("invite"), 30 * 24 * hour);
  assert.equal(entryLinkTtlMs("recovery"), 30 * 24 * hour);
  assert.equal(entryLinkTtlMs(null), 24 * hour);
  assert.equal(entryLinkTtlMs("signup"), 24 * hour);
});

test("une ligne sans expires_at expire 30 jours après sa création", () => {
  const created = "2026-10-01T10:00:00.000Z";
  assert.equal(
    entryLinkExpiresAt({ expires_at: null, created_at: created }).toISOString(),
    "2026-10-31T10:00:00.000Z"
  );
  assert.equal(
    entryLinkExpiresAt({ expires_at: "2026-10-02T10:00:00.000Z", created_at: created }).toISOString(),
    "2026-10-02T10:00:00.000Z"
  );
  assert.equal(entryLinkExpiresAt({}).getTime(), 0);
});

const NOW = new Date("2026-10-04T12:00:00.000Z");
const LATER = new Date("2026-10-05T12:00:00.000Z");
const EARLIER = new Date("2026-10-04T11:59:00.000Z");
const fresh = { now: NOW, expiresAt: LATER, revokedAt: null, openCount: 0, hasSession: false };

test("une session déjà ouverte passe sans consommer le lien, sauf s’il est révoqué", () => {
  assert.equal(entryReopenDecision({ ...fresh, hasSession: true, tokenValid: true }), "session");
  assert.equal(entryReopenDecision({ ...fresh, hasSession: true, tokenValid: false }), "session");
  assert.equal(entryReopenDecision({ ...fresh, hasSession: true, openCount: 9, tokenValid: false }), "session");
  assert.equal(entryReopenDecision({ ...fresh, hasSession: true, expiresAt: EARLIER, tokenValid: false }), "session");
  assert.equal(entryReopenDecision({ ...fresh, hasSession: true, revokedAt: NOW, tokenValid: true }), "refuse");
  assert.equal(entryReopenDecision({ ...fresh, hasSession: true, revokedAt: NOW.toISOString(), tokenValid: false }), "refuse");
});

test("un lien révoqué, expiré ou ouvert cinq fois ne s’ouvre plus, même avec un jeton valable", () => {
  assert.equal(entryReopenDecision({ ...fresh, revokedAt: NOW, tokenValid: true }), "refuse");
  assert.equal(entryReopenDecision({ ...fresh, expiresAt: EARLIER, tokenValid: true }), "refuse");
  assert.equal(entryReopenDecision({ ...fresh, openCount: MAX_ENTRY_OPENS, tokenValid: true }), "refuse");
  assert.equal(entryReopenDecision({ ...fresh, openCount: MAX_ENTRY_OPENS, tokenValid: false }), "refuse");
  assert.equal(entryReopenDecision({ ...fresh, openCount: MAX_ENTRY_OPENS - 1, tokenValid: true }), "open");
  assert.equal(entryReopenDecision({ ...fresh, openCount: null, tokenValid: true }), "open");
});

test("un jeton consommé est régénéré tant que le lien est dans son délai, même longtemps après le premier usage", () => {
  assert.equal(entryReopenDecision({ ...fresh, tokenValid: false }), "regenerate");
  // Scanner d’e-mail à 10 h, vrai client à 12 h : le jeton Supabase a servi, le lien court reste bon.
  assert.equal(entryReopenDecision({ ...fresh, openCount: 1, tokenValid: false }), "regenerate");
  assert.equal(entryReopenDecision({ ...fresh, openCount: MAX_ENTRY_OPENS - 1, tokenValid: false }), "regenerate");
  assert.equal(entryReopenDecision({ ...fresh, expiresAt: EARLIER, tokenValid: false }), "refuse");
  assert.equal(entryReopenDecision({ ...fresh, expiresAt: NOW, tokenValid: false }), "regenerate");
});

test("un lien WhatsApp ouvert par un client vaut opt-in, pas un lien e-mail ni un collègue", () => {
  assert.equal(entryOptInFromLink({ channel: "whatsapp", staff: false }), true);
  assert.equal(entryOptInFromLink({ channel: "whatsapp", staff: true }), false);
  assert.equal(entryOptInFromLink({ channel: "email", staff: false }), false);
  assert.equal(entryOptInFromLink({ channel: null, staff: false }), false);
});

test("la couverture ne se sert qu’à un lien vivant, « Votre séjour », sur sa référence", () => {
  const link = {
    revoked_at: null,
    expires_at: LATER.toISOString(),
    created_at: EARLIER.toISOString(),
    show_cover: true,
    next_path: "/mon-compte/reservations/TB-2026-0004",
  };
  assert.equal(entryCoverAllowed({ link, reference: "TB-2026-0004", now: NOW }), true);
  assert.equal(entryCoverAllowed({ link, reference: "TB-2026-0005", now: NOW }), false);
  assert.equal(entryCoverAllowed({ link: { ...link, show_cover: false }, reference: "TB-2026-0004", now: NOW }), false);
  assert.equal(entryCoverAllowed({ link: { ...link, revoked_at: NOW.toISOString() }, reference: "TB-2026-0004", now: NOW }), false);
  assert.equal(entryCoverAllowed({ link: { ...link, expires_at: EARLIER.toISOString() }, reference: "TB-2026-0004", now: NOW }), false);
  assert.equal(entryCoverAllowed({ link: { ...link, next_path: "/mon-compte" }, reference: "TB-2026-0004", now: NOW }), false);
  assert.equal(entryCoverAllowed({ link: null, reference: "TB-2026-0004", now: NOW }), false);
  const legacy = { ...link, expires_at: null, created_at: "2026-10-01T00:00:00.000Z" };
  assert.equal(entryCoverAllowed({ link: legacy, reference: "TB-2026-0004", now: NOW }), true);
});

test("une colonne absente se reconnaît au code ou au message", () => {
  assert.equal(isMissingColumnError({ code: "42703", message: "column does not exist" }, "expires_at"), true);
  assert.equal(isMissingColumnError({ code: "PGRST204", message: "" }, "expires_at"), true);
  assert.equal(
    isMissingColumnError({ code: null, message: "Could not find the 'expires_at' column" }, "expires_at"),
    true
  );
  assert.equal(isMissingColumnError({ code: "23505", message: "duplicate key" }, "expires_at"), false);
  assert.equal(isMissingColumnError(null, "expires_at"), false);
});

test("desk is an entry channel, other strings are not", () => {
  assert.equal(isEntryChannel("desk"), true);
  assert.equal(isEntryChannel("email"), true);
  assert.equal(isEntryChannel("whatsapp"), true);
  assert.equal(isEntryChannel("sms"), false);
  assert.equal(isEntryChannel(null), false);
});
