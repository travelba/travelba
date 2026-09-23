import type { FrenchPassportTrip } from "@/lib/crm/visa-trip";

const MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

function asOfLabel(iso: string) {
  const [year, month, day] = iso.split("-").map((part) => Number(part));
  const name = MONTHS[(month || 0) - 1];
  if (!year || !name || !day) return iso;
  return `${day} ${name} ${year}`;
}

export function TripFormalities({ trip }: { trip: FrenchPassportTrip }) {
  if (!trip.hasFlight) return null;
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
        Passeport français
      </p>
      {trip.needsFormality ? (
        <ul className="space-y-1 text-sm text-[var(--admin-navy)]">
          {trip.entries.map((entry) => (
            <li key={entry.iso}>
              <span className="font-semibold">{entry.name}</span>
              {entry.formality ? ` — ${entry.formality}` : ""}
            </li>
          ))}
        </ul>
      ) : trip.unknownIatas.length || trip.unknownCountries.length ? null : (
        <p className="text-sm text-[var(--admin-navy)]">
          Aucune formalité identifiée pour un passeport français sur ces vols.
        </p>
      )}
      {trip.unknownIatas.length ? (
        <ul className="space-y-1 text-sm text-[var(--admin-navy)]">
          {trip.unknownIatas.map((code) => (
            <li key={code}>Aéroport {code} non reconnu.</li>
          ))}
        </ul>
      ) : null}
      {trip.unknownCountries.length ? (
        <ul className="space-y-1 text-sm text-[var(--admin-navy)]">
          {trip.unknownCountries.map((entry) => (
            <li key={entry.iso}>{entry.name} — formalité non identifiée.</li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-muted">
        Indication au {asOfLabel(trip.asOf)}, pour un passeport français. Les règles changent.
        {trip.needsFormality
          ? " Les frais officiels du visa ou de l’autorisation sont en plus."
          : ""}
      </p>
    </div>
  );
}
