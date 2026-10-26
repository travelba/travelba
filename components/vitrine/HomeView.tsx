import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Phone } from "@/components/vitrine/Phone";
import { Photo } from "@/components/vitrine/Photo";
import { destinations } from "@/lib/vitrine/destinations";
import { contactPath, PREVIEW, voyagePath } from "@/lib/vitrine/paths";

const pillars = [
  {
    href: `${PREVIEW}/application`,
    image: "photo-1493976040374-85c8e12f0c0e",
    alt: "Allée de torii dans la forêt",
    kicker: "L’application",
    title: "Le carnet, ouvert.",
    line: "Jours, vols, maisons, documents, et le conseiller dans le même fil.",
  },
  {
    href: `${PREVIEW}/sur-mesure`,
    image: "photo-1582719478250-c89cae4dc85b",
    alt: "Suite et lumière douce",
    kicker: "Le service",
    title: "Tout est tenu.",
    line: "Maisons, vols, voiture, accueil, tables, formalités. Un seul interlocuteur.",
  },
  {
    href: `${PREVIEW}/voyages`,
    image: "photo-1484318571209-661cf29a69c3",
    alt: "Dune rouge au crépuscule",
    kicker: "Voyages signature",
    title: "Quarante-trois voyages, déjà écrits.",
    line: "La saison, les maisons, le déroulé. Le détail se confirme avec le conseiller.",
  },
  {
    href: `${PREVIEW}/professionnels`,
    image: "photo-1497366754035-f200968a6e72",
    alt: "Bureau calme",
    kicker: "L’entreprise",
    title: "La politique, puis le voyage.",
    line: "Collaborateurs et cadres, le même carnet, un agent joignable à toute heure.",
  },
  {
    href: `${PREVIEW}/club`,
    image: "photo-1571896349842-33c89424de2d",
    alt: "Piscine et lumière du soir",
    kicker: "Le Club",
    title: "La maison, et ce qui s’y obtient.",
    line: "Tarif, petit-déjeuner, horaires, surclassement, crédit selon l’hôtel.",
  },
];

const scenes = [
  {
    image: "photo-1566073771259-6a8506099945",
    alt: "Chambre d’hôtel au matin",
    kicker: "La chambre",
    title: "Demandée par son nom.",
    text: "Le conseiller connaît l’aile, l’étage, la vue. Il demande la chambre, pas seulement la catégorie. Elle n’est promise que lorsqu’elle est tenue.",
  },
  {
    image: "photo-1517248135467-4c7edcad34c4",
    alt: "Salle de restaurant",
    kicker: "La table",
    title: "Tenue, le soir où tout est complet.",
    text: "La maison la demande tôt. Elle entre dans le carnet à l’heure confirmée. Autour, la voiture sait déjà où vous déposer.",
  },
  {
    image: "photo-1507525428034-b723cf961d3e",
    alt: "Plage et eau claire",
    kicker: "La famille",
    title: "Le siège est déjà dans la voiture.",
    text: "Siège bébé ou sièges enfants, dès l’aéroport. Le club suit les âges. Une nounou, si vous la demandez, est confirmée avant le départ.",
  },
  {
    image: "photo-1511795409834-ef04bbd61622",
    alt: "Table de réception",
    kicker: "L’attention",
    title: "Préparée avant l’arrivée.",
    text: "Un anniversaire peut déjà être dans la suite : la chambre, la table, une attention déposée par la maison. Personne ne le réorganise à la réception.",
  },
  {
    image: "photo-1436491865332-7a61a109cc05",
    alt: "Aile au-dessus des nuages",
    kicker: "L’imprévu",
    title: "Le vol repris, avant que vous le sachiez.",
    text: "Un horaire bouge. Le conseiller reprend la place, aligne la voiture et l’hôtel, et le carnet affiche la nouvelle heure.",
  },
];

const perks = [
  ["01", "Le tarif", "Les meilleurs tarifs sur les plus beaux hôtels choisis avec vous."],
  ["02", "Le matin", "Le petit-déjeuner offert, lorsque l’adresse le prévoit."],
  ["03", "Les heures", "Arrivée anticipée, départ tardif, si l’hôtel les confirme."],
  ["04", "La chambre", "Surclassement prioritaire, lorsqu’une chambre est libre."],
  ["05", "Le crédit", "Jusqu’à 200 dollars de dépenses par séjour, selon les hôtels."],
];

