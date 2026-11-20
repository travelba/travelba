/** Pages client à invalider quand le titre du dossier change. */
export function clientDossierRevalidations(reference: string | null | undefined) {
  const paths: { path: string; type: "layout" | "page" }[] = [
    { path: "/mon-compte", type: "layout" },
    { path: "/mon-compte/reservations", type: "page" },
  ];
  const ref = (reference || "").trim();
  if (ref) paths.push({ path: `/mon-compte/reservations/${ref}`, type: "page" });
  return paths;
}
