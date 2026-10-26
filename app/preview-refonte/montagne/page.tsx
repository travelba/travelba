import type { Metadata } from "next";
import Link from "next/link";
import { Frame } from "@/components/preview-refonte/Frame";
import { Photo } from "@/components/preview-refonte/Photo";
import { shot } from "@/components/preview-refonte/photos";
import { CarnetScreen } from "@/components/preview-refonte/Screens";
import { Credentials, ProjetInvite } from "@/components/preview-refonte/ui";

export const metadata: Metadata = {
  title: "À la montagne",
  description: "Une semaine de ski premium, du lundi au dimanche, et d’autres semaines. Étude non indexée.",
};

const jours = [
  {
    jour: "Lundi",
    titre: "On pose les skis.",
    texte:
      "Arrivée à Courchevel. Le transfert vient de l’aéroport ou de la gare : l’horaire du vol ou du train reste celui du billet. Installation au Cheval Blanc. Forfaits et moniteurs sont demandés. Ils figurent au séjour une fois confirmés.",
  },
  {
    jour: "Mardi",
    titre: "Première journée de pistes.",
    texte:
      "Le matin sur le domaine. Le déjeuner en altitude, s’il a été réservé. La maison demande la table. Elle ne l’annonce pas avant la réponse. Le retour au palace se fait à votre heure.",
  },
  {
    jour: "Mercredi",
    titre: "Une journée plus calme, si vous la voulez.",
    texte:
      "Un guide, ou une matinée courte. L’après-midi, le spa du palace, selon ce que la maison confirme. Rien n’est ajouté au récit au-delà de cette confirmation.",
  },
  {
    jour: "Jeudi",
    titre: "Une table dans la station.",
    texte:
      "Même complète, elle se demande. La réservation part de l’agence. Le chauffeur, s’il faut quitter le palace, connaît l’adresse et l’heure de retour.",
  },
  {
    jour: "Vendredi",
    titre: "Ceux qui arrivent en cours de semaine.",
    texte:
      "En jet : l’appareil est affrété et confirmé, du décollage à l’atterrissage. Accueil VIP à l’aéroport, puis chauffeur jusqu’à la station. En ligne régulière : émission IATA 20291655, billet dans le carnet.",
  },
  {
    jour: "Samedi",
    titre: "La longue journée.",
    texte:
      "Les pistes, puis le dîner au palace. Si la semaine est un incentive, l’après-midi peut redevenir une salle : le lien avec le dossier entreprise se fait sans changer d’hôtel.",
  },
  {
    jour: "Dimanche",
    titre: "Le départ.",
    texte:
      "Transferts vers la vallée. Documents au coffre. La conciergerie reste joignable après que les skis sont rendus. Le carnet de la semaine se ferme dans l’espace.",
  },
];

