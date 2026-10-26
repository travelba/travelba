import type { Metadata } from "next";
import Link from "next/link";
import { Frame } from "@/components/preview-refonte/Frame";
import { Photo } from "@/components/preview-refonte/Photo";
import { shot } from "@/components/preview-refonte/photos";
import { CarnetScreen } from "@/components/preview-refonte/Screens";
import { Credentials, ProjetInvite } from "@/components/preview-refonte/ui";

export const metadata: Metadata = {
  title: "Pour l’entreprise",
  description:
    "Étude d’un séminaire à Marrakech, jour par jour, et d’autres inspirations. Étude non indexée.",
};

export default function EntreprisePage() {
  return (
    <Frame>
      <header className="tba-couverture">
        <p className="tba-kicker">Pour l’entreprise · Inspiration</p>
        <h1>Une étude. Marrakech, jour par jour.</h1>
        <p className="tba-lead">
          La Mamounia. Un séminaire tenu du premier soir au départ. Aucun client n’est nommé. Aucun effectif n’est
          avancé. Voici comment la maison écrirait le dossier.
        </p>
      </header>

      <figure className="tba-frame is-cine">
        <Photo
          id={shot.koutoubia}
          alt="Tour et jardin, lumière chaude de fin de jour"
          sizes="100vw"
          preload
        />
      </figure>

      <section className="tba-jour">
        <p className="tba-num">00</p>
        <div>
          <h2>L’arrivée.</h2>
          <p>
            Le groupe atterrit. L’horaire est celui des billets : il n’est pas écrit dans cette étude. À l’aéroport,
            l’accueil VIP si le passage le demande — fast-track, salon privé, assistance dédiée. Les chauffeurs prennent
            le relais jusqu’à La Mamounia. Les chambres sont prêtes. Le dîner de bienvenue est confirmé avec l’hôtel
            avant que quiconque ne pose sa valise.
          </p>
          <p>
            Le carnet du groupe s’ouvre dans l’espace. Chacun y voit le séjour. L’agence est IATA 20291655 : lorsqu’il
            y a un billet, elle l’émet. S’il y a un jet, l’appareil est affrété et confirmé, du décollage à
            l’atterrissage.
          </p>
        </div>
      </section>

      <section className="tba-jour">
        <p className="tba-num">01</p>
        <div>
          <h2>La salle.</h2>
          <p>
            Matinée de travail. Organisation complète : le lieu d’exception, la logistique, l’animation. La salle, la
            lumière et le déjeuner sont retenus avec l’hôtel. L’animation, si le projet en prévoit une, est écrite
            avant, pas improvisée le matin même.
          </p>
          <p>
            L’après-midi peut rester en atelier, ou s’ouvrir. Les transferts du soir sont calés. Un interlocuteur unique
            porte le fil, pour l’entreprise comme pour chaque voyageur.
          </p>
        </div>
      </section>

      <section className="tba-jour">
        <p className="tba-num">02</p>
        <div>
          <h2>Hors les murs.</h2>
          <p>
            Une après-midi dans la palmeraie ou dans la médina. Le lieu exact se confirme avec la maison : jardins,
            regroupements, chauffeurs. La discrétion reste la règle sur la route.
          </p>
          <p>
            Le soir, le dîner est tenu comme un événement. Conception et production d’un moment privé, à la hauteur du
            projet. Les tables, même complètes, se demandent. Rien n’est réservé seul. La confirmation revient, puis
            seulement elle figure au carnet.
          </p>
          <figure className="tba-frame is-wide">
            <Photo id={shot.lanterns} alt="Lanternes et cour, soirée" sizes="(min-width: 900px) 70vw, 100vw" />
          </figure>
        </div>
      </section>

      <section className="tba-jour">
        <p className="tba-num">03</p>
        <div>
          <h2>Le dernier matin, puis la piste.</h2>
          <p>
            Une séance plus courte. L’après-midi libre, ou déjà le départ. Les billets de retour sont dans le carnet.
            Les chauffeurs reprennent l’aéroport. L’accueil du retour se prépare comme celui de l’aller, si vous le
            demandez.
          </p>
          <p>
            Les avantages de l’hôtel — petit-déjeuner, surclassement, crédit — ne sont annoncés que lorsque le tarif les
            inclut et que la maison les a confirmés. Cette page n’affiche aucun prix.
          </p>
          <CarnetScreen
            kicker="Carnet de groupe · dossier d’exemple"
            title="Marrakech"
            meta="La Mamounia · étude"
            lines={[
              ["Arrivée", "Accueil", "Puis les chauffeurs"],
              ["Jour 1", "La salle", "Déjeuner tenu"],
              ["Jour 2", "Hors les murs", "Dîner confirmé"],
              ["Départ", "Vol", "L’horaire reste celui du billet"],
            ]}
          />
        </div>
      </section>

      <section className="tba-sommaire" aria-labelledby="autres-etudes">
        <h2 id="autres-etudes">D’autres études.</h2>
        <p>Le même dossier, un autre lieu. Inspirations, elles aussi.</p>

        <article>
          <h3>Four Seasons Resort Marrakech</h3>
          <p>
            Un incentive plus résidentiel, dans la palmeraie. Deux journées : une salle le matin, le resort l’après-midi,
            un dîner tenu le second soir. La maison confirme l’hôtel, les transferts, l’animation. Le carnet de groupe
            est le même objet. Les chauffeurs relient l’aéroport et les mouvements du jour.
          </p>
        </article>
        <article>
          <h3>Club Med Marrakech La Palmeraie, Exclusive Collection</h3>
          <p>
            Un séminaire dans le village, pas dans un palace. Les espaces de l’Exclusive Collection, les repas du
            resort, une animation écrite à l’avance. Utile quand le groupe veut rester sur un seul lieu. La logistique
            reste celle de la maison : arrivée, salles, départs échelonnés s’il le faut.
          </p>
        </article>
        <article>
          <h3>Four Seasons Hotel George V, Paris</h3>
          <p>
            Une journée de conseil, sans nuit si le projet tient dans la journée. Salle, déjeuner, chauffeurs dans
            Paris. Le soir peut devenir une table, ou s’arrêter. Événement privé et corporate : la conception suit
            l’ambition du jour, pas un catalogue de formules.
          </p>
        </article>
        <article>
          <h3>Cheval Blanc Courchevel</h3>
          <p>
            Un incentive d’hiver. Matin sur les pistes, après-midi de travail, dîner au palace. Le déroulé de la semaine
            alpine est dans <Link href="/preview-refonte/montagne">À la montagne</Link>. Ici, la maison retient surtout
            la salle, les moniteurs demandés, et les transferts depuis la vallée.
          </p>
        </article>
        <article>
          <h3>Un grand rendez-vous, dans le même dossier</h3>
          <p>
            Roland-Garros, Formule 1, Coupe du monde, festivals, galas : l’accès VIP se demande et se confirme. Il peut
            s’ajouter à un séminaire, ou devenir le motif du voyage. Les billets ne sont pas décrits comme déjà tenus.
            Le récit d’une soirée, heure par heure, est dans <Link href="/preview-refonte/celebrer">Pour célébrer</Link>.
          </p>
        </article>
      </section>

      <section className="tba-tenu">
        <h2>Ce que la maison tient, dans ce dossier.</h2>
        <ul>
          <li>
            <strong>Séminaire.</strong> Lieu d’exception, logistique, animation. Un seul interlocuteur.
          </li>
          <li>
            <strong>Événement.</strong> Conception et production, privé ou corporate.
          </li>
          <li>
            <strong>Hôtel.</strong> La Mamounia dans l’étude, d’autres palaces dans les variantes.
          </li>
          <li>
            <strong>Tables.</strong> Demandées, y compris lorsqu’elles sont complètes. Confirmées avant d’être promises.
          </li>
          <li>
            <strong>Chauffeurs et accueil VIP.</strong> La piste, puis la ville.
          </li>
          <li>
            <strong>Jet ou billet.</strong> L’appareil se confirme. Le billet s’émet. L’heure reste celle du transporteur.
          </li>
          <li>
            <strong>L’espace.</strong> Le carnet du groupe, les documents, le fil avec la conciergerie.
          </li>
        </ul>
      </section>

      <Credentials />
      <ProjetInvite lede="Dites-nous le motif, la ville, et la forme des journées. Marrakech n’est qu’une des études." />
    </Frame>
  );
}
