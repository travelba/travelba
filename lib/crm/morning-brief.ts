export function morningBriefLine(input: {
  unmatched: number;
  formalities: number;
  departTomorrow: number;
  departWeek: number;
}) {
  const parts: string[] = [];
  if (input.unmatched > 0) {
    parts.push(
      `${input.unmatched} virement${input.unmatched > 1 ? "s" : ""} à rapprocher`
    );
  }
  if (input.formalities > 0) {
    parts.push(
      `${input.formalities} formalité${input.formalities > 1 ? "s" : ""} ouverte${input.formalities > 1 ? "s" : ""}`
    );
  }
  if (input.departTomorrow > 0) {
    parts.push(
      `${input.departTomorrow} départ${input.departTomorrow > 1 ? "s" : ""} demain`
    );
  }
  if (input.departWeek > 0) {
    parts.push(
      `${input.departWeek} départ${input.departWeek > 1 ? "s" : ""} sous 7 jours`
    );
  }
  return parts.length ? parts.join(" · ") : null;
}
