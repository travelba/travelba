/** Moment court pour une notification. Vide si la date est illisible. */
export function replyMoment(iso: string, nowMs = Date.now()) {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "";
  const delta = Math.max(0, nowMs - at);
  if (delta < 60_000) return "À l’instant";
  if (delta < 3_600_000) {
    const minutes = Math.floor(delta / 60_000);
    return `Il y a ${minutes} min`;
  }
  if (delta < 86_400_000) {
    const hours = Math.floor(delta / 3_600_000);
    return `Il y a ${hours} h`;
  }
  const days = Math.floor(delta / 86_400_000);
  return `Il y a ${days} j`;
}
