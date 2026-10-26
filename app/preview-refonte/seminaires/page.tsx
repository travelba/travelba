import type { Metadata } from "next";
import { ContactBand } from "@/components/preview-refonte/ContactBand";
import { Frame } from "@/components/preview-refonte/Frame";
import { shot, waCopy } from "@/components/preview-refonte/photos";
import { Credentials, PageHero, Split } from "@/components/preview-refonte/ui";

export const metadata: Metadata = {
  title: "Séminaires",
  description:
    "Séminaires et incentives Travel BA. Marrakech en tête, événements privés et d’entreprise. Étude non indexée.",
};

export default function SeminairesPage() {
  return (
    <Frame whatsappText={waCopy.seminaires}>
      <PageHero
        title={
          <>
            Marrakech,
            <br />
            <em>pour la maison.</em>
          </>
        }
        lede="Séminaires et incentives. La ville d’abord, puis le groupe, les maisons, les tables, et le retour."
        image={shot.koutoubia}
        alt="Minaret et ciel clair, Marrakech"
      >
        <div className="tba-actions">
          <a className="tba-word" href="#brief">
            Un brief
          </a>
          <a className="tba-word" href="#rendez-vous">
            Un moment
          </a>
        </div>
      </PageHero>

      <section className="tba-manifesto">
        <p>L’incentive n’est pas un catalogue. C’est un séjour d’entreprise, composé comme un voyage privé.</p>
      </section>

      <Split
        title="La maison du groupe."
        text="Riads, palais, villas de la palmeraie. Les avantages du tarif, lorsqu’ils existent, sont confirmés avant l’arrivée. Les nuits, les salles, les dîners tiennent dans le même carnet."
        image={shot.majorelle}
        alt="Jardin bleu et ocre, lumière du jour"
      />

      <Split
        flip
        title="La journée, puis le soir."
        text="Médina, ateliers, temps libre. Le dîner, le club, le gala lorsqu’il a sa place. Rien n’est ajouté qui ne soit demandé."
        image={shot.medina}
        alt="Ruelle de médina, murs ocre"
      />

      <Split
        title="L’arrivée, déjà tenue."
        text="Vols ou jet, transferts, chauffeurs, fast track et accueil à l’aéroport. La formalité du pays est préparée avant le départ. Le carnet du groupe s’ouvre dans l’espace."
        image={shot.lanterns}
        alt="Ruelle le soir, lanternes"
        href="/preview-refonte/espace-client"
        more="Le carnet du séjour"
      />

      <section className="tba-prose">
        <h2>Ailleurs, de la même manière.</h2>
        <p>
          Marrakech ouvre la page. Un comité, un lancement, un gala se composent ailleurs avec la même tenue : lieu,
          logistique, accueil, et quelqu’un de joignable à toute heure.
        </p>
      </section>

      <Credentials />
      <ContactBand whatsappText={waCopy.seminaires} universe="seminaire" />
    </Frame>
  );
}
