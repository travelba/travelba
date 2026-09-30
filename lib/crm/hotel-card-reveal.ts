import "server-only";

import { agencyCodeMatches, configuredAgencyCode } from "./agency-card-code";
import { stayRevealNeedsAgencyCode } from "./hotel-arrival";
import { pliantConfigured, openPliantCardWidget } from "./pliant";
import { pliantWidgetError } from "./pliant-widget";

export async function revealStayCard(input: {
  pliantCardId: string | null;
  closed: boolean;
  code: string;
  audience: "staff" | "client";
}): Promise<{ error: string; status: number } | { widgetUrl: string; frameId: string }> {
  if (input.closed) return { error: "Cette carte est clôturée.", status: 400 as const };
  if (!input.pliantCardId) return { error: "Aucune carte émise.", status: 400 as const };
  if (stayRevealNeedsAgencyCode(input.audience)) {
    const expected = configuredAgencyCode();
    if (!expected || !agencyCodeMatches(input.code, expected)) {
      return { error: "Code agence incorrect.", status: 403 as const };
    }
  }
  if (!pliantConfigured()) {
    return {
      error: input.audience === "staff" ? "Pliant n’est pas branché." : "La carte n’a pas pu être lue.",
      status: input.audience === "staff" ? (400 as const) : (502 as const),
    };
  }
  try {
    const widget = await openPliantCardWidget(input.pliantCardId);
    return { widgetUrl: widget.url, frameId: widget.frameId };
  } catch (error) {
    const message = pliantWidgetError(error);
    const pending = message === "La carte est encore en activation chez Pliant.";
    return { error: message, status: pending ? (409 as const) : (502 as const) };
  }
}
