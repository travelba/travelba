import "server-only";

import { randomInt } from "node:crypto";
import { productionOnlySecret } from "@/lib/crm/preview-secrets";
import { getPortalAccess, inviteCustomer } from "@/lib/crm/invite";
import { rateLimit, requestIp } from "@/lib/crm/rate-limit";
import { siteConfig } from "@/lib/site";
import { createServiceClient } from "@/lib/supabase/admin";
import type { CrmCustomer } from "@/lib/crm/types";
import { adminSignupEmailHtml, signupEmailHtml } from "./signup-mail";
import {
  displayedInvitationStatus,
  extractReferralCode,
  hashToken,
  invitationCanOpen,
  invitationShareText,
  invitationUrl,
  expiresLabel,
  matchingCustomers,
  newOpaqueToken,
  newReferralCode,
  normalizeEmail,
  normalizePhone,
  planAutoValidation,
  planComplement,
  planRefusal,
  planResubmit,
  planValidation,
  phonesMatch,
  readSignupToken,
  referralAttachable,
  clubShareText,
  clubRenewalTerm,
  clubTerm,
  referralBalance,
  referralCountMode,
  referralShareText,
  referralUrl,
  TRAVEL_CLUB_NAME,
  signSignupToken,
  signupLinkSecret,
  signupRateRules,
  signupSmsRequired,
  smsRateRule,
  INVITATION_TTL_MS,
  EMAIL_TOKEN_TTL_MS,
  SMS_CODE_TTL_MS,
  waMeHref,
  whatsappCloudConfigured,
  whatsappInvitationPayload,
  whatsappReferralConfigured,
  whatsappReferralPayload,
  type CustomerHit,
  type ReferralCountMode,
  type SignupDraft,
  type SignupStatus,
} from "./signup";

type DbError = { code?: string; message?: string } | null;
type QueryResult<T> = { data: T; error: DbError };

// Le client service role. Les filtres restent ceux de supabase-js.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any; rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<QueryResult<any>> };

export class SignupError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function db(): Db {
  return createServiceClient() as unknown as Db;
}

function missingRelation(error: DbError) {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || /crm_signup_|crm_referral_/.test(error.message || "");
}

function fail(error: DbError, fallback: string): never {
  if (missingRelation(error)) throw new SignupError("L’inscription n’est pas encore ouverte.", 503);
  throw new SignupError(fallback, 500);
}

async function sendMail(to: string[], subject: string, html: string) {
  const apiKey = productionOnlySecret(process.env.RESEND_API_KEY);
  const recipients = [...new Set(to.map((item) => item.trim().toLowerCase()).filter(Boolean))];
  if (!apiKey || recipients.length === 0) return false;
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const from = process.env.CONTACT_FROM_EMAIL || "onboarding@resend.dev";
    const { error } = await resend.emails.send({
      from: `${siteConfig.name} <${from}>`,
      to: recipients,
      replyTo: siteConfig.contactEmail,
      subject,
      html,
    });
    if (error) {
      console.error("[inscription] e-mail non envoyé");
      return false;
    }
    return true;
  } catch {
    console.error("[inscription] e-mail non envoyé");
    return false;
  }
}

async function adminRecipients(client: Db) {
  const { data } = await client.from("crm_staff").select("email, role, active").eq("role", "admin");
  const rows = (data || []) as { email?: string | null; active?: boolean | null }[];
  const emails = rows.filter((row) => row.active !== false && row.email).map((row) => String(row.email));
  const extra = (process.env.CONTACT_TO_EMAIL || "").trim();
  if (extra) emails.push(extra);
  return emails;
}

async function notifyAdmins(client: Db, name: string, requestId: string, origin: string) {
  const mail = adminSignupEmailHtml({ name, href: `${origin}/admin/inscriptions/${requestId}` });
  await sendMail(await adminRecipients(client), mail.subject, mail.html);
}

async function customerHits(client: Db, email: string, phone: string): Promise<CustomerHit[]> {
  const rpc = await client.rpc("crm_signup_customer_hits", { p_email: email, p_phone: phone });
  if (!rpc.error && Array.isArray(rpc.data)) {
    return (rpc.data as CustomerHit[]).filter((row) => row?.id);
  }
  const byEmail = await client.from("crm_customers").select("id, email, phone").eq("email", email);
  if (byEmail.error) return [];
  return matchingCustomers({ email, phone }, (byEmail.data || []) as CustomerHit[]);
}

type RequestRow = {
  id: string;
  status: SignupStatus;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  birth_date: string;
  travel_preferences: string | null;
  heard_about: string;
  referral_raw: string | null;
  referral_code: string | null;
  email_verified_at: string | null;
  phone_verified_at: string | null;
  email_token_hash: string | null;
  email_token_expires_at: string | null;
  sms_code_hash: string | null;
  sms_code_expires_at: string | null;
  sms_attempts: number;
  view_token_hash: string | null;
  invitation_id: string | null;
  invited_by_staff: boolean;
  customer_id: string | null;
  link_mode: string | null;
  refusal_reason: string | null;
  complement_message: string | null;
  terms_accepted_at: string;
  created_at: string;
  submitted_at: string | null;
};

const REQUEST_COLUMNS =
  "id, status, first_name, last_name, email, phone, birth_date, travel_preferences, heard_about, referral_raw, referral_code, email_verified_at, phone_verified_at, email_token_hash, email_token_expires_at, sms_code_hash, sms_code_expires_at, sms_attempts, view_token_hash, invitation_id, invited_by_staff, customer_id, link_mode, refusal_reason, complement_message, terms_accepted_at, created_at, submitted_at";

