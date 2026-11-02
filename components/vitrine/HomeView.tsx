import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Phone } from "@/components/vitrine/Phone";
import { Photo } from "@/components/vitrine/Photo";
import { destinations } from "@/lib/vitrine/destinations";
import { contactPath, PREVIEW, voyagePath } from "@/lib/vitrine/paths";

const devis = contactPath("projet");
const phone = "tel:+33772158257";

const pillars = [
  {
    href: `${PREVIEW}/application`,
    image: "photo-1493976040374-85c8e12f0c0e",
    alt: "Allée de torii dans la forêt",
    kicker: "L’application",
    title: "Le séjour dans le téléphone.",
    line: "Jours, vols, hôtels, documents, messages.",
  },
  {
    href: `${PREVIEW}/sur-mesure`,
    image: "photo-1582719478250-c89cae4dc85b",
    alt: "Suite et lumière douce",
    kicker: "Sur mesure",
    title: "Vols, hôtels, voiture, tables.",
    line: "Un conseiller pour tout le voyage.",
  },
  {
    href: `${PREVIEW}/voyages`,
    image: "photo-1484318571209-661cf29a69c3",
    alt: "Dune rouge au crépuscule",
    kicker: "Voyages signature",
    title: "43 voyages déjà écrits.",
    line: "Saison, hôtels, jour par jour.",
  },
  {
    href: `${PREVIEW}/professionnels`,
    image: "photo-1497366754035-f200968a6e72",
    alt: "Bureau calme",
    kicker: "Entreprises",
    title: "Voyages d’affaires.",
    line: "Règle de prix, facture société, agent 24h/24.",
  },
  {
    href: `${PREVIEW}/club`,
    image: "photo-1571896349842-33c89424de2d",
    alt: "Piscine et lumière du soir",
    kicker: "Le Club",
    title: "Petit-déjeuner, surclassement, crédit.",
    line: "Jusqu’à 200 $ de crédit par séjour, selon l’hôtel.",
  },
];

const scenes = [
  {
    image: "photo-1566073771259-6a8506099945",
    alt: "Chambre d’hôtel au matin",
    kicker: "Hôtel",
    title: "La chambre est demandée par son nom.",
    text: "Aile, étage, vue. Elle n’est confirmée que si l’hôtel la tient.",
  },
  {
    image: "photo-1517248135467-4c7edcad34c4",
    alt: "Salle de restaurant",
    kicker: "Restaurant",
    title: "La table est tenue, même un soir complet.",
    text: "Demandée à l’avance. Inscrite dans le carnet seulement une fois confirmée.",
  },
  {
    image: "photo-1507525428034-b723cf961d3e",
    alt: "Plage et eau claire",
    kicker: "Famille",
    title: "Le siège enfant est déjà dans la voiture.",
    text: "Dès l’aéroport. Nounou sur place, si vous la demandez.",
  },
  {
    image: "photo-1511795409834-ef04bbd61622",
    alt: "Table de réception",
    kicker: "Anniversaire",
    title: "L’attention est prête avant l’arrivée.",
    text: "Chambre, table, attention dans la suite. Rien à réorganiser à la réception.",
  },
  {
    image: "photo-1436491865332-7a61a109cc05",
    alt: "Aile au-dessus des nuages",
    kicker: "Vol",
    title: "Le vol est repris avant que vous le sachiez.",
    text: "Nouvelle place, voiture et hôtel alignés. Le carnet affiche la nouvelle heure.",
  },
];

