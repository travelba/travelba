/**
 * Inscription : demande, invitation, parrainage.
 * Pur : aucune écriture, aucun envoi. La personne n’a pas d’accès tant qu’un admin n’a pas validé.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { rateLimitKey, type RateLimitRule } from "./rate-limit";
import { HEARD_ABOUT, SIGNUP_COOKIE } from "./signup-options";

export { HEARD_ABOUT, SIGNUP_COOKIE };

export const SIGNUP_STATUSES = ["brouillon", "en_attente", "a_completer", "validee", "refusee"] as const;
export type SignupStatus = (typeof SIGNUP_STATUSES)[number];

export const INVITATION_STATUSES = ["envoyee", "ouverte", "demande_deposee", "expiree"] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export const REFERRAL_STATUSES = ["en_attente", "valide"] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];

export const INVITATION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
export const EMAIL_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
export const VIEW_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SMS_CODE_TTL_MS = 10 * 60 * 1000;

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const REFERRAL_CODE = /\bTBA-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}\b/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SignupDraft = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  birthDate: string;
  travelPreferences: string;
  heardAbout: string;
  referralCode: string | null;
  referralRaw: string;
};

export type FieldError = { field: string; message: string };

export function signupSmsEnabled(env: Record<string, string | undefined>) {
  return env.SIGNUP_SMS_ENABLED === "1";
}

/** Le flag seul ne bloque pas : sans identifiants Twilio, le SMS reste éteint. */
export function signupSmsRequired(env: Record<string, string | undefined>) {
  return (
    signupSmsEnabled(env) &&
    Boolean((env.TWILIO_ACCOUNT_SID || "").trim() && (env.TWILIO_AUTH_TOKEN || "").trim() && (env.TWILIO_SMS_FROM || "").trim())
  );
}

export function whatsappCloudConfigured(env: Record<string, string | undefined>) {
  return Boolean(
    (env.WHATSAPP_TOKEN || "").trim() &&
      (env.WHATSAPP_PHONE_NUMBER_ID || "").trim() &&
      (env.WHATSAPP_TEMPLATE_INVITATION || "").trim()
  );
}

