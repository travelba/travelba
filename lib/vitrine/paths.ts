export const PREVIEW = "/preview-refonte";

export function voyagePath(slug: string, anchor?: string) {
  const base = `${PREVIEW}/voyages/${slug}`;
  return anchor ? `${base}#${anchor}` : base;
}

export function contactPath(intention: string, extra?: Record<string, string>) {
  const params = new URLSearchParams({ intention });
  if (extra) {
    for (const [key, value] of Object.entries(extra)) params.set(key, value);
  }
  return `${PREVIEW}/contact?${params.toString()}`;
}
