import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { ContactBand } from "@/components/preview-refonte/ContactBand";
import { Frame } from "@/components/preview-refonte/Frame";
import { Photo } from "@/components/preview-refonte/Photo";
import { shot, waCopy, whatsappHref } from "@/components/preview-refonte/photos";
import {
  CarnetScreen,
  ConciergeScreen,
  DocumentsScreen,
  Laptop,
  PaiementScreen,
  Phone,
} from "@/components/preview-refonte/Screens";
import { Trust } from "@/components/preview-refonte/ui";

export const viewport: Viewport = {
  themeColor: "#f3eee6",
};

export const metadata: Metadata = {
  title: "Espace client",
  description:
    "Vitrine de l’espace client Travel BA : carnet, concierge WhatsApp, documents et paiements. Dossier fictif. Aperçu non indexé.",
};

export default function EspaceClientPage() {
  const wa = whatsappHref(waCopy.espace);

  return (
    <Frame tone="solid" whatsappText={waCopy.espace}>
      <header className="tba-typehero">
        <p className="tba-kicker">Espace client</p>
        <h1>Tout le séjour, déjà là.</h1>
        <p className="tba-lede">
          Le carnet de voyage, le concierge WhatsApp joignable à toute heure, les documents et les paiements. Les écrans
          montrent un dossier fictif à Marrakech. Aucune donnée de client.
        </p>
        <div className="tba-hero-actions">
          <a className="tba-btn" href={wa} target="_blank" rel="noopener noreferrer">
            Demander l’accès
          </a>
          <Link className="tba-btn tba-btn-ghost" href="/connexion">
            Déjà client — ouvrir l’espace
          </Link>
        </div>
      </header>

      <article className="tba-chapter">
        <div>
          <p className="tba-kicker">01 — Carnet</p>
          <h2>Le carnet de voyage.</h2>
          <p className="tba-lede">
            Les étapes, dans l’ordre. Villes où l’on séjourne, trajets, journées. Rien qui n’ait été composé pour ce dossier.
            Les horaires restent ceux du carnet réel — ici, ils ne sont pas inventés.
          </p>
        </div>
        <div className="tba-chapter-device">
          <Laptop>
            <CarnetScreen />
          </Laptop>
        </div>
      </article>

      <article className="tba-chapter is-flip">
        <div>
          <p className="tba-kicker">02 — Concierge</p>
          <h2>WhatsApp, à toute heure.</h2>
          <p className="tba-lede">
            Un fil avec la maison. La demande part sur WhatsApp. La réponse vient de l’agence, pas d’un automate montré ici.
          </p>
        </div>
        <div className="tba-chapter-device">
          <Phone label="Concierge">
            <ConciergeScreen />
          </Phone>
        </div>
      </article>

      <article className="tba-chapter">
        <div>
          <p className="tba-kicker">03 — Documents</p>
          <h2>Les pièces, avec le séjour.</h2>
          <p className="tba-lede">
            Pièce d’identité, titre de transport, confirmation. Au même endroit que le voyage. Les numéros ne sont pas montrés
            sur cette vitrine.
          </p>
        </div>
        <div className="tba-chapter-device">
          <Phone label="Documents">
            <DocumentsScreen />
          </Phone>
        </div>
      </article>

      <article className="tba-chapter is-flip">
        <div>
          <p className="tba-kicker">04 — Paiements</p>
          <h2>Le règlement, au clair.</h2>
          <p className="tba-lede">
            Le montant du séjour se lit dans l’espace du client. Sur cet exemple, le montant et le règlement sont à fournir.
            Rien ne s’encaisse depuis la maquette.
          </p>
        </div>
        <div className="tba-chapter-device">
          <Phone label="Paiements">
            <PaiementScreen />
          </Phone>
        </div>
      </article>

      <section className="tba-photo-break" aria-label="Lagon, image d’atmosphère">
        <Photo id={shot.maldives} alt="Villas sur pilotis dans un lagon" sizes="100vw" width={2200} />
        <div className="tba-hero-shade" aria-hidden="true" />
        <p>Le séjour continue, même à distance.</p>
      </section>

      <Trust />
      <ContactBand whatsappText={waCopy.espace} />
    </Frame>
  );
}
