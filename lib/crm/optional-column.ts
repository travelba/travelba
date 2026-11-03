import type { DbErrorLike } from "@/lib/crm/db-error";

/** Colonne absente (Postgres 42703) ou pas encore dans le cache PostgREST. */
export function missingDbColumn(error: DbErrorLike, column: string) {
  if (!error) return false;
  const code = error.code || "";
  if (code !== "42703" && code !== "PGRST204") return false;
  const message = (error.message || "").toLowerCase();
  if (!message) return true;
  return message.includes(column.toLowerCase());
}

/**
 * Relit sans la colonne si elle n’existe pas encore.
 * La liste de base ne la contient pas : la production répond même si la migration n’est pas jouée.
 */
export async function queryWithOptionalColumn<T>(
  run: (columns: string) => PromiseLike<{ data: T; error: DbErrorLike }>,
  columns: string,
  optional: string
) {
  const first = await run(`${columns}, ${optional}`);
  if (first.error && missingDbColumn(first.error, optional)) return run(columns);
  return first;
}
