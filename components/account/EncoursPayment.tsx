import { StayPayment } from "@/components/account/StayPayment";
import { formatMoney } from "@/lib/crm/money";
import { encoursPartLabel, type PayerKind } from "@/lib/crm/payer";
import { stayPayMethods } from "@/lib/crm/stripe-pay";

/** Même règlement d’encours : carte, Apple Pay, prélèvement SEPA, virement. */
export function EncoursPayment({
  company,
  personal,
  currency,
  soleCompanyName,
  stripeKey,
  compact = false,
}: {
  company: number;
  personal: number;
  currency: string;
  soleCompanyName: string | null;
  stripeKey: string | null;
  compact?: boolean;
}) {
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
