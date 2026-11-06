import { ibanError, ibanLast4, normalizeIban } from "@/lib/crm/billing";
import { formatMoney } from "@/lib/crm/money";
import type { PayerKind } from "@/lib/crm/payer";
import { stayPayMethods, type StayPayMethod } from "@/lib/crm/stripe-pay";

/**
 * Phrases montrées au client quand un règlement ne part pas.
 * Chacune dit pourquoi, puis quoi faire. Aucun IBAN complet.
 */
export const PAY_COPY = {
  sepaMissingIban:
    "Le prélèvement n’a pas démarré : l’IBAN de la société n’est pas enregistré. Ouvrez Facturation, enregistrez le RIB français (27 caractères), puis revenez ici et touchez Lancer le prélèvement.",
  sepaPersonal:
    "Le prélèvement n’est pas ouvert pour l’encours particulier. Pour cette part : carte, Apple Pay ou virement. Le prélèvement sert à l’encours société.",
  sepaNotOpen:
    "Le prélèvement n’est pas encore ouvert. Payez par carte ou par virement, ou réessayez plus tard.",
  sepaNoEmail:
    "Le prélèvement n’a pas démarré : il manque un e-mail sur la fiche. Écrivez à l’agence pour le compléter, ou payez par carte ou par virement.",
  sepaBadIban:
    "Le prélèvement n’a pas démarré : la banque refuse cet IBAN. Corrigez-le dans Facturation, puis relancez le prélèvement. Sinon, payez par carte ou par virement.",
  sepaFailed:
    "Le prélèvement n’a pas démarré. Réessayez dans un instant. Si cela recommence, payez par carte ou par virement, ou écrivez à l’agence.",
  sepaNoConnection:
    "Le prélèvement n’a pas pu être confirmé depuis cette connexion. Rechargez la page et réessayez. Sinon, payez par carte ou par virement.",
  nothingDue: "Il n’y a pas de montant à régler.",
  wireClosed:
    "Le virement n’est pas encore ouvert : le compte de l’agence ne répond pas. Payez par carte ou par prélèvement, ou réessayez dans un moment.",
  methodClosed: "Ce moyen n’est pas encore ouvert. Choisissez un autre moyen affiché, ou réessayez plus tard.",
  methodWrongPart:
    "Ce moyen n’est pas ouvert pour cette part. Pour le particulier : carte, Apple Pay ou virement. Pour la société : carte, Apple Pay, prélèvement ou virement.",
  stripeCustomer:
    "Le compte de règlement n’a pas pu être ouvert. Réessayez, ou payez par virement, ou écrivez à l’agence.",
  cardStartFailed: "Le règlement par carte n’a pas démarré. Réessayez, ou choisissez le prélèvement ou le virement.",
  pocketPro:
    "Ce compte Pro se règle par carte ou Apple Pay. Le prélèvement et le virement ne s’y appliquent pas.",
  pocketAdvance: "Ce compte crédit se règle par virement. La carte et le prélèvement ne s’y appliquent pas.",
  pocketEmpty: "Ce compte n’a rien à régler.",
  sepaMandate:
    "En confirmant, vous autorisez Travel Business Agency et Stripe à envoyer à votre banque l’instruction de débiter ce compte. Un remboursement peut être demandé à votre banque sous 8 semaines.",
} as const;

export function sepaStartedMessage(amountLabel: string) {
  return `Prélèvement de ${amountLabel} lancé. Il peut prendre quelques jours. Vous n’avez rien d’autre à faire : l’agence est prévenue, et le montant sera crédité quand la banque aura confirmé.`;
}

export function sepaAlreadyMessage(amountLabel: string) {
  return `Un prélèvement de ${amountLabel} est déjà lancé. Attendez la confirmation de la banque. Ne le relancez pas, sauf si l’agence vous le demande.`;
}

export function sepaActionMessage(amountLabel: string) {
  return `La banque demande une confirmation supplémentaire pour ${amountLabel}. Terminez-la ci-dessous. Sinon, payez par carte ou par virement.`;
}

