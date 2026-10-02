import {
  ONBOARDING_PATH,
  SET_PASSWORD_PATH,
  hasChosenPassword,
  mustSetPassword,
  needsClientOnboarding,
  signedInClientDestination,
} from "./session";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function bearerAccessToken(authorization: string | null | undefined) {
  const value = (authorization || "").trim();
  if (!value.toLowerCase().startsWith("bearer ")) return null;
  const token = value.slice(7).trim();
  if (!token || token.length < 20 || token.length > 4096) return null;
  if (/\s/.test(token)) return null;
  return token;
}

export function isRefreshToken(value: unknown) {
  if (typeof value !== "string") return false;
  const token = value.trim();
  return token.length >= 20 && token.length <= 4096 && !/\s/.test(token);
}

export type MobileSessionUser = {
  id: string;
  email: string | null;
  app_metadata?: Record<string, unknown> | null;
};

export type MobileSessionCustomer = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string;
};

export type MobileSessionTokens = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: "bearer";
};

export function mobileSessionTokens(session: {
  access_token?: string | null;
  refresh_token?: string | null;
  expires_in?: number | null;
} | null | undefined): MobileSessionTokens | null {
  const access = session?.access_token?.trim() || "";
  const refresh = session?.refresh_token?.trim() || "";
  if (access.length < 20 || refresh.length < 20) return null;
  return {
    access_token: access,
    refresh_token: refresh,
    expires_in: Number(session?.expires_in) > 0 ? Number(session?.expires_in) : 3600,
    token_type: "bearer",
  };
}

export function mobileClientGate(input: {
  user: MobileSessionUser | null;
  customer: MobileSessionCustomer | null;
  staff: boolean;
}) {
  if (!input.user) return { ok: false as const, error: "Non authentifié", status: 401 };
  if (input.staff) return { ok: false as const, error: "Cette application est réservée aux clients.", status: 403 };
  if (!input.customer) return { ok: false as const, error: "Compte client introuvable", status: 403 };
  return { ok: true as const, user: input.user, customer: input.customer };
}

export function mobileNextPath(input: {
  staff: boolean;
  user: MobileSessionUser;
  phone?: string | null;
}) {
  return signedInClientDestination({
    staff: input.staff,
    mustSetPassword: mustSetPassword(input.user) && !hasChosenPassword(input.user),
    needsOnboarding: needsClientOnboarding(input.user),
  });
}

export function mobileScreenForPath(path: string) {
  const clean = path.split("?")[0];
  if (clean === SET_PASSWORD_PATH) return "password";
  if (clean === ONBOARDING_PATH) return "welcome";
  if (clean.startsWith("/mon-compte/profil")) return "profile";
  if (clean.startsWith("/mon-compte/reservations")) return "bookings";
  if (clean.startsWith("/mon-compte/transactions")) return "transactions";
  if (clean.startsWith("/mon-compte")) return "home";
  if (clean.startsWith("/connexion")) return "sign-in";
  return "home";
}

export type MobileSessionSnapshot = {
  customer: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    email: string;
    needs_phone: boolean;
  };
  next: string;
  screen: ReturnType<typeof mobileScreenForPath>;
};

export function mobileSessionSnapshot(input: {
  user: MobileSessionUser;
  customer: MobileSessionCustomer;
  staff?: boolean;
}): MobileSessionSnapshot {
  const next = mobileNextPath({
    staff: Boolean(input.staff),
    user: input.user,
    phone: input.customer.phone,
  });
  return {
    customer: {
      id: input.customer.id,
      first_name: input.customer.first_name,
      last_name: input.customer.last_name,
      phone: input.customer.phone,
      email: input.customer.email,
      needs_phone: !input.customer.phone,
    },
    next,
    screen: mobileScreenForPath(next),
  };
}

export function entryCodeFromPath(pathname: string) {
  const path = pathname.split("?")[0].replace(/\/+$/, "");
  const parts = path.split("/").filter(Boolean);
  if (parts[0] !== "e") return null;
  const code = parts[1] === "c" ? parts[2] : parts[1];
  return code && /^[2-9A-HJ-NP-Z]{8}$/.test(code) ? code : null;
}

export function callbackSecretsFromUrl(raw: string) {
  try {
    const url = new URL(raw, "https://travelba.fr");
    const tokenHash = url.searchParams.get("token_hash");
    const code = url.searchParams.get("code");
    const type = url.searchParams.get("type");
    return {
      token_hash: tokenHash && tokenHash.length > 10 ? tokenHash : null,
      code: code && code.length > 10 ? code : null,
      type,
    };
  } catch {
    return { token_hash: null, code: null, type: null };
  }
}

export function isAuthUserId(value: string | null | undefined) {
  return Boolean(value && UUID_RE.test(value));
}
