/**
 * Appels navigateur → routes API, sans jamais lever : une coupure réseau ou une réponse
 * illisible deviennent `{ ok: false, error }`. Les formulaires remettent leur état dans un `finally`.
 */
export type ClientResult<T> = {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
};

export const NETWORK_ERROR = "Connexion interrompue. Réessayez.";

function errorOf(data: unknown, fallback: string) {
  if (data && typeof data === "object" && "error" in data) {
    const message = (data as { error?: unknown }).error;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function requestJson<T = unknown>(
  url: string,
  init?: RequestInit,
  fallback = "La demande n’a pas abouti. Réessayez."
): Promise<ClientResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    return { ok: false, status: 0, error: NETWORK_ERROR };
  }
  const data = await readJson(res);
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      data: (data ?? undefined) as T | undefined,
      error: errorOf(data, res.status === 401 ? "Votre session a expiré. Reconnectez-vous." : fallback),
    };
  }
  return { ok: true, status: res.status, data: (data ?? undefined) as T | undefined };
}

/** POST / PATCH JSON. `init.method` par défaut POST. */
export function postJson<T = unknown>(url: string, body: unknown, init?: RequestInit) {
  return requestJson<T>(url, {
    method: "POST",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    body: JSON.stringify(body ?? {}),
  });
}

/** Envoi d’un FormData (fichier + champs). */
export function sendForm<T = unknown>(url: string, formData: FormData, init?: RequestInit) {
  return requestJson<T>(url, { method: "POST", ...init, body: formData });
}

export function deleteJson<T = unknown>(url: string, init?: RequestInit) {
  return requestJson<T>(url, { method: "DELETE", ...init });
}