export function wireClientMessage(amountLabel: string, notified: boolean, last4?: string | null) {
  const from = last4 && /^[A-Z0-9]{4}$/.test(last4) ? ` Depuis le compte ····${last4}.` : "";
  if (!notified) {
    return `Les coordonnées sont prêtes pour ${amountLabel}, mais l’agence n’a pas été prévenue. Réessayez dans un instant.${from} Vous pouvez déjà virer ce montant avec la référence indiquée, ou payer par carte.`;
  }
  return `Votre demande de virement de ${amountLabel} est enregistrée. L’agence est prévenue.${from} Virez ce montant en indiquant la référence. Ce n’est pas un prélèvement : l’argent part seulement quand vous faites le virement.`;
}

export function sepaFailureMessage(code: string) {
  if (/iban|bank_account|account_number|payment_method_invalid/i.test(code)) return PAY_COPY.sepaBadIban;
  return PAY_COPY.sepaFailed;
}

export function stripeFailureCode(err: unknown) {
  if (!err || typeof err !== "object") return "stripe";
  const code = "code" in err ? String((err as { code?: unknown }).code || "") : "";
  if (code && code !== "undefined") return code.slice(0, 80);
  const type = "type" in err ? String((err as { type?: unknown }).type || "") : "";
  return (type || "stripe").slice(0, 80);
}

/** IBAN de la fiche, utilisable pour prélever l’encours société. Le numéro complet ne sort pas d’ici. */
export function savedSepaIban(
  payer: PayerKind,
  iban: string | null | undefined
): { iban: string; last4: string } | { error: string } {
  if (payer !== "company") return { error: PAY_COPY.sepaPersonal };
  const normalized = normalizeIban(iban);
  const last4 = ibanLast4(normalized);
  if (!normalized || !last4 || ibanError(normalized)) return { error: PAY_COPY.sepaMissingIban };
  return { iban: normalized, last4 };
}

export function ledgerPayBlock(input: {
  payer: PayerKind;
  method: StayPayMethod;
  owed: { company: number; personal: number };
  currency: string;
}): { amount: number } | { error: string } {
  const allowed = stayPayMethods(input.payer, input.currency);
  if (!allowed.includes(input.method)) {
    if (input.method === "sepa_debit") return { error: PAY_COPY.sepaPersonal };
    return { error: PAY_COPY.methodWrongPart };
  }
  const amount = input.payer === "company" ? input.owed.company : input.owed.personal;
  if (amount >= 0.5) return { amount };
  const other = input.payer === "company" ? input.owed.personal : input.owed.company;
  if (other >= 0.5) {
    const otherLabel = formatMoney(other, input.currency);
    return {
      error:
        input.payer === "personal"
          ? `Le reste à payer (${otherLabel}) est sur l’encours société, pas sur le particulier. Choisissez Société, puis Prélèvement SEPA ou Virement.`
          : `Le reste à payer (${otherLabel}) est sur l’encours particulier, pas sur la société. Choisissez Particulier, puis carte, Apple Pay ou virement.`,
    };
  }
  return { error: PAY_COPY.nothingDue };
}

export function clientAcceptIp(header: string | null | undefined) {
  const first = (header || "").split(",")[0]?.trim() || "";
  if (!first || first.length > 64) return null;
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(first)) return first;
  if (/^[0-9a-fA-F:]+$/.test(first)) return first;
  return null;
}

export function scrubPaymentText(value: string) {
  return value.replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/gi, "IBAN").replace(/\s+/g, " ").trim();
}

export function clientPayAlertSummary(input: {
  action: "wire" | "sepa" | "sepa_failed" | "wire_closed";
  partLabel: string;
  amountLabel: string;
  last4: string | null;
  reason?: string | null;
}) {
  const last4 = input.last4 && /^[A-Z0-9]{4}$/.test(input.last4) ? ` · compte ····${input.last4}` : "";
  const part = scrubPaymentText(input.partLabel);
  const amount = scrubPaymentText(input.amountLabel);
  const reason = scrubPaymentText(input.reason || "");
  if (input.action === "wire") {
    return `Demande de virement · ${part} · ${amount}${last4}. Pas un prélèvement : rapprocher le virement dans Argent, À encaisser.`;
  }
  if (input.action === "wire_closed") {
    return `Virement impossible · ${part} · ${amount}. Le compte de l’agence ne répond pas. Le client peut payer par carte ou par prélèvement.`;
  }
  if (input.action === "sepa") {
    return `Prélèvement lancé · ${part} · ${amount}${last4}. Crédit automatique à la confirmation bancaire. Rien à rapprocher avant.`;
  }
  return `Prélèvement non démarré · ${part} · ${amount}${last4}. ${reason || "Le client doit réessayer, ou payer par carte ou par virement."}`.slice(0, 240);
}

