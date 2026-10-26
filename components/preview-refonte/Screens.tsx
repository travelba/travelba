export function CarnetScreen({
  kicker = "Carnet · dossier d’exemple",
  title = "Marrakech",
  meta = "12 – 16 mars · deux voyageurs",
  lines = [
    ["Arrivée", "Vol", "L’horaire reste celui du carnet"],
    ["Séjour", "Médina", "Maison d’hôtes"],
    ["Journée", "Palmeraie", "Sur place"],
    ["Retour", "Vol", "L’horaire reste celui du carnet"],
  ],
  note = "Dossier fictif. Aucune donnée de client.",
}: {
  kicker?: string;
  title?: string;
  meta?: string;
  lines?: [string, string, string][];
  note?: string;
}) {
  return (
    <article className="tba-sheet">
      <p className="tba-sheet-kicker">{kicker}</p>
      <h3>{title}</h3>
      <p className="tba-sheet-meta">{meta}</p>
      <ol className="tba-lines">
        {lines.map(([label, name, detail]) => (
          <li key={label}>
            <span>{label}</span>
            <strong>{name}</strong>
            <em>{detail}</em>
          </li>
        ))}
      </ol>
      <p className="tba-note">{note}</p>
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

const defaultThread = [
  ["house", "Le carnet de Marrakech est ouvert."],
  ["you", "Pouvez-vous prévoir le transfert à l’arrivée ?"],
  ["house", "Nous revenons vers vous dans ce fil."],
] as const;

export function MessagesScreen({
  lines = defaultThread,
}: {
  lines?: readonly (readonly [who: "house" | "you", text: string])[];
}) {
  return (
    <article className="tba-sheet">
      <p className="tba-sheet-kicker">Messages</p>
      <h3>Le Concierge</h3>
      <div className="tba-thread">
        {lines.map(([who, text]) => (
          <p key={text} className={who === "house" ? "is-house" : "is-you"}>
            <small>{who === "house" ? "La maison" : "Vous"}</small>
            {text}
          </p>
        ))}
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
