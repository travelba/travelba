import type { Metadata } from "next";
import Link from "next/link";
import { Frame } from "@/components/preview-refonte/Frame";
import { Photo } from "@/components/preview-refonte/Photo";
import { shot } from "@/components/preview-refonte/photos";
import { CarnetScreen } from "@/components/preview-refonte/Screens";
import { Credentials, ProjetInvite } from "@/components/preview-refonte/ui";

export const metadata: Metadata = {
  title: "En famille",
  description:
    "Une journée type en famille, puis d’autres inspirations : mer, îles, montagne. Étude non indexée.",
};

export default function EnFamillePage() {
  return (
    <Frame>
      <header className="tba-journee-open">
        <p className="tba-kicker">En famille · Inspiration</p>
        <h1>Une journée, du réveil au coucher.</h1>
        <p>
          Halkidiki, Ikos Olivia. Le récit suit une famille comme la maison la tiendrait : chambres qui s’ouvrent l’une
          sur l’autre, club des enfants, transfert avec siège, conciergerie au bout du fil. Aucun client n’est cité.
        </p>
      </header>

      <section className="tba-moment">
        <time>Matin</time>
        <div>
          <h2>Les chambres sont déjà ouvertes.</h2>
          <p>
            La nuit a été demandée en chambres communicantes. Le lit bébé est en place depuis l’arrivée, pas cherché le
            soir. Le petit-déjeuner se prend dans la suite ou en bas, selon l’âge et le sommeil. Personne ne part pour un
            transfert : la journée commence où l’on a dormi.
          </p>
        </div>
      </section>

      <section className="tba-moment is-photo">
        <time>Fin de matinée</time>
        <div>
          <h2>Le club a un âge, et un nom.</h2>
          <p>
            À Ikos Olivia, Heroes Kids Club accueille les enfants à partir de quatre ans, Heroes Crèche les plus petits
            à partir d’environ six mois, Just4Teens à partir de douze ans. Les mêmes clubs existent à Ikos Porto Petro,
            à Majorque, et à Ikos Andalusia, entre Marbella et Estepona. La maison confirme les âges et les créneaux
            avec le resort avant le départ.
          </p>
        </div>
        <figure className="tba-frame is-tall">
          <Photo id={shot.maldives} alt="Lagon clair et ponton, lumière du matin" sizes="(min-width: 900px) 30vw, 100vw" />
        </figure>
      </section>

      <section className="tba-moment">
        <time>Midi</time>
        <div>
          <h2>La table, ou le club.</h2>
          <p>
            Les parents déjeunent. L’enfant reste au club, ou revient à table. Le choix se dit le matin. Si l’hôtel a un
            menu pour les enfants, il est demandé. Rien n’est ajouté au récit au-delà de ce que la maison confirme.
          </p>
        </div>
      </section>

      <section className="tba-moment">
        <time>Après-midi</time>
        <div>
          <h2>Piscine, sieste, ou une nounou.</h2>
          <p>
            La nounou se demande à l’hôtel. Elle dépend d’une disponibilité : la maison la demande, elle attend la
            réponse. L’après-midi peut aussi rester simple, l’eau et l’ombre, sans programme écrit.
          </p>
        </div>
      </section>

      <section className="tba-moment is-photo">
        <time>Fin de journée</time>
        <div>
          <h2>S’il y a une table en ville, le siège est dans la voiture.</h2>
          <p>
            Le chauffeur privé fait partie du séjour quand la journée sort de l’hôtel. Le siège enfant fait partie du
            transfert, au même titre que l’adresse. La flotte est premium, la consigne est la discrétion. Le trajet se
            confirme quand la maison l’a.
          </p>
        </div>
        <figure className="tba-frame is-tall">
          <Photo id={shot.car} alt="Berline sombre, de profil" sizes="(min-width: 900px) 30vw, 100vw" />
        </figure>
      </section>

      <section className="tba-moment">
        <time>Soir</time>
        <div>
          <h2>Le carnet de la journée.</h2>
          <p>
            L’espace suit la famille : où l’on dort, ce qui est confirmé, le fil avec la conciergerie. Un message si la
            journée a bougé. L’écran ci-dessous est un exemple. La conciergerie répond sur WhatsApp, à toute heure.
          </p>
          <CarnetScreen
            title="Halkidiki"
            meta="Une semaine · dossier d’exemple"
            lines={[
              ["Nuit", "Ikos Olivia", "Chambres communicantes"],
              ["Matin", "Heroes", "Âges confirmés avec le resort"],
              ["Route", "Chauffeur", "Siège enfant"],
              ["Fil", "Concierge", "Dans l’espace"],
            ]}
          />
        </div>
      </section>

      <section className="tba-maisons" aria-labelledby="autres-journees">
        <h2 id="autres-journees">D’autres journées.</h2>
        <p className="tba-lead">
          Le même soin, un autre rivage. Chaque ligne est une inspiration : la destination, l’hôtel, le déroulé, ce que
          la maison organiserait.
        </p>

        <article className="tba-maison-row">
          <p className="tba-ou">Seychelles · île</p>
          <h3>Club Med Exclusive Collection, Seychelles</h3>
          <p>
            Arrivée sur l’île, installation dans le resort ou dans un Exclusive Collection Space lorsque le séjour s’y
            tient. Le matin, le club enfants du village, les âges confirmés avec Club Med. L’après-midi, la mer. Le
            soir, le dîner sur place. La maison demande les chambres côte à côte, le lit bébé, le transfert depuis
            l’aéroport avec un siège. L’accueil VIP — fast-track, salon privé, assistance — se prépare si le passage à
            l’aéroport le demande. Le jet, seulement si le voyage le justifie : l’appareil est affrété et confirmé, du
            décollage à l’atterrissage.
          </p>
        </article>

        <article className="tba-maison-row">
          <p className="tba-ou">Desaru Coast · mer</p>
          <h3>Mandarin Oriental, Desaru Coast</h3>
          <p>
            Le Kids’ Club reçoit les enfants de quatre à onze ans. Les suites et les villas communicantes existent dans
            la maison. La nounou se demande, elle reste soumise à disponibilité. Journée : club le matin, jardin et mer
            ensuite, dîner à l’hôtel. La maison tient la réservation, les chambres, le transfert, le carnet. Les
            avantages du tarif — petit-déjeuner, surclassement, crédit — n’apparaissent que s’ils sont inclus et
            confirmés.
          </p>
        </article>

        <article className="tba-maison-row">
          <p className="tba-ou">Val d’Isère · montagne</p>
          <h3>Club Med Exclusive Collection, Val d’Isère</h3>
          <p>
            Une semaine de ski en famille. Au Club Med, en montagne, le forfait de remontées et les cours de ski ou de
            snowboard font partie du séjour. Le club enfants du village couvre la journée pendant que les parents
            skient, les âges se confirment avant le départ. Arrivée en transfert, sièges enfants dans les voitures,
            chambres proches. Le récit de la semaine alpine est aussi dans{" "}
            <Link href="/preview-refonte/montagne">À la montagne</Link>. Les Arcs Panorama, Tignes et Valmorel se
            tiennent de la même façon : ce sont des Exclusive Collection Spaces.
          </p>
        </article>

        <article className="tba-maison-row">
          <p className="tba-ou">Dubaï · Palm</p>
          <h3>Atlantis The Royal</h3>
          <p>
            Atlantis Explorers Club pour les 4–12 ans, Little Explorers pour les tout-petits avec un adulte, Teens
            Lounge pour les 13–17 ans. L’après-midi peut rester au club, le soir revient à la chambre. La maison
            organise l’arrivée — accueil VIP si le terminal le demande, chauffeur — et le carnet du séjour. Aucun
            horaire de vol n’est inventé ici.
          </p>
        </article>

        <article className="tba-maison-row">
          <p className="tba-ou">Riviera Nayarit · par périodes</p>
          <h3>One&amp;Only Mandarina, KidsOnly</h3>
          <p>
            KidsOnly est le club de One&amp;Only Mandarina. Il ouvre par périodes, notamment l’été, pour les enfants
            d’environ quatre à onze ans, autour d’un terrain de jeu dans la végétation. La maison ne le promet pas hors
            de ces périodes : elle vérifie la saison, puis elle tient chambres, transferts et conciergerie.
          </p>
        </article>

        <article className="tba-maison-row">
          <p className="tba-ou">Nassau et Riviera Maya</p>
          <h3>Rosewood Baha Mar, Rosewood Mayakoba</h3>
          <p>
            À Baha Mar, Rosewood Explorers accueille les enfants d’environ quatre à douze ans. À Mayakoba, la page
            familles du resort décrit les suites familiales et les nounous, à demander avec un préavis. Deux journées
            possibles : club et plage à Nassau, ou une suite familiale et une nounou confirmée à Mayakoba. La maison
            écrit le déroulé une fois l’hôtel choisi.
          </p>
        </article>

        <article className="tba-maison-row">
          <p className="tba-ou">Maldives, Algarve, Sardaigne, Oman</p>
          <h3>D’autres maisons, le même fil</h3>
          <p>
            Cheval Blanc Randheli reçoit les familles : équipement bébé, menus enfants, un temps de jeu. À Six Senses,
            le programme s’appelle Grow With Six Senses ; Nest est le kids club de Krabey Island et de Yao Noi, le Teen
            Club est à Zighy Bay. Les chambres communicantes se demandent là où l’hôtel en a. Martinhal Sagres, en
            Algarve, a le Raposinhos Kids Club, des tout-petits jusqu’au début de l’adolescence. Forte Village, en
            Sardaigne, a son kids club et l’AcquaPark. Là où un Four Seasons ouvre Kids For All Seasons, le club suit
            l’âge et la destination : la maison le retient seulement s’il est ouvert pour les enfants du voyage. Club
            Med, ailleurs : Exclusive Collection aux Seychelles, à Cefalù, à Kani, à La Palmeraie de Marrakech ; Spaces
            aussi à Québec Charlevoix, Cancún, Punta Cana, Rio das Pedras.
          </p>
        </article>
      </section>

      <section className="tba-tenu" aria-label="Ce que la maison prépare">
        <h2>Ce que la maison prépare.</h2>
        <ul>
          <li>
            <strong>Chambres communicantes.</strong> Demandées à la réservation, avec le nombre d’enfants et les âges.
          </li>
          <li>
            <strong>Lit bébé.</strong> En place à l’arrivée, lorsque l’hôtel en a un.
          </li>
          <li>
            <strong>Nounou.</strong> Demandée. Elle reste soumise à la disponibilité de la maison d’hôte.
          </li>
          <li>
            <strong>Kids club.</strong> Celui de l’hôtel retenu, avec ses âges, confirmé avant le départ.
          </li>
          <li>
            <strong>Transfert.</strong> Chauffeur privé, siège enfant dans la voiture.
          </li>
          <li>
            <strong>Accueil VIP.</strong> Fast-track, salon privé, assistance dédiée, quand l’aéroport le demande.
          </li>
          <li>
            <strong>Jet privé.</strong> Affrètement, itinéraire, confort du décollage à l’atterrissage. L’appareil se confirme avec la maison.
          </li>
          <li>
            <strong>Billets.</strong> Agence IATA 20291655. L’émission va dans le carnet. L’heure reste celle du billet.
          </li>
          <li>
            <strong>L’espace.</strong> Carnet, documents, messages. La conciergerie, sur WhatsApp, à toute heure.
          </li>
        </ul>
      </section>

      <Credentials />
      <ProjetInvite lede="Dites-nous les âges, la saison, et si la journée doit rester à l’hôtel ou sortir." />
    </Frame>
  );
}
