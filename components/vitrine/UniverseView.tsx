import Link from "next/link";
import type { Universe } from "@/lib/vitrine/types";
import { contactPath, PREVIEW } from "@/lib/vitrine/paths";
import { AppRecall } from "./Blocks";
import { Photo } from "./Photo";

export function UniverseView({ universe }: { universe: Universe }) {
  const contact = contactPath("projet", { sujet: universe.menu });
  const opener = (
    <header className={universe.layout === "salon" ? "vz-journal" : "vz-cover"}>
      {universe.layout === "salon" ? (
        <>
          <figure>
            <Photo id={universe.image} alt={universe.alt} priority />
          </figure>
          <div>
            <p className="vz-kicker">{universe.kicker}</p>
            <h1>
              {universe.title} <em>{universe.em}</em>
            </h1>
            <p className="vz-pull">{universe.lede}</p>
          </div>
        </>
      ) : (
        <>
          <Photo id={universe.image} alt={universe.alt} priority />
          <div className="shade" />
          <div className="copy">
            <p className="vz-kicker">{universe.kicker}</p>
            <h1>
              {universe.title} <em>{universe.em}</em>
            </h1>
            <p className="vz-lede">{universe.lede}</p>
          </div>
        </>
      )}
    </header>
  );

  return (
    <article>
      {universe.layout === "membership" ? (
        <header className="vz-section vz-dark" style={{ paddingTop: "8rem" }}>
          <p className="vz-kicker">{universe.kicker}</p>
          <h1>
            {universe.title} <em>{universe.em}</em>
          </h1>
          <p className="vz-lede">{universe.lede}</p>
        </header>
      ) : (
        opener
      )}

      <section className={`vz-section ${universe.layout === "essay" ? "vz-split" : ""}`}>
        <div className="vz-narrow">
          {universe.essay.map((paragraph) => (
            <p key={paragraph.slice(0, 24)}>{paragraph}</p>
          ))}
          <div className="vz-actions">
            <Link className="vz-link" href={contact}>
              Parler à un conseiller
            </Link>
            <Link className="vz-link" href="/connexion">
              Espace client
            </Link>
          </div>
        </div>
        {universe.layout === "essay" ? (
          <ol className="vz-steps">
            {universe.points.map((point) => (
              <li key={point.title}>
                <span>{point.title}</span>
                <p>{point.text}</p>
              </li>
            ))}
          </ol>
        ) : null}
      </section>

      {universe.layout === "membership" ? (
        <section className="vz-section vz-dark" style={{ paddingTop: 0 }}>
          <div className="vz-benefits">
            {universe.points.map((point, index) => (
              <article key={point.title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{point.title}</h3>
                <p>{point.text}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {universe.layout === "family" ? (
        <div>
          {universe.places.map((place, index) => (
            <article className={`vz-chapter${index % 2 ? " is-flip" : ""}`} key={place.name}>
              <figure>
                <Photo id={place.image} alt={place.alt} />
              </figure>
              <div>
                <p className="vz-kicker">{place.where}</p>
                <h2>{place.name}</h2>
                <p>{place.text}</p>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <section className="vz-section" style={{ paddingTop: 0 }}>
          <h2>{universe.layout === "route" ? "Le déroulé" : "En pratique"}</h2>
          <ol className={universe.layout === "route" ? "vz-route" : "vz-steps"}>
            {universe.steps.map((step) => (
              <li key={step.n}>
                <span>{step.n}</span>
                <div>
                  <strong>{step.title}</strong>
                  <p>{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {universe.layout === "family" ? (
        <section className="vz-section">
          <h2>Comment la maison s’y prend</h2>
          <ol className="vz-steps">
            {universe.steps.map((step) => (
              <li key={step.n}>
                <span>{step.n}</span>
                <div>
                  <strong>{step.title}</strong>
                  <p>{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : (
        <section className="vz-section" style={{ paddingTop: 0 }}>
          <div className={`vz-houses ${universe.places.length > 2 ? "cols-3" : "cols-2"}`}>
            {universe.places.map((place) => (
              <article key={place.name}>
                <p className="vz-kicker">{place.where}</p>
                <h3>{place.name}</h3>
                <p>{place.text}</p>
                {place.href ? (
                  <Link className="vz-link" href={place.href}>
                    Voir
                  </Link>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      )}

      {universe.layout !== "membership" && universe.layout !== "essay" ? (
        <section className="vz-section" style={{ paddingTop: 0 }}>
          <div className="vz-feature-grid">
            {universe.points.map((point) => (
              <article key={point.title}>
                <h3>{point.title}</h3>
                <p>{point.text}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <AppRecall>{universe.app}</AppRecall>
      <section className="vz-section" style={{ paddingTop: 0 }}>
        <Link className="vz-link" href={contact}>
          Écrire à Travel BA
        </Link>
        <Link className="vz-link" href={`${PREVIEW}/application`} style={{ marginLeft: "1.4rem" }}>
          L’application
        </Link>
      </section>
    </article>
  );
}
