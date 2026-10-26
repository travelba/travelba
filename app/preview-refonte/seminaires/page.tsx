import type { Metadata } from "next";
import { ContactBand } from "@/components/preview-refonte/ContactBand";
import { Frame } from "@/components/preview-refonte/Frame";
import { shot, waCopy, whatsappHref } from "@/components/preview-refonte/photos";
import { Photo } from "@/components/preview-refonte/Photo";
import { AtmosphereNote, PageHero, SectionHead, Trust } from "@/components/preview-refonte/ui";

export const metadata: Metadata = {
  title: "Séminaires et événements",
  description:
    "Séminaires et événements Travel BA. Marrakech en tête. Aperçu non indexé de la refonte.",
};

const MOMENTS = [
  {
    title: "Jardins",
    text: "Pour un cercle, à l’écart du bruit. Le lieu exact se choisit avec le brief.",
    image: shot.majorelle,
    alt: "Jardin aux murs bleus et bassin, à Marrakech",
  },
  {
    title: "Médina",
    text: "Pour être dans la ville, pas seulement à côté. Le parcours se compose, il ne s’invente pas.",
    image: shot.medina,
    alt: "Ruelle de médina, murs ocre et ciel",
  },
  {
    title: "Le soir",
    text: "Pour la table et la lumière. Le menu et l’heure se disent quand ils sont connus.",
    image: shot.lanterns,
    alt: "Ruelle et lanternes, lumière chaude",
  },
] as const;

const STEPS = [
  {
    n: "01",
    title: "Le brief",
    text: "Le but, le nombre de personnes, le ton. Rien d’autre n’est requis pour commencer.",
  },
  {
    n: "02",
    title: "La composition",
    text: "La maison propose un lieu et un rythme. Horaires et inclusions attendent d’être connus.",
  },
  {
    n: "03",
    title: "Le séjour",
    text: "Le carnet rassemble les étapes. Le concierge reste joignable, à toute heure.",
  },
  {
    n: "04",
    title: "Le retour",
    text: "Les documents demeurent dans l’espace. Les comptes du rassemblement : à fournir.",
  },
] as const;

export default function SeminairesPage() {
  const wa = whatsappHref(waCopy.seminaires);

  return (
    <Frame whatsappText={waCopy.seminaires}>
      <PageHero
        eyebrow="Séminaires et événements"
        title={
          <>
            Marrakech,
            <br />
            pour se réunir.
          </>
        }
        lede="Médina, jardins, palais. La maison compose le rassemblement — lieu, rythme, attentions — et le tient jusqu’au retour."
        image={shot.koutoubia}
        alt="Minaret et ciel bleu, à Marrakech"
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
          kicker="Marrakech en tête"
          title="La ville, puis le format."
          lede="Marrakech ouvre ce chapitre. Cercle restreint ou assemblée plus large : cela se décide dans le brief. Les jauges, les plans de salles et les conditions : à fournir."
        />
        <div className="tba-trio">
          {MOMENTS.map((moment) => (
            <article key={moment.title}>
              <figure>
                <Photo id={moment.image} alt={moment.alt} sizes="(min-width: 900px) 33vw, 100vw" width={1600} className="tba-zoom" />
              </figure>
              <h2>{moment.title}</h2>
              <p>{moment.text}</p>
            </article>
          ))}
        </div>
        <AtmosphereNote />
      </section>

      <section>
        <SectionHead
          kicker="La suite"
          title="D’autres scènes, si le brief l’appelle."
          lede="Marrakech reste la première porte. Une autre ville se compose ensuite, avec le même soin, sans catalogue figé."
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
      </section>

      <Trust />
      <ContactBand whatsappText={waCopy.seminaires} universe="seminaire" />
    </Frame>
  );
}
