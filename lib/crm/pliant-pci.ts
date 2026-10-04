const PCI_HOSTS = new Set(["https://pci-api.getpliant.com", "https://pci-sandbox.partner-api.getpliant.com"]);

/** Le coffre renvoie l’OTP en texte ou en chaîne JSON. */
export function pliantOtpToken(body: string) {
  const trimmed = body.trim();
  const raw = /^\d{4,12}$/.test(trimmed) ? trimmed : "";
  if (raw) return raw;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === "string" && /^\d{4,12}$/.test(parsed)) return parsed;
  } catch {
    return null;
  }
  return null;
}

export function pliantPciWidgetUrl(input: {
  host: string;
  traceId: string;
  cardId: string;
  token: string;
  frameId: string;
}) {
  const host = input.host.replace(/\/$/, "");
  if (!PCI_HOSTS.has(host)) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.cardId)) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.traceId)) return null;
  if (!/^\d{4,12}$/.test(input.token)) return null;
  const frameId = input.frameId.replace(/[^\w-]/g, "").slice(0, 80);
  if (!frameId) return null;
  const config = {
    title: "Carte hôtel",
    token: input.token,
    cardId: input.cardId,
    overlayText: "Afficher la carte",
    copyLabel: "Copier",
    frameId,
    pan: { label: "Numéro", display: true, clickToCopy: true, textOnCopy: "Copier le numéro" },
    cardholderName: { label: "Titulaire", display: true, clickToCopy: true, textOnCopy: "Copier le titulaire" },
    expiryDate: { label: "Expire", display: true, clickToCopy: true, textOnCopy: "Copier la date" },
    cvv: { label: "CVC", display: true, clickToCopy: true, textOnCopy: "Copier le CVC" },
  };
  const params = Buffer.from(JSON.stringify(config), "utf8").toString("base64");
  return `${host}/card-details/widget?traceId=${encodeURIComponent(input.traceId)}&params=${encodeURIComponent(params)}`;
}

export function pliantWidgetEvent(data: unknown): { eventType: string; frameId: string } | null {
  if (typeof data === "string") {
    try {
      return pliantWidgetEvent(JSON.parse(data) as unknown);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== "object") return null;
  const row = data as { eventType?: unknown; frameId?: unknown };
  if (typeof row.eventType !== "string" || typeof row.frameId !== "string") return null;
  return { eventType: row.eventType, frameId: row.frameId };
}
