import Link from "next/link";
import { Phone } from "@/components/vitrine/Phone";
import { PREVIEW } from "@/lib/vitrine/paths";

export function ApplicationView() {
  return (
    <article>
      <header className="vz-section" style={{ paddingTop: "8rem" }}>
        <p className="vz-kicker">L’application</p>
        <h1>
          Réserver chez Travel BA, <em>c’est ouvrir le carnet.</em>
        </h1>
        <p className="vz-lede">
          L’espace client est une application : moderne, tenue, à votre nom. Les écrans ci-dessous montrent un séjour
          d’exemple, le Japon signature. Claire Berger et Thomas Berger n’existent pas. Aucun dossier réel n’est ouvert.
        </p>
        <div className="vz-actions">
          <Link className="vz-link" href="/connexion">
            Ouvrir l’espace client
          </Link>
          <Link className="vz-link" href={`${PREVIEW}/voyages/japon`}>
            Lire l’itinéraire Japon
          </Link>
        </div>
      </header>

      <section className="vz-section" style={{ paddingTop: 0 }}>
        <Phone controls />
      </section>

      <section className="vz-section vz-phones">
        <Phone screen="carnet" />
        <Phone screen="documents" />
        <Phone screen="fil" />
      </section>

      <section className="vz-section">
        <h2>Ce que le carnet tient</h2>
        <div className="vz-feature-grid">
          <article>
            <h3>Les jours</h3>
            <p>Tokyo, Hakone, Kyoto. Chaque étape a son heure locale, sa maison, son transfert.</p>
          </article>
          <article>
            <h3>Les vols</h3>
            <p>Paris → Tokyo, CDG → HND, départ 11 h 35, cabine affaires. Un vol d’exemple, sans numéro inventé.</p>
          </article>
          <article>
            <h3>Les maisons</h3>
            <p>Aman Tokyo, Gora Kadan, Aman Kyoto. Les nuits se suivent. Les avantages confirmés y figurent.</p>
          </article>
          <article>
            <h3>L’accueil</h3>
            <p>À Haneda, à la sortie de l’avion. La voiture continue jusqu’à l’hôtel.</p>
          </article>
          <article>
            <h3>La table</h3>
            <p>Kikunoi, le 10 avril, 19 h 30. Deux couverts. L’adresse est dans la journée.</p>
          </article>
          <article>
            <h3>Le conseiller</h3>
            <p>Le bureau Travel BA répond dans le fil, à toute heure. Le message reste dans le séjour.</p>
          </article>
        </div>
      </section>

      <section className="vz-section vz-dark">
        <p className="vz-kicker">Sur le téléphone</p>
        <h2>Pas une boutique. Une icône.</h2>
        <p className="vz-lede">
          L’espace s’ouvre dans le navigateur, puis se pose sur l’écran d’accueil, avec l’icône Travel BA. Après la
          réservation, le lien est le vôtre.
        </p>
        <div className="vz-install">
          <article>
            <h3>iPhone</h3>
            <p>Safari, puis Partager, puis Sur l’écran d’accueil. L’espace s’ouvre ensuite comme une application.</p>
          </article>
          <article>
            <h3>Android</h3>
            <p>Chrome propose d’installer l’application. L’icône rejoint les autres. Le carnet reste le même.</p>
          </article>
        </div>
        <div className="vz-actions">
          <Link className="vz-link" href="/connexion">
            Accéder à l’espace
          </Link>
        </div>
      </section>
    </article>
  );
}