async function latestOpen(client: Db, email: string): Promise<RequestRow | null> {
  const { data, error } = await client
    .from("crm_signup_requests")
    .select(REQUEST_COLUMNS)
    .eq("email", email)
    .in("status", ["brouillon", "en_attente", "a_completer", "validee"])
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) fail(error, "La demande n’a pas pu être enregistrée.");
  return ((data || [])[0] as RequestRow | undefined) ?? null;
}

async function loadRequest(client: Db, id: string): Promise<RequestRow> {
  const { data, error } = await client.from("crm_signup_requests").select(REQUEST_COLUMNS).eq("id", id).maybeSingle();
  if (error) fail(error, "Demande introuvable.");
  if (!data) throw new SignupError("Demande introuvable.", 404);
  return data as RequestRow;
}

type InvitationRow = {
  id: string;
  token_hash: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  customer_id: string | null;
  status: string;
  expires_at: string;
  kind?: string | null;
  referrer_customer_id?: string | null;
};

async function invitationFromToken(client: Db, token: string): Promise<InvitationRow | null> {
  const secret = signupLinkSecret(process.env);
  const parsed = readSignupToken(token, secret);
  if (!parsed) return null;
  const { data, error } = await client
    .from("crm_signup_invitations")
    .select("id, token_hash, first_name, last_name, phone, email, customer_id, status, expires_at, kind, referrer_customer_id")
    .eq("id", parsed.id)
    .maybeSingle();
  if (error) fail(error, "Cette invitation ne s’ouvre pas.");
  if (!data) return null;
  const row = data as InvitationRow;
  if (row.token_hash !== hashToken(token)) return null;
  return row;
}

async function bindReferral(client: Db, requestId: string, draft: SignupDraft, invitation?: InvitationRow | null) {
  const fromInvite = invitation?.kind === "parrainage" ? invitation.referrer_customer_id : null;
  let referrerId = fromInvite || "";
  let code = draft.referralCode || "";
  if (!referrerId && draft.referralCode) {
    const { data } = await client.from("crm_referral_codes").select("customer_id, code").eq("code", draft.referralCode).maybeSingle();
    const codeRow = data as { customer_id?: string; code?: string } | null;
    referrerId = codeRow?.customer_id || "";
    code = codeRow?.code || draft.referralCode;
  }
  if (!referrerId) return;
  const referrer = await client.from("crm_customers").select("email, first_name").eq("id", referrerId).maybeSingle();
  const referrerEmail = (referrer.data as { email?: string } | null)?.email ?? null;
  if (!fromInvite && !referralAttachable({ code, referrerEmail, applicantEmail: draft.email })) return;
  const existing = await client.from("crm_referrals").select("id").eq("request_id", requestId).limit(1);
  if ((existing.data || []).length) return;
    if (!fromInvite) {
    const balance = await readReferralBalance(client, referrerId);
    if (balance.blocked) return;
    if (balance.mode === "envoi") {
      const marked = await client.from("crm_signup_invitations").insert({
        token_hash: hashToken(newOpaqueToken()),
        first_name: draft.firstName,
        last_name: draft.lastName,
        phone: draft.phone,
        status: "demande_deposee",
        expires_at: new Date().toISOString(),
        channel: "wa_me",
        kind: "parrainage",
        referrer_customer_id: referrerId,
        submitted_at: new Date().toISOString(),
        sent_at: new Date().toISOString(),
      });
      if (marked.error) return;
    }
  }
  if (!code) {
    const owned = await ensureReferralCode(client, referrerId);
    code = owned || TRAVEL_CLUB_NAME;
  }
  await client.from("crm_referrals").insert({
    referrer_customer_id: referrerId,
    request_id: requestId,
    code,
    status: "en_attente",
  });
}

async function readReferralBalance(client: Db, customerId: string) {
  const settings = await client.from("crm_signup_settings").select("referral_count_mode").eq("id", 1).maybeSingle();
  const mode = referralCountMode((settings.data as { referral_count_mode?: string } | null)?.referral_count_mode);
  const sentQuery = await client
    .from("crm_signup_invitations")
    .select("id", { count: "exact", head: true })
    .eq("referrer_customer_id", customerId)
    .eq("kind", "parrainage");
  const validQuery = await client
    .from("crm_referrals")
    .select("id", { count: "exact", head: true })
    .eq("referrer_customer_id", customerId)
    .eq("status", "valide");
  if (sentQuery.error && (sentQuery.error.code === "42703" || sentQuery.error.code === "42P01")) {
    return referralBalance({ mode, sent: 0, validated: 0 });
  }
  return referralBalance({
    mode,
    sent: sentQuery.count || 0,
    validated: validQuery.count || 0,
  });
}

async function grantClubMembership(client: Db, customerId: string) {
  const current = await client.from("crm_customers").select("club_started_on").eq("id", customerId).maybeSingle();
  if (current.error) return;
  if ((current.data as { club_started_on?: string | null } | null)?.club_started_on) return;
  const term = clubTerm(new Date());
  await client
    .from("crm_customers")
    .update({ club_rank: term.rank, club_started_on: term.startedOn, club_ends_on: term.endsOn })
    .eq("id", customerId);
}

