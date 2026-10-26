import Link from "next/link";
import { Phone } from "@/components/vitrine/Phone";
import { Photo } from "@/components/vitrine/Photo";
import { destinations } from "@/lib/vitrine/destinations";
import { contactPath, PREVIEW } from "@/lib/vitrine/paths";

const ROMAN = ["I", "II", "III", "IV", "V", "VI"];
const names = destinations.map((item) => item.name).join("  ·  ");

const privileges = [
  ["01", "Le tarif", "Les meilleurs tarifs sur les plus beaux hôtels choisis avec vous."],
  ["02", "Le matin", "Le petit-déjeuner offert, lorsque l’adresse le prévoit."],
  ["03", "Les heures", "Arrivée anticipée, départ tardif. Early check-in, late check-out."],
  ["04", "La chambre", "Surclassement prioritaire, si une chambre est libre."],
  ["05", "Le crédit", "Jusqu’à 200 dollars de dépenses par séjour, selon les hôtels."],
];

export function HomeView() {
  const featured = ["japon", "namibie", "perou", "argentine", "seychelles", "maroc"]
    .map((slug) => destinations.find((item) => item.slug === slug))
    .filter((item) => item != null);

  return (
    <>
      <section className="vz-hero">
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
            <Link className="vz-btn" href={`${PREVIEW}/application`}>
              Voir l’application
            </Link>
            <Link className="vz-btn is-ghost" href={`${PREVIEW}/voyages`}>
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
        <header className="vz-rule-head">
          <div>
            <p className="vz-kicker">L’application</p>
            <h2>Votre voyage, dans la poche.</h2>
          </div>
          <Link className="vz-link" href={`${PREVIEW}/application`}>
            Le détail
          </Link>
        </header>
        <p className="vz-lede">
          L’écran montre un séjour d’exemple, le Japon : Claire et Thomas Berger, dix jours, trois maisons. Aucun
          client réel. Le carnet suit les jours. La table de Kikunoi y est. Le bureau répond.
        </p>
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
      </section>

      <section className="vz-section vz-band">
        <header className="vz-rule-head">
          <div>
            <p className="vz-kicker">Club Travel BA</p>
            <h2>Les maisons, avec ce qui se confirme.</h2>
          </div>
          <Link className="vz-link" href={`${PREVIEW}/club`}>
            Le Club
          </Link>
        </header>
        <div className="vz-privileges">
          {privileges.map(([n, title, text]) => (
            <article key={n}>
              <span>{n}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="vz-section">
        <header className="vz-rule-head">
          <div>
            <p className="vz-kicker">Voyages signature</p>
            <h2>Quarante-trois voyages déjà écrits.</h2>
          </div>
          <Link className="vz-link" href={`${PREVIEW}/voyages`}>
            Tout le catalogue
          </Link>
        </header>
        <p className="vz-lede">
          Chaque destination a son itinéraire, ses maisons, sa saison. L’Inde du Nord et l’Inde du Sud sont deux
          voyages. Le détail se confirme avec le conseiller. Sur demande.
        </p>
        <div className="vz-sig">
          {featured.map((item, index) => (
            <Link key={item.slug} href={`${PREVIEW}/voyages/${item.slug}`} className={index < 2 ? "is-lead" : ""}>
              <Photo id={item.image} alt={item.alt} />
              <span>{ROMAN[index]}</span>
              <strong>{item.name}</strong>
              <em>{item.itineraries[0]?.title}</em>
            </Link>
          ))}
        </div>
      </section>

      <section className="vz-section vz-band">
        <header className="vz-rule-head">
          <div>
            <p className="vz-kicker">Les univers</p>
            <h2>La maison, selon le motif.</h2>
          </div>
        </header>
        <div className="vz-univers">
          <article>
            <p className="vz-kicker">Sur mesure</p>
            <h3>L’agenda d’abord.</h3>
            <p>
              Hébergement du Club, vols, vol privé si l’heure l’exige, transferts, accueil à la sortie de l’avion, visas
              pour les États-Unis, le Royaume-Uni et Israël, activités, restaurants.
            </p>
            <Link className="vz-link" href={`${PREVIEW}/sur-mesure`}>
              Composer
            </Link>
          </article>
          <article>
            <p className="vz-kicker">Kids</p>
            <h3>La famille, au même niveau.</h3>
            <p>
              Club Med, Sani Resort, Ikos, et les hôtels dont le kids club existe vraiment. La voiture a le siège bébé.
              Une nounou peut prendre le relais, si vous la demandez.
            </p>
            <Link className="vz-link" href={`${PREVIEW}/kids`}>
              L’univers Kids
            </Link>
          </article>
          <article>
            <p className="vz-kicker">Séminaires</p>
            <h3>Le groupe, comme un séjour.</h3>
            <p>Séminaire, anniversaire, enterrement de vie de garçon. Les arrivées sont écrites avant le jour.</p>
            <Link className="vz-link" href={`${PREVIEW}/seminaires`}>
              Les occasions
            </Link>
          </article>
          <article>
            <p className="vz-kicker">Professionnels</p>
            <h3>Une politique, un agent.</h3>
            <p>
              Tarifs préférentiels, facture à la société, carnet pour les collaborateurs et les cadres, agent Travel BA
              vingt-quatre heures sur vingt-quatre.
            </p>
            <Link className="vz-link" href={`${PREVIEW}/professionnels`}>
              L’entreprise
            </Link>
          </article>
        </div>
      </section>

      <blockquote className="vz-quote">
        <p>Travel Business Agency conçoit les voyages des particuliers et des entreprises.</p>
        <cite>Un interlocuteur. Une réponse dans l’heure, les jours ouvrés. Quelqu’un, à toute heure, pendant le séjour.</cite>
      </blockquote>

      <section className="vz-section">
        <header className="vz-rule-head">
          <div>
            <p className="vz-kicker">La manière</p>
            <h2>Du brief au carnet.</h2>
          </div>
          <Link className="vz-link" href={contactPath("projet")}>
            Écrire
          </Link>
        </header>
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
