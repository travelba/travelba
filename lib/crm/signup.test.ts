import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { roleAllows } from "./agency-access";
import { classifyAgencyRoute } from "./agency-routes";
import {
  clubRenewalDue,
  clubTerm,
  displayedInvitationStatus,
  extractReferralCode,
  hashToken,
  honeypotTripped,
  invitationCanOpen,
  invitationShareText,
  matchingCustomers,
  referralBalance,
  referralShareText,
  planAutoValidation,
  planComplement,
  planRefusal,
  planResubmit,
  planValidation,
  phonesMatch,
  readSignupToken,
  referralAttachable,
  referralCodeFromBytes,
  signSignupToken,
  signupMailCopy,
  signupRateRules,
  signupSmsRequired,
  validateSignupDraft,
  waMeHref,
  whatsappCloudConfigured,
  whatsappInvitationPayload,
  whatsappReferralPayload,
} from "./signup";

const NOW = new Date("2026-11-23T12:00:00Z");

function draft(overrides: Record<string, unknown> = {}) {
  return validateSignupDraft(
    {
      firstName: "Camille",
      lastName: "Morel",
      email: "camille@exemple.fr",
      phone: "06 12 34 56 78",
      birthDate: "1990-04-02",
      heardAbout: "Un proche",
      terms: true,
      privacy: true,
      ...overrides,
    },
    NOW
  );
}

test("le formulaire exige l’identité, la majorité, les conditions et ignore le miel", () => {
  const ok = draft();
  assert.equal(ok.ok, true);
  if (!ok.ok) return;
  assert.equal(ok.value.phone, "+33612345678");
  assert.equal(ok.value.email, "camille@exemple.fr");
  const young = draft({ birthDate: "2015-01-01" });
  assert.equal(young.ok, false);
  if (!young.ok) assert.equal(young.errors.some((error) => error.field === "birthDate"), true);
  const noTerms = draft({ terms: false, privacy: false });
  assert.equal(noTerms.ok, false);
  assert.equal(honeypotTripped("https://spam.test"), true);
  assert.equal(honeypotTripped("  "), false);
  const other = draft({ heardAbout: "Autre", heardAboutDetail: "Un salon" });
  assert.equal(other.ok, true);
  if (other.ok) assert.equal(other.value.heardAbout, "Autre — Un salon");
  const invited = draft({ heardAbout: "" });
  assert.equal(invited.ok, true);
  if (invited.ok) assert.equal(invited.value.heardAbout, "Invitation");
});

