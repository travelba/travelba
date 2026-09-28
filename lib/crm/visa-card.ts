import { customerPliantCardCount, etaIlPliantCard } from "./eta-il-fee";
import { paymentHold } from "./visa-flow";
import type { EurFx } from "./visa-fees";

type CardRow = { pliant_card_id?: string | null; ceiling_cents?: number | null };

export type VisaCardDb = {
  from: (table: string) => any;
};

export type IlPliantCardResult = {
  issued: boolean;
  ceilingEur: number;
  feeIls: number;
  cardId: string | null;
  label: string;
  journal: string;
  level: "fini" | "attente" | "erreur";
};

/** Une carte par dossier, plafond 30 % au-dessus de 25 ILS par voyageur. Pas de second émission. */
export async function ensureIlPliantCard(opts: {
  db: VisaCardDb;
  bookingId: string;
  customerId: string;
  firstName: string;
  lastName: string;
  travelerCount: number;
  bookingReference: string;
  startDate?: string | null;
  endDate?: string | null;
  rates?: EurFx;
  configured?: boolean;
  organizationId?: string;
  cardholderId?: string;
  issue?: (cardholderId: string, body: unknown) => Promise<{ cardId: string | null }>;
  raise?: (cardId: string, limit: { value: number; currency: "EUR" }, count: number) => Promise<void>;
}): Promise<IlPliantCardResult> {
  const count = Math.max(1, Math.floor(Number(opts.travelerCount)) || 1);
  const spec = etaIlPliantCard({
    firstName: opts.firstName,
    lastName: opts.lastName,
    travelerCount: count,
    bookingReference: opts.bookingReference,
    rates: opts.rates,
    organizationId: opts.organizationId ?? process.env.PLIANT_ORGANIZATION_ID ?? "",
    startDate: opts.startDate,
    endDate: opts.endDate,
    existingCards: await customerPliantCardCount(opts.db, opts.customerId),
  });
  const feeIls = spec.feeIls;
  const base = { ceilingEur: spec.ceilingEur, feeIls, cardId: null as string | null, label: spec.body.label };
  if (!(spec.body.limit.value > 0)) {
    return { ...base, issued: false, level: "erreur", journal: "Cours indisponible pour le plafond Pliant." };
  }
  const ready = opts.configured ?? (await import("./pliant")).pliantConfigured();
  if (!ready) {
    return { ...base, ceilingEur: spec.ceilingEur, issued: false, level: "attente", journal: paymentHold(false) || "" };
  }

  const { data } = await opts.db
    .from("crm_visa_cards")
    .select("pliant_card_id, ceiling_cents")
    .eq("booking_id", opts.bookingId)
    .maybeSingle();
  const existing = data as CardRow | null;
  const limit = { value: spec.body.limit.value, currency: "EUR" as const };
  const journal = `Carte Pliant ${spec.body.label}. Plafond ${spec.ceilingEur} € pour ${feeIls} ILS.`;

  if (existing?.pliant_card_id) {
    try {
      const raise = opts.raise || (await import("./pliant")).raisePliantLimit;
      await raise(existing.pliant_card_id, limit, spec.body.maxTransactionCount);
      await opts.db.from("crm_visa_cards").upsert(
        {
          booking_id: opts.bookingId,
          pliant_card_id: existing.pliant_card_id,
          ceiling_cents: spec.body.limit.value,
          countries: ["IL"],
        },
        { onConflict: "booking_id" }
      );
    } catch {
      return { ...base, ceilingEur: spec.ceilingEur, issued: false, level: "erreur", journal: "Pliant n’a pas créé la carte." };
    }
    return {
      issued: true,
      ceilingEur: spec.ceilingEur,
      feeIls,
      cardId: existing.pliant_card_id,
      label: spec.body.label,
      level: "fini",
      journal,
    };
  }

  try {
    const issue = opts.issue || (await import("./pliant")).issuePliantCard;
    const issued = await issue(opts.cardholderId ?? process.env.PLIANT_CARDHOLDER_ID ?? "", spec.body);
    if (!issued.cardId) {
      return { ...base, ceilingEur: spec.ceilingEur, issued: false, level: "erreur", journal: "Pliant n’a pas créé la carte." };
    }
    await opts.db.from("crm_visa_cards").upsert(
      {
        booking_id: opts.bookingId,
        pliant_card_id: issued.cardId,
        ceiling_cents: spec.body.limit.value,
        countries: ["IL"],
      },
      { onConflict: "booking_id" }
    );
    return {
      issued: true,
      ceilingEur: spec.ceilingEur,
      feeIls,
      cardId: issued.cardId,
      label: spec.body.label,
      level: "fini",
      journal,
    };
  } catch {
    return { ...base, ceilingEur: spec.ceilingEur, issued: false, level: "erreur", journal: "Pliant n’a pas créé la carte." };
  }
}