export async function renewClubMembership(customerId: string) {
  const client = db();
  const current = await client.from("crm_customers").select("club_ends_on, club_started_on").eq("id", customerId).maybeSingle();
  if (current.error) fail(current.error, "L’adhésion n’a pas pu être lue.");
  const row = current.data as { club_ends_on?: string | null; club_started_on?: string | null } | null;
  const next = clubRenewalTerm(row?.club_ends_on);
  const { error } = await client
    .from("crm_customers")
    .update({
      club_rank: "platinum",
      club_started_on: next.startedOn || row?.club_started_on || next.endsOn,
      club_ends_on: next.endsOn,
    })
    .eq("id", customerId);
  if (error) fail(error, "Le renouvellement n’a pas été enregistré.");
  return { endsOn: next.endsOn, startedOn: next.startedOn || row?.club_started_on || null };
}

async function ensureReferralCode(client: Db, customerId: string) {
  const current = await client.from("crm_referral_codes").select("code").eq("customer_id", customerId).maybeSingle();
  const existing = (current.data as { code?: string } | null)?.code;
  if (existing) return existing;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const code = newReferralCode();
    const inserted = await client.from("crm_referral_codes").insert({ customer_id: customerId, code });
    if (!inserted.error) return code;
    if (inserted.error.code !== "23505") return null;
    const again = await client.from("crm_referral_codes").select("code").eq("customer_id", customerId).maybeSingle();
    const found = (again.data as { code?: string } | null)?.code;
    if (found) return found;
  }
  return null;
}

async function markReferralValidated(client: Db, requestId: string, customerId: string) {
  await client
    .from("crm_referrals")
    .update({ status: "valide", referred_customer_id: customerId, validated_at: new Date().toISOString() })
    .eq("request_id", requestId)
    .eq("status", "en_attente");
}

function draftPatch(draft: SignupDraft, now: string) {
  return {
    first_name: draft.firstName,
    last_name: draft.lastName,
    email: draft.email,
    phone: draft.phone,
    birth_date: draft.birthDate,
    travel_preferences: draft.travelPreferences || null,
    heard_about: draft.heardAbout,
    referral_raw: draft.referralRaw || null,
    referral_code: draft.referralCode,
    terms_accepted_at: now,
    privacy_accepted_at: now,
  };
}

export async function submitSignup(input: { draft: SignupDraft; origin: string; invitationToken?: string | null; ip: string }) {
  const client = db();
  const allowed = await rateLimitAllSafe(signupRateRules(input.ip, input.draft.email));
  if (!allowed) throw new SignupError("Trop de demandes. Réessayez plus tard.", 429);

  let invitation: InvitationRow | null = null;
  if (input.invitationToken) {
    invitation = await invitationFromToken(client, input.invitationToken);
    if (!invitation) throw new SignupError("Ce lien d’invitation n’est pas valable.", 400);
    const shown = displayedInvitationStatus({ status: invitation.status, expiresAt: invitation.expires_at });
    if (!invitationCanOpen(shown)) {
      throw new SignupError(shown === "expiree" ? "Ce lien a expiré." : "Ce lien a déjà été utilisé.", 400);
    }
    if (!phonesMatch(invitation.phone, input.draft.phone)) {
      throw new SignupError("Ce lien ne correspond pas à ce numéro.", 400);
    }
  }

  const now = new Date().toISOString();
  const emailToken = newOpaqueToken();
  const viewToken = newOpaqueToken();
  const existing = await latestOpen(client, input.draft.email);
  const plan = planResubmit(existing ? { status: existing.status, emailVerified: Boolean(existing.email_verified_at) } : null);

  if (plan === "silent") {
    return { ok: true as const, viewToken: null as string | null };
  }

  const tokenPatch = {
    email_token_hash: hashToken(emailToken),
    email_token_expires_at: new Date(Date.now() + EMAIL_TOKEN_TTL_MS).toISOString(),
    view_token_hash: hashToken(viewToken),
    invitation_id: invitation?.id ?? existing?.invitation_id ?? null,
    invited_by_staff:
      (Boolean(invitation) && invitation?.kind !== "parrainage") || existing?.invited_by_staff === true,
  };

  let requestId = existing?.id || "";
  if (plan === "create" || !existing) {
    const inserted = await client
      .from("crm_signup_requests")
      .insert({ ...draftPatch(input.draft, now), ...tokenPatch, status: "brouillon" })
      .select("id")
      .single();
    if (inserted.error || !inserted.data) fail(inserted.error, "La demande n’a pas pu être enregistrée.");
    requestId = (inserted.data as { id: string }).id;
  } else {
    const status = plan === "complete" && existing.email_verified_at ? "en_attente" : "brouillon";
    const updated = await client
      .from("crm_signup_requests")
      .update({
        ...draftPatch(input.draft, now),
        ...(existing.email_verified_at ? { view_token_hash: hashToken(viewToken) } : tokenPatch),
        status,
        submitted_at: status === "en_attente" ? now : existing.submitted_at,
      })
      .eq("id", existing.id);
    if (updated.error) fail(updated.error, "La demande n’a pas pu être enregistrée.");
    requestId = existing.id;
    if (existing.email_verified_at && status === "en_attente") {
      await bindReferral(client, requestId, input.draft, invitation);
      await notifyAdmins(client, `${input.draft.firstName} ${input.draft.lastName}`, requestId, input.origin);
      const received = signupEmailHtml("received", { firstName: input.draft.firstName });
      await sendMail([input.draft.email], received.subject, received.html);
      await maybeAutoValidate(client, requestId, input.origin);
      return { ok: true as const, viewToken };
    }
  }

  await bindReferral(client, requestId, input.draft, invitation);
  if (invitation) {
    await client
      .from("crm_signup_invitations")
      .update({ status: "demande_deposee", submitted_at: now })
      .eq("id", invitation.id);
  }
  const verify = signupEmailHtml("verify", {
    firstName: input.draft.firstName,
    link: `${input.origin}/inscription/verifier?t=${emailToken}`,
  });
  await sendMail([input.draft.email], verify.subject, verify.html);
  return { ok: true as const, viewToken };
}