export function honeypotTripped(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

/** E.164 approximatif. Un 0 initial français devient +33. */
export function normalizePhone(value: string) {
  let digits = value.replace(/[^\d+]/g, "");
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  if (/^0\d{9}$/.test(digits)) digits = `+33${digits.slice(1)}`;
  if (!digits.startsWith("+") && digits.length >= 8) digits = `+${digits}`;
  return digits;
}

export function phonesMatch(left: string | null | undefined, right: string | null | undefined) {
  const a = (left || "").replace(/\D/g, "");
  const b = (right || "").replace(/\D/g, "");
  if (a.length < 9 || b.length < 9) return false;
  return a.slice(-9) === b.slice(-9);
}

export function phoneLookupVariants(phone: string) {
  const normalized = normalizePhone(phone);
  const digits = normalized.replace(/\D/g, "");
  const variants = new Set<string>();
  if (normalized) variants.add(normalized);
  if (digits) variants.add(digits);
  if (digits.startsWith("33") && digits.length === 11) variants.add(`0${digits.slice(2)}`);
  return [...variants];
}

function parisDate(now: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(now);
}

export function ageYears(birthDate: string, now: Date) {
  const today = parisDate(now);
  const [y, m, d] = birthDate.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let age = ty - y;
  if (tm < m || (tm === m && td < d)) age -= 1;
  return age;
}

export function validateSignupDraft(
  input: {
    firstName?: unknown;
    lastName?: unknown;
    email?: unknown;
    phone?: unknown;
    birthDate?: unknown;
    travelPreferences?: unknown;
    heardAbout?: unknown;
    heardAboutDetail?: unknown;
    referralCode?: unknown;
    terms?: unknown;
    privacy?: unknown;
  },
  now = new Date()
): { ok: true; value: SignupDraft } | { ok: false; errors: FieldError[] } {
  const errors: FieldError[] = [];
  const firstName = typeof input.firstName === "string" ? input.firstName.trim().replace(/\s+/g, " ") : "";
  const lastName = typeof input.lastName === "string" ? input.lastName.trim().replace(/\s+/g, " ") : "";
  const email = typeof input.email === "string" ? normalizeEmail(input.email) : "";
  const phoneRaw = typeof input.phone === "string" ? input.phone : "";
  const phone = normalizePhone(phoneRaw);
  const birthDate = typeof input.birthDate === "string" ? input.birthDate.trim() : "";
  const travel = typeof input.travelPreferences === "string" ? input.travelPreferences.trim() : "";
  const heard = typeof input.heardAbout === "string" ? input.heardAbout.trim() : "";
  const detail = typeof input.heardAboutDetail === "string" ? input.heardAboutDetail.trim() : "";
  const referralRaw = typeof input.referralCode === "string" ? input.referralCode.trim() : "";

  if (firstName.length < 1 || firstName.length > 80) errors.push({ field: "firstName", message: "Indiquez votre prénom." });
  if (lastName.length < 1 || lastName.length > 80) errors.push({ field: "lastName", message: "Indiquez votre nom." });
  if (!EMAIL.test(email) || email.length > 180) errors.push({ field: "email", message: "Indiquez une adresse e-mail valide." });
  const phoneDigits = phone.replace(/\D/g, "");
  if (phoneDigits.length < 8 || phoneDigits.length > 15) {
    errors.push({ field: "phone", message: "Indiquez un numéro de téléphone." });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || Number.isNaN(Date.parse(`${birthDate}T00:00:00Z`))) {
    errors.push({ field: "birthDate", message: "Indiquez votre date de naissance." });
  } else if (birthDate > parisDate(now)) {
    errors.push({ field: "birthDate", message: "La date de naissance ne peut pas être dans le futur." });
  } else if (ageYears(birthDate, now) < 18) {
    errors.push({ field: "birthDate", message: "L’inscription est réservée aux personnes majeures." });
  } else if (ageYears(birthDate, now) > 120) {
    errors.push({ field: "birthDate", message: "Vérifiez la date de naissance." });
  }
  if (travel.length > 1000) errors.push({ field: "travelPreferences", message: "Le texte est trop long." });
  if (!(HEARD_ABOUT as readonly string[]).includes(heard)) {
    errors.push({ field: "heardAbout", message: "Indiquez comment vous avez connu TravelBA." });
  } else if (heard === "Autre" && detail.length < 2) {
    errors.push({ field: "heardAboutDetail", message: "Précisez comment vous avez connu TravelBA." });
  } else if (detail.length > 160) {
    errors.push({ field: "heardAboutDetail", message: "Le texte est trop long." });
  }
  if (input.terms !== true) errors.push({ field: "terms", message: "Acceptez les conditions générales." });
  if (input.privacy !== true) errors.push({ field: "privacy", message: "Acceptez l’utilisation de vos données pour cette demande." });

  if (errors.length) return { ok: false, errors };
  const heardAbout = heard === "Autre" ? `Autre — ${detail}` : heard;
  return {
    ok: true,
    value: {
      firstName,
      lastName,
      email,
      phone,
      birthDate,
      travelPreferences: travel,
      heardAbout,
      referralCode: extractReferralCode(referralRaw),
      referralRaw: referralRaw.slice(0, 120),
    },
  };
}

/** Code TBA-XXXXXX, ou le paramètre `parrain` d’un lien. Null si rien d’utilisable. */
export function extractReferralCode(raw: string) {
  const fromUrl = raw.match(/[?&]parrain=([^&#\s]+)/i);
  const candidate = decodeURIComponent(fromUrl?.[1] || raw).toUpperCase().replace(/\s+/g, "");
  return candidate.match(REFERRAL_CODE)?.[0] ?? null;
}

export function referralCodeFromBytes(bytes: Uint8Array) {
  let code = "";
  for (let i = 0; i < 6; i += 1) code += CODE_ALPHABET[bytes[i % bytes.length] % CODE_ALPHABET.length];
  return `TBA-${code}`;
}

export function newReferralCode() {
  return referralCodeFromBytes(randomBytes(6));
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function newOpaqueToken() {
  return randomBytes(32).toString("base64url");
}

export function signupLinkSecret(env: Record<string, string | undefined>) {
  const dedicated = (env.SIGNUP_LINK_SECRET || "").trim();
  if (dedicated) return dedicated;
  const material = (env.CRON_SECRET || env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!material) return "";
  return createHash("sha256").update(`travelba-signup:${material}`).digest("hex");
}

/** Jeton signé : identifiant, expiration, signature. L’URL ne contient pas de secret de serveur. */
export function signSignupToken(id: string, expSeconds: number, secret: string) {
  const body = `${id}.${expSeconds}`;
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readSignupToken(token: string, secret: string, now = Date.now()) {
  if (!secret) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [id, expRaw, sig] = parts;
  if (!UUID.test(id)) return null;
  const exp = Number(expRaw);
  if (!Number.isInteger(exp) || exp < 1_000_000_000) return null;
  const expected = createHmac("sha256", secret).update(`${id}.${expRaw}`).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  return { id, exp, expired: exp * 1000 <= now };
}

export function invitationUrl(origin: string, token: string) {
  return `${origin.replace(/\/$/, "")}/inscription/i/${token}`;
}

export function referralUrl(origin: string, code: string) {
  return `${origin.replace(/\/$/, "")}/inscription?parrain=${encodeURIComponent(code)}`;
}

export function expiresLabel(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  }).format(date);
}

export function invitationShareText(input: { firstName: string; link: string; expiresLabel: string }) {
  const name = input.firstName.trim() || "Bonjour";
  return `Bonjour ${name}, l’agence vous invite à demander votre inscription. Ce lien est personnel, à usage unique, et expire le ${input.expiresLabel} : ${input.link}`;
}

export function waMeHref(phone: string, text: string) {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function referralShareText(link: string) {
  return `Je voyage avec Travel Business Agency. Si vous souhaitez leur confier un séjour, vous pouvez demander votre inscription avec mon lien : ${link}`;
}

/** Modèle Meta : corps {{1}} prénom, {{2}} date, bouton URL https://travelba.fr/inscription/i/{{1}}. */
export function whatsappInvitationPayload(input: {
  to: string;
  template: string;
  lang: string;
  firstName: string;
  expiresLabel: string;
  token: string;
}) {
  return {
    messaging_product: "whatsapp",
    to: input.to.replace(/\D/g, ""),
    type: "template",
    template: {
      name: input.template,
      language: { code: input.lang || "fr" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: input.firstName.slice(0, 80) },
            { type: "text", text: input.expiresLabel.slice(0, 40) },
          ],
        },
        {
          type: "button",
          sub_type: "url",
          index: "0",
          parameters: [{ type: "text", text: input.token }],
        },
      ],
    },
  };
}

export function signupRateRules(ip: string, email: string): RateLimitRule[] {
  return [
    { key: rateLimitKey("signup-ip", ip), limit: 8, windowSeconds: 60 * 60 },
    { key: rateLimitKey("signup-email", email || "vide"), limit: 3, windowSeconds: 24 * 60 * 60 },
  ];
}

export function smsRateRule(phone: string): RateLimitRule {
  return { key: rateLimitKey("signup-sms", phone), limit: 5, windowSeconds: 60 * 60 };
}

export type OpenSignup = { status: SignupStatus; emailVerified: boolean };

/** Une demande déjà en file n’est pas dupliquée. Un refus permet de recommencer. Une validation ne dit rien. */
export function planResubmit(existing: OpenSignup | null): "create" | "refresh" | "silent" | "complete" {
  if (!existing) return "create";
  if (existing.status === "validee") return "silent";
  if (existing.status === "refusee") return "create";
  if (existing.status === "a_completer") return "complete";
  if (existing.status === "en_attente") return "silent";
  return "refresh";
}

export function shouldAutoValidate(input: { invitedByStaff: boolean; enabled: boolean; matchCount: number }) {
  return input.invitedByStaff && input.enabled && input.matchCount === 0;
}

/**
 * Réglage activé et demande invitée.
 * Fiche déjà nommée par l’admin et retrouvée : rattacher.
 * Aucune fiche : créer.
 * Plusieurs possibilités sans cible : la file attend.
 */
export function planAutoValidation(input: {
  invitedByStaff: boolean;
  enabled: boolean;
  matches: { id: string }[];
  invitationCustomerId?: string | null;
}): { mode: "rattacher"; customerId: string } | { mode: "creer"; customerId: null } | null {
  if (!input.invitedByStaff || !input.enabled) return null;
  const target = (input.invitationCustomerId || "").trim();
  if (target && input.matches.some((row) => row.id === target)) {
    return { mode: "rattacher", customerId: target };
  }
  if (!target && input.matches.length === 0) return { mode: "creer", customerId: null };
  return null;
}

export type CustomerHit = { id: string; email: string | null; phone: string | null };

export function matchingCustomers(applicant: { email: string; phone: string }, rows: CustomerHit[]) {
  return rows.filter(
    (row) => normalizeEmail(row.email || "") === applicant.email || phonesMatch(row.phone, applicant.phone)
  );
}

export function planValidation(input: {
  status: SignupStatus;
  emailVerified: boolean;
  matches: { id: string }[];
  mode?: "rattacher" | "creer" | null;
  customerId?: string | null;
}): { ok: true; mode: "rattacher" | "creer"; customerId: string | null } | { ok: false; error: string } {
  if (!input.emailVerified || input.status === "brouillon") {
    return { ok: false, error: "L’adresse e-mail n’est pas encore confirmée." };
  }
  if (input.status === "validee") return { ok: false, error: "Cette demande est déjà validée." };
  if (input.status === "refusee") return { ok: false, error: "Cette demande est refusée." };
  if (input.status !== "en_attente" && input.status !== "a_completer") {
    return { ok: false, error: "Cette demande ne peut pas être validée." };
  }
  const matches = input.matches;
  if (matches.length > 0 && input.mode !== "rattacher" && input.mode !== "creer") {
    return { ok: false, error: "Une fiche existe déjà. Choisissez de la rattacher ou d’en créer une nouvelle." };
  }
  if (input.mode === "rattacher") {
    const id = (input.customerId || "").trim();
    if (!matches.some((row) => row.id === id)) {
      return { ok: false, error: "Choisissez la fiche qui correspond à cette demande." };
    }
    return { ok: true, mode: "rattacher", customerId: id };
  }
  if (matches.length === 0 || input.mode === "creer") return { ok: true, mode: "creer", customerId: null };
  return { ok: false, error: "Une fiche existe déjà. Choisissez de la rattacher ou d’en créer une nouvelle." };
}

export function planRefusal(input: { status: SignupStatus; reason?: string | null; notify: boolean }) {
  if (input.status === "validee") return { ok: false as const, error: "Cette demande est déjà validée." };
  if (input.status === "refusee") return { ok: false as const, error: "Cette demande est déjà refusée." };
  const reason = (input.reason || "").trim().slice(0, 500);
  return {
    ok: true as const,
    reason,
    send: input.notify === true && reason.length > 0 ? ("reason" as const) : input.notify === true ? ("generic" as const) : ("none" as const),
  };
}

export function planComplement(input: { status: SignupStatus; message?: string | null }) {
  if (input.status === "validee" || input.status === "refusee") {
    return { ok: false as const, error: "Cette demande est déjà terminée." };
  }
  const message = (input.message || "").trim();
  if (message.length < 2 || message.length > 1000) {
    return { ok: false as const, error: "Écrivez le complément à demander." };
  }
  return { ok: true as const, message };
}

export function displayedInvitationStatus(
  row: { status: string; expiresAt: string },
  now = new Date()
): InvitationStatus {
  if (row.status === "demande_deposee") return "demande_deposee";
  if (Number.isFinite(Date.parse(row.expiresAt)) && Date.parse(row.expiresAt) <= now.getTime()) return "expiree";
  if (row.status === "ouverte") return "ouverte";
  return "envoyee";
}

export function invitationCanOpen(status: InvitationStatus) {
  return status === "envoyee" || status === "ouverte";
}

/** Le parrain n’est pas le demandeur. Un code inconnu ne bloque pas la demande. */
export function referralAttachable(input: { code: string | null; referrerEmail: string | null; applicantEmail: string }) {
  if (!input.code || !input.referrerEmail) return false;
  return normalizeEmail(input.referrerEmail) !== input.applicantEmail;
}

export function maskEmail(email: string) {
  const [local, domain] = normalizeEmail(email).split("@");
  if (!local || !domain) return "";
  const head = local.slice(0, 1);
  return `${head}•••@${domain}`;
}

export function signupMailCopy(kind: "verify" | "received" | "complement" | "refused" | "validated", input: {
  firstName: string;
  link?: string;
  message?: string;
}) {
  const name = input.firstName.trim() || "Bonjour";
  if (kind === "verify") {
    return {
      subject: "Confirmez votre adresse e-mail",
      title: "Confirmez votre adresse",
      paragraphs: [
        `Bonjour ${name},`,
        "Pour déposer votre demande d’inscription, confirmez cette adresse. Le lien est valable 24 heures.",
        "Tant que l’agence n’a pas validé la demande, vous n’avez pas accès à vos séjours.",
      ],
      cta: "Confirmer mon adresse",
      href: input.link || "",
    };
  }
  if (kind === "received") {
    return {
      subject: "Votre demande d’inscription est bien reçue",
      title: "Demande bien reçue",
      paragraphs: [
        `Bonjour ${name},`,
        "L’agence a reçu votre demande. Elle la relit avant d’ouvrir l’accès.",
        "Vous n’avez pas encore accès à vos séjours. Nous vous écrivons dès que c’est relu.",
      ],
      cta: "",
      href: "",
    };
  }
  if (kind === "complement") {
    return {
      subject: "L’agence a besoin d’un complément",
      title: "Un complément est demandé",
      paragraphs: [
        `Bonjour ${name},`,
        "L’agence a besoin d’une précision avant de relire votre demande :",
        input.message || "",
        "Vous pouvez compléter la demande depuis le lien. Rien n’est ouvert tant qu’elle n’est pas validée.",
      ],
      cta: "Compléter ma demande",
      href: input.link || "",
    };
  }
  if (kind === "refused") {
    return {
      subject: "Votre demande d’inscription",
      title: "Demande non retenue",
      paragraphs: [
        `Bonjour ${name},`,
        "L’agence ne peut pas ouvrir l’accès pour le moment.",
        input.message ? input.message : "Vous pouvez écrire à l’agence si vous souhaitez en parler.",
      ],
      cta: "",
      href: "",
    };
  }
  return {
    subject: "Votre demande est acceptée",
    title: "Votre accès va s’ouvrir",
    paragraphs: [
      `Bonjour ${name},`,
      "L’agence a validé votre demande. Vous allez recevoir l’accès à votre espace, par e-mail et par WhatsApp si le message part.",
      "Le lien sert à choisir votre mot de passe, ou à ouvrir l’espace.",
    ],
    cta: "",
    href: "",
  };
}

export function adminSignupNotice(input: { name: string; href: string }) {
  return {
    subject: "Nouvelle demande d’inscription",
    title: "Une demande est en attente",
    paragraphs: [
      `${input.name} a déposé une demande d’inscription.`,
      "Elle reste en file jusqu’au clic Valider, Refuser ou Demander un complément.",
    ],
    cta: "Ouvrir la demande",
    href: input.href,
  };
}
