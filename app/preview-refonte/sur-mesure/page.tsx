import type { Metadata } from "next";
import Link from "next/link";
import { ContactBand } from "@/components/preview-refonte/ContactBand";
import { Frame } from "@/components/preview-refonte/Frame";
import { shot, waCopy, whatsappHref } from "@/components/preview-refonte/photos";
import { PageHero, Places, SectionHead, Trust } from "@/components/preview-refonte/ui";

export const metadata: Metadata = {
  title: "Sur-mesure",
  description: "Voyages sur-mesure Travel BA. Aperçu non indexé de la refonte.",
};

const STEPS = [
  {
    n: "01",
    title: "L’écoute",
    text: "Vous racontez le voyage, même s’il n’est pas encore net. La maison ne plaque pas une offre toute faite.",
  },
  {
    n: "02",
    title: "La composition",
    text: "Un séjour se dessine. Les horaires, les adresses et les inclusions ne s’écrivent que lorsqu’ils sont connus.",
  },
  {
    n: "03",
    title: "Le carnet",
    text: "Quand le séjour est prêt, il s’ouvre dans l’espace : étapes, documents, et le concierge à toute heure.",
  },
  {
    n: "04",
    title: "La présence",
    text: "Pendant le voyage, un message suffit. Au retour, les pièces restent là. Le délai de réponse chiffré : à fournir.",
  },
] as const;

export default function SurMesurePage() {
  const wa = whatsappHref(waCopy.surMesure);

  return (
    <Frame whatsappText={waCopy.surMesure}>
      <PageHero
        eyebrow="Sur-mesure"
        title={
          <>
            Un séjour
            <br />
            qui n’appartient
            <br />
            qu’à vous.
          </>
        }
        lede="Pas de catalogue. Vous parlez, la maison compose, le carnet s’ouvre quand le séjour est prêt."
        image={shot.suite}
        alt="Chambre claire, lumière du matin sur le linge"
      >
        <div className="tba-hero-actions">
          <a className="tba-btn tba-btn-light" href={wa} target="_blank" rel="noopener noreferrer">
            Écrire sur WhatsApp
          </a>
          <a className="tba-btn tba-btn-ghost-light" href="#brief">
            Déposer un brief
          </a>
        </div>
      </PageHero>

      <section>
        <SectionHead
          kicker="La manière"
          title="Quatre temps, sans formule."
          lede="Le sur-mesure est une conversation. Les séminaires et le ski sont les mêmes mains, sur un autre sujet."
        />
        <ol className="tba-steps-prose">
          {STEPS.map((step) => (
            <li key={step.n}>
              <span>{step.n}</span>
              <strong>{step.title}</strong>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
        <p className="tba-note">
          <Link href="/preview-refonte/seminaires">Séminaires, Marrakech en tête</Link>
          {" · "}
          <Link href="/preview-refonte/ski">Ski premium, chalets et palaces</Link>
        </p>
      </section>

      <section id="destinations" aria-labelledby="lieux-titre">
        <SectionHead
          id="lieux-titre"
          kicker="Pour commencer"
          title="Quelques lieux."
          lede="Ils n’épuisent pas la carte. Ils montrent le genre de séjour que la maison aime composer."
        />
        <Places />
      </section>

      <Trust />
      <ContactBand whatsappText={waCopy.surMesure} universe="sur-mesure" />
    </Frame>
  );
}
