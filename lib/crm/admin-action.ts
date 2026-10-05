import type { BookingIssue } from "./booking-issues";

export type AdminActionResult<T> = {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  issues?: BookingIssue[];
};

export const ADMIN_ACTION_NETWORK_ERROR = "Connexion interrompue. Réessayez.";

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Appel d’une API agence qui ne lève jamais : `ok`, `status`, `data`, `error` et `issues` lus sur la réponse.
 * Réseau coupé ou JSON illisible → `ok: false` avec un message en français.
 */
export async function adminAction<T = Record<string, unknown>>(
  url: string,
  init: { method: string; body?: unknown; formData?: FormData; signal?: AbortSignal } = { method: "GET" },
  fetcher: Fetcher = (input, options) => fetch(input, options)
): Promise<AdminActionResult<T>> {
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;
  if (init.formData) {
    body = init.formData;
  } else if (init.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.body);
  }
  let res: Response;
  try {
    res = await fetcher(url, { method: init.method, headers, body, signal: init.signal });
  } catch {
    return { ok: false, status: 0, error: ADMIN_ACTION_NETWORK_ERROR };
  }
  let json: Record<string, unknown> = {};
  try {
    const text = await res.text();
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    json = {};
  }
  if (!json || typeof json !== "object" || Array.isArray(json)) json = {};
  const issues = Array.isArray(json.issues)
    ? (json.issues as unknown[]).filter(
        (row): row is BookingIssue =>
          Boolean(row) && typeof row === "object" && typeof (row as BookingIssue).message === "string"
      )
    : undefined;
  if (!res.ok) {
    const error =
      typeof json.error === "string" && json.error.trim()
        ? json.error
        : issues?.length
          ? issues.map((issue) => issue.message).join(" ")
          : adminActionStatusMessage(res.status);
    return { ok: false, status: res.status, error, issues: issues?.length ? issues : undefined };
  }
  return { ok: true, status: res.status, data: json as T };
}

/** Message par défaut quand le serveur ne dit rien. */
export function adminActionStatusMessage(status: number) {
  if (status === 401) return "Session expirée. Reconnectez-vous.";
  if (status === 403) return "Accès réservé à l’agence.";
  if (status === 404) return "Introuvable. La page a peut-être changé.";
  if (status >= 500) return "Le serveur n’a pas répondu. Réessayez.";
  return "Action impossible. Réessayez.";
}