async function rateLimitAllSafe(rules: { key: string; limit: number; windowSeconds: number }[]) {
  const results = await Promise.all(rules.map((rule) => rateLimit(rule)));
  return results.every(Boolean);
}

async function maybeAutoValidate(client: Db, requestId: string, origin: string) {
  const row = await loadRequest(client, requestId);
  const settings = await client.from("crm_signup_settings").select("auto_validate_invited").eq("id", 1).maybeSingle();
  const enabled = (settings.data as { auto_validate_invited?: boolean } | null)?.auto_validate_invited === true;
  const hits = await customerHits(client, row.email, row.phone);
  let invitationCustomerId: string | null = null;
  if (row.invitation_id) {
    const invitation = await client.from("crm_signup_invitations").select("customer_id").eq("id", row.invitation_id).maybeSingle();
    invitationCustomerId = (invitation.data as { customer_id?: string | null } | null)?.customer_id ?? null;
  }
  const auto = planAutoValidation({
    invitedByStaff: row.invited_by_staff,
    enabled,
    matches: hits,
    invitationCustomerId,
  });
  if (!auto) return;
  await applyValidation(client, row, { mode: auto.mode, customerId: auto.customerId, staffId: null, origin, hits });
}

async function applyValidation(
  client: Db,
  row: RequestRow,
  input: { mode?: "rattacher" | "creer" | null; customerId: string | null; staffId: string | null; origin: string; hits: CustomerHit[] }
) {
  const plan = planValidation({
    status: row.status,
    emailVerified: Boolean(row.email_verified_at),
    matches: input.hits,
    mode: input.mode,
    customerId: input.customerId,
  });
  if (!plan.ok) throw new SignupError(plan.error, 400);

  let customerId = plan.customerId;
  if (plan.mode === "creer") {
    const inserted = await client
      .from("crm_customers")
      .insert({
        email: row.email,
        first_name: row.first_name,
        last_name: row.last_name,
        phone: row.phone,
        birth_date: row.birth_date,
        language: "fr",
        signup_terms_at: row.terms_accepted_at,
        phone_verified_at: row.phone_verified_at,
      })
      .select("*")
      .single();
    if (inserted.error?.code === "23505") {
      throw new SignupError("Cette adresse est déjà une fiche. Rattachez la demande.", 409);
    }
    if (inserted.error || !inserted.data) fail(inserted.error, "La fiche n’a pas pu être créée.");
    customerId = (inserted.data as { id: string }).id;
  } else if (customerId) {
    const current = await client.from("crm_customers").select("birth_date, phone, phone_verified_at").eq("id", customerId).maybeSingle();
    const fiche = current.data as { birth_date?: string | null; phone?: string | null; phone_verified_at?: string | null } | null;
    await client
      .from("crm_customers")
      .update({
        signup_terms_at: row.terms_accepted_at,
        birth_date: fiche?.birth_date || row.birth_date,
        phone_verified_at: fiche?.phone_verified_at || row.phone_verified_at,
        ...(fiche?.phone ? {} : { phone: row.phone }),
      })
      .eq("id", customerId);
  }
  if (!customerId) throw new SignupError("La fiche n’a pas pu être ouverte.", 500);
  await grantClubMembership(client, customerId);

  const now = new Date().toISOString();
  const updated = await client
    .from("crm_signup_requests")
    .update({
      status: "validee",
      customer_id: customerId,
      link_mode: plan.mode,
      reviewed_by: input.staffId,
      reviewed_at: now,
    })
    .eq("id", row.id)
    .in("status", ["en_attente", "a_completer"]);
  if (updated.error) fail(updated.error, "La validation n’a pas été enregistrée.");

  await ensureReferralCode(client, customerId);
  await markReferralValidated(client, row.id, customerId);

  const loaded = await client.from("crm_customers").select("*").eq("id", customerId).maybeSingle();
  const customer = loaded.data as CrmCustomer | null;
  let inviteWarning = "";
  if (customer) {
    try {
      const access = await getPortalAccess(customer);
      if (access.status === "none") await inviteCustomer(customer, input.origin);
    } catch {
      inviteWarning = "La fiche est ouverte. L’invitation n’est pas partie : renvoyez-la depuis la fiche.";
    }
  }
  const accepted = signupEmailHtml("validated", { firstName: row.first_name });
  await sendMail([row.email], accepted.subject, accepted.html);
  try {
    const { sendCustomerPush } = await import("./push-notices");
    await sendCustomerPush({
      customerId,
      kind: "messages",
      title: "Demande acceptée",
      body: "L’agence a validé votre inscription.",
      url: "/mon-compte",
      idempotencyKey: `signup-validee:${row.id}`,
    });
  } catch {
    console.error("[inscription] notification");
  }
  return { customerId, inviteWarning };
}

