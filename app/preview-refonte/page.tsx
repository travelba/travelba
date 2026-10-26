import type { Metadata } from "next";
import Link from "next/link";
import { AppStage } from "@/components/preview-refonte/AppStage";
import { previewServices } from "@/components/preview-refonte/catalog";
import { DevisForm } from "@/components/preview-refonte/DevisForm";
import { Frame } from "@/components/preview-refonte/Frame";
import { Photo } from "@/components/preview-refonte/Photo";
import { shot, whatsappHref, waCopy } from "@/components/preview-refonte/photos";
import { Credentials } from "@/components/preview-refonte/ui";
import { universes } from "@/components/preview-refonte/universes";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: "Travel BA" },
  description:
    "Travel BA. Ultra-personnalisé, ultra-réactif, partout, tout le temps. Étude non indexée.",
};

const offerHref: Record<string, string> = {
  "jet-prive": "/preview-refonte#tenir",
  seminaires: "/preview-refonte/entreprise",
  evenements: "/preview-refonte/entreprise",
  prestige: "/preview-refonte/celebrer",
  hotels: "/preview-refonte/entre-nous",
  restaurants: "/preview-refonte/entre-nous",
  clubs: "/preview-refonte/celebrer",
  chauffeur: "/preview-refonte#tenir",
  "accueil-vip": "/preview-refonte#tenir",
  "sur-mesure": "/preview-refonte/entre-nous",
  ski: "/preview-refonte/montagne",
};

const universeShot: Record<string, { image: string; alt: string; line: string }> = {
  "/preview-refonte/en-famille": {
    image: shot.maldives,
    alt: "Lagon et ponton",
    line: "Une journée type. Club Med, Ikos, les maisons qui reçoivent les enfants.",
  },
  "/preview-refonte/entre-nous": {
    image: shot.amalfi,
    alt: "Côte et mer, fin de jour",
    line: "Un carnet d’escapades. Le Sirenuse, Aman Kyoto, Royal Mansour.",
  },
  "/preview-refonte/entreprise": {
    image: shot.koutoubia,
    alt: "Tour et jardin, lumière chaude",
    line: "Séminaires et incentives. Marrakech, jour par jour.",
  },
  "/preview-refonte/celebrer": {
    image: "photo-1566737236500-c8ac43014a67",
    alt: "Salle sombre, lumières chaudes",
    line: "Une soirée, heure par heure. Tables, clubs, grands rendez-vous.",
  },
  "/preview-refonte/montagne": {
    image: shot.peaks,
    alt: "Crêtes enneigées",
    line: "Une semaine de ski. Courchevel, Val d’Isère, Les Arcs.",
  },
};

const pillars = [
  {
    n: "01",
    title: "Ultra-personnalisé",
    text: "Le séjour suit l’agenda, les âges, le motif. Rien n’est un circuit.",
  },
  {
    n: "02",
    title: "Ultra-réactif",
    text: "La conciergerie répond sur WhatsApp, à toute heure. Un seul interlocuteur.",
  },
  {
    n: "03",
    title: "Tout est tenu",
    text: "Vols, hôtels, tables, transferts, formalités. Le jet, lorsque l’appareil est confirmé.",
  },
  {
    n: "04",
    title: "Partout, tout le temps",
    text: "Carnet, billets, documents, messages. L’espace suit le voyageur.",
  },
];

