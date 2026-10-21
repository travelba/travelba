import { HotelBenefits } from "@/components/crm/HotelBenefits";
import { hotelStayFacts, type HotelFact } from "@/lib/crm/hotel-gallery";
import type { CrmBookingItem } from "@/lib/crm/types";

function Fact({ fact }: { fact: HotelFact }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">{fact.label}</p>
      {"lines" in fact ? (
        <ul className="mt-0.5 space-y-0.5 text-sm text-[var(--admin-navy)]">
          {fact.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-0.5 text-sm text-[var(--admin-navy)]">{fact.value}</p>
      )}
    </div>
  );
}

/** Chambre, pension, avantages, horaires, adresse, annulation, nuits, voyageurs. */
export function HotelStayFacts({ item }: { item: CrmBookingItem }) {
  const facts = hotelStayFacts(item);
  if (!facts.length) return null;
  const benefits = facts.find((fact) => fact.label === "Avantages" && "lines" in fact);
  const rest = facts.filter((fact) => fact !== benefits);
  return (
    <div className="space-y-3">
      {benefits && "lines" in benefits ? <HotelBenefits lines={benefits.lines} /> : null}
      {rest.map((fact) => (
        <Fact key={fact.label} fact={fact} />
      ))}
    </div>
  );
}