export async function verifySignupEmail(token: string, origin: string) {
  const client = db();
  const hashed = hashToken(token);
  const { data, error } = await client
    .from("crm_signup_requests")
    .select(REQUEST_COLUMNS)
    .eq("email_token_hash", hashed)
    .maybeSingle();
  if (error) fail(error, "Ce lien n’est pas valable.");
  const row = data as RequestRow | null;
  if (!row) throw new SignupError("Ce lien n’est pas valable.", 400);
  if (row.email_token_expires_at && Date.parse(row.email_token_expires_at) <= Date.now()) {
    throw new SignupError("Ce lien a expiré. Déposez à nouveau la demande.", 400);
  }
  const viewToken = newOpaqueToken();
  const now = new Date().toISOString();
  const sms = signupSmsRequired(process.env) && !row.phone_verified_at;
  const nextStatus = sms ? "brouillon" : row.status === "validee" ? "validee" : "en_attente";
  const updated = await client
    .from("crm_signup_requests")
    .update({
      email_verified_at: row.email_verified_at || now,
      email_token_hash: null,
      email_token_expires_at: null,
      view_token_hash: hashToken(viewToken),
      status: nextStatus,
      submitted_at: nextStatus === "en_attente" ? row.submitted_at || now : row.submitted_at,
    })
    .eq("id", row.id);
  if (updated.error) fail(updated.error, "La confirmation n’a pas été enregistrée.");
  if (nextStatus === "en_attente" && row.status !== "en_attente") {
    const received = signupEmailHtml("received", { firstName: row.first_name });
    await sendMail([row.email], received.subject, received.html);
    await notifyAdmins(client, `${row.first_name} ${row.last_name}`, row.id, origin);
    await maybeAutoValidate(client, row.id, origin);
  }
  return { viewToken, sms };
}

export async function sendSignupSms(viewToken: string) {
  if (!signupSmsRequired(process.env)) throw new SignupError("La vérification par SMS n’est pas activée.", 400);
  const client = db();
  const row = await requestByView(client, viewToken);
  if (!row.email_verified_at) throw new SignupError("Confirmez d’abord l’adresse e-mail.", 400);
  if (row.phone_verified_at) return { ok: true as const };
  const allowed = await rateLimit(smsRateRule(row.phone));
  if (!allowed) throw new SignupError("Trop de codes. Réessayez plus tard.", 429);
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const updated = await client
    .from("crm_signup_requests")
    .update({
      sms_code_hash: hashToken(code),
      sms_code_expires_at: new Date(Date.now() + SMS_CODE_TTL_MS).toISOString(),
      sms_attempts: 0,
    })
    .eq("id", row.id);
  if (updated.error) fail(updated.error, "Le code n’a pas pu être préparé.");
  const sent = await sendTwilioSms(row.phone, `TravelBA : votre code est ${code}. Il expire dans 10 minutes.`);
  if (!sent) throw new SignupError("Le SMS n’a pas pu partir.", 502);
  return { ok: true as const };
}

export async function confirmSignupSms(viewToken: string, code: string, origin: string) {
  if (!signupSmsRequired(process.env)) throw new SignupError("La vérification par SMS n’est pas activée.", 400);
  const client = db();
  const row = await requestByView(client, viewToken);
  if (row.phone_verified_at) return { ok: true as const };
  if ((row.sms_attempts || 0) >= 5) throw new SignupError("Trop de tentatives. Demandez un nouveau code.", 429);
  const expires = row.sms_code_expires_at ? Date.parse(row.sms_code_expires_at) : 0;
  const matches = row.sms_code_hash && hashToken(code.trim()) === row.sms_code_hash && expires > Date.now();
  if (!matches) {
    await client.from("crm_signup_requests").update({ sms_attempts: (row.sms_attempts || 0) + 1 }).eq("id", row.id);
    throw new SignupError("Ce code n’est pas le bon.", 400);
  }
  const now = new Date().toISOString();
  await client
    .from("crm_signup_requests")
    .update({
      phone_verified_at: now,
      sms_code_hash: null,
      sms_code_expires_at: null,
      status: "en_attente",
      submitted_at: row.submitted_at || now,
    })
    .eq("id", row.id);
  const received = signupEmailHtml("received", { firstName: row.first_name });
  await sendMail([row.email], received.subject, received.html);
  await notifyAdmins(client, `${row.first_name} ${row.last_name}`, row.id, origin);
  await maybeAutoValidate(client, row.id, origin);
  return { ok: true as const };
}

async function requestByView(client: Db, viewToken: string) {
  const { data, error } = await client
    .from("crm_signup_requests")
    .select(REQUEST_COLUMNS)
    .eq("view_token_hash", hashToken(viewToken))
    .maybeSingle();
  if (error) fail(error, "Demande introuvable.");
  if (!data) throw new SignupError("Demande introuvable.", 404);
  return data as RequestRow;
}

async function sendTwilioSms(phone: string, body: string) {
  const sid = productionOnlySecret(process.env.TWILIO_ACCOUNT_SID);
  const token = productionOnlySecret(process.env.TWILIO_AUTH_TOKEN);
  const from = (process.env.TWILIO_SMS_FROM || "").trim();
  if (!sid || !token || !from) return false;
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: phone, From: from, Body: body }),
  });
  return response.ok;
}

export async function readSignupStatus(viewToken: string) {
  const client = db();
  try {
    const row = await requestByView(client, viewToken);
    return publicStatus(row);
  } catch (error) {
    if (error instanceof SignupError && error.status === 503) return null;
    if (error instanceof SignupError && error.status === 404) return null;
    throw error;
  }
}

function publicStatus(row: RequestRow) {
  const smsPending = signupSmsRequired(process.env) && Boolean(row.email_verified_at) && !row.phone_verified_at && row.status === "brouillon";
  return {
    firstName: row.first_name,
    status: row.status,
    emailVerified: Boolean(row.email_verified_at),
    smsPending,
    complement: row.status === "a_completer" ? row.complement_message : null,
  };
}

