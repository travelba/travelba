import Link from "next/link";
import { Phone } from "@/components/vitrine/Phone";
import { Photo } from "@/components/vitrine/Photo";
import { destinations } from "@/lib/vitrine/destinations";
import { contactPath, PREVIEW } from "@/lib/vitrine/paths";

const names = destinations.map((item) => item.name).join(" · ");

export function HomeView() {
  const featured = ["japon", "maroc", "kenya", "saint-barth", "perou", "seychelles"]
    .map((slug) => destinations.find((item) => item.slug === slug))
    .filter((item) => item != null);

  return (
    <>
      <section className="vz-hero">
        <div className="vz-hero-photo">
          <Photo id="photo-1571896349842-33c89424de2d" alt="" priority />
        </div>
        <div className="vz-hero-shade" />
        <div className="vz-hero-copy">
          <p className="vz-kicker">Travel BA · Agence IATA</p>
          <h1>
            Le voyage, tenu.
            <br />
            <em>L’application, ouverte.</em>
          </h1>
          <p className="vz-lede">
            En réservant chez Travel BA, le séjour entre dans une application à votre nom. Le carnet, les vols, les
            maisons, l’accueil à la sortie de l’avion, les tables, les documents. Un conseiller, à toute heure.
          </p>
          <div className="vz-actions">
            <Link className="vz-link" href={`${PREVIEW}/application`}>
              Voir l’application
            </Link>
            <Link className="vz-link" href={`${PREVIEW}/voyages`}>
              Les voyages signature
            </Link>
          </div>
        </div>
        <div className="vz-hero-stage">
          <Phone controls />
        </div>
      </section>

      <div className="vz-marquee" aria-hidden>
        <p>
          {names} · {names} ·
        </p>
      </div>

      <section className="vz-section">
        <div className="vz-split">
          <div>
            <p className="vz-kicker">L’application</p>
            <h2>Votre voyage, dans la poche.</h2>
            <p className="vz-lede">
              L’écran montre un séjour d’exemple, le Japon : Claire et Thomas Berger, dix jours, trois maisons. Aucun
              client réel. Le carnet suit les jours. La table de Kikunoi y est. Le bureau répond.
            </p>
            <div className="vz-actions">
              <Link className="vz-link" href={`${PREVIEW}/application`}>
                Le détail
              </Link>
              <Link className="vz-link" href="/connexion">
                Espace client
              </Link>
            </div>
          </div>
          <div className="vz-feature-grid">
            <article>
              <h3>Le carnet</h3>
              <p>Jour par jour : vol, hôtel, transfert, accueil, restaurant.</p>
            </article>
            <article>
              <h3>Les documents</h3>
              <p>Carte d’embarquement, confirmations. Pas de papier à chercher.</p>
            </article>
            <article>
              <h3>Le conseiller</h3>
              <p>Un fil avec la maison, vingt-quatre heures sur vingt-quatre.</p>
            </article>
            <article>
              <h3>Les alertes</h3>
              <p>Un accueil confirmé, une table tenue, un horaire qui bouge.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="vz-section vz-dark">
        <p className="vz-kicker">Club Travel BA</p>
        <h2>Les maisons, avec ce qui se confirme.</h2>
        <div className="vz-benefits">
          <article>
            <span>01</span>
            <h3>Le tarif</h3>
            <p>Les meilleurs tarifs sur les plus beaux hôtels choisis avec vous.</p>
          </article>
          <article>
            <span>02</span>
            <h3>Le matin</h3>
            <p>Le petit-déjeuner offert, lorsque l’adresse le prévoit.</p>
          </article>
          <article>
            <span>03</span>
            <h3>Les heures</h3>
            <p>Arrivée anticipée, départ tardif. Early check-in, late check-out.</p>
          </article>
          <article>
            <span>04</span>
            <h3>La chambre</h3>
            <p>Surclassement prioritaire, si une chambre est libre.</p>
          </article>
          <article>
            <span>05</span>
            <h3>Le crédit</h3>
            <p>Jusqu’à 200 dollars de dépenses par séjour, selon les hôtels.</p>
          </article>
        </div>
        <div className="vz-actions">
          <Link className="vz-link" href={`${PREVIEW}/club`}>
            Le Club
          </Link>
        </div>
      </section>

      <section className="vz-section">
        <p className="vz-kicker">Voyages signature</p>
        <h2>Quarante-trois voyages déjà écrits.</h2>
        <p className="vz-lede">
          Chaque destination a son itinéraire, ses maisons, sa saison. L’Inde du Nord et l’Inde du Sud sont deux
          voyages. Le détail se confirme avec le conseiller. Sur demande.
        </p>
        <ul className="vz-index">
          {featured.map((item) => (
            <li key={item.slug}>
              <Link href={`${PREVIEW}/voyages/${item.slug}`}>
                <small>{item.itineraries[0]?.duration}</small>
                <strong>{item.name}</strong>
                <em>{item.itineraries[0]?.title}</em>
              </Link>
            </li>
          ))}
        </ul>
        <div className="vz-actions">
          <Link className="vz-link" href={`${PREVIEW}/voyages`}>
            Tout le catalogue
          </Link>
        </div>
      </section>

      <article className="vz-chapter">
        <figure>
          <Photo id="photo-1507525428034-b723cf961d3e" alt="Plage et eau claire" />
        </figure>
        <div>
          <p className="vz-kicker">Kids</p>
          <h2>La famille, au même niveau.</h2>
          <p>
            Club Med, Sani Resort, Ikos, et les hôtels dont le kids club existe vraiment. La voiture a le siège bébé.
            Une nounou peut prendre le relais, si vous la demandez.
          </p>
          <Link className="vz-link" href={`${PREVIEW}/kids`}>
            L’univers Kids
          </Link>
        </div>
      </article>

      <section className="vz-section vz-split">
        <div>
          <p className="vz-kicker">Sur mesure</p>
          <h2>L’agenda d’abord.</h2>
          <p className="vz-lede">
            Hébergement du Club, vols, vol privé si l’heure l’exige, transferts, accueil à la sortie de l’avion, visas
            pour les États-Unis, le Royaume-Uni et Israël, activités, restaurants.
          </p>
          <Link className="vz-link" href={`${PREVIEW}/sur-mesure`}>
            Composer
          </Link>
        </div>
        <div>
          <p className="vz-kicker">La maison</p>
          <h2>Levallois, et le monde.</h2>
          <p className="vz-lede">
            Travel Business Agency conçoit les voyages des particuliers et des entreprises. Un interlocuteur. Une
            réponse dans l’heure, les jours ouvrés. Quelqu’un, à toute heure, pendant le séjour.
          </p>
          <Link className="vz-link" href={contactPath("projet")}>
            Écrire
          </Link>
        </div>
      </section>

      <section className="vz-section vz-dark">
        <div className="vz-split">
          <div>
            <p className="vz-kicker">Séminaires</p>
            <h2>Le groupe, comme un séjour.</h2>
            <p className="vz-lede">Séminaire, anniversaire, enterrement de vie de garçon. Les arrivées sont écrites avant le jour.</p>
            <Link className="vz-link" href={`${PREVIEW}/seminaires`}>
              Les occasions
            </Link>
          </div>
          <div>
            <p className="vz-kicker">Professionnels</p>
            <h2>Une politique, un agent.</h2>
            <p className="vz-lede">
              Tarifs préférentiels, facture à la société, carnet pour les collaborateurs et les cadres, agent Travel BA
              vingt-quatre heures sur vingt-quatre.
            </p>
            <Link className="vz-link" href={`${PREVIEW}/professionnels`}>
              L’entreprise
            </Link>
          </div>
        </div>
      </section>

      <section className="vz-section">
        <p className="vz-kicker">La manière</p>
        <div className="vz-feature-grid">
          <article>
            <h3>Le brief</h3>
            <p>Dates, personnes, motif. La maison écoute avant d’écrire.</p>
          </article>
          <article>
            <h3>La proposition</h3>
            <p>Un voyage tenu, généralement sous vingt-quatre heures. Le détail se confirme, sur demande.</p>
          </article>
          <article>
            <h3>L’organisation</h3>
            <p>Vols, maisons, sol, tables, formalités. Un seul interlocuteur.</p>
          </article>
          <article>
            <h3>Le séjour</h3>
            <p>Le carnet s’ouvre dans l’application. Quelqu’un reste joignable, à toute heure.</p>
          </article>
        </div>
      </section>
    </>
  );
}
