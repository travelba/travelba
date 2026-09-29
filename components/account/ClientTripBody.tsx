import type { ReactNode } from "react";

/** Ordre fixe du séjour client. Les blocs vides ne laissent pas de trou. */
const SECTIONS = [
  "itinerary",
  "services",
  "visa-request",
  "received-visas",
  "passports",
  "share",
  "amount",
  "expenses",
] as const;

export function ClientTripBody({
  intro,
  itinerary,
  services,
  visaRequest,
  receivedVisas,
  passports,
  share,
  amount,
  expenses,
  tail,
}: {
  intro?: ReactNode;
  itinerary: ReactNode;
  services?: ReactNode;
  visaRequest?: ReactNode;
  receivedVisas?: ReactNode;
  passports?: ReactNode;
  share?: ReactNode;
  amount: ReactNode;
  expenses?: ReactNode;
  tail?: ReactNode;
}) {
  const slots: Record<(typeof SECTIONS)[number], ReactNode> = {
    itinerary,
    services,
    "visa-request": visaRequest,
    "received-visas": receivedVisas,
    passports,
    share,
    amount,
    expenses,
  };
  return (
    <div className="space-y-5">
      {intro}
      {SECTIONS.map((id) => {
        const node = slots[id];
        if (node == null || node === false) return null;
        return (
          <div key={id} data-section={id} className="empty:hidden">
            {node}
          </div>
        );
      })}
      {tail}
    </div>
  );
}
