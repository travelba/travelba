import type { Metadata } from "next";
import { Frame } from "@/components/preview-refonte/Frame";
import { Photo } from "@/components/preview-refonte/Photo";
import { shot } from "@/components/preview-refonte/photos";
import { MessagesScreen } from "@/components/preview-refonte/Screens";
import { Credentials, ProjetInvite } from "@/components/preview-refonte/ui";

export const metadata: Metadata = {
  title: "Entre nous",
  description: "Un carnet d’escapades, à deux. Inspirations, hôtels, tables, conciergerie. Étude non indexée.",
};

export default function EntreNousPage() {
  return (
    <Frame>
      <div className="tba-journal">
      <header>
        <p className="tba-kicker">Entre nous</p>
        <h1>Carnet d’escapades.</h1>
        <p>
          Cinq départs, écrits comme on les noterait avant de partir. Ce sont des inspirations. La maison les tiendrait
          ainsi : l’hôtel, la table, la route, le fil. Aucun client n’est cité.
        </p>
      </header>

      <article className="tba-entree">
        <header>
          <p>Positano · quelques nuits</p>
          <h2>Le Sirenuse.</h2>
        </header>
        <div className="tba-corps">
          <p>
            On arrive sans programme chargé. La première soirée reste à l’hôtel. Le lendemain, une table sur la côte,
            demandée même si elle affiche complet : la demande part de la maison, rien n’est réservé seul, la
            confirmation revient avant que vous ne comptiez dessus.
          </p>
          <p>
            Le chauffeur prend Naples, ou l’aéroport, et la route jusqu’à Positano. L’accueil VIP se prépare si le
            terminal le justifie. Le voyage sur mesure se dessine autour de votre agenda, pas d’un circuit.
          </p>
        </div>
        <figure className="tba-frame is-wide">
          <Photo id={shot.amalfi} alt="Côte escarpée et mer, lumière de fin de jour" sizes="(min-width: 800px) 44rem, 100vw" />
        </figure>
        <p className="tba-note-bas">
          <strong>La maison organise.</strong> Le Sirenuse, les nuits, la table, le chauffeur depuis Naples, l’accueil en
          aéroport si besoin, le carnet dans l’espace. Les avantages du tarif seulement s’ils sont inclus et confirmés.
        </p>
      </article>

      <article className="tba-entree">
        <header>
          <p>Kyoto · le rythme de la ville</p>
          <h2>Aman Kyoto.</h2>
        </header>
        <div className="tba-corps">
          <p>
            Peu de choses écrites d’avance. Un jardin le matin, une table le soir, une journée laissée vide. La maison
            demande à l’hôtel le rythme que vous voulez, puis elle confirme. Si le passeport exige une formalité, elle
            suit le fil habituel : préparation, remplissage, validation, paiement, pièce. La pièce rejoint le coffre de
            l’espace quand elle est prête.
          </p>
          <p>
            Le vol, commercial ou privé, se confirme à part. En jet, l’affrètement et l’itinéraire sont tenus par la
            maison, du décollage à l’atterrissage. En ligne régulière, l’agence IATA 20291655 émet le billet. L’heure
            n’est pas inventée dans ce carnet.
          </p>
        </div>
        <figure className="tba-frame is-wide">
          <Photo id={shot.kyoto} alt="Temple et jardin, lumière douce" sizes="(min-width: 800px) 44rem, 100vw" />
        </figure>
        <p className="tba-note-bas">
          <strong>La maison organise.</strong> Aman Kyoto, les tables, la formalité s’il en faut une, le billet ou le
          jet, le chauffeur à l’arrivée, la conciergerie sur WhatsApp.
        </p>
        <MessagesScreen
          lines={[
            ["house", "Le carnet de Kyoto est ouvert. Aman Kyoto est noté."],
            ["you", "Gardez un soir sans table."],
            ["house", "C’est noté dans le fil. Rien n’est envoyé depuis cette étude."],
          ]}
        />
      </article>

      <article className="tba-entree">
        <header>
          <p>Marrakech · à deux</p>
          <h2>Royal Mansour.</h2>
        </header>
        <div className="tba-corps">
          <p>
            Un riad, pas un séminaire. Les journées restent courtes : un jardin, un déjeuner, une fin d’après-midi sans
            obligation. Le soir, une table en ville si vous la souhaitez. Les meilleures tables, même complètes, se
            demandent. La maison tente, puis confirme.
          </p>
          <p>
            Les chauffeurs tiennent les trajets. L’accueil VIP à l’arrivée, si vous le demandez. Le palais confirme les
            soins et les heures qu’il tient vraiment. Ce carnet ne les invente pas.
          </p>
        </div>
        <figure className="tba-frame is-wide">
          <Photo id={shot.majorelle} alt="Jardin bleu et ocre, allée plantée" sizes="(min-width: 800px) 44rem, 100vw" />
        </figure>
        <p className="tba-note-bas">
          <strong>La maison organise.</strong> Royal Mansour, les nuits, les tables, les chauffeurs, l’arrivée, l’espace
          client. Pour un groupe, le récit change de page : il est dans Pour l’entreprise.
        </p>
      </article>

      <article className="tba-entree">
        <header>
          <p>Mahé · l’île</p>
          <h2>Four Seasons Resort Seychelles.</h2>
        </header>
        <div className="tba-corps">
          <p>
            Le transfert depuis l’aéroport est celui que l’île confirme. Les journées n’ont pas d’autre obligation que
            l’eau, une table, et le soir. Si vous arrivez en jet, l’appareil est confirmé avant la piste ; le dernier
            kilomètre jusqu’au resort reste un transfert, tenu lui aussi.
          </p>
          <p>
            L’espace porte les confirmations. La conciergerie reste joignable pendant le séjour, à toute heure.
          </p>
        </div>
        <figure className="tba-frame is-wide">
          <Photo id={shot.seychelles} alt="Granite, palmes et eau claire" sizes="(min-width: 800px) 44rem, 100vw" />
        </figure>
        <p className="tba-note-bas">
          <strong>La maison organise.</strong> Four Seasons Resort Seychelles, le transfert d’île, le jet s’il a un
          sens, l’accueil au départ, le carnet. Accès privilégié aux palaces : la nuit se confirme avec l’hôtel.
        </p>
      </article>

      <article className="tba-entree">
        <header>
          <p>Paris · une nuit</p>
          <h2>Cheval Blanc Paris.</h2>
        </header>
        <div className="tba-corps">
          <p>
            Parfois l’escapade ne quitte pas la ville. Une nuit au Cheval Blanc, une table, et, si vous le souhaitez, un
            club ensuite. L’accès aux clubs privés, aux tables VIP et aux soirées se demande. La maison le confirme.
            Le chauffeur prend la fin de soirée. Le récit heure par heure d’une célébration est sur l’autre page.
          </p>
        </div>
        <figure className="tba-frame is-wide">
          <Photo id={shot.table} alt="Table dressée, lumière basse" sizes="(min-width: 800px) 44rem, 100vw" />
        </figure>
        <p className="tba-note-bas">
          <strong>La maison organise.</strong> Cheval Blanc Paris, la table, le club si vous le demandez, le chauffeur,
          le message du retour dans le fil.
        </p>
      </article>

      <article className="tba-entree">
        <header>
          <p>Maldives · le lagon</p>
          <h2>One&amp;Only Reethi Rah.</h2>
        </header>
        <div className="tba-corps">
          <p>
            Malé, puis le transfert que l’île confirme. Les journées restent sur l’eau. Une table au resort, ou une
            demande plus loin si le bateau se confirme. Le coffre de l’espace garde les confirmations. Les numéros de
            pièces n’apparaissent pas ici.
          </p>
        </div>
        <figure className="tba-frame is-wide">
          <Photo id={shot.maldives} alt="Ponton et lagon, ciel clair" sizes="(min-width: 800px) 44rem, 100vw" />
        </figure>
        <p className="tba-note-bas">
          <strong>La maison organise.</strong> One&amp;Only Reethi Rah, le transfert, l’accueil VIP au départ, le jet
          si le voyage se fait ainsi, la conciergerie pendant les nuits.
        </p>
      </article>
      </div>

      <Credentials />
      <ProjetInvite lede="Dites-nous à deux où vous voulez disparaître, et combien de nuits." />
    </Frame>
  );
}
