/** iPhone, iPad, iPod, Mac. Chrome sur Mac envoie Macintosh. Un iPad récent aussi. */
export function isAppleWalletDevice(
  userAgent: string | null | undefined,
  extras?: { platform?: string | null; maxTouchPoints?: number | null }
) {
  const ua = userAgent || "";
  if (/iPhone|iPad|iPod|Macintosh|Mac OS X/i.test(ua)) return true;
  const points = extras?.maxTouchPoints || 0;
  return points > 1 && /Mac/i.test(extras?.platform || "");
}
