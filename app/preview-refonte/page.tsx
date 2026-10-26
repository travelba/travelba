import type { Metadata } from "next";
import { ContactBand } from "@/components/preview-refonte/ContactBand";
import { Frame } from "@/components/preview-refonte/Frame";
import { waCopy, whatsappHref, shot } from "@/components/preview-refonte/photos";
import { CarnetScreen, ConciergeScreen, DocumentsScreen, PaiementScreen, Phone } from "@/components/preview-refonte/Screens";
import { Door, PageHero, Places, SectionHead, Trust } from "@/components/preview-refonte/ui";

export const metadata: Metadata = {
  title: { absolute: "Travel BA — Maison de voyage" },
  description:
    "Travel BA, maison de voyage parisienne. Sur-mesure, séminaires et événements, ski premium. Aperçu non indexé.",
};

export default function PreviewHomePage() {
  const wa = whatsappHref(waCopy.home);

  return (
    <Frame whatsappText={waCopy.home}>
      <PageHero
        eyebrow="Maison de voyage · Paris"
        title={
          <>
            Le voyage,
            <br />
            écrit pour vous.
          </>
        }
        lede="Sur-mesure, séminaires et ski d’exception. Une maison parisienne, et le séjour qui vous suit — carnet, documents, concierge."
        image={shot.hero}
        alt="Piscine à débordement face à la mer, en fin de journée"
      >
        <div className="tba-hero-actions">
          <a className="tba-btn tba-btn-light" href={wa} target="_blank" rel="noopener noreferrer">
            Écrire sur WhatsApp
          </a>
          <a className="tba-btn tba-btn-ghost-light" href="#brief">
            Déposer un brief
          </a>
          <a className="tba-btn tba-btn-ghost-light" href="#rendez-vous">
            Prendre rendez-vous
          </a>
        </div>
      </PageHero>

      <section className="tba-quote-wrap">
        <span className="tba-rule" aria-hidden="true" />
        <p className="tba-quote">
          Une maison parisienne pour composer le séjour, puis rester là. Le même soin, du premier mot jusqu’au retour.
        </p>
      </section>

      <section id="univers" aria-labelledby="univers-titre">
        <SectionHead
          id="univers-titre"
          kicker="Les univers"
          title="Quatre portes."
          lede="Sur-mesure, séminaires et événements, ski premium, destinations signatures. Chaque porte ouvre un séjour composé, pas une brochure."
        />
        <div className="tba-doors">
          <Door
            href="/preview-refonte/sur-mesure"
            index="01"
            title="Sur-mesure"
            text="Le séjour composé autour de vous. Rythme, adresses, attentions."
            image={shot.suite}
            alt="Chambre claire, lumière du matin sur le linge"
          />
          <Door
            href="/preview-refonte/seminaires"
            index="02"
            title="Séminaires et événements"
            text="Marrakech en tête. Des rassemblements tenus, du premier échange au dernier retour."
            image={shot.koutoubia}
            alt="Minaret et ciel bleu, à Marrakech"
          />
          <Door
            href="/preview-refonte/ski"
            index="03"
            title="Ski premium"
            text="Chalets et palaces. La montagne, sans le poids de l’organisation."
            image={shot.skier}
            alt="Skieuse de face, masque doré, neige"
          />
          <Door
            href="#destinations"
            index="04"
            title="Destinations signatures"
            text="Quelques lieux pour commencer. La suite se dit dans le brief."
            image={shot.lanterns}
            alt="Ruelle et lanternes, lumière chaude"
          />
        </div>
      </section>

      <section id="destinations" aria-labelledby="destinations-titre">
        <SectionHead
          id="destinations-titre"
          kicker="Destinations signatures"
          title="Des lieux, pas un catalogue."
          lede="Marrakech, les lagons, Kyoto, la côte amalfitaine, les Seychelles, Courchevel. D’autres villes se composent ensuite."
        />
        <Places />
      </section>

      <section className="tba-band" id="espace" aria-labelledby="espace-titre">
        <SectionHead
          id="espace-titre"
          light
          kicker="L’espace client"
          title="Le séjour, dans la poche."
          lede="Le carnet de voyage, le concierge WhatsApp joignable à toute heure, les documents et les paiements. Ci-dessous, un dossier fictif. Aucune donnée de client."
        />
        <div className="tba-phones">
          <Phone label="Carnet de voyage">
            <CarnetScreen />
          </Phone>
          <Phone label="Concierge WhatsApp">
            <ConciergeScreen />
          </Phone>
          <Phone label="Documents">
            <DocumentsScreen />
          </Phone>
          <Phone label="Paiements">
            <PaiementScreen />
          </Phone>
        </div>
      </section>

      <Trust withBlanks />
      <ContactBand whatsappText={waCopy.home} />
    </Frame>
  );
}
