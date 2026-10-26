import type { ReactNode } from "react";

export function Phone({ label, children }: { label: string; children: ReactNode }) {
  return (
    <figure className="tba-phone">
      <figcaption>{label}</figcaption>
      <div className="tba-device">
        <div className="tba-device-screen">{children}</div>
      </div>
    </figure>
  );
}

export function Laptop({ children }: { children: ReactNode }) {
  return (
    <div className="tba-laptop">
      <div className="tba-laptop-bar">Aperçu · dossier d’exemple</div>
      <div className="tba-laptop-screen">{children}</div>
    </div>
  );
}

export function CarnetScreen() {
  return (
    <div>
      <p className="tba-screen-brand">Travel BA</p>
      <p className="tba-screen-kicker">Dossier d’exemple</p>
      <h3 className="tba-screen-title">Marrakech</h3>
      <p className="tba-screen-meta">12 – 16 mars · deux voyageurs</p>
      <ol className="tba-steps">
        <li>
          <span>Arrivée</span>
          <strong>Vol</strong>
          <em>Horaire dans le carnet</em>
        </li>
        <li>
          <span>Séjour</span>
          <strong>Médina</strong>
          <em>Maison d’hôtes</em>
        </li>
        <li>
          <span>Journée</span>
          <strong>Palmeraie</strong>
          <em>Sur place</em>
        </li>
        <li>
          <span>Retour</span>
          <strong>Vol</strong>
          <em>Horaire dans le carnet</em>
        </li>
      </ol>
      <p className="tba-screen-note">Dossier fictif. Aucune donnée de client, aucun horaire inventé.</p>
    </div>
  );
}

export function ConciergeScreen() {
  return (
    <div>
      <p className="tba-screen-brand">Concierge</p>
      <p className="tba-screen-kicker">WhatsApp · à toute heure</p>
      <h3 className="tba-screen-title">La maison</h3>
      <div className="tba-chat">
        <p className="tba-bubble">
          <small>La maison</small>
          Bonjour. Le carnet de Marrakech est ouvert.
        </p>
        <p className="tba-bubble is-you">
          <small>Vous</small>
          Pouvez-vous prévoir le transfert à l’arrivée ?
        </p>
        <p className="tba-bubble">
          <small>La maison</small>
          Nous revenons vers vous dans ce fil. Joignable à toute heure.
        </p>
      </div>
      <p className="tba-screen-note">Échange d’exemple. Rien n’a été envoyé.</p>
    </div>
  );
}

export function DocumentsScreen() {
  return (
    <div>
      <p className="tba-screen-brand">Documents</p>
      <p className="tba-screen-kicker">Dossier d’exemple</p>
      <h3 className="tba-screen-title">Le coffre</h3>
      <ul className="tba-docs">
        <li>
          Pièce d’identité <span>Au coffre</span>
        </li>
        <li>
          Titre de transport <span>Dans le carnet</span>
        </li>
        <li>
          Confirmation de séjour <span>Dans le carnet</span>
        </li>
      </ul>
      <p className="tba-screen-note">Les numéros de pièces ne figurent pas sur cet aperçu.</p>
    </div>
  );
}

export function PaiementScreen() {
  return (
    <div>
      <p className="tba-screen-brand">Paiements</p>
      <p className="tba-screen-kicker">Dossier d’exemple</p>
      <h3 className="tba-screen-title">Marrakech</h3>
      <div className="tba-pay">
        <div>
          Montant <em>à fournir</em>
        </div>
        <div>
          Règlement <em>à fournir</em>
        </div>
      </div>
      <p className="tba-screen-note">Aucun encaissement depuis cet aperçu. Le montant réel reste dans l’espace du client.</p>
    </div>
  );
}
