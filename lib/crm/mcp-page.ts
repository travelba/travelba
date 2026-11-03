/** Taille de page par défaut des listes MCP. Le total n’est pas plafonné : `page` avance. */
export const MCP_PAGE_DEFAULT = 30;
export const MCP_PAGE_MAX = 100;

export type McpWindow = { page: number; limite: number; from: number };

export function mcpWindow(
  input: { page?: number; limite?: number } | undefined,
  fallback = MCP_PAGE_DEFAULT
): McpWindow {
  const pageRaw = Number(input?.page);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
  const limitRaw = Number(input?.limite);
  const limite =
    Number.isFinite(limitRaw) && limitRaw >= 1 ? Math.min(MCP_PAGE_MAX, Math.floor(limitRaw)) : fallback;
  return { page, limite, from: (page - 1) * limite };
}

/** `rows` contient au plus `limite + 1` lignes, déjà calées sur la page. */
export function mcpPageMeta<T>(rows: T[], window: { page: number; limite: number }) {
  const suite = rows.length > window.limite;
  return {
    rows: rows.slice(0, window.limite),
    page: window.page,
    limite: window.limite,
    suite,
    page_suivante: suite ? window.page + 1 : null,
  };
}

/** Découpe une liste déjà chargée. La page suivante reste accessible. */
export function mcpSlice<T>(rows: T[], window: McpWindow) {
  return mcpPageMeta(rows.slice(window.from, window.from + window.limite + 1), window);
}