const perks = [
  ["01", "Tarif", "Meilleurs tarifs sur les hôtels choisis avec vous."],
  ["02", "Petit-déjeuner", "Offert quand l’hôtel le prévoit."],
  ["03", "Horaires", "Arrivée anticipée et départ tardif, si l’hôtel confirme."],
  ["04", "Surclassement", "En priorité, si une chambre est libre."],
  ["05", "Crédit", "Jusqu’à 200 $ de crédit par séjour, selon l’hôtel."],
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
  ["01", "Vous nous dites", "Dates, personnes, motif."],
  ["02", "Nous écrivons", "Une proposition, généralement sous 24 h."],
  ["03", "Vous partez", "Le carnet s’ouvre. Un conseiller répond, 24h/24."],
  ["04", "Vous rentrez", "Dernier transfert et ce qui reste à régler."],
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
              <p>Travel BA · agence de voyage de luxe</p>
            </div>
            <h1>
              Votre voyage de luxe, <br />
              <em>organisé de A à Z.</em>
            </h1>
            <p className="vz-hero-lede">Vols, hôtels, transferts, tables, formalités. Un conseiller, 24h/24.</p>
            <div className="vz-hero-cta">
              <Link className="vz-btn" href={devis}>
                Demander un devis
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
              <p className="vz-caps">Ce que nous organisons</p>
              <h2>Cinq services.</h2>
            </div>
            <Link className="vz-link" href={devis}>
              Demander un devis
            </Link>
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

      <section className="vz-canvas" aria-label="Détails déjà prévus">
        {scenes.map((scene, index) => (
          <article key={scene.title} className={`vz-chapter${index % 2 ? " is-flip" : ""}`}>
            <figure>
              <Photo id={scene.image} alt={scene.alt} />
            </figure>
            <div>
              <p className="vz-kicker">{scene.kicker}</p>
              <h2>{scene.title}</h2>
              <p>{scene.text}</p>
              <Link className="vz-link" href={devis}>
                Demander un devis
              </Link>
            </div>
          </article>
        ))}
      </section>

      <section className="vz-band">
        <div className="vz-frame">
          <header className="vz-sig-head">
            <div>
              <p className="vz-caps">L’application</p>
              <h2>Votre séjour, dans le téléphone.</h2>
            </div>
            <Link className="vz-link" href={`${PREVIEW}/application`}>
              Voir l’application
            </Link>
          </header>
          <p className="vz-lede">Exemple : Japon, Claire et Thomas Berger. Aucun client réel.</p>
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
              <h2>43 voyages prêts à réserver.</h2>
            </div>
            <p className="vz-sig-count">
              <em>43</em>
              <span>de l’Argentine au Pacifique</span>
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
              <strong>Les 43 voyages</strong>
              <em>
                Voir le catalogue <ArrowRight size={16} />
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
              <h2>Petit-déjeuner, surclassement et jusqu’à 200 $ de crédit par séjour.</h2>
              <p>Selon l’hôtel. Confirmé avant l’arrivée.</p>
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
              Rejoindre le Club
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
            <h2>Vos voyages d’affaires, avec une règle.</h2>
            <p className="vz-lede">Cabines, hôtels, facture au nom de la société. La réservation reste à l’agence.</p>
            <div className="vz-actions">
              <Link className="vz-link" href={devis}>
                Demander un devis
              </Link>
              <a className="vz-link" href={phone}>
                Appeler
              </a>
            </div>
          </div>
          <aside className="vz-desk" aria-label="Lecture d’exemple">
            <p className="vz-caps">Exemple</p>
            <ul>
              <li>
                <span>Vol modifié</span>
                <p>Nouvelle place. Le carnet montre la nouvelle heure.</p>
              </li>
              <li>
                <span>Réunion avancée</span>
                <p>La voiture est demandée plus tôt. L’hôtel est prévenu.</p>
              </li>
              <li>
                <span>Facture</span>
                <p>Au nom de la société, selon la règle écrite avec vous.</p>
              </li>
              <li>
                <span>24h/24</span>
                <p>Un agent Travel BA pendant le déplacement.</p>
              </li>
            </ul>
          </aside>
        </div>
      </section>

      <section className="vz-band">
        <div className="vz-frame">
          <p className="vz-caps">Déroulement</p>
          <h2>Quatre étapes.</h2>
          <ol className="vz-timeline">
            {beats.map(([n, title, text]) => (
              <li key={n}>
                <span>{n}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ol>
          <div className="vz-actions">
            <Link className="vz-link" href={devis}>
              Demander un devis
            </Link>
            <a className="vz-link" href={phone}>
              Appeler
            </a>
          </div>
        </div>
      </section>

      <section className="vz-canvas">
        <div className="vz-frame">
          <header className="vz-sig-head">
            <div>
              <p className="vz-caps">Services</p>
              <h2>Tout ce que l’agence organise.</h2>
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
