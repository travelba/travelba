import "server-only";

import type { User } from "@supabase/supabase-js";
import { recordAgencyJournal } from "@/lib/crm/agency-log";
import { productionOnlySecret } from "@/lib/crm/preview-secrets";
import { rateLimit, rateLimitKey, requestIp } from "@/lib/crm/rate-limit";
import { ensureStripeCustomer, getStripe, stripeConfigured } from "@/lib/crm/stripe";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  ACCOUNT_SELF,
  completeSignupDecision,
  emailSignupDecision,
  googleNameParts,
  googleSignupDecision,
  identityDecision,
  normalizeSignupPhone,
  passwordDecision,
  selfServiceBookingBlock,
  selfServiceMetadata,
  signupStep,
  type SelfServiceSettings,
  type SignupSnapshot,
} from "./self-signup";

const SETTINGS_KEY = "self_service";

function admin() {
  return createServiceClient();
}

export async function readSelfServiceSettings(): Promise<SelfServiceSettings> {
  const { parseSelfServiceSettings } = await import("./self-signup");
  try {
    const { data, error } = await admin()
      .from("crm_hotel_button_settings")
      .select("value")
      .eq("key", SETTINGS_KEY)
      .maybeSingle();
    if (error || !data) return parseSelfServiceSettings(null);
    const raw = (data as { value?: string }).value;
    return parseSelfServiceSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return parseSelfServiceSettings(null);
  }
}

export async function writeSelfServiceSettings(actor: string, staffId: string | null, value: unknown) {
  const { decideSelfServiceSettings } = await import("./self-signup");
  const decision = decideSelfServiceSettings({ actor, value });
  if (!decision.ok) return decision;
  const { error } = await admin()
    .from("crm_hotel_button_settings")
    .upsert(
      {
        key: SETTINGS_KEY,
        value: JSON.stringify(decision.settings),
        updated_at: new Date().toISOString(),
        updated_by: staffId,
      },
      { onConflict: "key" }
    );
  if (error) return { ok: false as const, message: "Le réglage n’a pas été enregistré." };
  await recordAgencyJournal({
    staffId,
    action: "update",
    entityType: "setting",
    summary: decision.settings.enabled
      ? "Réservations autonomes ouvertes."
      : "Réservations autonomes suspendues.",
    path: "/admin/reglages/hotels",
  });
  return { ok: true as const, settings: decision.settings };
}

type SignupRow = {
  id: string;
  auth_user_id: string | null;
  account_origin: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  phone_verified_at: string | null;
  signup_terms_at: string | null;
  signup_completed_at: string | null;
  on_hold?: boolean | null;
  email?: string | null;
  stripe_customer_id?: string | null;
};

async function loadByEmail(email: string) {
  const { data } = await admin()
    .from("crm_customers")
    .select("id, auth_user_id, account_origin, signup_completed_at")
    .ilike("email", email)
    .maybeSingle();
  return data as Pick<SignupRow, "id" | "auth_user_id" | "account_origin" | "signup_completed_at"> | null;
}

function googleNames(user: User) {
  const meta = user.user_metadata || {};
  return googleNameParts({
    given: typeof meta.given_name === "string" ? meta.given_name : null,
    family: typeof meta.family_name === "string" ? meta.family_name : null,
    full: typeof meta.full_name === "string" ? meta.full_name : typeof meta.name === "string" ? meta.name : null,
  });
}

export type PublicGoogleResult =
  | { kind: "staff" }
  | { kind: "refuse"; path: string }
  | { kind: "enter"; path: string; cookie: "pending" | "done" | "clear" };