export default function PreviewHomePage() {
  return (
    <Frame>
      <section className="tba-hero tba-name">
        <Photo id={shot.hero} alt="Piscine à débordement face à la mer, en fin de journée" sizes="100vw" preload width={2400} className="tba-hero-img" />
        <div className="tba-hero-shade" aria-hidden="true" />
        <div className="tba-hero-copy">
          <p className="tba-kicker">Travel Business Agency</p>
          <h1>Travel BA</h1>
          <p className="tba-name-lines">
            Ultra-personnalisé. Ultra-réactif.
            <br />
            Partout, tout le temps.
          </p>
          <p className="tba-lead">L’agence orchestre le voyage privé et celui des entreprises, de la première idée au dernier kilomètre.</p>
          <div className="tba-actions">
            <a className="tba-word" href="#devis">
              Demander un devis
            </a>
            <Link className="tba-word" href="/preview-refonte/espace-client">
              Espace client
            </Link>
          </div>
        </div>
      </section>

      <section className="tba-pillars tba-reveal" id="pourquoi" aria-labelledby="pourquoi-titre">
        <h2 id="pourquoi-titre">Pourquoi Travel BA</h2>
        <div>
          {pillars.map((item) => (
            <article key={item.n}>
              <span>{item.n}</span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="tba-univers tba-reveal" aria-labelledby="univers-titre">
        <h2 id="univers-titre">Cinq façons d’entrer.</h2>
        <div>
          {universes.map((item) => {
            const visual = universeShot[item.href];
            return (
              <Link key={item.href} href={item.href}>
                <figure className="tba-frame">
                  <Photo id={visual.image} alt={visual.alt} sizes="(min-width: 900px) 20vw, 100vw" />
                </figure>
                <h3>{item.title}</h3>
                <p>{visual.line}</p>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="tba-offres tba-reveal" id="tenir" aria-labelledby="offres-titre">
        <h2 id="offres-titre">Toute l’offre.</h2>
        <p>Chaque ligne ouvre la page qui la raconte.</p>
        <div>
          {previewServices.map((service) => (
            <Link key={service.slug} href={offerHref[service.slug] ?? "/preview-refonte#tenir"}>
              <strong>{service.menu}</strong>
              <span>{service.description}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="tba-about tba-reveal">
        <p>
          Basée à Levallois-Perret, la maison conçoit le voyage pour les entreprises comme pour les particuliers.
          Brief, proposition, organisation, puis le séjour. Les formalités — ESTA, ETA pour le Royaume-Uni, ETA-IL et
          les autres visas — suivent cinq temps : préparation, remplissage, validation, paiement, pièce.
        </p>
      </section>

      <section className="tba-show tba-reveal" id="espace-voyage" aria-labelledby="espace-titre">
        <div className="tba-show-copy">
          <p className="tba-kicker">L’espace</p>
          <h2 id="espace-titre">Le voyage, dans la main.</h2>
          <p>
            Un dossier d’exemple. Compte à rebours, étapes, vol, hôtel, transferts, documents, budget, fil avec la
            maison. Aucune donnée de client. Aucun horaire inventé. Le montant reste dans le vrai espace.
          </p>
          <div className="tba-actions">
            <Link className="tba-word" href="/preview-refonte/espace-client">
              Voir l’espace
            </Link>
            <Link className="tba-word is-quiet" href="/connexion">
              Entrer
            </Link>
          </div>
        </div>
        <AppStage />
      </section>

      <section className="tba-corp tba-reveal">
        <figure className="tba-frame">
          <Photo id={shot.medina} alt="Ruelles et lumière chaude" sizes="(min-width: 900px) 48vw, 100vw" />
        </figure>
        <div>
          <p className="tba-kicker">Pour l’entreprise</p>
          <h2>Congrès et séminaires.</h2>
          <p>
            Organisation complète : lieux d’exception, logistique, animation. L’étude de Marrakech, à La Mamounia, se
            lit jour par jour. D’autres dossiers tiennent à la Palmeraie, à Paris, ou à la montagne.
          </p>
          <p>Factures, billets et confirmations vivent dans l’espace du groupe. Le carnet ne publie pas de prix ici.</p>
          <Link className="tba-word" href="/preview-refonte/entreprise">
            Lire l’étude
          </Link>
        </div>
      </section>

      <section className="tba-exp tba-reveal" aria-labelledby="exp-titre">
        <h2 id="exp-titre">Des expériences tenues.</h2>
        <div>
          <Link href="/preview-refonte/en-famille">
            <figure className="tba-frame">
              <Photo id={shot.seychelles} alt="Granite et eau claire" sizes="(min-width: 800px) 34vw, 100vw" />
            </figure>
            <h3>En famille</h3>
            <p>Chambres communicantes, kids club, siège dans la voiture. Ikos Olivia, Club Med, Mandarin Oriental Desaru Coast.</p>
          </Link>
          <Link href="/preview-refonte/entre-nous">
            <figure className="tba-frame">
              <Photo id={shot.table} alt="Table dressée, lumière basse" sizes="(min-width: 800px) 34vw, 100vw" />
            </figure>
            <h3>À deux</h3>
            <p>Quelques nuits sans programme chargé. Une table, même complète, se demande puis se confirme.</p>
          </Link>
          <Link href="/preview-refonte/celebrer">
            <figure className="tba-frame">
              <Photo id="photo-1511795409834-ef04bbd61622" alt="Salle de réception, lumière dorée" sizes="(min-width: 800px) 34vw, 100vw" />
            </figure>
            <h3>Pour célébrer</h3>
            <p>Dix-huit heures, la table, le club, minuit. Roland-Garros et les grands rendez-vous se demandent.</p>
          </Link>
        </div>
      </section>

      <section className="tba-devis-band tba-reveal" id="devis">
        <div>
          <p className="tba-kicker">Demander un devis</p>
          <h2>Racontez-nous le voyage.</h2>
          <p>La demande se prépare ici. Cette étude ne l’envoie pas.</p>
          <p>
            <a href={whatsappHref(waCopy.home)}>WhatsApp</a>
            <br />
            <a href="tel:+33772158257">07 72 15 82 57</a>
            <br />
            <a href={`mailto:${siteConfig.contactEmail}`}>{siteConfig.contactEmail}</a>
          </p>
          <p>
            Le chemin guidé reste ouvert : <Link href="/preview-refonte/projet">quatre questions</Link>, si vous préférez.
          </p>
        </div>
        <DevisForm />
      </section>

      <Credentials />
    </Frame>
  );
}
