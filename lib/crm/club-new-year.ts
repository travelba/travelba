/** Fin offerte à la validation, et point de départ de la prolongation du 1er janvier. */
export const CLUB_OFFER_ENDS_ON = "2026-12-31";

export const CLUB_NEW_YEAR_TO = "2027-12-31";

/** 1er janvier 2027, 0 h 30, heure de Paris (UTC+1). */
export const CLUB_NEW_YEAR_AT = "2026-12-31T23:30:00.000Z";

export const NEW_YEAR_TEMPLATE = "bonne_annee_prolongation";

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

export function clubUntilLabel(endsOn?: string | null) {
  const iso = endsOn && /^\d{4}-\d{2}-\d{2}$/.test(endsOn) ? endsOn : CLUB_OFFER_ENDS_ON;
  const [year, month, day] = iso.split("-").map(Number);
  return `Jusqu’au ${day} ${MONTHS[month - 1]} ${year}`;
}

/** {{1}} du modèle. Jamais vide, et jamais « Bonjour Bonjour ». */
export function newYearGreeting(firstName: string) {
  const name = firstName.replace(/\s+/g, " ").trim();
  return name ? `Bonjour ${name}.` : "Bonjour.";
}

export function newYearMessage(firstName: string) {
  return `${newYearGreeting(firstName)} Le Travel Club TBA vous souhaite une bonne année. Votre adhésion Platinum est prolongée jusqu’au 31 décembre 2027. Elle reste nominative et réservée à vos propres réservations.`;
}

export function newYearExtensionEnabled(env: Record<string, string | undefined>) {
  return env.NEW_YEAR_EXTENSION_ENABLED === "1";
}

export function newYearWindowOpen(now: Date) {
  return now.getTime() >= Date.parse(CLUB_NEW_YEAR_AT);
}

export type NewYearMember = {
  id: string;
  firstName: string;
  phone: string | null;
  clubRank: string | null;
  endsOn: string | null;
};

export function planNewYearExtension(input: {
  now: Date;
  enabled: boolean;
  members: NewYearMember[];
  alreadySent: ReadonlySet<string>;
}) {
  const due = newYearWindowOpen(input.now);
  const recipients = input.members
    .filter(
      (member) =>
        member.clubRank === "platinum" &&
        member.endsOn === CLUB_OFFER_ENDS_ON &&
        !input.alreadySent.has(member.id)
    )
    .map((member) => {
      const digits = (member.phone || "").replace(/\D/g, "");
      return {
        id: member.id,
        firstName: member.firstName,
        phone: member.phone,
        greeting: newYearGreeting(member.firstName),
        message: newYearMessage(member.firstName),
        send: digits.length >= 8,
      };
    });
  return {
    due,
    enabled: input.enabled,
    dryRun: !input.enabled || !due,
    from: CLUB_OFFER_ENDS_ON,
    to: CLUB_NEW_YEAR_TO,
    recipients,
  };
}

export function whatsappNewYearPayload(input: { to: string; template: string; lang: string; firstName: string }) {
  return {
    messaging_product: "whatsapp",
    to: input.to.replace(/\D/g, ""),
    type: "template",
    template: {
      name: input.template,
      language: { code: input.lang || "fr" },
      components: [
        {
          type: "body",
          parameters: [{ type: "text", text: newYearGreeting(input.firstName).slice(0, 80) }],
        },
      ],
    },
  };
}