/** Google a prouvé l’adresse. Une fiche invitée reste invitée. L’agence ne devient pas un client. */
export async function resolvePublicGoogle(user: User, ip: string): Promise<PublicGoogleResult> {
  const email = (user.email || "").trim().toLowerCase();
  if (!email || !user.email_confirmed_at) return { kind: "refuse", path: "/connexion?error=auth" };
  const db = admin();
  const [{ data: staff }, existing] = await Promise.all([
    db.from("crm_staff").select("id").ilike("email", email).limit(1),
    loadByEmail(email),
  ]);
  const decision = googleSignupDecision({
    email,
    staff: Boolean(staff && staff.length),
    userId: user.id,
    existing: existing
      ? { id: existing.id, authUserId: existing.auth_user_id, origin: existing.account_origin }
      : null,
  });
  if (decision.action === "refuse") {
    if (decision.reason === "agence") return { kind: "staff" };
    return { kind: "refuse", path: "/connexion?error=auth" };
  }
  if (decision.action === "enter") {
    if (decision.link) {
      await db.from("crm_customers").update({ auth_user_id: user.id }).eq("id", decision.customerId).is("auth_user_id", null);
    }
    if (!decision.selfService) return { kind: "enter", path: "/mon-compte", cookie: "clear" };
    return existing?.signup_completed_at
      ? { kind: "enter", path: "/mon-compte/hotels", cookie: "done" }
      : { kind: "enter", path: "/inscription", cookie: "pending" };
  }
  const allowed = await rateLimit({ key: rateLimitKey("signup", `${ip}:${email}`), limit: 5, windowSeconds: 3600 });
  if (!allowed) return { kind: "refuse", path: "/inscription?error=attente" };
  const names = googleNames(user);
  const { data: created, error } = await db
    .from("crm_customers")
    .insert({
      email,
      first_name: names.firstName,
      last_name: names.lastName,
      auth_user_id: user.id,
      account_origin: ACCOUNT_SELF,
      language: "fr",
    })
    .select("id")
    .single();
  if (error || !created) {
    const again = await loadByEmail(email);
    if (again && (!again.auth_user_id || again.auth_user_id === user.id)) {
      if (!again.auth_user_id) {
        await db.from("crm_customers").update({ auth_user_id: user.id }).eq("id", again.id).is("auth_user_id", null);
      }
      return again.account_origin === ACCOUNT_SELF && !again.signup_completed_at
        ? { kind: "enter", path: "/inscription", cookie: "pending" }
        : { kind: "enter", path: "/mon-compte", cookie: "clear" };
    }
    return { kind: "refuse", path: "/connexion?error=auth" };
  }
  await db.auth.admin.updateUserById(user.id, { app_metadata: selfServiceMetadata(false) });
  return { kind: "enter", path: "/inscription", cookie: "pending" };
}

export async function createEmailSignup(input: { email: string; password: string; ip: string }) {
  const takenRow = await loadByEmail(input.email.trim().toLowerCase());
  const db = admin();
  const { data: staff } = await db.from("crm_staff").select("id").ilike("email", input.email.trim()).limit(1);
  const decision = emailSignupDecision({
    email: input.email,
    staff: Boolean(staff && staff.length),
    taken: Boolean(takenRow),
  });
  if (!decision.ok) return decision;
  const secret = passwordDecision(input.password);
  if (!secret.ok) return secret;
  const allowed = await rateLimit({
    key: rateLimitKey("signup", `${input.ip}:${decision.email}`),
    limit: 5,
    windowSeconds: 3600,
  });
  if (!allowed) return { ok: false as const, message: "Trop de tentatives. Réessayez plus tard." };
  const created = await db.auth.admin.createUser({
    email: decision.email,
    password: input.password,
    email_confirm: true,
    app_metadata: selfServiceMetadata(false),
  });
  if (created.error || !created.data.user) {
    return { ok: false as const, message: "Cette adresse a déjà un accès. Connectez-vous." };
  }
  const names = { firstName: "", lastName: "" };
  const { error } = await db.from("crm_customers").insert({
    email: decision.email,
    first_name: names.firstName,
    last_name: names.lastName,
    auth_user_id: created.data.user.id,
    account_origin: ACCOUNT_SELF,
    language: "fr",
  });
  if (error) {
    await db.auth.admin.deleteUser(created.data.user.id).catch(() => null);
    return { ok: false as const, message: "L’inscription n’a pas abouti. Réessayez." };
  }
  return { ok: true as const };
}

