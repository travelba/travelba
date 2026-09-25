/** URL courte. Le client ne reçoit jamais l’URL signée Supabase. */
export function fileHref(path: string) {
  return `/api/files?path=${encodeURIComponent(path)}`;
}

export function fileDownloadHref(path: string, name?: string | null) {
  const params = new URLSearchParams({ path, download: "1" });
  if (name?.trim()) params.set("name", name.trim());
  return `/api/files?${params.toString()}`;
}

/** Aperçu servi par l’app, sans redirection vers l’URL signée. */
export function fileInlineHref(path: string) {
  const params = new URLSearchParams({ path, inline: "1" });
  return `/api/files?${params.toString()}`;
}
