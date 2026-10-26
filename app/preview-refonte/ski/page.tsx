import type { Metadata } from "next";
import { ContactBand } from "@/components/preview-refonte/ContactBand";
import { Frame } from "@/components/preview-refonte/Frame";
import { Photo } from "@/components/preview-refonte/Photo";
import { shot, waCopy, whatsappHref } from "@/components/preview-refonte/photos";
import { AtmosphereNote, PageHero, PlaceCard, SectionHead, Trust } from "@/components/preview-refonte/ui";

export const metadata: Metadata = {
  title: "Ski premium",
  description: "Ski premium Travel BA : chalets et palaces. Aperçu non indexé de la refonte.",
};

const STATIONS = [
  { name: "Courchevel", line: "Neige", image: shot.peaks, alt: "Chaîne de sommets enneigés" },
  { name: "Megève", line: "Village", image: shot.cabin, alt: "Chalet de bois sous la neige" },
  { name: "Val d’Isère", line: "Domaine", image: shot.slope, alt: "Piste enneigée et skieurs" },
  { name: "Zermatt", line: "Haute altitude", image: shot.matterhorn, alt: "Sommet pyramidal dans les nuages" },
  { name: "Saint-Moritz", line: "Lac et sommets", image: shot.lake, alt: "Lac de montagne et sommets" },
  { name: "Cortina d’Ampezzo", line: "Dolomites", image: shot.skier, alt: "Skieuse de face, masque doré" },
] as const;

export default function SkiPage() {
  const wa = whatsappHref(waCopy.ski);

  return (
    <Frame whatsappText={waCopy.ski}>
      <PageHero
        eyebrow="Ski premium"
        title={
          <>
            Chalets
            <br />
            et palaces.
          </>
        }
        lede="La montagne, tenue. Une semaine composée par la maison — arrivées, table, imprévus — sans que vous en portiez l’organisation."
        image={shot.peaks}
        alt="Sommets alpins dorés par le soleil"
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
          kicker="Deux manières"
          title="La maison, ou le palace."
          lede="L’un et l’autre se choisissent avec vous. Le nom de l’établissement n’apparaît que lorsqu’il est retenu. Les tarifs de la saison : à fournir."
        />
        <div className="tba-split">
          <article>
            <figure>
              <Photo id={shot.chalet} alt="Intérieur de chalet, bois et cheminée" sizes="(min-width: 900px) 50vw, 100vw" width={1800} className="tba-zoom" />
            </figure>
            <h2>Chalets</h2>
            <p>Une maison à vous, le temps de la semaine. Le feu, la table, la neige au seuil. Le chalet précis se choisit dans le brief.</p>
          </article>
          <article>
            <figure>
              <Photo id={shot.suite} alt="Chambre claire, lumière du matin" sizes="(min-width: 900px) 50vw, 100vw" width={1800} className="tba-zoom" />
            </figure>
            <h2>Palaces</h2>
            <p>La montagne, et quelqu’un pour la tenir. Chambre, table, rythme. On nomme la maison quand elle est choisie — pas avant.</p>
          </article>
        </div>
        <AtmosphereNote />
      </section>

      <section>
        <SectionHead
          kicker="Stations"
          title="Quelques massifs."
          lede="Courchevel, Megève, Val d’Isère, Zermatt, Saint-Moritz, Cortina d’Ampezzo. D’autres domaines se composent si le brief les appelle."
        />
        <div className="tba-places">
          {STATIONS.map((station) => (
            <PlaceCard key={station.name} {...station} />
          ))}
        </div>
        <AtmosphereNote />
      </section>

      <Trust />
      <ContactBand whatsappText={waCopy.ski} universe="ski" />
    </Frame>
  );
}
