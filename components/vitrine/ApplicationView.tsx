import Link from "next/link";
import { DetailScene } from "@/components/vitrine/Blocks";
import { Phone } from "@/components/vitrine/Phone";
import { contactPath, PREVIEW } from "@/lib/vitrine/paths";

export function ApplicationView() {
  return (
    <article>
      <header className="vz-hero">
        <div className="vz-hero-copy">
          <p className="vz-kicker">L’application</p>
          <h1>
            Votre séjour, <em>dans le téléphone.</em>
          </h1>
          <p className="vz-lede">Jours, vols, hôtels, documents, messages. Exemple : Japon. Claire et Thomas Berger n’existent pas.</p>
          <div className="vz-hero-cta">
            <Link className="vz-btn" href="/connexion">
              Ouvrir l’application
            </Link>
            <Link className="vz-btn is-ghost" href={contactPath("projet")}>
              Demander un devis
            </Link>
          </div>
        </div>
        <div className="vz-hero-stage">
          <Phone controls />
        </div>
      </header>

      <DetailScene slug="application" />

      <section className="vz-section vz-phones">
        <Phone screen="carnet" />
        <Phone screen="documents" />
        <Phone screen="fil" />
      </section>

      <section className="vz-section">
        <header className="vz-rule-head">
          <h2>Dans le carnet</h2>
        </header>
        <div className="vz-feature-grid">
          <article>
            <h3>Les jours</h3>
            <p>Tokyo, Hakone, Kyoto. Heure, hôtel, transfert.</p>
          </article>
          <article>
            <h3>Les vols</h3>
            <p>Paris → Tokyo, CDG → HND, 11 h 35, cabine affaires. Exemple, sans numéro inventé.</p>
          </article>
          <article>
            <h3>Les hôtels</h3>
            <p>Aman Tokyo, Gora Kadan, Aman Kyoto.</p>
          </article>
          <article>
            <h3>L’accueil</h3>
            <p>Haneda, à la sortie de l’avion. La voiture continue jusqu’à l’hôtel.</p>
          </article>
          <article>
            <h3>La table</h3>
            <p>Kikunoi, 10 avril, 19 h 30. Deux couverts.</p>
          </article>
          <article>
            <h3>Le conseiller</h3>
            <p>Le bureau répond dans le fil, 24h/24.</p>
          </article>
        </div>
      </section>

      <section className="vz-section vz-dark">
        <p className="vz-kicker">Téléphone</p>
        <h2>Ajoutez l’icône à l’écran d’accueil.</h2>
        <div className="vz-install">
          <article>
            <h3>iPhone</h3>
            <p>Safari, Partager, Sur l’écran d’accueil.</p>
          </article>
          <article>
            <h3>Android</h3>
            <p>Chrome propose d’installer l’application.</p>
          </article>
        </div>
        <div className="vz-actions">
          <Link className="vz-link" href="/connexion">
            Ouvrir l’application
          </Link>
          <Link className="vz-link" href={`${PREVIEW}/voyages/japon`}>
            Voir le Japon
          </Link>
        </div>
      </section>
    </article>
  );
}