const reel = ["japon", "namibie", "argentine", "seychelles", "hawaii", "perou", "maroc", "kenya", "thailande", "saint-barth", "bali", "mexique"]
  .map((slug) => destinations.find((item) => item.slug === slug))
  .filter((item) => item != null);

const index = [
  ["Le voyage", `${PREVIEW}/sur-mesure`],
  ["À deux", `${PREVIEW}/services/a-deux`],
  ["En famille", `${PREVIEW}/kids`],
  ["Ski", `${PREVIEW}/services/ski`],
  ["Jet privé", `${PREVIEW}/services/jet-prive`],
  ["Chauffeur", `${PREVIEW}/services/chauffeur`],
  ["Accueil VIP", `${PREVIEW}/services/accueil-vip`],
  ["Hôtels", `${PREVIEW}/services/hotels`],
  ["Restaurants", `${PREVIEW}/services/restaurants`],
  ["Clubs", `${PREVIEW}/services/clubs`],
  ["Séminaires", `${PREVIEW}/seminaires`],
  ["Anniversaire", `${PREVIEW}/services/anniversaire`],
  ["EVG", `${PREVIEW}/services/evg`],
  ["Célébrations", `${PREVIEW}/services/celebrations`],
  ["Prestige", `${PREVIEW}/services/prestige`],
  ["Événements", `${PREVIEW}/services/evenements`],
] as const;

const beats = [
  ["01", "L’écoute", "Dates, personnes, motif, rythme. La maison entend avant de proposer."],
  ["02", "La proposition", "Un voyage écrit. Généralement sous vingt-quatre heures. Le détail se confirme, sur demande."],
  ["03", "Le séjour", "Le carnet s’ouvre. Quelqu’un reste joignable à toute heure si la journée change."],
  ["04", "Le retour", "La maison tient encore le dernier transfert, et ce qui reste à régler."],
];

