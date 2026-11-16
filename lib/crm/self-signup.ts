import { AGENCY_GOOGLE_DOMAIN } from "./agency-access";
import { toE164 } from "./phone";
import { MIN_PASSWORD_LENGTH } from "./session";

/** Client invité par l’agence. Défaut des fiches déjà là. */
export const ACCOUNT_INVITED = "invited";
/** Inconnu inscrit seul pour réserver un hôtel. */
export const ACCOUNT_SELF = "self_service";

export const SIGNUP_PATH = "/inscription";
export const SIGNUP_COOKIE = "tb_signup";

export const SELF_SERVICE_DEFAULTS = {
  enabled: true,
  maxStayCents: 1_500_000,
  searchesPerHour: 20,
  bookingsPerDay: 3,
} as const;

export type SelfServiceSettings = {
  enabled: boolean;
  maxStayCents: number;
  searchesPerHour: number;
  bookingsPerDay: number;
};

export type SignupStep = "identite" | "telephone" | "carte" | "conditions" | "ouvert";

export type SignupSnapshot = {
  firstName: string;
  lastName: string;
  phoneVerifiedAt: string | null;
  hasCard: boolean;
  termsAt: string | null;
  completedAt: string | null;
};

const NAME = /^[\p{L}][\p{L}\s'’-]*$/u;

export function isSelfServiceOrigin(origin: string | null | undefined) {
  return origin === ACCOUNT_SELF;
}

export function isAgencySignupEmail(email: string) {
  return email.trim().toLowerCase().endsWith(`@${AGENCY_GOOGLE_DOMAIN}`);
}

function cleanName(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, " ").trim().slice(0, 80);
}

/** Prénom et nom proposés par Google. L’inscrit les confirme ensuite. */
export function googleNameParts(input: { given?: string | null; family?: string | null; full?: string | null }) {
  const given = cleanName(input.given);
  const family = cleanName(input.family);
  if (given && family) return { firstName: given, lastName: family };
  const full = cleanName(input.full);
  const parts = full.split(" ").filter(Boolean);
  if (parts.length >= 2) {
    return {
      firstName: given || parts.slice(0, -1).join(" "),
      lastName: family || parts.at(-1) || "",
    };
  }
  return { firstName: given || parts[0] || "", lastName: family };
}

export function identityDecision(input: { firstName: string; lastName: string }) {
  const firstName = cleanName(input.firstName);
  const lastName = cleanName(input.lastName);
  if (firstName.length < 2 || lastName.length < 2 || !NAME.test(firstName) || !NAME.test(lastName)) {
    return { ok: false as const, message: "Indiquez votre prénom et votre nom." };
  }
  return { ok: true as const, firstName, lastName };
}

export function normalizeSignupPhone(raw: string) {
  const e164 = toE164(raw, "FR");
  if (!e164 || !e164.startsWith("+")) {
    return { ok: false as const, message: "Indiquez un numéro de mobile, avec l’indicatif." };
  }
  return { ok: true as const, e164 };
}

export function passwordDecision(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false as const, message: `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.` };
  }
  return { ok: true as const };
}

export type ExistingSignup = {
  id: string;
  authUserId: string | null;
  origin: string | null;
};

/**
 * Google a prouvé l’adresse. Une fiche invitée reste invitée.
 * Une adresse de l’agence ne devient pas un inscrit autonome.
 */
export function googleSignupDecision(input: {
  email: string;
  staff: boolean;
  userId: string;
  existing: ExistingSignup | null;
}) {
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) return { action: "refuse" as const, reason: "email" as const };
  if (input.staff || isAgencySignupEmail(email)) return { action: "refuse" as const, reason: "agence" as const };
  if (!input.existing) return { action: "create" as const };
  if (input.existing.authUserId && input.existing.authUserId !== input.userId) {
    return { action: "refuse" as const, reason: "pris" as const };
  }
  return {
    action: "enter" as const,
    customerId: input.existing.id,
    link: !input.existing.authUserId,
    selfService: isSelfServiceOrigin(input.existing.origin),
  };
}

export function emailSignupDecision(input: { email: string; staff: boolean; taken: boolean }) {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false as const, message: "Indiquez une adresse e-mail." };
  }
  if (input.staff || isAgencySignupEmail(email)) {
    return { ok: false as const, message: "Cette adresse ne peut pas s’inscrire ici." };
  }
  if (input.taken) {
    return { ok: false as const, message: "Cette adresse a déjà un accès. Connectez-vous." };
  }
  return { ok: true as const, email };
}

/** Étape affichée. L’ouverture n’a lieu qu’une fois tout réuni. */
export function signupStep(snapshot: SignupSnapshot): SignupStep {
  if (snapshot.completedAt) return "ouvert";
  const named = identityDecision({ firstName: snapshot.firstName, lastName: snapshot.lastName }).ok;
  if (!named) return "identite";
  if (!snapshot.phoneVerifiedAt) return "telephone";
  if (!snapshot.hasCard) return "carte";
  if (!snapshot.termsAt) return "conditions";
  return "conditions";
}