export default function MontagnePage() {
  return (
    <Frame>
      <header className="tba-semaine-open">
        <p className="tba-kicker">À la montagne · Inspiration</p>
        <h1>Sept jours à Courchevel.</h1>
        <p>
          Cheval Blanc Courchevel. Une semaine premium, écrite du lundi au dimanche. Inspiration : la maison tiendrait
          le séjour ainsi. Aucun client n’est cité.
        </p>
      </header>

      <figure className="tba-frame is-cine">
        <Photo id={shot.peaks} alt="Crêtes enneigées, ciel clair" sizes="100vw" preload />
      </figure>

      <div className="tba-semaine">
        {jours.map((jour) => (
          <article key={jour.jour}>
            <h2>{jour.jour}</h2>
            <h3>{jour.titre}</h3>
            <p>{jour.texte}</p>
          </article>
        ))}
      </div>

      <div className="tba-semaine-fin">
        <div>
          <h2>Le carnet du dimanche.</h2>
          <p>
            L’espace porte la semaine : nuits, transferts, ce qui a été confirmé. L’écran est un exemple. Les numéros de
            fidélité — Flying Blue, Miles &amp; More, et les autres programmes de la fiche — restent enregistrés. Ils
            ne sont pas montrés.
          </p>
        </div>
        <CarnetScreen
          title="Courchevel"
          meta="Cheval Blanc · une semaine"
          lines={[
            ["Lundi", "Arrivée", "Transfert confirmé"],
            ["Semaine", "Pistes", "Moniteurs demandés"],
            ["Soirs", "Tables", "Une fois confirmées"],
            ["Dimanche", "Départ", "Le coffre reste ouvert"],
          ]}
        />
      </div>

      <section className="tba-maisons">
        <h2>D’autres semaines.</h2>

        <article className="tba-maison-row">
          <p className="tba-ou">Val d’Isère</p>
          <h3>Club Med Exclusive Collection</h3>
          <p>
            Une semaine dans le village. En montagne, le forfait de remontées et les cours de ski ou de snowboard font
            partie du séjour Club Med. Le club enfants du village couvre la journée, les âges se confirment avant le
            départ. La maison tient l’arrivée, les chambres, et le carnet. Le récit familial est aussi dans{" "}
            <Link href="/preview-refonte/en-famille">En famille</Link>.
          </p>
        </article>
        <article className="tba-maison-row">
          <p className="tba-ou">Les Arcs</p>
          <h3>Les Arcs Panorama, Exclusive Collection Space</h3>
          <p>
            Même logique de séjour : le Space, les cours, les remontées compris dans le produit Club Med en montagne.
            Tignes et Valmorel se préparent de la même façon. La maison confirme les âges, les chambres proches, les
            sièges enfants dans les transferts.
          </p>
        </article>
        <article className="tba-maison-row">
          <p className="tba-ou">Courchevel, plus calme</p>
          <h3>Aman Le Mélézin</h3>
          <p>
            Une semaine de palace plus retenue. Les pistes le matin, peu de choses écrites l’après-midi. Forfaits et
            moniteurs demandés à part : ils ne sont pas inclus d’office, ils se confirment. Tables de la station
            demandées, même complètes. Chauffeur pour la vallée le dimanche. Accueil VIP si l’aéroport d’arrivée le
            demande.
          </p>
        </article>
        <article className="tba-maison-row">
          <p className="tba-ou">Le chalet</p>
          <h3>Une maison pour la semaine</h3>
          <p>
            Quand le séjour n’est pas un palace : un chalet, un chef si vous le demandez et s’il se confirme, des
            moniteurs, des transferts. En famille, les sièges enfants et la nounou se demandent en même temps que les
            lits. La nounou reste soumise à disponibilité. Le chef aussi. La maison n’annonce que ce qui est tenu.
          </p>
        </article>
      </section>

      <section className="tba-tenu">
        <h2>Ce que la semaine mobilise.</h2>
        <ul>
          <li>
            <strong>L’hôtel.</strong> Cheval Blanc Courchevel, Aman Le Mélézin, ou un Club Med Exclusive Collection.
          </li>
          <li>
            <strong>La montagne.</strong> Forfaits et moniteurs demandés, ou compris lorsque le produit Club Med en montagne le dit.
          </li>
          <li>
            <strong>Chauffeur et accueil VIP.</strong> De la piste d’aviation jusqu’à la station.
          </li>
          <li>
            <strong>Jet ou billet.</strong> Appareil confirmé, ou émission IATA. L’heure reste celle du transporteur.
          </li>
          <li>
            <strong>Tables.</strong> En altitude ou dans la station, sur confirmation.
          </li>
          <li>
            <strong>L’espace.</strong> Le carnet de la semaine, les documents, la conciergerie à toute heure.
          </li>
        </ul>
      </section>

      <Credentials />
      <ProjetInvite lede="Dites-nous la station, la semaine, et si les journées sont sur les pistes ou partagées avec une salle." />
    </Frame>
  );
}
