import type { Metadata } from "next";
import Link from "next/link";
import { Frame } from "@/components/preview-refonte/Frame";
import { Photo } from "@/components/preview-refonte/Photo";
import { MessagesScreen } from "@/components/preview-refonte/Screens";
import { Credentials, ProjetInvite } from "@/components/preview-refonte/ui";

export const metadata: Metadata = {
  title: "Pour célébrer",
  description: "Une soirée racontée heure par heure, et d’autres nuits. Étude non indexée.",
};

export default function CelebrerPage() {
  return (
    <Frame>
      <article className="tba-soiree">
        <p className="tba-kicker">Pour célébrer · Inspiration</p>
        <h1>Une soirée, heure par heure.</h1>
        <p className="tba-lead">
          Paris, Cheval Blanc. Les heures donnent le rythme du récit. Ce ne sont pas des horaires de vol. Aucun invité
          réel n’est nommé.
        </p>

        <section className="tba-heure">
          <time>18 h</time>
          <h2>Les voitures sont placées.</h2>
          <p>
            Les invités arrivent. La flotte est premium, les chauffeurs d’expérience, la discrétion est la consigne. Le
            trajet se confirme quand la maison a les adresses. À l’hôtel, les chambres de ceux qui restent dormir sont
            prêtes. Cheval Blanc Paris tient la nuit. L’accueil dans le hall reste celui de la maison, sans file
            improvisée.
          </p>
          <figure className="tba-frame is-cine">
            <Photo id="photo-1449965408869-eaa3f722e40d" alt="Route et lumière, en fin de jour" sizes="100vw" preload />
          </figure>
        </section>

        <section className="tba-heure">
          <time>20 h</time>
          <h2>La table.</h2>
          <p>
            Dans la maison, ou dehors. Les meilleures tables, même complètes, se demandent. La réservation part de
            l’agence. Rien n’est tenu pour acquis avant la confirmation. Le dîner est conçu comme un événement privé :
            le rythme, les places, le moment où l’on se lève. La production suit l’ambition de la soirée.
          </p>
          <figure className="tba-frame is-wide">
            <Photo id="photo-1414235077428-338989a2e8c0" alt="Table dressée, verres, lumière basse" sizes="100vw" />
          </figure>
        </section>

        <section className="tba-heure">
          <time>22 h</time>
          <h2>Le club.</h2>
          <p>
            L’accès se demande : clubs privés, table VIP, soirée. La maison le confirme avec l’adresse. Quand la file
            est écartée, c’est l’adresse qui le dit, pas une formule générale. Ceux qui ne viennent pas au club
            rentrent. Les chauffeurs connaissent déjà les deux fins de soirée.
          </p>
          <figure className="tba-frame is-wide">
            <Photo id="photo-1566737236500-c8ac43014a67" alt="Salle sombre, lumières chaudes" sizes="100vw" />
          </figure>
        </section>

        <section className="tba-heure">
          <time>Minuit</time>
          <h2>Le fil, pas une file.</h2>
          <p>
            Les retours. Le Concierge écrit dans le fil du séjour. L’échange montré ici est un exemple : rien n’a été
            envoyé. La conciergerie reste joignable, à toute heure, y compris quand la soirée déborde.
          </p>
          <MessagesScreen
            lines={[
              ["house", "Les voitures sont en bas. Cheval Blanc pour ceux qui restent."],
              ["you", "Deux invités partent plus tôt."],
              ["house", "Une voiture se détache. Nous le notons dans ce fil."],
            ]}
          />
        </section>

        <section className="tba-autres-nuits" aria-labelledby="autres-nuits">
          <h2 id="autres-nuits">D’autres nuits.</h2>

          <article>
            <h3>Roland-Garros, puis le soir</h3>
            <p>
              L’accès VIP se demande et se confirme. La maison ne décrit pas les places comme déjà tenues. La journée
              va au court, le chauffeur tient les trajets, la nuit se poursuit au Cheval Blanc ou au Four Seasons Hotel
              George V. La table du soir se demande à part, même complète. Le même geste vaut pour un festival ou un
              gala : l’accès, l’hôtel, la voiture, le fil.
            </p>
          </article>
          <article>
            <h3>Formule 1, Coupe du monde</h3>
            <p>
              Le rendez-vous dicte la ville. L’hôtel se choisit quand la date est connue — un palace de la ville, pas
              une formule. Jet si les invités arrivent ainsi : affrètement confirmé, du décollage à l’atterrissage.
              Accueil VIP à l’aéroport, chauffeurs jusqu’à l’hôtel, puis jusqu’au rendez-vous. Les billets d’accès se
              confirment. Ils ne sont pas annoncés avant.
            </p>
          </article>
          <article>
            <h3>Marrakech, Royal Mansour</h3>
            <p>
              Une célébration, pas le séminaire. Arrivée l’après-midi, accueil VIP si le terminal le demande, chauffeurs
              jusqu’au riad. 20 h, le dîner dans la maison ou une table en ville, demandée. 22 h, la suite de la nuit
              seulement si vous la souhaitez. Le carnet porte les confirmations. L’étude jour par jour d’un groupe est
              dans <Link href="/preview-refonte/entreprise">Pour l’entreprise</Link>.
            </p>
          </article>
          <article>
            <h3>Une île, pour quelques invités</h3>
            <p>
              One&amp;Only Reethi Rah, ou Four Seasons Resort Seychelles. Le transfert que l’île confirme, un dîner sur
              place, pas de club à inventer. Le jet jusqu’à l’aéroport d’arrivée, puis le dernier bateau ou la voiture,
              tenus tous les deux. L’espace reste ouvert pendant les nuits.
            </p>
          </article>
        </section>
      </article>

      <section className="tba-tenu">
        <h2>Ce que la soirée emprunte à la maison.</h2>
        <ul>
          <li>
            <strong>Événements de prestige.</strong> Roland-Garros, Formule 1, Coupe du monde, festivals, galas. L’accès se demande.
          </li>
          <li>
            <strong>Clubs.</strong> Clubs privés, tables VIP, soirées. Sur confirmation.
          </li>
          <li>
            <strong>Tables.</strong> Même complètes. La demande part, la confirmation revient.
          </li>
          <li>
            <strong>Chauffeur.</strong> Flotte premium, discrétion, deux fins de soirée si le groupe se sépare.
          </li>
          <li>
            <strong>Hôtel.</strong> Cheval Blanc Paris dans le récit, d’autres palaces selon la ville.
          </li>
          <li>
            <strong>Jet, accueil VIP, espace.</strong> Quand les invités viennent de loin. La conciergerie, à toute heure.
          </li>
        </ul>
      </section>

      <Credentials />
      <ProjetInvite lede="Dites-nous la date, la ville, et si la nuit doit s’arrêter à table ou continuer." />
    </Frame>
  );
}
