export type PieceStay = {
  id: string;
  reference: string;
  destination: string | null;
  title: string | null;
};

export type PieceTraveler = {
  id: string;
  bookingId: string;
  firstName: string | null;
  lastName: string | null;
};

export type PieceTarget = {
  bookingId: string;
  travelerId: string | null;
};

function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

function tokens(stay: PieceStay) {
  return [stay.reference, stay.destination, stay.title]
    .flatMap((value) => (value || "").split(/[,·]/))
    .map((value) => fold(value).trim())
    .filter((value) => value.length >= 3);
}

function stayNamedIn(text: string, stays: PieceStay[]) {
  const folded = fold(text);
  if (!folded.trim()) return null;
  const byRef = stays.filter((stay) => folded.includes(fold(stay.reference)));
  if (byRef.length === 1) return byRef[0];
  const byPlace = stays.filter((stay) => tokens(stay).some((token) => token !== fold(stay.reference) && folded.includes(token)));
  if (byPlace.length === 1) return byPlace[0];
  return null;
}

function obviousTraveler(text: string, bookingId: string, travelers: PieceTraveler[]) {
  const rows = travelers.filter((row) => row.bookingId === bookingId);
  if (rows.length === 1) return rows[0].id;
  const folded = fold(text);
  const named = rows.filter((row) => {
    const first = fold(row.firstName || "");
    return first.length >= 3 && folded.includes(first);
  });
  return named.length === 1 ? named[0].id : null;
}

/**
 * Pièce reçue après un dossier nommé ou choisi dans le fil.
 * Le voyageur n’est lié que s’il est seul, ou nommé.
 */
export function pieceStayTarget(input: {
  message: string;
  history: { direction: string; body: string }[];
  stays: PieceStay[];
  travelers?: PieceTraveler[];
}): PieceTarget | null {
  const current = stayNamedIn(input.message, input.stays);
  const earlier = [...input.history]
    .reverse()
    .map((row) => stayNamedIn(row.body, input.stays))
    .find((stay) => stay);
  const stay = current || earlier || null;
  if (!stay) return null;
  const corpus = [input.message, ...input.history.map((row) => row.body)].join("\n");
  return {
    bookingId: stay.id,
    travelerId: obviousTraveler(corpus, stay.id, input.travelers || []),
  };
}
