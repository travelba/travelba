import type { Metadata } from "next";
import Link from "next/link";
import { AppDevices } from "@/components/preview-refonte/AppDevices";
import { Frame } from "@/components/preview-refonte/Frame";

export const metadata: Metadata = {
  title: "L’application",
  description:
    "L’application Travel BA. Carnet, documents, cartes d’embarquement, formalités, concierge, paiements. Étude non indexée.",
};

const features = [
  {
    n: "01",
    title: "Carnet de voyage",
    text: "Les villes du séjour, les nuits, les vols, l’hôtel, les transferts. L’exemple dit Marrakech, du 12 au 16 mars. L’horaire reste celui du billet.",
  },
  {
    n: "02",
    title: "Documents, 6 / 6",
    text: "Passeport, billet, hôtel, transfert, formalité, assurance. Dans l’exemple, les six sont au coffre. Les numéros ne figurent pas ici.",
  },
  {
    n: "03",
    title: "Cartes d’embarquement",
    text: "Villes en titre, codes d’aéroport dessous. La référence et l’horaire restent dans le vrai carnet. Aucun numéro de vol n’est inventé.",
  },
  {
    n: "04",
    title: "ESTA, ETA",
    text: "ESTA, ETA Royaume-Uni, ETA-IL, et les autres visas. Les étapes : préparation, remplissage, validation, paiement, pièce.",
  },
  {
    n: "05",
    title: "Concierge, à toute heure",
    text: "Le fil WhatsApp avec la maison. L’échange montré est un exemple. Rien n’est envoyé depuis cette page.",
  },
  {
    n: "06",
    title: "Paiements",
    text: "Le règlement se suit dans l’espace. Le montant reste celui du dossier. Cette étude ne l’affiche pas.",
  },
  {
    n: "07",
    title: "Mises à jour",
    text: "Quand une confirmation arrive, le carnet du vrai dossier se met à jour. La démonstration, elle, reste un exemple.",
  },
];

export default function ApplicationPage() {
  return (
    <Frame>
      <section className="tba-pocket">
        <div className="tba-pocket-copy">
          <p className="tba-kicker">L’application</p>
          <h1>Votre voyage, dans votre poche.</h1>
          <p>
            Carnet, documents, carte d’embarquement, formalité, paiements, fil avec la maison. La démonstration tourne.
            Un clic sur un onglet l’arrête. Rien ne part.
          </p>
          <ul className="tba-feature-names">
            {features.map((feature) => (
              <li key={feature.n}>{feature.title}</li>
            ))}
          </ul>
          <div className="tba-actions">
            <Link className="tba-word" href="/preview-refonte/espace-client">
              Les écrans
            </Link>
            <Link className="tba-word is-quiet" href="/preview-refonte#devis">
              Demander un devis
            </Link>
          </div>
        </div>
        <AppDevices />
      </section>

      <section className="tba-features" aria-labelledby="fonctions">
        <h2 id="fonctions">Ce que l’espace tient.</h2>
        <ol>
          {features.map((feature) => (
            <li key={feature.n}>
              <span>{feature.n}</span>
              <div>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="tba-inner-end tba-app-end">
        <h2>Le carnet suit le séjour.</h2>
        <p>En famille, le planning des enfants. En séminaire, le programme des participants. Le même espace, le même fil.</p>
        <div className="tba-actions">
          <Link className="tba-word" href="/preview-refonte/kids">
            En famille
          </Link>
          <Link className="tba-word is-quiet" href="/preview-refonte/seminaires">
            Séminaires
          </Link>
        </div>
      </section>
    </Frame>
  );
}
