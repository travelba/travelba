export const CUSTOMER_LOGIN_METHODS = [
  "password",
  "magiclink",
  "invite",
  "recovery",
  "entry",
  "precedent",
  "desk",
] as const;

export type CustomerLoginMethod = (typeof CUSTOMER_LOGIN_METHODS)[number];

export const LOGIN_DEBOUNCE_MS = 90_000;

const METHOD_LABELS: Record<CustomerLoginMethod, string> = {
  password: "Mot de passe",
  magiclink: "Lien magique",
  invite: "Invitation",
  recovery: "Réinitialisation",
  entry: "Lien d’accès",
  precedent: "Connexion précédente",
  desk: "Ouverture par l’agence",
};

export function isCustomerLoginMethod(value: string): value is CustomerLoginMethod {
  return (CUSTOMER_LOGIN_METHODS as readonly string[]).includes(value);
}

export function loginMethodLabel(method: string) {
  return isCustomerLoginMethod(method) ? METHOD_LABELS[method] : "Connexion";
}

export function loginMethodFromCallback(type: string | null): CustomerLoginMethod {
  if (type === "invite" || type === "recovery" || type === "magiclink") return type;
  return "magiclink";
}

export function shouldRecordLogin(opts: {
  previousAt: string | null;
  now: Date;
  windowMs?: number;
}) {
  if (!opts.previousAt) return true;
  const previous = new Date(opts.previousAt).getTime();
  if (Number.isNaN(previous)) return true;
  return opts.now.getTime() - previous > (opts.windowMs ?? LOGIN_DEBOUNCE_MS);
}

/** Jour et heure à Paris, pour l’agence. */
export function formatCustomerLoginAt(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const date = d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  });
  const time = d.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  });
  return `${date} à ${time}`;
}

export type CustomerLoginStore = {
  findCustomerId: (authUserId: string) => Promise<string | null>;
  latestCreatedAt: (customerId: string) => Promise<string | null>;
  insert: (row: {
    customer_id: string;
    auth_user_id: string;
    method: CustomerLoginMethod;
  }) => Promise<void>;
};

export async function writeCustomerLogin(
  opts: {
    authUserId: string;
    method: CustomerLoginMethod;
    now?: Date;
  },
  store: CustomerLoginStore
) {
  const authUserId = opts.authUserId.trim();
  if (!authUserId) return { recorded: false as const, reason: "auth" };
  const customerId = await store.findCustomerId(authUserId);
  if (!customerId) return { recorded: false as const, reason: "customer" };
  const now = opts.now ?? new Date();
  const previousAt = await store.latestCreatedAt(customerId);
  if (!shouldRecordLogin({ previousAt, now })) {
    return { recorded: false as const, reason: "debounce" };
  }
  await store.insert({
    customer_id: customerId,
    auth_user_id: authUserId,
    method: opts.method,
  });
  return { recorded: true as const, customerId };
}

export async function recordCustomerLogin(
  authUserId: string,
  method: CustomerLoginMethod
) {
  try {
    const { createServiceClient } = await import("@/lib/supabase/admin");
    const admin = createServiceClient();
    await writeCustomerLogin(
      { authUserId, method },
      {
        async findCustomerId(id) {
          const { data } = await admin
            .from("crm_customers")
            .select("id")
            .eq("auth_user_id", id)
            .maybeSingle();
          return typeof data?.id === "string" ? data.id : null;
        },
        async latestCreatedAt(customerId) {
          const { data } = await admin
            .from("crm_customer_logins")
            .select("created_at")
            .eq("customer_id", customerId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          return typeof data?.created_at === "string" ? data.created_at : null;
        },
        async insert(row) {
          const { error } = await admin.from("crm_customer_logins").insert(row);
          if (error) throw new Error(error.message || "insert");
        },
      }
    );
  } catch {
    console.error("[customer-login] enregistrement impossible");
  }
}
