import { staffLedgerCaption } from "./staff-stay";

export type ReglementCheckState = "done" | "todo" | "info";

export type ReglementCheck = {
  id: "payer" | "prices" | "ledger" | "costs" | "invoice";
  label: string;
  state: ReglementCheckState;
};

export type ReglementChecklistInput = {
  payerKind: "company" | "personal";
  /** Société retenue quand le payeur est une société. */
  payerCompanyName: string | null;
  /** Cartes actives du carnet qui composent le montant du séjour. */
  cardsTotal: number;
  cardsPriced: number;
  booking: Parameters<typeof staffLedgerCaption>[0];
  /** Sorties proposées + coûts sans vente. */
  costsToPoint: number;
  invoice: {
    number: string | null;
    printed: boolean;
    marginStale: boolean;
  };
};

function plural(count: number, one: string, many: string) {
  return count > 1 ? many : one;
}

/** Ce qui reste à faire sur le règlement, dans l’ordre du travail. Rien n’est inventé : chaque ligne vient d’un état stocké. */
export function reglementChecklist(input: ReglementChecklistInput): ReglementCheck[] {
  const checks: ReglementCheck[] = [];

  if (input.payerKind === "company") {
    const name = (input.payerCompanyName || "").trim();
    checks.push(
      name
        ? { id: "payer", label: `Société · ${name}`, state: "done" }
        : { id: "payer", label: "Société à choisir", state: "todo" }
    );
  } else {
    checks.push({ id: "payer", label: "Particulier", state: "done" });
  }

  if (input.cardsTotal <= 0) {
    checks.push({ id: "prices", label: "Aucune carte à vendre", state: "info" });
  } else {
    const missing = Math.max(0, input.cardsTotal - input.cardsPriced);
    checks.push(
      missing === 0
        ? {
            id: "prices",
            label: `Prix saisi sur ${input.cardsTotal} ${plural(input.cardsTotal, "carte", "cartes")}`,
            state: "done",
          }
        : { id: "prices", label: `${missing} ${plural(missing, "carte sans prix", "cartes sans prix")}`, state: "todo" }
    );
  }

  const caption = staffLedgerCaption(input.booking);
  if (caption === "Au grand livre") checks.push({ id: "ledger", label: "Au grand livre", state: "done" });
  else if (caption === "Pas encore")
    checks.push({ id: "ledger", label: "Pas encore au grand livre · montrez le séjour", state: "todo" });
  else if (caption === "Hors agence")
    checks.push({ id: "ledger", label: "Hors agence · le client règle l’hôtel", state: "info" });
  else checks.push({ id: "ledger", label: caption, state: "info" });

  checks.push(
    input.costsToPoint > 0
      ? {
          id: "costs",
          label: `${input.costsToPoint} ${plural(input.costsToPoint, "coût à pointer", "coûts à pointer")}`,
          state: "todo",
        }
      : { id: "costs", label: "Coûts pointés", state: "done" }
  );

  const { number, printed, marginStale } = input.invoice;
  if (marginStale && number) checks.push({ id: "invoice", label: `Marge à corriger sur la facture n° ${number}`, state: "todo" });
  else if (printed && number) checks.push({ id: "invoice", label: `Facture n° ${number} imprimée`, state: "done" });
  else if (number) checks.push({ id: "invoice", label: `Pro forma n° ${number} à valider dans MB3M`, state: "todo" });
  else checks.push({ id: "invoice", label: "Facture à préparer", state: "todo" });

  return checks;
}

/** Nombre de gestes qui attendent l’agent dans Coûts du voyage. */
export function reglementCostsToPoint(view: { proposed: unknown[]; unsold: unknown[] } | null | undefined) {
  if (!view) return 0;
  return view.proposed.length + view.unsold.length;
}
