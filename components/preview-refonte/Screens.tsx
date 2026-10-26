export function CarnetScreen() {
  return (
    <article className="tba-sheet">
      <p className="tba-sheet-kicker">Carnet · dossier d’exemple</p>
      <h3>Marrakech</h3>
      <p className="tba-sheet-meta">12 – 16 mars · deux voyageurs</p>
      <ol className="tba-lines">
        <li>
          <span>Arrivée</span>
          <strong>Vol</strong>
          <em>L’horaire reste celui du carnet</em>
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
          <em>L’horaire reste celui du carnet</em>
        </li>
      </ol>
      <p className="tba-note">Dossier fictif. Aucune donnée de client.</p>
    </article>
  );
}

export function BilletScreen() {
  return (
    <article className="tba-sheet">
      <p className="tba-sheet-kicker">Billet · dossier d’exemple</p>
      <h3>Paris → Marrakech</h3>
      <p className="tba-sheet-meta">CDG → RAK</p>
      <ol className="tba-lines">
        <li>
          <span>Classe</span>
          <strong>Dans le carnet</strong>
        </li>
        <li>
          <span>Référence</span>
          <strong>Dans le carnet</strong>
        </li>
        <li>
          <span>Voyageurs</span>
          <strong>Deux billets</strong>
          <em>Le train, lorsqu’il y en a un, suit la même carte</em>
        </li>
      </ol>
      <p className="tba-note">Aucun numéro de billet sur cette étude.</p>
    </article>
  );
}

export function DocumentsScreen() {
  return (
    <article className="tba-sheet">
      <p className="tba-sheet-kicker">Documents</p>
      <h3>Le coffre</h3>
      <ol className="tba-lines">
        <li>
          <span>Pièce d’identité</span>
          <strong>Au coffre</strong>
        </li>
        <li>
          <span>Billet</span>
          <strong>Dans le carnet</strong>
        </li>
        <li>
          <span>Confirmation de séjour</span>
          <strong>Dans le carnet</strong>
        </li>
        <li>
          <span>Formalité</span>
          <strong>Lorsque la pièce est prête</strong>
        </li>
      </ol>
      <p className="tba-note">Les numéros ne figurent pas ici.</p>
    </article>
  );
}

export function SuiviScreen() {
  return (
    <article className="tba-sheet">
      <p className="tba-sheet-kicker">Suivi</p>
      <h3>Le séjour</h3>
      <ol className="tba-lines">
        <li>
          <span>Carnet</span>
          <strong>Ouvert</strong>
          <em>Étapes, villes, pièces</em>
        </li>
        <li>
          <span>ESTA</span>
          <strong>Pièce au coffre</strong>
          <em>Préparation, remplissage, validation, paiement, pièce</em>
        </li>
        <li>
          <span>Concierge</span>
          <strong>Joignable</strong>
          <em>WhatsApp, à toute heure</em>
        </li>
      </ol>
      <p className="tba-note">Exemple. Le vrai suivi est celui du dossier.</p>
    </article>
  );
}

export function MessagesScreen() {
  return (
    <article className="tba-sheet">
      <p className="tba-sheet-kicker">Messages</p>
      <h3>Le Concierge</h3>
      <div className="tba-thread">
        <p className="is-house">
          <small>La maison</small>
          Le carnet de Marrakech est ouvert.
        </p>
        <p className="is-you">
          <small>Vous</small>
          Pouvez-vous prévoir le transfert à l’arrivée ?
        </p>
        <p className="is-house">
          <small>La maison</small>
          Nous revenons vers vous dans ce fil.
        </p>
      </div>
      <p className="tba-note">Échange d’exemple. Rien n’a été envoyé.</p>
    </article>
  );
}

export function FideliteScreen() {
  return (
    <article className="tba-sheet">
      <p className="tba-sheet-kicker">Fidélité</p>
      <h3>La fiche</h3>
      <ol className="tba-lines">
        <li>
          <span>Aérien</span>
          <strong>Numéro enregistré</strong>
        </li>
        <li>
          <span>Hôtel</span>
          <strong>Numéro enregistré</strong>
        </li>
        <li>
          <span>Train</span>
          <strong>Numéro enregistré</strong>
        </li>
      </ol>
      <p className="tba-note">Les numéros restent sur la fiche. Ils ne sont pas montrés ici.</p>
    </article>
  );
}
