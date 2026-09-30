const PCI_HOSTS = new Set(["pci-api.getpliant.com", "pci-sandbox.partner-api.getpliant.com"]);

const BLOCKED = new Set([
  "La carte est encore en activation chez Pliant.",
  "Cette carte est clôturée.",
  "Cette carte est verrouillée.",
  "Pliant refuse l’ouverture du numéro.",
  "La carte n’a pas pu être lue.",
]);

/** Le coffre Pliant ne livre le numéro qu’aux partenaires PCI. Les autres passent par le widget. */
export function pliantCardBlockMessage(status: string) {
  const value = status.trim().toUpperCase();
  if (!value || value === "ACTIVE") return null;
  if (
    value.startsWith("TERMINAT") ||
    value === "EXPIRED" ||
    value === "REQUEST_CANCELLED" ||
    value === "REQUEST_REJECTED"
  ) {
    return "Cette carte est clôturée.";
  }
  if (value === "LOCKED" || value === "LOCKED_PIN") return "Cette carte est verrouillée.";
  return "La carte est encore en activation chez Pliant.";
}

export function pliantWidgetFailure(status: number) {
  if (status === 404) return "La carte est encore en activation chez Pliant.";
  if (status === 403) return "Pliant refuse l’ouverture du numéro.";
  return "La carte n’a pas pu être lue.";
}

export function pliantWidgetError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return BLOCKED.has(message) ? message : "La carte n’a pas pu être lue.";
}

/** Jeton court du widget. Un numéro de carte ne doit jamais servir de jeton. */
export function parsePliantWidgetOtp(raw: string) {
  const text = raw.trim();
  if (!text) return "";
  let value = "";
  try {
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed === "string") value = parsed.trim();
    else if (parsed && typeof parsed === "object") {
      const row = parsed as Record<string, unknown>;
      const picked = row.otp ?? row.token ?? row.value;
      if (typeof picked === "string") value = picked.trim();
    }
  } catch {
    value = text.replace(/^"|"$/g, "").trim();
  }
  if (!value || value.length > 128 || /^\d{13,19}$/.test(value)) return "";
  return value;
}

export function pliantWidgetParams(input: { otp: string; cardId: string; frameId: string }) {
  const config = {
    title: "Carte hôtel",
    token: input.otp,
    cardId: input.cardId,
    overlayText: "Le numéro a été masqué.",
    copyLabel: "Copier",
    frameId: input.frameId,
    pan: { label: "Numéro", display: true, clickToCopy: true, textOnCopy: "Numéro copié" },
    cardholderName: { label: "Titulaire", display: true, clickToCopy: true, textOnCopy: "Titulaire copié" },
    expiryDate: { label: "Expire", display: true, clickToCopy: true, textOnCopy: "Date copiée" },
    cvv: { label: "CVC", display: true, clickToCopy: true, textOnCopy: "CVC copié" },
  };
  return Buffer.from(JSON.stringify(config), "utf8").toString("base64");
}

export function pliantWidgetUrl(host: string, traceId: string, params: string) {
  const base = host.replace(/\/$/, "");
  return `${base}/card-details/widget?traceId=${encodeURIComponent(traceId)}&params=${encodeURIComponent(params)}`;
}

export function isPliantWidgetUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && PCI_HOSTS.has(parsed.hostname) && parsed.pathname === "/card-details/widget";
  } catch {
    return false;
  }
}
