/** Envoie un geste que seul le navigateur voit. Le serveur écrit le libellé. */
export function postHotelActivity(body: Record<string, unknown>) {
  if (typeof fetch === "undefined") return;
  void fetch("/api/client/hotels/activite", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {});
}