async function ownSignup(customerId: string) {
  const { data } = await admin()
    .from("crm_customers")
    .select("id, account_origin, first_name, last_name, phone, phone_verified_at, signup_terms_at, signup_completed_at, on_hold, email, stripe_customer_id")
    .eq("id", customerId)
    .maybeSingle();
  const row = data as SignupRow | null;
  if (!row || row.account_origin !== ACCOUNT_SELF) return null;
  return row;
}

async function hasCard(customerId: string) {
  const { data } = await admin()
    .from("crm_payment_methods")
    .select("id")
    .eq("customer_id", customerId)
    .limit(1);
  return Boolean(data && data.length);
}

function snapshotOf(row: SignupRow, card: boolean): SignupSnapshot {
  return {
    firstName: row.first_name || "",
    lastName: row.last_name || "",
    phoneVerifiedAt: row.phone_verified_at,
    hasCard: card,
    termsAt: row.signup_terms_at,
    completedAt: row.signup_completed_at,
  };
}

export async function signupStatus(customerId: string) {
  const row = await ownSignup(customerId);
  if (!row) return null;
  const card = await hasCard(customerId);
  const snapshot = snapshotOf(row, card);
  return {
    step: signupStep(snapshot),
    firstName: row.first_name || "",
    lastName: row.last_name || "",
    phone: row.phone || "",
    phoneVerified: Boolean(row.phone_verified_at),
  };
}

export async function saveSignupIdentity(customerId: string, firstName: string, lastName: string) {
  const row = await ownSignup(customerId);
  if (!row) return { ok: false as const, message: "Introuvable." };
  const named = identityDecision({ firstName, lastName });
  if (!named.ok) return named;
  const { error } = await admin()
    .from("crm_customers")
    .update({ first_name: named.firstName, last_name: named.lastName })
    .eq("id", customerId);
  if (error) return { ok: false as const, message: "Le nom n’a pas été enregistré." };
  return { ok: true as const };
}

function verifyConfigured() {
  return {
    sid: productionOnlySecret(process.env.TWILIO_ACCOUNT_SID),
    token: productionOnlySecret(process.env.TWILIO_AUTH_TOKEN),
    service: productionOnlySecret(process.env.TWILIO_VERIFY_SERVICE_SID),
  };
}