export async function listSignupQueue(status?: string | null) {
  const client = db();
  let query = client
    .from("crm_signup_requests")
    .select("id, status, first_name, last_name, email, phone, heard_about, invited_by_staff, referral_code, created_at, submitted_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (status && ["brouillon", "en_attente", "a_completer", "validee", "refusee"].includes(status)) {
    query = query.eq("status", status);
  }
  const { data, error } = await query;
  if (error) {
    if (missingRelation(error)) return { ready: false as const, rows: [] };
    throw new SignupError("La file n’a pas pu être lue.", 500);
  }
  let settings = await client.from("crm_signup_settings").select("auto_validate_invited, referral_count_mode").eq("id", 1).maybeSingle();
  if (settings.error?.code === "42703" || settings.error?.code === "PGRST204") {
    settings = await client.from("crm_signup_settings").select("auto_validate_invited").eq("id", 1).maybeSingle();
  }
  const invitations = await client
    .from("crm_signup_invitations")
    .select("id, first_name, last_name, phone, status, expires_at, channel, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  return {
    ready: true as const,
    rows: (data || []) as {
      id: string;
      status: SignupStatus;
      first_name: string;
      last_name: string;
      email: string;
      phone: string;
      heard_about: string;
      invited_by_staff: boolean;
      referral_code: string | null;
      created_at: string;
      submitted_at: string | null;
    }[],
    autoValidate: (settings.data as { auto_validate_invited?: boolean } | null)?.auto_validate_invited === true,
    referralCountMode: referralCountMode((settings.data as { referral_count_mode?: string } | null)?.referral_count_mode),
    invitations: ((invitations.data || []) as { id: string; first_name: string; last_name: string; phone: string; status: string; expires_at: string; channel: string; created_at: string }[]).map(
      (row) => ({ ...row, shown: displayedInvitationStatus({ status: row.status, expiresAt: row.expires_at }) })
    ),
  };
}

export async function readSignupAdmin(id: string) {
  const client = db();
  let row: RequestRow;
  try {
    row = await loadRequest(client, id);
  } catch (error) {
    if (error instanceof SignupError && error.status === 503) return { ready: false as const };
    throw error;
  }
  const hits = await customerHits(client, row.email, row.phone);
  const detailed = await Promise.all(
    hits.map(async (hit) => {
      const fiche = await client.from("crm_customers").select("id, first_name, last_name, email, phone").eq("id", hit.id).maybeSingle();
      return (fiche.data as { id: string; first_name: string; last_name: string; email: string | null; phone: string | null } | null) || null;
    })
  );
  let referrer: { id: string; first_name: string; last_name: string; code: string } | null = null;
  if (row.referral_code) {
    const code = await client.from("crm_referral_codes").select("customer_id, code").eq("code", row.referral_code).maybeSingle();
    const owner = (code.data as { customer_id?: string; code?: string } | null)?.customer_id;
    if (owner) {
      const person = await client.from("crm_customers").select("id, first_name, last_name").eq("id", owner).maybeSingle();
      const named = person.data as { id: string; first_name: string; last_name: string } | null;
      if (named) referrer = { ...named, code: row.referral_code };
    }
  }
  return {
    ready: true as const,
    request: row,
    matches: detailed.filter((item): item is NonNullable<typeof item> => Boolean(item)),
    referrer,
    referralKnown: Boolean(referrer),
    referralRaw: row.referral_raw,
  };
}