test("un code de parrainage se lit dans le champ ou dans le lien", () => {
  assert.equal(extractReferralCode("tba-ab23cd"), "TBA-AB23CD");
  assert.equal(extractReferralCode("https://travelba.fr/inscription?parrain=TBA-AB23CD"), "TBA-AB23CD");
  assert.equal(extractReferralCode("bonjour"), null);
  assert.match(referralCodeFromBytes(Uint8Array.from([0, 1, 2, 3, 4, 5])), /^TBA-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
});

test("le jeton d’invitation est signé, à expiration, et un chiffre changé ne passe pas", () => {
  const secret = "secret-de-test";
  const exp = Math.floor(NOW.getTime() / 1000) + 3600;
  const id = "11111111-1111-4111-8111-111111111111";
  const token = signSignupToken(id, exp, secret);
  const read = readSignupToken(token, secret, NOW.getTime());
  assert.equal(read?.id, id);
  assert.equal(read?.expired, false);
  assert.equal(readSignupToken(token, secret, (exp + 5) * 1000)?.expired, true);
  const forged = token.replace(String(exp), String(exp + 86400));
  assert.equal(readSignupToken(forged, secret, NOW.getTime()), null);
  assert.equal(readSignupToken(token, "autre", NOW.getTime()), null);
  assert.equal(hashToken(token), hashToken(token));
  assert.notEqual(hashToken(token), hashToken(`${token}x`));
});

test("une demande ouverte n’est pas dupliquée, un refus peut recommencer", () => {
  assert.equal(planResubmit(null), "create");
  assert.equal(planResubmit({ status: "brouillon", emailVerified: false }), "refresh");
  assert.equal(planResubmit({ status: "en_attente", emailVerified: true }), "silent");
  assert.equal(planResubmit({ status: "a_completer", emailVerified: true }), "complete");
  assert.equal(planResubmit({ status: "validee", emailVerified: true }), "silent");
  assert.equal(planResubmit({ status: "refusee", emailVerified: true }), "create");
});

test("une fiche correspondante n’est jamais rattachée toute seule", () => {
  const matches = [{ id: "cust-1" }];
  const missing = planValidation({
    status: "en_attente",
    emailVerified: true,
    matches,
    mode: null,
    customerId: null,
  });
  assert.equal(missing.ok, false);
  const wrong = planValidation({
    status: "en_attente",
    emailVerified: true,
    matches,
    mode: "rattacher",
    customerId: "autre",
  });
  assert.equal(wrong.ok, false);
  const attached = planValidation({
    status: "en_attente",
    emailVerified: true,
    matches,
    mode: "rattacher",
    customerId: "cust-1",
  });
  assert.deepEqual(attached, { ok: true, mode: "rattacher", customerId: "cust-1" });
  const created = planValidation({
    status: "en_attente",
    emailVerified: true,
    matches,
    mode: "creer",
    customerId: null,
  });
  assert.equal(created.ok, true);
  if (created.ok) assert.equal(created.mode, "creer");
  const fresh = planValidation({ status: "en_attente", emailVerified: true, matches: [], mode: null });
  assert.equal(fresh.ok, true);
  if (fresh.ok) assert.equal(fresh.mode, "creer");
  assert.equal(
    planValidation({ status: "brouillon", emailVerified: false, matches: [], mode: "creer" }).ok,
    false
  );
});

test("l’auto-validation des invités reste éteinte, et une fiche ambiguë attend", () => {
  assert.equal(
    planAutoValidation({ invitedByStaff: true, enabled: false, matches: [], invitationCustomerId: null }),
    null
  );
  assert.deepEqual(
    planAutoValidation({ invitedByStaff: true, enabled: true, matches: [], invitationCustomerId: null }),
    { mode: "creer", customerId: null }
  );
  assert.equal(
    planAutoValidation({
      invitedByStaff: true,
      enabled: true,
      matches: [{ id: "a" }, { id: "b" }],
      invitationCustomerId: null,
    }),
    null
  );
  assert.deepEqual(
    planAutoValidation({
      invitedByStaff: true,
      enabled: true,
      matches: [{ id: "a" }],
      invitationCustomerId: "a",
    }),
    { mode: "rattacher", customerId: "a" }
  );
});

test("le refus n’écrit au demandeur que si la case est cochée, le complément exige un message", () => {
  const quiet = planRefusal({ status: "en_attente", reason: "Hors zone", notify: false });
  assert.equal(quiet.ok, true);
  if (quiet.ok) assert.equal(quiet.send, "none");
  const told = planRefusal({ status: "en_attente", reason: "Hors zone", notify: true });
  assert.equal(told.ok, true);
  if (told.ok) assert.equal(told.send, "reason");
  assert.equal(planComplement({ status: "en_attente", message: "  " }).ok, false);
  const ask = planComplement({ status: "en_attente", message: "La date de naissance ne correspond pas." });
  assert.equal(ask.ok, true);
  assert.equal(planComplement({ status: "validee", message: "Plus tard" }).ok, false);
});

test("l’invitation expire, le SMS reste éteint sans flag, WhatsApp retombe sur wa.me", () => {
  assert.equal(displayedInvitationStatus({ status: "envoyee", expiresAt: "2020-01-01T00:00:00Z" }, NOW), "expiree");
  assert.equal(displayedInvitationStatus({ status: "demande_deposee", expiresAt: "2020-01-01T00:00:00Z" }, NOW), "demande_deposee");
  assert.equal(invitationCanOpen("ouverte"), true);
  assert.equal(invitationCanOpen("expiree"), false);
  assert.equal(signupSmsRequired({}), false);
  assert.equal(signupSmsRequired({ SIGNUP_SMS_ENABLED: "1" }), false);
  assert.equal(
    signupSmsRequired({
      SIGNUP_SMS_ENABLED: "1",
      TWILIO_ACCOUNT_SID: "AC",
      TWILIO_AUTH_TOKEN: "tok",
      TWILIO_SMS_FROM: "+33100000000",
    }),
    true
  );
  assert.equal(whatsappCloudConfigured({}), false);
  assert.equal(
    whatsappCloudConfigured({
      WHATSAPP_TOKEN: "t",
      WHATSAPP_PHONE_NUMBER_ID: "1",
      WHATSAPP_TEMPLATE_INVITATION: "invitation_inscription",
    }),
    true
  );
  const text = invitationShareText({ firstName: "Camille", link: "https://travelba.fr/inscription/i/abc", expiresLabel: "7 décembre 2026" });
  assert.match(text, /Travel Club TBA/);
  assert.match(text, /Platinum/);
  assert.match(text, /nominative/);
  assert.doesNotMatch(text, /1 600|gestionnaire|Benjamin/);
  const parrain = referralShareText({
    guestFirstName: "Léa",
    referrerFirstName: "Camille",
    link: "https://travelba.fr/inscription/i/abc",
    expiresLabel: "7 décembre 2026",
  });
  assert.match(parrain, /Camille vous a recommandé/);
  assert.doesNotMatch(parrain, /1 600|gestionnaire|Benjamin/);
  const term = clubTerm(NOW);
  assert.equal(term.rank, "platinum");
  assert.equal(term.startedOn, "2026-11-23");
  assert.equal(term.endsOn, "2027-11-23");
  assert.equal(clubRenewalDue("2026-12-01", NOW), true);
  assert.equal(clubRenewalDue("2027-11-23", NOW), false);
  assert.deepEqual(referralBalance({ mode: "envoi", sent: 3, validated: 1 }), {
    cap: 10,
    used: 3,
    remaining: 7,
    blocked: false,
    mode: "envoi",
  });
  assert.equal(referralBalance({ mode: "envoi", sent: 10, validated: 0 }).blocked, true);
  assert.equal(referralBalance({ mode: "validee", sent: 10, validated: 2 }).remaining, 8);
  assert.equal(referralBalance({ mode: "validee", sent: 1, validated: 10 }).blocked, true);
  assert.match(waMeHref("+33612345678", text), /^https:\/\/wa\.me\/33612345678\?text=/);
  const payload = whatsappInvitationPayload({
    to: "+33612345678",
    template: "invitation_inscription",
    lang: "fr",
    firstName: "Camille",
    expiresLabel: "7 décembre 2026",
    token: "abc",
  });
  assert.equal(payload.template.name, "invitation_inscription");
  assert.equal(payload.template.components[1].parameters[0].text, "abc");
  const referralPayload = whatsappReferralPayload({
    to: "+33612345678",
    template: "invitation_parrainage",
    lang: "fr",
    guestFirstName: "Léa",
    referrerFirstName: "Camille",
    expiresLabel: "7 décembre 2026",
    token: "abc",
  });
  assert.equal(referralPayload.template.components[0].parameters[1].text, "Camille");
  assert.equal(referralPayload.template.components[0].parameters.length, 3);
});

test("le parrain n’est pas le demandeur, et le téléphone se compare sur les neuf derniers chiffres", () => {
  assert.equal(phonesMatch("+33 6 12 34 56 78", "0612345678"), true);
  assert.equal(phonesMatch("+33600000000", "+33611111111"), false);
  assert.equal(
    referralAttachable({ code: "TBA-AB23CD", referrerEmail: "ami@exemple.fr", applicantEmail: "camille@exemple.fr" }),
    true
  );
  assert.equal(
    referralAttachable({ code: "TBA-AB23CD", referrerEmail: "Camille@exemple.fr", applicantEmail: "camille@exemple.fr" }),
    false
  );
  const hits = matchingCustomers(
    { email: "camille@exemple.fr", phone: "+33612345678" },
    [
      { id: "1", email: "autre@exemple.fr", phone: "06 12 34 56 78" },
      { id: "2", email: "loin@exemple.fr", phone: "+33600000000" },
    ]
  );
  assert.deepEqual(hits.map((hit) => hit.id), ["1"]);
});

test("les e-mails sont en français et le refus sans case n’a pas de motif à envoyer", () => {
  const received = signupMailCopy("received", { firstName: "Camille" });
  assert.match(received.paragraphs.join(" "), /Travel Club TBA/);
  assert.match(received.paragraphs.join(" "), /nominative/);
  assert.doesNotMatch(received.paragraphs.join(" "), /1 600|gestionnaire/);
  const accepted = signupMailCopy("validated", { firstName: "Camille" });
  assert.match(accepted.paragraphs.join(" "), /Platinum/);
  assert.doesNotMatch(accepted.paragraphs.join(" "), /1 600|gestionnaire/);
  const refused = signupMailCopy("refused", { firstName: "Camille", message: "Hors zone" });
  assert.match(refused.paragraphs.join(" "), /Hors zone/);
  const rules = signupRateRules("203.0.113.5", "camille@exemple.fr");
  assert.equal(rules.length, 2);
  assert.equal(rules[0].limit, 8);
  assert.notEqual(rules[0].key, rules[1].key);
});

test("la file est un droit à part, fermé pour l’agent, et la migration pose la RLS", () => {
  assert.equal(roleAllows("admin", "review_signups"), true);
  assert.equal(roleAllows("manager", "review_signups"), false);
  assert.equal(roleAllows("agent", "review_signups"), false);
  assert.equal(roleAllows("manager", "review_signups", { manager: { review_signups: true } }), true);
  const classified = classifyAgencyRoute("POST", "/api/admin/inscriptions/11111111-1111-4111-8111-111111111111");
  assert.equal(classified?.permission, "review_signups");
  assert.equal(classifyAgencyRoute("GET", "/api/admin/inscriptions")?.permission, "review_signups");
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261123210000_signup_requests.sql"), "utf8");
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on table public\.crm_signup_requests from public, anon, authenticated/);
  assert.match(sql, /crm_signup_requests_staff/);
  assert.match(sql, /customer_id = crm_private\.customer_id\(\)/);
  assert.doesNotMatch(sql, /for insert/);
  assert.match(sql, /signup_completed_at n'est pas posé|signup_completed_at n’est pas posé/);
});
