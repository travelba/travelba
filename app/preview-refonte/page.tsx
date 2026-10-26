import type { Metadata } from "next";
import Link from "next/link";
import { ContactBand } from "@/components/preview-refonte/ContactBand";
import { Frame } from "@/components/preview-refonte/Frame";
import { waCopy, shot } from "@/components/preview-refonte/photos";
import { CarnetScreen, MessagesScreen } from "@/components/preview-refonte/Screens";
import { Credentials, PageHero, ServiceIndex, Split } from "@/components/preview-refonte/ui";

export const metadata: Metadata = {
  title: { absolute: "Travel BA" },
  description:
    "Travel BA. Voyages sur mesure, hôtels, vols, jets, séminaires, ski, accueil, formalités, carnet et conciergerie. Étude non indexée.",
};

export default function PreviewHomePage() {
  return (
    <Frame whatsappText={waCopy.home}>
      <PageHero
        title={
          <>
            Le voyage,
            <br />
            <em>tenu.</em>
          </>
        }
        lede="Une maison parisienne pour le séjour entier : le vol, la maison, le passage en aéroport, la formalité, et le carnet qui reste ouvert."
        image={shot.hero}
        alt="Piscine à débordement face à la mer, en fin de journée"
      >
        <div className="tba-actions">
          <a className="tba-word" href="#services">
            Les services
          </a>
          <Link className="tba-word" href="/preview-refonte/espace-client">
            L’espace
          </Link>
          <a className="tba-word" href="#brief">
            Un brief
          </a>
        </div>
      </PageHero>

      <section className="tba-manifesto">
        <p>Rien n’est laissé au hasard du dernier kilomètre. La maison compose, confirme, et reste joignable.</p>
      </section>

      <ServiceIndex />

      <Split
        id="hotels"
        title="La maison, et ses avantages."
        text="Palaces, villas, adresses plus discrètes. Lorsque le tarif les prévoit, le séjour porte le petit-déjeuner, le surclassement ou le crédit. La maison les fait confirmer."
        image={shot.suite}
        alt="Chambre claire, linge blanc, lumière du matin"
        href="/preview-refonte/sur-mesure"
        more="Composer un séjour"
      />

      <Split
        id="vols"
        flip
        title="L’air, le rail, la mer."
        text="Billetterie aérienne, affrètement d’un jet privé lorsque le voyage l’appelle, trains, traversées. Les horaires restent ceux du carnet. La ville du titre est celle où l’on séjourne."
        image={shot.wing}
        alt="Aile d’avion au-dessus des nuages"
        href="/preview-refonte/espace-client"
        more="Voir le billet dans l’espace"
      />

      <Split
        id="ville"
        title="La ville, le soir, le rendez-vous."
        text="Tables, clubs, et les grands rendez-vous : Roland-Garros, Formule 1, Coupe du monde, festivals, galas. L’activité de la journée s’écrit dans le même carnet."
        image={shot.table}
        alt="Table dressée, lumière basse"
      />

      <Split
        id="sol"
        flip
        title="Du seuil de l’avion à la porte."
        text="Transfert, chauffeur, voiture. Fast track, salon, accueil à l’arrivée et au départ. L’enregistrement se prépare avant de partir."
        image={shot.car}
        alt="Berline sombre, profil"
        href="/preview-refonte/sur-mesure"
        more="Le séjour entier"
      />

      <section className="tba-prose" id="formalites">
        <h2>La formalité, avant le départ.</h2>
        <p>
          ESTA pour les États-Unis, ETA pour le Royaume-Uni, ETA pour Israël, et les autres visas. Le chemin suit cinq
          temps : préparation, remplissage, validation, paiement, pièce.
        </p>
        <ul>
          <li>
            <strong>La pièce reste au coffre</strong>
            Elle rejoint les documents du séjour, dans l’espace.
          </li>
          <li>
            <strong>L’assurance</strong>
            Lorsqu’elle est au dossier, elle suit le même carnet.
          </li>
        </ul>
      </section>

      <section className="tba-product" id="espace">
        <div className="tba-product-copy">
          <h2>L’espace suit le voyageur.</h2>
          <p className="tba-lead">
            Carnet, billets, documents, suivi, messages. La conciergerie répond sur WhatsApp, à toute heure. L’exemple
            ci-contre est fictif.
          </p>
          <div className="tba-actions">
            <Link className="tba-word" href="/preview-refonte/espace-client">
              Voir l’espace
            </Link>
            <Link className="tba-word" href="/connexion">
              Entrer
            </Link>
          </div>
        </div>
        <CarnetScreen />
      </section>

      <section className="tba-product is-flip">
        <div className="tba-product-copy">
          <h2>Un fil, pas une file.</h2>
          <p className="tba-lead">Le Concierge écrit dans le fil du séjour. Rien de cet échange n’a été envoyé.</p>
        </div>
        <MessagesScreen />
      </section>

      <section className="tba-prose" id="fidelite">
        <h2>Vos numéros, pas les nôtres.</h2>
        <p>
          La fiche garde les programmes du voyageur : Flying Blue, Miles &amp; More, Executive Club, Skywards, Marriott
          Bonvoy, ALL Accor, Grand Voyageur, Great Members. Le numéro n’est pas affiché. Il accompagne l’émission.
        </p>
        <p>
          <Link className="tba-word" href="/preview-refonte/espace-client">
            La fiche, dans l’espace
          </Link>
        </p>
      </section>

      <Credentials />
      <ContactBand whatsappText={waCopy.home} />
    </Frame>
  );
}
