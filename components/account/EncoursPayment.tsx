import { StayPayment } from "@/components/account/StayPayment";
import type { FundingPocket } from "@/lib/crm/funding-wallet";
import { formatMoney } from "@/lib/crm/money";
import { encoursPartLabel, type PayerKind } from "@/lib/crm/payer";
import { pocketPayMethods, stayPayMethods } from "@/lib/crm/stripe-pay";

/** Même règlement d’encours : carte, Apple Pay, prélèvement SEPA, virement. */
export function EncoursPayment({
  company,
  personal,
  currency,
  soleCompanyName,
  stripeKey,
  compact = false,
  pockets = null,
}: {
  company: number;
  personal: number;
  currency: string;
  soleCompanyName: string | null;
  stripeKey: string | null;
  compact?: boolean;
  /** Crédit et Pro : chacun se règle à part. */
  pockets?: FundingPocket[] | null;
}) {
  if (pockets?.length) {
    const parts = pockets
      .filter((pocket) => pocket.due >= 0.5)
      .map((pocket) => ({
        id: pocket.companyId,
        kind: "company" as const,
        funding: pocket.funding,
        companyId: pocket.companyId,
        mention: pocket.label,
        hint:
          pocket.funding === "pro"
            ? "Carte ou Apple Pay. Ce règlement ne recharge pas le crédit."
            : "Virement. Ce compte n’est pas réglé par carte.",
        amountLabel: formatMoney(pocket.due, currency),
        payable: true,
        canPay: true,
        methods: pocketPayMethods(pocket.funding, currency),
        companyName: pocket.name || null,
      }));
    const all =
      personal >= 0.5
        ? [
            ...parts,
            {
              id: "personal",
              kind: "personal" as const,
              mention: encoursPartLabel("personal", null),
              amountLabel: formatMoney(personal, currency),
              payable: true,
              canPay: true,
              methods: stayPayMethods("personal", currency),
              companyName: null,
            },
          ]
        : parts;
    if (!all.length) return null;
    return (
      <div className="space-y-4" aria-label="Régler">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9c7c4e]">Régler</p>
        <StayPayment compact={compact} named stripeKey={stripeKey} parts={all} />
      </div>
    );
  }

  function part(kind: PayerKind, named: boolean) {
    const amount = kind === "company" ? company : personal;
    if (amount < 0.5) return null;
    return (
      <StayPayment
        key={kind}
        compact={compact}
        named={named}
        stripeKey={stripeKey}
        parts={[
          {
            kind,
            mention: encoursPartLabel(kind, kind === "company" ? soleCompanyName : null),
            amountLabel: formatMoney(amount, currency),
            payable: true,
            canPay: true,
            methods: stayPayMethods(kind, currency),
            companyName: kind === "company" ? soleCompanyName : null,
          },
        ]}
      />
    );
  }

  const both = company >= 0.5 && personal >= 0.5;
  const companyPart = part("company", both);
  const personalPart = part("personal", both);
  if (!companyPart && !personalPart) return null;

  return (
    <div className="space-y-4" aria-label="Régler">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9c7c4e]">Régler</p>
      {companyPart}
      {personalPart}
    </div>
  );
}
