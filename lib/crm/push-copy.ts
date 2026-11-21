export type FlightPushKind =
  | "horaire"
  | "annule"
  | "enregistrement"
  | "retard"
  | "deroute"
  | "envol"
  | "arrivee";

export type PushPreference = "travel" | "documents" | "payment";

export type PushPreferenceRow = {
  push_travel?: boolean | null;
  push_documents?: boolean | null;
  push_payment?: boolean | null;
};

const COLUMN: Record<PushPreference, keyof PushPreferenceRow> = {
  travel: "push_travel",
  documents: "push_documents",
  payment: "push_payment",
};

/** Pas de ligne : les trois canaux sont ouverts, comme les e-mails. `false` ferme. */
export function pushAllowed(row: PushPreferenceRow | null | undefined, kind: PushPreference) {
  if (!row) return true;
  return row[COLUMN[kind]] !== false;
}

function clean(value: string | null | undefined, max = 80) {
  return (value || "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export function flightPushCopy(input: {
  kind: FlightPushKind;
  flight?: string | null;
  route?: string | null;
  when?: string | null;
  place?: string | null;
}): { title: string; body: string } | null {
  const flight = clean(input.flight);
  const route = clean(input.route);
  const when = clean(input.when);
  const place = clean(input.place);
  const leg = [flight, route].filter(Boolean).join(" ");
  switch (input.kind) {
    case "horaire":
      if (!flight || !route || !when) return null;
      return { title: "Horaire de vol", body: `Votre vol ${leg} part désormais à ${when}.` };
    case "retard":
      if (!flight || !route || !when) return null;
      return { title: "Vol retardé", body: `Votre vol ${leg} est annoncé à ${when}.` };
    case "annule":
      if (!flight || !route) return null;
      return { title: "Vol annulé", body: `Votre vol ${leg} ne partira pas. L’agence s’en occupe.` };
    case "enregistrement":
      if (!flight || !route) return null;
      return { title: "Enregistrement ouvert", body: `L’enregistrement de votre vol ${leg} est ouvert.` };
    case "deroute":
      if (!flight || !route) return null;
      return { title: "Vol modifié", body: `Votre vol ${leg} change de destination. L’agence suit l’affaire.` };
    case "envol":
      if (!flight || !route) return null;
      return { title: "Bon vol", body: `Votre vol ${leg} a décollé.` };
    case "arrivee":
      if (!place) return null;
      return { title: "Bienvenue", body: `Vous voici ${place}. Votre séjour vous attend.` };
    default:
      return null;
  }
}

export function boardingPushCopy(input: { flight?: string | null; route?: string | null }) {
  const leg = [clean(input.flight), clean(input.route)].filter(Boolean).join(" ");
  return {
    title: "Carte d’embarquement",
    body: leg
      ? `Votre carte d’embarquement ${leg} est dans votre séjour.`
      : "Votre carte d’embarquement est dans votre séjour.",
  };
}

export function airportPushCopy(input: { flight?: string | null; route?: string | null }) {
  const leg = [clean(input.flight), clean(input.route)].filter(Boolean).join(" ");
  return {
    title: "Enregistrement",
    body: leg
      ? `L’enregistrement de votre vol ${leg} se termine à l’aéroport.`
      : "L’enregistrement se termine à l’aéroport.",
  };
}

export function paymentPushCopy(money: string, reference?: string | null) {
  const amount = clean(money, 40);
  const ref = clean(reference, 40);
  const stay = /^TB-/i.test(ref) ? ` pour ${ref}` : "";
  return {
    title: "Règlement reçu",
    body: amount ? `Votre règlement de ${amount} est bien reçu${stay}.` : `Votre règlement est bien reçu${stay}.`,
  };
}
