import type { Metadata } from "next";
import Link from "next/link";
import { AppDevices } from "@/components/preview-refonte/AppDevices";
import { DevisForm } from "@/components/preview-refonte/DevisForm";
import { Frame } from "@/components/preview-refonte/Frame";
import { featuredOffers } from "@/components/preview-refonte/offers";
import { Photo } from "@/components/preview-refonte/Photo";
import { shot, waCopy, whatsappHref } from "@/components/preview-refonte/photos";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: "Travel BA" },
  description: "Travel BA. Voyages privés, séminaires, famille, ski. Étude non indexée.",
};

const pillars = [
  ["01", "Réactivité", "La conciergerie répond sur WhatsApp, à toute heure. Un seul interlocuteur."],
  ["02", "Sur mesure", "Chaque séjour suit l’agenda, les âges et le motif. Rien n’est un circuit."],
  ["03", "Tout est tenu", "Vols, hôtels, tables, transferts, formalités. Le jet, lorsque l’appareil est confirmé."],
  ["04", "L’espace", "Billets, documents, messages. Le carnet suit le voyageur, où qu’il soit."],
];

export default function PreviewHomePage() {
  return (
    <Frame>
      <section className="tba-pocket">
        <div className="tba-pocket-copy">
          <p className="tba-kicker">Travel Business Agency · L’application</p>
          <h1>Votre voyage, dans votre poche.</h1>
          <p>
            Le carnet, les documents, la carte d’embarquement et le fil WhatsApp avec la maison. Un dossier d’exemple,
            sans horaire inventé.
          </p>
          <div className="tba-actions">
            <Link className="tba-word" href="/preview-refonte/application">
              Voir l’application
            </Link>
            <a className="tba-word is-quiet" href="#devis">
              Demander un devis
            </a>
          </div>
        </div>
        <AppDevices />
      </section>

      <section className="tba-why" id="pourquoi" aria-labelledby="pourquoi-titre">
        <h2 id="pourquoi-titre">Pourquoi Travel BA</h2>
        <div>
          {pillars.map(([n, title, text]) => (
            <article key={n}>
              <span>{n}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="tba-cards" id="offres" aria-labelledby="offres-titre">
        <h2 id="offres-titre">Nos offres</h2>
        {featuredOffers.map((offer) => (
          <Link key={offer.slug} href={offer.href} className="tba-card">
            <figure className="tba-frame">
              <Photo id={offer.image} alt={offer.alt} sizes="(min-width: 800px) 42vw, 100vw" />
            </figure>
            <div>
              <h3>{offer.menu}</h3>
              <p>{offer.card}</p>
              <span>Découvrir</span>
            </div>
          </Link>
        ))}
      </section>

      <section className="tba-about" id="apropos">
        <p className="tba-kicker">À propos</p>
        <h2>Une maison, pour le privé et pour l’entreprise.</h2>
        <p>
          Basée à Levallois-Perret, Travel BA tient le voyage des particuliers exigeants et des entreprises. Brief,
          proposition, organisation, puis le séjour.
        </p>
        <ul>
          <li>
            <strong>Sur mesure.</strong> Le séjour suit vos préférences, pas une grille.
          </li>
          <li>
            <strong>Joignable.</strong> La conciergerie reste au bout du fil, à toute heure.
          </li>
          <li>
            <strong>L’espace.</strong> Carnet, billets et documents, depuis le téléphone.
          </li>
        </ul>
        <Link className="tba-word" href="#devis">
          Commencer
        </Link>
      </section>

      <section className="tba-corp">
        <div>
          <p className="tba-kicker">Voyages professionnels</p>
          <h2>Congrès et séminaires.</h2>
          <p>La maison accompagne les entreprises pour les séminaires, les incentives et les déplacements de groupe.</p>
          <ul>
            <li>Organisation complète et tenue du groupe</li>
            <li>Logistique écrite avant le jour même</li>
            <li>Billets et confirmations dans l’espace</li>
          </ul>
          <Link className="tba-word" href="/preview-refonte/seminaires">
            Organiser
          </Link>
        </div>
        <figure className="tba-frame">
          <Photo id={shot.medina} alt="Ruelles et lumière chaude" sizes="(min-width: 900px) 48vw, 100vw" />
        </figure>
      </section>

      <section className="tba-exp">
        <h2>Des moments tenus.</h2>
        <div>
          <p>
            En famille, le club, le lit bébé et le siège dans la voiture. À deux, une table et quelques nuits sans
            programme. Pour célébrer, la soirée de dix-huit heures à minuit. À la montagne, la semaine du lundi au
            dimanche.
          </p>
          <p>
            Chaque proposition est une inspiration. Les maisons sont réelles. Les accès, les nounous et les tables se
            confirment. Ils ne sont pas annoncés avant.
          </p>
        </div>
      </section>

      <section className="tba-devis-band" id="devis">
        <div>
          <h2>Demander un devis</h2>
          <p>Dites le voyage. La demande se prépare ici. Cette étude ne l’envoie pas.</p>
          <p>
            <Link href="/preview-refonte/projet">Quatre questions</Link>, si le projet se raconte mieux ainsi.
          </p>
          <p>
            <a href={`mailto:${siteConfig.contactEmail}`}>{siteConfig.contactEmail}</a>
            <br />
            <a href="tel:+33772158257">07 72 15 82 57</a>
            <br />
            <a href={whatsappHref(waCopy.home)}>WhatsApp</a>
          </p>
        </div>
        <DevisForm />
      </section>
    </Frame>
  );
}
