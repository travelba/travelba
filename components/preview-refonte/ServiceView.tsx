import { ContactBand } from "./ContactBand";
import { Frame } from "./Frame";
import { Credentials, PageHero, Split } from "./ui";
import type { PreviewService } from "./catalog";

export function ServiceView({ service }: { service: PreviewService }) {
  return (
    <Frame whatsappText={service.wa}>
      <PageHero
        title={
          <>
            {service.heroTitle}
            <br />
            <em>{service.heroEm}</em>
          </>
        }
        lede={service.description}
        image={service.image}
        alt={service.alt}
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
        <p>{service.manifesto}</p>
      </section>

      {service.splits.map((split, index) => (
        <Split
          key={split.title}
          flip={index === 1}
          title={split.title}
          text={split.text}
          image={split.image}
          alt={split.alt}
          href={split.href}
          more={split.more}
        />
      ))}

      <section className="tba-prose">
        <h2>{service.proseTitle}</h2>
        <p>{service.prose}</p>
        <ul>
          <li>
            <strong>Brief</strong>
            Besoins, contraintes, envies. La maison écoute avant de composer.
          </li>
          <li>
            <strong>Proposition</strong>
            Une proposition détaillée. Elle part lorsque la maison l’a écrite.
          </li>
          <li>
            <strong>Organisation</strong>
            La logistique est coordonnée. Un interlocuteur unique.
          </li>
          <li>
            <strong>Expérience</strong>
            Vous profitez. La maison reste joignable, à toute heure.
          </li>
        </ul>
      </section>

      <Credentials />
      <ContactBand whatsappText={service.wa} universe={service.universe} />
    </Frame>
  );
}