type SepaIntentLike = {
  amount?: number | null;
  status?: string | null;
  metadata?: Record<string, string> | null;
};

/** Un prélèvement déjà parti pour le même montant ne doit pas être relancé. */
export function sepaIntentMatches(
  intent: SepaIntentLike,
  expected: { cents: number; customerId: string; payer: string; companyId: string }
) {
  const meta = intent.metadata || {};
  if (meta.pay_method !== "sepa_debit") return false;
  if (meta.crm_customer_id !== expected.customerId) return false;
  if (meta.payer_kind !== expected.payer) return false;
  if ((meta.billing_company_id || "") !== expected.companyId) return false;
  if (intent.amount !== expected.cents) return false;
  return intent.status === "processing" || intent.status === "succeeded" || intent.status === "requires_action";
}

export function livePartSentence(owed: { company: number; personal: number }, currency: string) {
  const parts: string[] = [];
  if (owed.company >= 0.5) parts.push(`la société (${formatMoney(owed.company, currency)})`);
  if (owed.personal >= 0.5) parts.push(`le particulier (${formatMoney(owed.personal, currency)})`);
  return parts.length ? parts.join(" et ") : "rien à régler";
}

export function payFollowUpIsFresh(createdAt: string, now = Date.now(), days = 14) {
  const at = Date.parse(createdAt);
  if (!Number.isFinite(at)) return false;
  return now - at < days * 24 * 60 * 60 * 1000;
}

/**
 * Ce que l’agence doit faire quand le client a demandé un règlement qui ne s’encaisse pas seul.
 * Le montant affiché est le solde dû maintenant, pas le chiffre d’un ancien clic.
 */
export function agencyPayFollowUp(input: {
  summary: string;
  detail?: string | null;
  owed?: { company: number; personal: number };
  currency?: string;
  createdAt?: string | null;
  now?: number;
}): { title: string; next: string; href: string | null } | null {
  if (input.createdAt && !payFollowUpIsFresh(input.createdAt, input.now)) return null;
  const summary = input.summary.trim();
  const owed = input.owed;
  const currency = input.currency || "EUR";
  const live = owed ? livePartSentence(owed, currency) : null;
  const stillDue = !owed || owed.company >= 0.5 || owed.personal >= 0.5;
  if (!stillDue) return null;

  if (/demandé un virement/i.test(summary)) {
    const askedPersonal = /particulier/.test(summary);
    const askedCompany = /société/.test(summary);
    const mismatch = Boolean(
      owed &&
        ((askedPersonal && owed.company >= 0.5 && owed.personal < 0.5) ||
          (askedCompany && owed.personal >= 0.5 && owed.company < 0.5))
    );
    const where = live ? `Le solde dû est ${live}.` : "Le montant dû est celui des transactions, pas un ancien chiffre.";
    return {
      title: "Demande de virement",
      next: mismatch
        ? `La demande indiquait l’encours ${askedPersonal ? "particulier" : "société"}, mais ${where} Ce virement n’est pas prélevé automatiquement. Prochaine étape : le client vire ce montant, puis vous le rapprochez dans Argent, À encaisser.`
        : `${where} Ce virement n’est pas prélevé automatiquement. Prochaine étape : le client vire ce montant, puis vous le rapprochez dans Argent, À encaisser.`,
      href: "/admin/argent?onglet=a-encaisser",
    };
  }
  if (/lancé un prélèvement/i.test(summary)) {
    return {
      title: "Prélèvement lancé",
      next: `${live ? `Le solde dû est ${live}. ` : ""}La banque peut prendre quelques jours. Le crédit arrivera par Stripe. Rien à rapprocher à la main avant. S’il n’arrive pas, le client relance le prélèvement ou paie par carte ou virement.`,
      href: null,
    };
  }
  if (/n’a pas démarré|n’a pas abouti/i.test(summary)) {
    const why = scrubPaymentText(input.detail || "");
    return {
      title: "Règlement non démarré",
      next: why
        ? `${why} Prochaine étape : le client corrige le point indiqué, ou paie par un autre moyen.`
        : "Le client doit réessayer, enregistrer son IBAN si c’est un prélèvement, ou payer par carte ou par virement.",
      href: null,
    };
  }
  return null;
}
