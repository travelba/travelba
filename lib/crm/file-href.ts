export type FileAccess = { partage?: string | null };

function withAccess(params: URLSearchParams, access?: FileAccess) {
  if (access?.partage) params.set("partage", access.partage);
}

/** URL courte. Le client ne reçoit jamais l’URL signée Supabase. */
export function fileHref(path: string, access?: FileAccess) {
  const params = new URLSearchParams({ path });
  withAccess(params, access);
  return `/api/files?${params.toString()}`;
}

export function fileDownloadHref(path: string, name?: string | null, access?: FileAccess) {
  const params = new URLSearchParams({ path, download: "1" });
  if (name?.trim()) params.set("name", name.trim());
  withAccess(params, access);
  return `/api/files?${params.toString()}`;
}

/** Aperçu servi par l’app, sans redirection vers l’URL signée. */
export function fileInlineHref(path: string, access?: FileAccess) {
  const params = new URLSearchParams({ path, inline: "1" });
  withAccess(params, access);
  return `/api/files?${params.toString()}`;
}

/** Vignette première page (PDF) ou image, toujours via /api/files. */
export function fileThumbHref(path: string, access?: FileAccess) {
  const params = new URLSearchParams({ path, inline: "1", thumb: "1" });
  withAccess(params, access);
  return `/api/files?${params.toString()}`;
}
