import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ContactBand } from "@/components/preview-refonte/ContactBand";
import { Frame } from "@/components/preview-refonte/Frame";
import { shot, waCopy } from "@/components/preview-refonte/photos";
import {
  BilletScreen,
  CarnetScreen,
  DocumentsScreen,
  FideliteScreen,
  MessagesScreen,
  SuiviScreen,
} from "@/components/preview-refonte/Screens";
import { Credentials, PageHero } from "@/components/preview-refonte/ui";

export const metadata: Metadata = {
  title: "L’espace",
  description:
    "Espace client Travel BA. Carnet, billets, documents, suivi, messages, fidélité. Étude non indexée.",
};

const sheets: { title: string; text: string; screen: ReactNode; flip?: boolean }[] = [
  {
    title: "Le carnet.",
    text: "Les villes du séjour, les nuits, les vols. L’exemple dit Marrakech, du 12 au 16 mars, deux voyageurs. Aucun horaire n’est inventé.",
    screen: <CarnetScreen />,
  },
  {
    title: "Le billet.",
    text: "Villes en titre, codes d’aéroport dessous. La classe et la référence restent dans le vrai carnet. Le train, s’il y en a un, suit la même carte.",
    screen: <BilletScreen />,
    flip: true,
  },
  {
    title: "Les documents.",
    text: "Pièce d’identité, billet, confirmation, formalité lorsque la pièce est prête. Les numéros ne figurent pas sur cette étude.",
    screen: <DocumentsScreen />,
  },
  {
    title: "Le suivi.",
    text: "Carnet ouvert, formalité en cours, concierge joignable. Les temps d’une formalité : préparation, remplissage, validation, paiement, pièce.",
    screen: <SuiviScreen />,
    flip: true,
  },
  {
    title: "Les messages.",
    text: "Le Concierge, sur WhatsApp, à toute heure. L’échange montré ici est un exemple. Rien n’a été envoyé.",
    screen: <MessagesScreen />,
  },
  {
    title: "La fidélité.",
    text: "Flying Blue, Miles & More, Executive Club, Skywards, Marriott Bonvoy, ALL Accor, Grand Voyageur, Great Members. Le numéro est enregistré. Il n’est pas montré.",
    screen: <FideliteScreen />,
    flip: true,
  },
];

export default function EspaceClientPage() {
  return (
    <Frame whatsappText={waCopy.espace}>
      <PageHero
        title={
          <>
            L’espace,
            <br />
            <em>déjà ouvert.</em>
          </>
        }
        lede="Le séjour que la maison a composé vous suit : carnet, billets, documents, suivi, messages."
        image={shot.maldives}
        alt="Lagon et ponton, lumière claire"
      >
        <div className="tba-actions">
          <Link className="tba-word" href="/connexion">
            Entrer
          </Link>
          <a className="tba-word" href="#carnet">
            Les écrans
          </a>
        </div>
      </PageHero>

      <section className="tba-manifesto">
        <p>Ce que vous voyez est un dossier d’exemple. Aucune donnée de client, aucun prix, aucun horaire inventé.</p>
      </section>

      <div id="carnet">
        {sheets.map((sheet) => (
          <section key={sheet.title} className={sheet.flip ? "tba-product is-flip" : "tba-product"}>
            <div className="tba-product-copy">
              <h2>{sheet.title}</h2>
              <p className="tba-lead">{sheet.text}</p>
            </div>
            {sheet.screen}
          </section>
        ))}
      </div>

      <section className="tba-prose">
        <h2>Entrer.</h2>
        <p>L’espace réel est derrière la connexion. L’invitation vient de la maison. Cette étude n’en envoie pas.</p>
        <p>
          <Link className="tba-word" href="/connexion">
            Entrer
          </Link>
        </p>
      </section>

      <Credentials />
      <ContactBand whatsappText={waCopy.espace} />
    </Frame>
  );
}
