import type { Metadata } from "next";
import Link from "next/link";
import { Frame } from "@/components/preview-refonte/Frame";
import { Photo } from "@/components/preview-refonte/Photo";
import { shot } from "@/components/preview-refonte/photos";
import { MessagesScreen, SuiviScreen } from "@/components/preview-refonte/Screens";
import { Credentials, PageHero, ProjetInvite } from "@/components/preview-refonte/ui";

export const metadata: Metadata = {
  title: { absolute: "Travel BA" },
  description:
    "Travel BA. Cinq univers — famille, à deux, entreprise, célébrer, montagne — et l’espace client. Étude non indexée.",
};

export default function PreviewHomePage() {
  return (
    <Frame>
      <PageHero
        title={
          <>
            Selon le moment
            <br />
            <em>de la vie.</em>
          </>
        }
        lede="La maison tient le voyage avant, pendant, et après. Cinq façons d’entrer. Un seul endroit pour le raconter."
        image={shot.hero}
        alt="Piscine à débordement face à la mer, en fin de journée"
      >
        <div className="tba-actions">
          <Link className="tba-word" href="/preview-refonte/projet">
            Racontez-nous votre projet
          </Link>
        </div>
      </PageHero>

      <section className="tba-manifesto">
        <p>
          Basée à Levallois-Perret, Travel BA conçoit et orchestre le voyage pour les entreprises comme pour les
          particuliers. Un interlocuteur. Du premier échange au dernier kilomètre.
        </p>
      </section>

      <article className="tba-recit is-bleed">
        <figure className="tba-frame">
          <Photo id={shot.maldives} alt="Lagon et ponton" sizes="100vw" />
          <div className="tba-recit-shade" aria-hidden="true" />
        </figure>
        <div className="tba-recit-copy">
          <p className="tba-kicker">En famille</p>
          <h2>Le matin, les chambres sont déjà ouvertes.</h2>
          <p>
            Une journée type, du réveil au coucher. Club des enfants, lit bébé, siège dans la voiture. Puis d’autres
            rivages, et la montagne en famille.
          </p>
          <Link className="tba-word" href="/preview-refonte/en-famille">
            Lire la journée
          </Link>
        </div>
      </article>

      <article className="tba-recit is-paper">
        <p className="tba-kicker">Entre nous</p>
        <blockquote>
          « On arrive sans programme chargé. La première soirée reste à l’hôtel. »
          <span>Positano · Le Sirenuse · carnet</span>
        </blockquote>
        <p>Cinq escapades, écrites comme un carnet. Kyoto, Marrakech, les Seychelles, Paris, les Maldives.</p>
        <Link className="tba-word" href="/preview-refonte/entre-nous">
          Ouvrir le carnet
        </Link>
      </article>

      <article className="tba-recit is-dossier">
        <p className="tba-kicker">Pour l’entreprise</p>
        <h2>Marrakech, tenu comme un dossier.</h2>
        <p>La Mamounia. Une étude, jour par jour. Inspiration, sans client nommé.</p>
        <ol>
          <li>
            <strong>00</strong> L’arrivée, les chauffeurs, le dîner.
          </li>
          <li>
            <strong>01</strong> La salle.
          </li>
          <li>
            <strong>02</strong> Hors les murs.
          </li>
          <li>
            <strong>03</strong> Le départ.
          </li>
        </ol>
        <Link className="tba-word" href="/preview-refonte/entreprise">
          Lire l’étude
        </Link>
      </article>

      <article className="tba-recit is-night">
        <p className="tba-kicker">Pour célébrer</p>
        <h2>La nuit a ses heures.</h2>
        <p>Paris, Cheval Blanc. De dix-huit heures à minuit : les voitures, la table, le club, le fil.</p>
        <div className="tba-heures-ligne">
          <span>18 h</span>
          <span>20 h</span>
          <span>22 h</span>
          <span>Minuit</span>
        </div>
        <Link className="tba-word" href="/preview-refonte/celebrer">
          Suivre la soirée
        </Link>
      </article>

      <article className="tba-recit is-ridge">
        <div className="tba-recit-copy">
          <p className="tba-kicker">À la montagne</p>
          <h2>Une semaine, pas un forfait affiché.</h2>
          <p>Cheval Blanc Courchevel, du lundi au dimanche. D’autres semaines à Val d’Isère, aux Arcs, au Mélézin.</p>
          <p className="tba-jours-noms">
            <span>Lun</span>
            <span>Mar</span>
            <span>Mer</span>
            <span>Jeu</span>
            <span>Ven</span>
            <span>Sam</span>
            <span>Dim</span>
          </p>
          <Link className="tba-word" href="/preview-refonte/montagne">
            Lire la semaine
          </Link>
        </div>
        <figure className="tba-frame">
          <Photo id={shot.matterhorn} alt="Sommet et neige" sizes="(min-width: 900px) 46vw, 100vw" />
        </figure>
      </article>

      <section className="tba-fil" id="fil">
        <h2>Avant, pendant, après.</h2>
        <article>
          <h3>Avant</h3>
          <p>
            Le projet commence par quelques questions : qui, quoi, quand, et une enveloppe si vous en avez une. Ensuite,
            le brief, la proposition, l’organisation. Les formalités — ESTA, ETA pour le Royaume-Uni, ETA-IL, les autres
            visas — suivent cinq temps : préparation, remplissage, validation, paiement, pièce. Les numéros de fidélité
            sont enregistrés sur la fiche : Flying Blue, Miles &amp; More, Executive Club, Skywards, Marriott Bonvoy, ALL
            Accor, Grand Voyageur, Great Members. Ils ne sont pas montrés.
          </p>
        </article>
        <article>
          <h3>Pendant</h3>
          <p>
            Le carnet suit le voyageur. La conciergerie répond sur WhatsApp, à toute heure. Chauffeur, accueil en
            aéroport, hôtel, table : un seul fil. L’échange ci-dessous est un exemple. Rien n’a été envoyé.
          </p>
          <MessagesScreen />
        </article>
        <article>
          <h3>Après</h3>
          <p>
            Les documents restent au coffre. La maison reste joignable. L’espace réel s’ouvre avec une invitation :{" "}
            <Link href="/preview-refonte/espace-client">le voir</Link>, ou <Link href="/connexion">entrer</Link>.
          </p>
          <SuiviScreen />
        </article>
      </section>

      <section className="tba-tenir" id="tenir">
        <h2>Ce que la maison tient.</h2>
        <p>
          Le jet privé : affrètement d’avions privés, optimisation des itinéraires et confort absolu, du décollage à
          l’atterrissage. L’appareil se confirme avec la maison.
        </p>
        <p>
          Les séminaires : organisation complète, lieux d’exception, logistique et animation. Le récit est dans{" "}
          <Link href="/preview-refonte/entreprise">Pour l’entreprise</Link>.
        </p>
        <p>
          Les événements sur mesure : conception et production d’événements privés et corporate. Les événements de
          prestige : accès VIP à Roland-Garros, à la Formule 1, à la Coupe du monde, aux festivals et aux galas.
          L’accès se demande, puis se confirme.
        </p>
        <p>
          Les hôtels : accès privilégié aux palaces, aux villas et aux adresses confidentielles. Les avantages d’un
          tarif — petit-déjeuner, surclassement, crédit — seulement lorsqu’ils sont inclus et confirmés.
        </p>
        <p>
          Les restaurants : les meilleures tables, même complètes. La demande part de la maison. Rien n’est réservé
          seul.
        </p>
        <p>
          Les clubs : clubs privés, tables VIP, soirées. Sur confirmation de l’adresse. Le chauffeur privé : flotte
          premium, discrétion. L’accueil VIP en aéroport : fast-track, salons privés, assistance dédiée.
        </p>
        <p>
          Les voyages sur mesure : des itinéraires pensés autour de vos envies et de votre agenda. Le titre d’un séjour
          retient les villes où l’on reste.
        </p>
        <p>
          L’émission des billets se fait par une agence IATA 20291655. L’heure et la référence restent celles du
          carnet. Cette étude n’en invente pas.
        </p>
      </section>

      <Credentials />
      <ProjetInvite lede="Un seul geste. Quelques questions, puis WhatsApp si vous voulez que le récit parte." />
    </Frame>
  );
}
