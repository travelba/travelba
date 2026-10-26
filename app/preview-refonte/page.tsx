import type { Metadata } from "next";
import Link from "next/link";
import { ContactBand } from "@/components/preview-refonte/ContactBand";
import { Frame } from "@/components/preview-refonte/Frame";
import { waCopy, shot } from "@/components/preview-refonte/photos";
import { CarnetScreen, MessagesScreen } from "@/components/preview-refonte/Screens";
import { Credentials, PageHero, ServiceGrid } from "@/components/preview-refonte/ui";

export const metadata: Metadata = {
  title: { absolute: "Travel BA" },
  description:
    "Travel BA. Jet privé, séminaires, événements, hôtels, tables, clubs, chauffeur, accueil VIP, voyages sur mesure, ski, et l’espace client. Étude non indexée.",
};

export default function PreviewHomePage() {
  return (
    <Frame whatsappText={waCopy.home}>
      <PageHero
        title={
          <>
            Vos voyages,
            <br />
            <em>orchestrés.</em>
          </>
        }
        lede="Une seule équipe pour tout le voyage. De la première idée au dernier kilomètre, chaque service a le même soin."
        image={shot.hero}
        alt="Piscine à débordement face à la mer, en fin de journée"
      >
        <div className="tba-actions">
          <a className="tba-word" href="#services">
            Les services
          </a>
          <Link className="tba-word" href="/preview-refonte/espace-client">
            L’espace
          </Link>
          <a className="tba-word" href="#brief">
            Un brief
          </a>
        </div>
      </PageHero>

      <section className="tba-manifesto">
        <p>
          Basée à Levallois-Perret, la maison conçoit et orchestre le voyage pour les entreprises comme pour les
          particuliers exigeants.
        </p>
      </section>

      <ServiceGrid />

      <section className="tba-product" id="espace">
        <div className="tba-product-copy">
          <h2>L’espace suit le voyageur.</h2>
          <p className="tba-lead">
            Carnet, billets, documents, suivi, messages. La conciergerie répond sur WhatsApp, à toute heure. L’exemple
            ci-contre est fictif.
          </p>
          <div className="tba-actions">
            <Link className="tba-word" href="/preview-refonte/espace-client">
              Voir l’espace
            </Link>
            <Link className="tba-word" href="/connexion">
              Entrer
            </Link>
          </div>
        </div>
        <CarnetScreen />
      </section>

      <section className="tba-product is-flip">
        <div className="tba-product-copy">
          <h2>Un fil, pas une file.</h2>
          <p className="tba-lead">Le Concierge écrit dans le fil du séjour. Rien de cet échange n’a été envoyé.</p>
        </div>
        <MessagesScreen />
      </section>

      <Credentials />
      <ContactBand whatsappText={waCopy.home} />
    </Frame>
  );
}
