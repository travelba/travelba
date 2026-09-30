import "server-only";

import { agencyCodeMatches, configuredAgencyCode } from "./agency-card-code";
import { cardLast4, stayRevealNeedsAgencyCode } from "./hotel-arrival";
import { pliantConfigured, readPliantCardSecrets } from "./pliant";

type Admin = {
  from: (table: string) => {
    update: (row: { card_last4: string }) => {
      eq: (column: string, value: string) => PromiseLike<unknown>;
    };
  };
};

type RevealedCard = { pan: string; expiry: string; cvc: string };

export async function revealStayCard(input: {
  admin: Admin;
  rowId: string;
  pliantCardId: string | null;
  closed: boolean;
  code: string;
  audience: "staff" | "client";
}): Promise<{ error: string; status: number } | { secrets: RevealedCard }> {
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
    const secrets = await readPliantCardSecrets(input.pliantCardId);
    const last4 = cardLast4(secrets.pan);
    if (last4.length === 4) {
      await input.admin.from("crm_hotel_arrivals").update({ card_last4: last4 }).eq("id", input.rowId);
    }
    return { secrets };
  } catch {
    return { error: "La carte n’a pas pu être lue.", status: 502 as const };
  }
}
