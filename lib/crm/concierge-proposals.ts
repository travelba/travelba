import { isVercelPreview } from "@/lib/crm/preview-secrets";
import { stayPayMethods, STAY_PAY_LABELS } from "@/lib/crm/stripe-pay";
import type { PayerKind } from "@/lib/crm/payer";
import { withConciergeSignature } from "@/lib/crm/whatsapp";
import type { ProposalDraft } from "@/lib/crm/concierge-journey";

export type StoredProposal = ProposalDraft & {
  id?: string;
  phone: string;
  customerId: string | null;
  bookingId: string | null;
  status: "pending" | "approved" | "rejected" | "edited";
};

/** Le canal reste coupé tant que l’agence ne pose pas CONCIERGE_OUTBOUND=1, et jamais en aperçu. */
export function conciergeOutboundArmed(env = process.env) {
  if (isVercelPreview()) return false;
  return (env.CONCIERGE_OUTBOUND || "").trim() === "1";
}

export function paymentDraft(input: {
  balance: number | null;
  currency: string;
  payer?: PayerKind;
  phone: string;
}): ProposalDraft & { href: null; methods: string[]; reason: string } {
  const due = input.balance != null && input.balance < 0 ? Math.round(-input.balance * 100) / 100 : 0;
  const methods = stayPayMethods(input.payer || "personal", input.currency).map((method) => STAY_PAY_LABELS[method]);
  const reason = due > 0 ? "Le PaymentIntent n’est pas créé. Le lien part après accord." : "Rien à régler dans l’encours publié.";
  return {
    kind: "payment",
    draftBody: withConciergeSignature(
      due > 0
        ? `Le règlement de ${due} ${input.currency} reprend l’encours publié. Le lien vous parviendra après l’accord de l’agence.`
        : "Je ne vois rien à régler sur l’encours publié. Je transmets à l’agence."
    ),
    amounts: {
      currency: input.currency,
      net: due || null,
      sell: due || null,
      lines: [],
    },
    simulated: false,
    href: null,
    methods,
    reason,
  };
}

export function serviceDraft(kind: "transfer" | "restaurant" | "help", detail: string): ProposalDraft {
  const label = kind === "transfer" ? "Transfert" : kind === "restaurant" ? "Restaurant" : "Aide sur place";
  return {
    kind,
    draftBody: withConciergeSignature(`${label}. ${detail.trim()}\nL’agence confirme avant tout envoi. Rien n’est réservé.`),
    amounts: { currency: "EUR", net: null, sell: null, lines: [] },
    simulated: false,
  };
}

export function decideProposal(
  proposal: { draftBody: string },
  action: "approve" | "reject" | "edit",
  editedBody: string | null,
  armed: boolean
) {
  if (action === "reject") return { status: "rejected" as const, send: false, body: null };
  const body = (action === "edit" ? editedBody || "" : proposal.draftBody).trim();
  if (body.length < 10) return { status: "pending" as const, send: false, body: null, error: "Texte trop court" };
  return {
    status: action === "edit" ? ("edited" as const) : ("approved" as const),
    send: armed,
    body,
  };
}
