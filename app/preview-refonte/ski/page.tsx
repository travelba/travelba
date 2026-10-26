import type { Metadata } from "next";
import { ContactBand } from "@/components/preview-refonte/ContactBand";
import { Frame } from "@/components/preview-refonte/Frame";
import { shot, waCopy } from "@/components/preview-refonte/photos";
import { Credentials, PageHero, Split } from "@/components/preview-refonte/ui";

export const metadata: Metadata = {
  title: "Ski",
  description: "Ski premium Travel BA. Chalets et palaces, transferts et carnet. Étude non indexée.",
};

export default function SkiPage() {
  return (
    <Frame whatsappText={waCopy.ski}>
      <PageHero
        title={
          <>
            La semaine,
            <br />
            <em>en altitude.</em>
          </>
        }
        lede="Chalets et palaces. La neige n’est qu’une partie du séjour : la maison, le transfert, le dîner, le retour."
        image={shot.peaks}
        alt="Crêtes enneigées, lumière dorée"
      >
        <div className="tba-actions">
          <a className="tba-word" href="#brief">
            Un brief
          </a>
        </div>
      </PageHero>

      <section className="tba-manifesto">
        <p>Courchevel, Megève, Zermatt, St. Moritz : des noms de vallées. La maison se choisit avec vous.</p>
      </section>

      <Split
        title="Le chalet."
        text="Bois, feu, table longue. Le séjour se compose comme les autres : nuits, avantages du tarif lorsqu’ils sont prévus, et confirmation avant l’arrivée."
        image={shot.chalet}
        alt="Intérieur de bois, lumière chaude"
      />

      <Split
        flip
        title="Le palace."
        text="Lorsque la semaine appelle un palace plutôt qu’une maison. Même carnet, mêmes transferts, même conciergerie."
        image={shot.suite}
        alt="Chambre claire, linge blanc"
      />

      <Split
        title="La route, puis la piste."
        text="Transfert ou chauffeur jusqu’à la station. Fast track lorsque l’aéroport l’exige. Les horaires restent ceux du carnet. Aucune piste n’est promise qui ne soit écrite."
        image={shot.slope}
        alt="Piste damée, montagne au loin"
        href="/preview-refonte/espace-client"
        more="Ouvrir le carnet"
      />

      <Credentials />
      <ContactBand whatsappText={waCopy.ski} universe="ski" />
    </Frame>
  );
}