async function verifyCall(path: string, body: URLSearchParams) {
  const creds = verifyConfigured();
  if (!creds.sid || !creds.token || !creds.service) return null;
  const response = await fetch(`https://verify.twilio.com/v2/Services/${creds.service}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${creds.sid}:${creds.token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const json = (await response.json().catch(() => null)) as { status?: string; code?: number } | null;
  return { ok: response.ok, status: json?.status || "", code: json?.code || 0 };
}

export async function sendSignupCode(customerId: string, rawPhone: string, ip: string) {
  const row = await ownSignup(customerId);
  if (!row) return { ok: false as const, message: "Introuvable." };
  const phone = normalizeSignupPhone(rawPhone);
  if (!phone.ok) return phone;
  const allowed = await Promise.all([
    rateLimit({ key: rateLimitKey("signup-sms", phone.e164), limit: 5, windowSeconds: 3600 }),
    rateLimit({ key: rateLimitKey("signup-sms-ip", ip), limit: 5, windowSeconds: 3600 }),
  ]);
  if (allowed.some((hit) => !hit)) return { ok: false as const, message: "Trop d’essais. Patientez avant un nouveau code." };
  const sent = await verifyCall("/Verifications", new URLSearchParams({ To: phone.e164, Channel: "sms" }));
  if (!sent) return { ok: false as const, message: "La vérification par SMS n’est pas ouverte." };
  if (!sent.ok || sent.status === "canceled") {
    return { ok: false as const, message: "Le code n’a pas pu être envoyé. Vérifiez le numéro." };
  }
  const { error } = await admin()
    .from("crm_customers")
    .update({ phone: phone.e164, phone_verified_at: null })
    .eq("id", customerId);
  if (error) return { ok: false as const, message: "Le numéro n’a pas été enregistré." };
  return { ok: true as const };
}

export async function checkSignupCode(customerId: string, code: string, ip: string) {
  const row = await ownSignup(customerId);
  if (!row?.phone) return { ok: false as const, message: "Indiquez d’abord votre numéro." };
  if (!/^\d{6}$/.test(code)) return { ok: false as const, message: "Le code comporte six chiffres." };
  const allowed = await rateLimit({
    key: rateLimitKey("signup-sms-check", `${row.phone}:${ip}`),
    limit: 5,
    windowSeconds: 15 * 60,
  });
  if (!allowed) return { ok: false as const, message: "Trop d’essais. Patientez avant un nouveau code." };
  const checked = await verifyCall(
    "/VerificationCheck",
    new URLSearchParams({ To: row.phone, Code: code })
  );
  if (!checked) return { ok: false as const, message: "La vérification par SMS n’est pas ouverte." };
  if (checked.status !== "approved") return { ok: false as const, message: "Ce code n’est pas le bon." };
  const { error } = await admin()
    .from("crm_customers")
    .update({ phone_verified_at: new Date().toISOString() })
    .eq("id", customerId)
    .eq("phone", row.phone);
  if (error) return { ok: false as const, message: "La vérification n’a pas été enregistrée." };
  return { ok: true as const };
}

export async function signupSetupIntent(customer: {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  stripe_customer_id: string | null;
  account_origin?: string | null;
  phone_verified_at?: string | null;
}) {
  if (customer.account_origin !== ACCOUNT_SELF) return { ok: false as const, message: "Introuvable." };
  if (!customer.phone_verified_at) return { ok: false as const, message: "Vérifiez votre numéro de téléphone." };
  if (!stripeConfigured()) return { ok: false as const, message: "L’enregistrement de la carte n’est pas ouvert." };
  const stripe = getStripe();
  if (!stripe) return { ok: false as const, message: "L’enregistrement de la carte n’est pas ouvert." };
  const stripeCustomerId = await ensureStripeCustomer(stripe, admin(), customer);
  const intent = await stripe.setupIntents.create({
    customer: stripeCustomerId,
    usage: "off_session",
    payment_method_types: ["card"],
    payment_method_options: { card: { request_three_d_secure: "any" } },
    metadata: { crm_customer_id: customer.id, purpose: "self_signup_guarantee" },
  });
  if (!intent.client_secret) return { ok: false as const, message: "La carte n’a pas pu être préparée." };
  return { ok: true as const, clientSecret: intent.client_secret };
}

export async function openSelfSignup(input: { customerId: string; userId: string; adult: boolean; terms: boolean }) {
  const row = await ownSignup(input.customerId);
  if (!row) return { ok: false as const, message: "Introuvable." };
  if (row.signup_completed_at) return { ok: true as const, already: true };
  const card = await hasCard(input.customerId);
  const termsAt = input.adult && input.terms ? new Date().toISOString() : null;
  const decision = completeSignupDecision({ ...snapshotOf(row, card), termsAt });
  if (!decision.ok) return decision;
  const now = termsAt || new Date().toISOString();
  const { error } = await admin()
    .from("crm_customers")
    .update({
      signup_terms_at: now,
      signup_completed_at: now,
      hotel_booking_enabled: true,
      hotel_direct_live: true,
    })
    .eq("id", input.customerId)
    .is("signup_completed_at", null);
  if (error) return { ok: false as const, message: "L’ouverture n’a pas abouti." };
  const db = admin();
  const { data: authUser } = await db.auth.admin.getUserById(input.userId);
  const meta = authUser.user?.app_metadata || {};
  await db.auth.admin.updateUserById(input.userId, {
    app_metadata: { ...meta, ...selfServiceMetadata(true) },
  });
  await recordAgencyJournal({
    staffId: null,
    action: "create",
    entityType: "client",
    entityId: input.customerId,
    summary: "Inscription autonome terminée.",
    path: "/inscription",
  });
  await db.from("crm_agency_alerts").insert({
    kind: "signup",
    summary: "Nouvelle inscription autonome.",
    entity_type: "client",
    entity_id: input.customerId,
  });
  return { ok: true as const, already: false };
}

export async function selfServiceSearchAllowed(customerId: string, origin: string | null | undefined, ip: string) {
  if (origin !== ACCOUNT_SELF) return true;
  const settings = await readSelfServiceSettings();
  const [person, network] = await Promise.all([
    rateLimit({ key: rateLimitKey("hotel-search", customerId), limit: settings.searchesPerHour, windowSeconds: 3600 }),
    rateLimit({ key: rateLimitKey("hotel-search-ip", ip), limit: 60, windowSeconds: 3600 }),
  ]);
  return person && network;
}

export async function selfServiceBookBlock(customer: {
  id: string;
  account_origin?: string | null;
  on_hold?: boolean | null;
  phone_verified_at?: string | null;
}, sellCents: number, currency: string) {
  if (customer.account_origin !== ACCOUNT_SELF) return null;
  const settings = await readSelfServiceSettings();
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const [{ count }, card] = await Promise.all([
    admin()
      .from("crm_hotel_direct_stays")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customer.id)
      .gte("created_at", start.toISOString()),
    hasCard(customer.id),
  ]);
  return selfServiceBookingBlock({
    origin: customer.account_origin,
    onHold: customer.on_hold === true,
    phoneVerified: Boolean(customer.phone_verified_at),
    hasCard: card,
    sellCents,
    currency,
    bookingsToday: count || 0,
    settings,
  });
}

export async function defaultCardId(customerId: string) {
  const { data } = await admin()
    .from("crm_payment_methods")
    .select("stripe_payment_method_id, is_default")
    .eq("customer_id", customerId)
    .order("is_default", { ascending: false })
    .limit(1);
  const row = (data || [])[0] as { stripe_payment_method_id?: string } | undefined;
  return row?.stripe_payment_method_id || null;
}

export async function confirmSignupCard(customerId: string, setupIntentId: string) {
  if (!/^seti_[A-Za-z0-9]+$/.test(setupIntentId)) {
    return { ok: false as const, message: "La carte n’est pas confirmée." };
  }
  const row = await ownSignup(customerId);
  if (!row) return { ok: false as const, message: "Introuvable." };
  if (!stripeConfigured()) return { ok: false as const, message: "L’enregistrement de la carte n’est pas ouvert." };
  const stripe = getStripe();
  if (!stripe) return { ok: false as const, message: "L’enregistrement de la carte n’est pas ouvert." };
  const intent = await stripe.setupIntents.retrieve(setupIntentId).catch(() => null);
  if (!intent || intent.status !== "succeeded" || intent.metadata?.crm_customer_id !== customerId) {
    return { ok: false as const, message: "La carte n’est pas confirmée." };
  }
  if (intent.metadata?.purpose !== "self_signup_guarantee") {
    return { ok: false as const, message: "La carte n’est pas confirmée." };
  }
  const pmId = typeof intent.payment_method === "string" ? intent.payment_method : intent.payment_method?.id;
  if (!pmId) return { ok: false as const, message: "La carte n’est pas confirmée." };
  const pm = await stripe.paymentMethods.retrieve(pmId);
  const card = pm.card;
  const { count } = await admin()
    .from("crm_payment_methods")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", customerId);
  const { error } = await admin().from("crm_payment_methods").upsert(
    {
      customer_id: customerId,
      stripe_payment_method_id: pmId,
      brand: card?.brand || null,
      last4: card?.last4 || null,
      exp_month: card?.exp_month || null,
      exp_year: card?.exp_year || null,
      is_default: (count ?? 0) === 0,
    },
    { onConflict: "stripe_payment_method_id" }
  );
  if (error) return { ok: false as const, message: "La carte n’a pas été enregistrée." };
  return { ok: true as const, last4: card?.last4 || "" };
}

export function signupRequestIp(headers: Headers) {
  return requestIp(headers);
}
