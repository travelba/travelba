import { officialUrls } from "../lib/catalog";
import { getFiche } from "../lib/og";

async function main() {
  let ok = 0;
  for (const url of officialUrls) {
    const fiche = await getFiche(url, { refresh: true });
    const mark = fiche.ok ? "ok" : "echec";
    if (fiche.ok) ok += 1;
    console.log(`${mark}\t${fiche.images.length} photo(s)\t${url}${fiche.error ? `\t${fiche.error}` : ""}`);
  }
  console.log(`${ok}/${officialUrls.length} fiches avec texte ou photo. Les prix du seed restent utilisables sinon.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