export async function reviewSignup(input: {
  id: string;
  action: "valider" | "refuser" | "completer";
  mode?: "rattacher" | "creer" | null;
  customerId?: string | null;
  reason?: string | null;
  notify?: boolean;
  message?: string | null;
  staffId: string;
  origin: string;
}) {
  const client = db();
  const row = await loadRequest(client, input.id);
  if (input.action === "valider") {
    const hits = await customerHits(client, row.email, row.phone);
    const result = await applyValidation(client, row, {
      mode: input.mode === "rattacher" || input.mode === "creer" ? input.mode : null,
      customerId: input.customerId || null,
      staffId: input.staffId,
      origin: input.origin,
      hits,
    });
    return { ok: true as const, ...result };
  }
  if (input.action === "refuser") {
    const plan = planRefusal({ status: row.status, reason: input.reason, notify: input.notify === true });
    if (!plan.ok) throw new SignupError(plan.error, 400);
    const updated = await client
      .from("crm_signup_requests")
      .update({
        status: "refusee",
        refusal_reason: plan.reason || null,
        refusal_notified: plan.send !== "none",
        reviewed_by: input.staffId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (updated.error) fail(updated.error, "Le refus n’a pas été enregistré.");
    if (plan.send !== "none") {
      const mail = signupEmailHtml("refused", {
        firstName: row.first_name,
        message: plan.send === "reason" ? plan.reason : "",
      });
      await sendMail([row.email], mail.subject, mail.html);
    }
    return { ok: true as const, customerId: row.customer_id, inviteWarning: "" };
  }
  const plan = planComplement({ status: row.status, message: input.message });
  if (!plan.ok) throw new SignupError(plan.error, 400);
  const viewToken = newOpaqueToken();
  const updated = await client
    .from("crm_signup_requests")
    .update({
      status: "a_completer",
      complement_message: plan.message,
      complement_at: new Date().toISOString(),
      view_token_hash: hashToken(viewToken),
      reviewed_by: input.staffId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (updated.error) fail(updated.error, "Le complément n’a pas été enregistré.");
  const mail = signupEmailHtml("complement", {
    firstName: row.first_name,
    message: plan.message,
    link: `${input.origin}/inscription/ouvrir?t=${viewToken}`,
  });
  await sendMail([row.email], mail.subject, mail.html);
  return { ok: true as const, customerId: row.customer_id, inviteWarning: "" };
}

export async function createSignupInvitation(input: {
  firstName: string;
  lastName?: string;
  phone: string;
  email?: string | null;
  customerId?: string | null;
  staffId?: string | null;
  origin: string;
  send: boolean;
  kind?: "admin" | "parrainage";
  referrerCustomerId?: string | null;
  referrerFirstName?: string | null;
}) {
  const kind = input.kind === "parrainage" ? "parrainage" : "admin";
  const firstName = input.firstName.trim().replace(/\s+/g, " ");
  const lastName = (input.lastName || "").trim().replace(/\s+/g, " ") || "—";
  const phone = normalizePhone(input.phone);
  if (firstName.length < 1 || (kind === "admin" && lastName === "—")) throw new SignupError("Indiquez le nom et le prénom.", 400);
  if (phone.replace(/\D/g, "").length < 8) throw new SignupError("Indiquez un numéro de téléphone.", 400);
  const client = db();
  if (kind === "parrainage") {
    if (!input.referrerCustomerId) throw new SignupError("Le membre parrain est requis.", 400);
    const balance = await readReferralBalance(client, input.referrerCustomerId);
    if (balance.blocked) throw new SignupError("Le plafond de 10 invitations est atteint.", 409);
  }
  const secret = signupLinkSecret(process.env);
  if (!secret) throw new SignupError("Le secret de signature n’est pas configuré.", 503);
  const id = crypto.randomUUID();
  const exp = Math.floor((Date.now() + INVITATION_TTL_MS) / 1000);
  const token = signSignupToken(id, exp, secret);
  const expiresAt = new Date(exp * 1000).toISOString();
  const link = invitationUrl(input.origin, token);
  const when = expiresLabel(new Date(exp * 1000));
  const text =
    kind === "parrainage"
      ? referralShareText({
          guestFirstName: firstName,
          referrerFirstName: input.referrerFirstName || "Un membre",
          link,
          expiresLabel: when,
        })
      : invitationShareText({ firstName, link, expiresLabel: when });
  const cloud =
    input.send && (kind === "parrainage" ? whatsappReferralConfigured(process.env) : whatsappCloudConfigured(process.env));
  let channel: "whatsapp_cloud" | "wa_me" = "wa_me";
  let provider: string | null = null;
  if (cloud) {
    const lang = (process.env.WHATSAPP_TEMPLATE_LANG || "fr").trim() || "fr";
    const payload =
      kind === "parrainage"
        ? whatsappReferralPayload({
            to: phone,
            template: (process.env.WHATSAPP_TEMPLATE_PARRAINAGE || "invitation_parrainage").trim(),
            lang,
            guestFirstName: firstName,
            referrerFirstName: input.referrerFirstName || "Un membre",
            expiresLabel: when,
            token,
          })
        : whatsappInvitationPayload({
            to: phone,
            template: (process.env.WHATSAPP_TEMPLATE_INVITATION || "").trim(),
            lang,
            firstName,
            expiresLabel: when,
            token,
          });
    const sent = await sendWhatsappCloud(payload);
    if (sent.ok) {
      channel = "whatsapp_cloud";
      provider = sent.id;
    }
  }
  const inserted = await client.from("crm_signup_invitations").insert({
    id,
    token_hash: hashToken(token),
    first_name: firstName,
    last_name: lastName,
    phone,
    email: input.email ? normalizeEmail(input.email) : null,
    customer_id: input.customerId || null,
    status: "envoyee",
    expires_at: expiresAt,
    created_by: input.staffId || null,
    channel,
    kind,
    referrer_customer_id: kind === "parrainage" ? input.referrerCustomerId : null,
    sent_at: new Date().toISOString(),
    provider_message_id: provider,
  });
  if (inserted.error) fail(inserted.error, "L’invitation n’a pas été créée.");
  const balance = kind === "parrainage" && input.referrerCustomerId ? await readReferralBalance(client, input.referrerCustomerId) : null;
  return {
    id,
    canal: channel,
    lien: link,
    partage: waMeHref(phone, text),
    expireLe: when,
    envoye: channel === "whatsapp_cloud",
    restantes: balance?.remaining ?? null,
  };
}

async function sendWhatsappCloud(payload: ReturnType<typeof whatsappInvitationPayload> | ReturnType<typeof whatsappReferralPayload>) {
  const token = productionOnlySecret(process.env.WHATSAPP_TOKEN);
  const phoneId = (process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim();
  const version = (process.env.WHATSAPP_GRAPH_VERSION || "v21.0").replace(/[^\w.]/g, "") || "v21.0";
  if (!token || !phoneId) return { ok: false as const, id: null };
  try {
    const response = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = (await response.json().catch(() => null)) as { messages?: { id?: string }[] } | null;
    if (!response.ok) {
      console.error("[inscription] WhatsApp", response.status);
      return { ok: false as const, id: null };
    }
    return { ok: true as const, id: json?.messages?.[0]?.id || null };
  } catch {
    console.error("[inscription] WhatsApp");
    return { ok: false as const, id: null };
  }
}

export async function openSignupInvitation(token: string) {
  const client = db();
  const row = await invitationFromToken(client, token);
  if (!row) return { ok: false as const, error: "Ce lien d’invitation n’est pas valable." };
  const shown = displayedInvitationStatus({ status: row.status, expiresAt: row.expires_at });
  if (shown === "expiree" && row.status !== "expiree" && row.status !== "demande_deposee") {
    await client.from("crm_signup_invitations").update({ status: "expiree" }).eq("id", row.id);
  }
  if (!invitationCanOpen(shown)) {
    return { ok: false as const, error: shown === "expiree" ? "Ce lien a expiré." : "Ce lien a déjà été utilisé." };
  }
  if (row.status === "envoyee") {
    await client.from("crm_signup_invitations").update({ status: "ouverte", opened_at: new Date().toISOString() }).eq("id", row.id);
  }
  return {
    ok: true as const,
    prefill: {
      firstName: row.first_name,
      lastName: row.last_name,
      phone: row.phone,
      email: row.email || "",
    },
  };
}

export async function previewSignupInvitation(input: { firstName: string; phone: string; origin: string }) {
  const firstName = input.firstName.trim() || "Bonjour";
  const phone = normalizePhone(input.phone);
  const sample = invitationUrl(input.origin, "lien-personnel");
  const text = invitationShareText({
    firstName,
    link: sample,
    expiresLabel: expiresLabel(new Date(Date.now() + INVITATION_TTL_MS)),
  });
  return {
    apercu: true as const,
    canal: whatsappCloudConfigured(process.env) ? ("whatsapp_cloud" as const) : ("wa_me" as const),
    message: text.replace(sample, "lien personnel"),
    partage: phone.replace(/\D/g, "").length >= 8 ? waMeHref(phone, text.replace(sample, "lien personnel")) : null,
  };
}

export async function setSignupAutoValidate(enabled: boolean) {
  const client = db();
  const { error } = await client
    .from("crm_signup_settings")
    .update({ auto_validate_invited: enabled, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) fail(error, "Le réglage n’a pas été enregistré.");
}

export async function listReferralBoard() {
  const client = db();
  const { data, error } = await client
    .from("crm_referrals")
    .select("id, referrer_customer_id, referred_customer_id, code, status, reward_note, created_at, validated_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    if (missingRelation(error)) return { ready: false as const, groups: [] };
    throw new SignupError("Les parrainages n’ont pas pu être lus.", 500);
  }
  const rows = (data || []) as {
    id: string;
    referrer_customer_id: string;
    referred_customer_id: string | null;
    code: string;
    status: string;
    reward_note: string | null;
    created_at: string;
    validated_at: string | null;
  }[];
  const ids = [...new Set(rows.flatMap((row) => [row.referrer_customer_id, row.referred_customer_id].filter(Boolean)))] as string[];
  const names = new Map<string, string>();
  if (ids.length) {
    const people = await client.from("crm_customers").select("id, first_name, last_name").in("id", ids);
    for (const person of (people.data || []) as { id: string; first_name: string; last_name: string }[]) {
      names.set(person.id, `${person.first_name} ${person.last_name}`.trim());
    }
  }
  const groups = new Map<string, { id: string; name: string; code: string; enAttente: number; valides: number; lignes: typeof rows }>();
  for (const row of rows) {
    const current = groups.get(row.referrer_customer_id) || {
      id: row.referrer_customer_id,
      name: names.get(row.referrer_customer_id) || "Client",
      code: row.code,
      enAttente: 0,
      valides: 0,
      lignes: [],
    };
    if (row.status === "valide") current.valides += 1;
    else current.enAttente += 1;
    current.lignes.push(row);
    groups.set(row.referrer_customer_id, current);
  }
  return {
    ready: true as const,
    groups: [...groups.values()].map((group) => ({
      ...group,
      lignes: group.lignes.map((row) => ({
        id: row.id,
        status: row.status,
        rewardNote: row.reward_note,
        createdAt: row.created_at,
        validatedAt: row.validated_at,
        filleul: row.referred_customer_id ? names.get(row.referred_customer_id) || "Fiche" : null,
      })),
    })),
  };
}

export async function setReferralReward(id: string, note: string) {
  const client = db();
  const reward = note.trim().slice(0, 500);
  const { error } = await client.from("crm_referrals").update({ reward_note: reward || null }).eq("id", id);
  if (error) fail(error, "La note n’a pas été enregistrée.");
}

export async function referralShareForCustomer(customerId: string, origin: string) {
  try {
    const client = db();
    const code = await ensureReferralCode(client, customerId);
    if (!code) return null;
    const person = await client.from("crm_customers").select("first_name").eq("id", customerId).maybeSingle();
    const firstName = (person.data as { first_name?: string } | null)?.first_name || "";
    const balance = await readReferralBalance(client, customerId);
    const link = referralUrl(origin, code);
    const text = clubShareText({ referrerFirstName: firstName, link });
    return {
      code,
      link,
      text,
      whatsapp: signupShareWhatsapp(text),
      remaining: balance.remaining,
      cap: balance.cap,
      used: balance.used,
      mode: balance.mode,
      firstName,
    };
  } catch (error) {
    if (error instanceof SignupError && error.status === 503) return null;
    return null;
  }
}

export async function referralAccountFor(customerId: string) {
  try {
    const balance = await readReferralBalance(db(), customerId);
    return balance;
  } catch {
    return null;
  }
}

export async function setReferralCountMode(mode: ReferralCountMode) {
  const client = db();
  const { error } = await client
    .from("crm_signup_settings")
    .update({ referral_count_mode: mode, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) fail(error, "Le réglage n’a pas été enregistré.");
}

export function signupShareWhatsapp(text: string) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export async function customerForInvitation(customerId: string) {
  const client = db();
  const { data, error } = await client
    .from("crm_customers")
    .select("id, first_name, last_name, phone, email")
    .eq("id", customerId)
    .maybeSingle();
  if (error || !data) return null;
  return data as { id: string; first_name: string; last_name: string; phone: string | null; email: string | null };
}

export function clientIp(headers: Headers) {
  return requestIp(headers);
}

export function referralFromSearch(value: string | null | undefined) {
  return value ? extractReferralCode(value) : null;
}
