import type { Metadata } from "next";
import Link from "next/link";
import { ContactBand } from "@/components/preview-refonte/ContactBand";
import { Frame } from "@/components/preview-refonte/Frame";
import { shot, waCopy } from "@/components/preview-refonte/photos";
import { Credentials, PageHero, Split } from "@/components/preview-refonte/ui";

export const metadata: Metadata = {
  title: "Sur-mesure",
  description:
    "Voyages sur mesure Travel BA. Hôtels, vols, jets, trains, bateaux, accueil et formalités. Étude non indexée.",
};

export default function SurMesurePage() {
  return (
    <Frame whatsappText={waCopy.surMesure}>
      <PageHero
        title={
          <>
            Composé
            <br />
            <em>autour de vous.</em>
          </>
        }
        lede="Luxe et VIP. Le séjour n’est pas une offre : c’est une suite de cartes, tenues dans un seul carnet."
        image={shot.amalfi}
        alt="Côte et mer, lumière de fin de jour"
      >
        <div className="tba-actions">
          <a className="tba-word" href="#brief">
            Un brief
          </a>
          <Link className="tba-word" href="/preview-refonte">
            Tous les services
          </Link>
        </div>
      </PageHero>

      <section className="tba-manifesto">
        <p>La phrase dit les villes où l’on séjourne. Le départ et l’escale n’entrent pas dans le titre.</p>
      </section>

      <Split
        title="Où l’on reste."
        text="Hôtels, villas, maisons. Petit-déjeuner, surclassement, crédit : seulement lorsque le tarif les prévoit, et une fois confirmés."
        image={shot.seychelles}
        alt="Plage et eau claire"
      />

      <Split
        flip
        title="Comment l’on y va."
        text="Vols et billetterie, jet privé, train, bateau. Deux billets du même trajet le même jour restent une carte. L’heure est celle de l’aéroport, jamais une heure inventée."
        image={shot.jet}
        alt="Avion d’affaires au sol, ciel clair"
      />

      <Split
        title="Ce qui entoure le lit."
        text="Transfert, chauffeur, voiture. Accueil VIP et fast track. Tables, clubs, activité de la journée. Formalité du pays, assurance si elle est au dossier."
        image={shot.kyoto}
        alt="Allée de lanternes, lumière douce"
        href="/preview-refonte/espace-client"
        more="Le carnet qui le tient"
      />

      <section className="tba-prose">
        <h2>Deux pages, même maison.</h2>
        <p>Le groupe part vers Marrakech. La semaine de neige a sa propre page. Le geste reste le même.</p>
        <p>
          <Link className="tba-word" href="/preview-refonte/seminaires">
            Séminaires
          </Link>
        </p>
        <p>
          <Link className="tba-word" href="/preview-refonte/ski">
            Ski
          </Link>
        </p>
      </section>

      <Credentials />
      <ContactBand whatsappText={waCopy.surMesure} universe="sur-mesure" />
    </Frame>
  );
}