export function HomeView() {
  return (
    <>
      <section className="vz-home-hero">
        <div className="vz-aura vz-aura-a" aria-hidden />
        <div className="vz-aura vz-aura-b" aria-hidden />
        <div className="vz-frame vz-hero-grid">
          <div className="vz-hero-copy">
            <div className="vz-eyebrow">
              <span />
              <p>Le service · L’expertise</p>
            </div>
            <h1>
              Tenir le voyage, <br />
              <em>jusqu’au détail.</em>
            </h1>
            <p className="vz-hero-lede">
              Les conseillers connaissent les maisons et les destinations de l’intérieur. Ils anticipent, ils tiennent le
              séjour avant, pendant et après, et restent joignables à toute heure. L’application, les voyages signature,
              le Club et les déplacements d’affaires en sont la suite.
            </p>
            <div className="vz-hero-cta">
              <Link className="vz-btn" href={contactPath("projet")}>
                Parler à un conseiller
              </Link>
              <Link className="vz-btn is-ghost" href={`${PREVIEW}/application`}>
                Voir l’application
              </Link>
            </div>
          </div>
          <div className="vz-device-wrap">
            <Phone controls />
          </div>
        </div>
      </section>

      <section className="vz-canvas" aria-label="Les cinq métiers">
        <div className="vz-frame">
          <header className="vz-sig-head">
            <div>
              <p className="vz-caps">Cinq façons de tenir le même service</p>
              <h2>La maison, entière.</h2>
            </div>
          </header>
          <div className="vz-film">
            {pillars.map((item) => (
              <Link key={item.href} href={item.href}>
                <Photo id={item.image} alt={item.alt} />
                <span>
                  <small>{item.kicker}</small>
                  <strong>{item.title}</strong>
                  <em>{item.line}</em>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="vz-canvas" aria-label="Le détail du service">
        {scenes.map((scene, index) => (
          <article key={scene.title} className={`vz-chapter${index % 2 ? " is-flip" : ""}`}>
            <figure>
              <Photo id={scene.image} alt={scene.alt} />
            </figure>
            <div>
              <p className="vz-kicker">{scene.kicker}</p>
              <h2>{scene.title}</h2>
              <p>{scene.text}</p>
            </div>
          </article>
        ))}
      </section>

      <section className="vz-band">
        <div className="vz-frame">
          <header className="vz-sig-head">
            <div>
              <p className="vz-caps">L’application</p>
              <h2>Le séjour, dans la poche.</h2>
            </div>
            <Link className="vz-link" href={`${PREVIEW}/application`}>
              Le détail
            </Link>
          </header>
          <p className="vz-lede">
            Un séjour d’exemple, le Japon : Claire et Thomas Berger, dix jours, trois maisons. Aucun client réel. Le
            carnet suit les jours. La table est tenue. Le bureau répond.
          </p>
          <div className="vz-phones">
            <Phone screen="accueil" />
            <Phone screen="carnet" />
            <Phone screen="fil" />
          </div>
        </div>
      </section>

      <section className="vz-canvas" id="signature">
        <div className="vz-frame">
          <header className="vz-sig-head">
            <div>
              <p className="vz-caps">Voyages signature</p>
              <h2>Déjà écrits. À confirmer.</h2>
            </div>
            <p className="vz-sig-count">
              <em>43</em>
              <span>créations, de l’Argentine au Pacifique</span>
            </p>
          </header>
        </div>
        <div className="vz-reel">
          {reel.map((item) => (
            <Link key={item.slug} href={voyagePath(item.slug)}>
              <Photo id={item.image} alt={item.alt} />
              <span>
                <small>{item.itineraries[0]?.duration}</small>
                <strong>{item.name}</strong>
                <em>{item.line}</em>
              </span>
            </Link>
          ))}
          <Link href={`${PREVIEW}/voyages`}>
            <span className="vz-reel-end">
              <strong>Les quarante-trois</strong>
              <em>
                Le catalogue <ArrowRight size={16} />
              </em>
            </span>
          </Link>
        </div>
      </section>

      <section className="vz-band" id="club">
        <div className="vz-frame vz-member">
          <article className="vz-metal">
            <header>
              <p className="vz-caps">Club Travel BA</p>
              <h2>La carte de la maison.</h2>
              <p>Ce qui se confirme avec l’hôtel, avant l’arrivée. Pas une surprise à la réception.</p>
            </header>
            <ol>
              {perks.map(([n, title, text]) => (
                <li key={n}>
                  <span>{n}</span>
                  <div>
                    <strong>{title}</strong>
                    <p>{text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <Link className="vz-link" href={`${PREVIEW}/club`}>
              Le Club
            </Link>
          </article>
          <figure>
            <Photo id="photo-1582719478250-c89cae4dc85b" alt="Suite et lumière douce" />
          </figure>
        </div>
      </section>

      <section className="vz-canvas">
        <div className="vz-frame vz-desk-wrap">
          <div>
            <p className="vz-caps">Déplacements professionnels</p>
            <h2>L’entreprise voyage avec une règle.</h2>
            <p className="vz-lede">
              La politique de prix se fixe avec vous : cabines, maisons, facture au nom de la société. Les voyageurs
              ouvrent l’application. La réservation reste à l’agence. Un agent répond, de jour comme de nuit.
            </p>
            <Link className="vz-link" href={`${PREVIEW}/professionnels`}>
              Les déplacements
            </Link>
          </div>
          <aside className="vz-desk" aria-label="Lecture d’exemple">
            <p className="vz-caps">Lecture d’exemple</p>
            <ul>
              <li>
                <span>Un vol qui bouge</span>
                <p>Le conseiller reprend la place. Le carnet montre la nouvelle heure.</p>
              </li>
              <li>
                <span>Une réunion avancée</span>
                <p>La voiture est déjà demandée plus tôt. L’hôtel le sait.</p>
              </li>
              <li>
                <span>La facture</span>
                <p>Établie pour la société, selon la politique écrite avec vous.</p>
              </li>
              <li>
                <span>Le fil</span>
                <p>Un agent Travel BA, à toute heure, pendant le déplacement.</p>
              </li>
            </ul>
          </aside>
        </div>
      </section>

      <section className="vz-band">
        <div className="vz-frame">
          <p className="vz-caps">La manière</p>
          <h2>Quatre temps.</h2>
          <ol className="vz-timeline">
            {beats.map(([n, title, text]) => (
              <li key={n}>
                <span>{n}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="vz-canvas">
        <div className="vz-frame">
          <header className="vz-sig-head">
            <div>
              <p className="vz-caps">Tout le service</p>
              <h2>Chaque métier a sa page.</h2>
            </div>
          </header>
          <ul className="vz-index">
            {index.map(([label, href]) => (
              <li key={href}>
                <Link href={href}>
                  <strong>{label}</strong>
                  <em>Voir</em>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
