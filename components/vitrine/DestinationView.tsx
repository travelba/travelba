import type { Destination, Itinerary } from "@/lib/vitrine/types";
import { AppRecall, Ask, ClubNote } from "./Blocks";
import { Photo } from "./Photo";

function Steps({ trip, mode }: { trip: Itinerary; mode: "track" | "route" | "prose" }) {
  if (mode === "track") {
    return (
      <div className="vz-track">
        {trip.steps.map((step) => (
          <article key={step.when}>
            <p className="vz-kicker">{step.when}</p>
            <h3>{step.title}</h3>
            <p>{step.text}</p>
            <p>
              <strong>{step.stay}</strong>
            </p>
          </article>
        ))}
      </div>
    );
  }
  if (mode === "route") {
    return (
      <ol className="vz-route">
        {trip.steps.map((step) => (
          <li key={step.when}>
            <p className="vz-kicker">{step.when}</p>
            <h3>{step.title}</h3>
            <p>{step.text}</p>
            <p>{step.stay}</p>
          </li>
        ))}
      </ol>
    );
  }
  return (
    <ol className="vz-steps">
      {trip.steps.map((step) => (
        <li key={step.when}>
          <span>{step.when}</span>
          <div>
            <strong>{step.title}</strong>
            <p>{step.text}</p>
            <p>{step.stay}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Houses({ trip }: { trip: Itinerary }) {
  return (
    <div className={`vz-houses ${trip.houses.length > 2 ? "cols-3" : "cols-2"}`}>
      {trip.houses.map((house) => (
        <article key={house.name}>
          <p className="vz-kicker">{house.where}</p>
          <h3>{house.name}</h3>
          <p>{house.note}</p>
        </article>
      ))}
    </div>
  );
}

function Close({ destination, trip }: { destination: Destination; trip: Itinerary }) {
  return (
    <div className="vz-section">
      <p className="vz-pull">La chambre demandée, la table tenue, le vol repris si l’heure change.</p>
      <p className="vz-club-note">
        À {destination.name}, le conseiller connaît la maison de l’intérieur. Le détail confirmé entre dans le carnet. Il
        reste joignable à toute heure.
      </p>
      <h2>Ce que la maison tient</h2>
      <ul className="vz-steps">
        {trip.experiences.map((item) => (
          <li key={item}>
            <span>Inclus</span>
            <p>{item}</p>
          </li>
        ))}
      </ul>
      <ClubNote />
      <Ask slug={destination.slug} title={trip.title} anchor={trip.anchor} />
    </div>
  );
}

export function DestinationView({ destination }: { destination: Destination }) {
  const first = destination.itineraries[0];
  if (!first) return null;
  const many = destination.itineraries.length > 1;

  return (
    <article>
      {destination.rhythm === "journal" && !many ? (
        <header className="vz-journal">
          <figure>
            <Photo id={destination.image} alt={destination.alt} priority />
          </figure>
          <div>
            <p className="vz-kicker">{destination.name}</p>
            <h1>{first.title}</h1>
            <p className="vz-pull">{first.lede}</p>
            <p className="vz-meta">
              <span>
                Durée
                <strong style={{ display: "block", letterSpacing: 0, textTransform: "none", fontSize: "1rem" }}>{first.duration}</strong>
              </span>
              <span>
                Saison
                <strong style={{ display: "block", letterSpacing: 0, textTransform: "none", fontSize: "1rem" }}>{first.season}</strong>
              </span>
            </p>
          </div>
        </header>
      ) : (
        <header className="vz-cover">
          <Photo id={destination.image} alt={destination.alt} priority />
          <div className="shade" />
          <div className="copy">
            <p className="vz-kicker">{destination.name}</p>
            <h1>{many ? destination.name : first.title}</h1>
            <p className="vz-lede">{many ? destination.essay : first.lede}</p>
            {many ? null : (
              <p className="vz-meta">
                <span>
                  Durée
                  <strong style={{ display: "block", letterSpacing: 0, textTransform: "none", fontSize: "1rem", color: "white" }}>{first.duration}</strong>
                </span>
                <span>
                  Saison
                  <strong style={{ display: "block", letterSpacing: 0, textTransform: "none", fontSize: "1rem", color: "white" }}>{first.season}</strong>
                </span>
              </p>
            )}
          </div>
        </header>
      )}

      <div className="vz-section vz-narrow">
        <p>{destination.essay}</p>
      </div>

      {destination.itineraries.map((trip, index) => {
        const mode = destination.rhythm === "film" ? "track" : destination.rhythm === "atlas" ? "route" : "prose";
        const chosen = many ? (index === 0 ? "route" : "prose") : mode;
        return (
          <section key={trip.anchor} id={trip.anchor}>
            <div className="vz-section">
              {many ? (
                <>
                  <p className="vz-kicker">{trip.name}</p>
                  <h2>{trip.title}</h2>
                  <p className="vz-lede">{trip.lede}</p>
                  <p>
                    {trip.duration}. {trip.season}
                  </p>
                </>
              ) : (
                <h2>Le déroulé</h2>
              )}
              <Steps trip={trip} mode={chosen} />
            </div>
            <div className="vz-section" style={{ paddingTop: 0 }}>
              <h2>Les maisons</h2>
              <Houses trip={trip} />
            </div>
            <Close destination={destination} trip={trip} />
          </section>
        );
      })}

      <AppRecall>
        {`Le carnet de ${destination.name} s’ouvre dans l’application : jours, vols, maisons, transferts, accueil, tables. Le conseiller reste joignable.`}
      </AppRecall>
    </article>
  );
}