export function completeSignupDecision(snapshot: SignupSnapshot) {
  const step = signupStep({ ...snapshot, completedAt: null, termsAt: snapshot.termsAt });
  if (!snapshot.termsAt) return { ok: false as const, message: "Confirmez votre majorité et les conditions.", step: "conditions" as const };
  if (step !== "conditions") {
    const message =
      step === "identite"
        ? "Indiquez votre prénom et votre nom."
        : step === "telephone"
          ? "Vérifiez votre numéro de téléphone."
          : "Enregistrez une carte avant de continuer.";
    return { ok: false as const, message, step };
  }
  return { ok: true as const };
}

export function selfServiceMetadata(complete: boolean) {
  return {
    crm_role: "client",
    account_origin: ACCOUNT_SELF,
    signup_complete: complete,
    must_set_password: false,
  };
}

export function parseSelfServiceSettings(raw: unknown): SelfServiceSettings {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const maxStayCents = clampInt(source.maxStayCents, SELF_SERVICE_DEFAULTS.maxStayCents, 10_000, 10_000_000);
  const searchesPerHour = clampInt(source.searchesPerHour, SELF_SERVICE_DEFAULTS.searchesPerHour, 1, 100);
  const bookingsPerDay = clampInt(source.bookingsPerDay, SELF_SERVICE_DEFAULTS.bookingsPerDay, 1, 20);
  return {
    enabled: source.enabled === false ? false : true,
    maxStayCents,
    searchesPerHour,
    bookingsPerDay,
  };
}

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function decideSelfServiceSettings(input: { actor: string; value: unknown }) {
  if (input.actor !== "admin") return { ok: false as const, message: "Réservé aux administrateurs." };
  return { ok: true as const, settings: parseSelfServiceSettings(input.value) };
}

/** Refus d’une réservation autonome. Null : le parcours habituel, ou rien ne bloque. */
export function selfServiceBookingBlock(input: {
  origin: string | null | undefined;
  onHold: boolean;
  phoneVerified: boolean;
  hasCard: boolean;
  sellCents: number;
  currency: string;
  bookingsToday: number;
  settings: SelfServiceSettings;
}) {
  if (!isSelfServiceOrigin(input.origin)) return null;
  if (input.onHold) return "Votre accès est suspendu. Contactez l’agence.";
  if (!input.phoneVerified) return "Vérifiez votre numéro de téléphone.";
  if (!input.hasCard) return "Enregistrez une carte avant de réserver.";
  if (!input.settings.enabled) return "Les réservations en autonomie sont suspendues.";
  if (input.currency.toUpperCase() !== "EUR") return "Ce tarif n’est pas en euros. Écrivez à votre conseiller.";
  if (!Number.isInteger(input.sellCents) || input.sellCents < 1) return "Ce tarif n’est plus disponible.";
  if (input.sellCents > input.settings.maxStayCents) return "Ce séjour dépasse le plafond d’une réservation en autonomie.";
  if (input.bookingsToday >= input.settings.bookingsPerDay) return "Vous avez atteint le nombre de réservations du jour.";
  return null;
}

export function ficheSignupFields(row: { account_origin?: string | null; phone_verified_at?: string | null } | null) {
  if (!row || !isSelfServiceOrigin(row.account_origin)) return { origine: "invite" as const };
  return { origine: "autonome" as const, telephone_verifie: Boolean(row.phone_verified_at) };
}

/**
 * Le proxy ne laisse l’espace qu’une fois l’inscription finie.
 * L’origine vient du jeton. Le cookie `done` couvre le jeton encore ancien, juste après l’ouverture.
 * Les API restent la garde : drapeaux, téléphone, carte, quotas.
 */
export function inscriptionRedirect(input: {
  pathname: string;
  signupCookie: string | null;
  staff: boolean;
  origin: string | null;
  signupComplete: boolean;
}) {
  if (input.staff || !isSelfServiceOrigin(input.origin)) return null;
  const path = input.pathname;
  const done = input.signupComplete || input.signupCookie === "done";
  if (!done && (path.startsWith("/mon-compte") || path === "/connexion" || path.startsWith("/connexion/"))) {
    return SIGNUP_PATH;
  }
  if (!done) return null;
  if (path === SIGNUP_PATH || path.startsWith(`${SIGNUP_PATH}/`)) return "/mon-compte/hotels";
  if (path.startsWith("/mon-compte/profil/") && path !== "/mon-compte/profil") return "/mon-compte/profil";
  if (
    path.startsWith("/mon-compte") &&
    path !== "/mon-compte/profil" &&
    !path.startsWith("/mon-compte/hotels") &&
    !path.startsWith("/mon-compte/reservations")
  ) {
    return "/mon-compte/hotels";
  }
  return null;
}

export function signupCookieWrite(state: "pending" | "done" | "clear", secure: boolean) {
  return {
    name: SIGNUP_COOKIE,
    value: state === "clear" ? "" : state,
    options: {
      path: "/",
      httpOnly: true,
      sameSite: "lax" as const,
      secure,
      maxAge: state === "clear" ? 0 : 400 * 24 * 60 * 60,
    },
  };
}
