/**
 * Génère les couvertures des villes du catalogue qui n’ont pas encore de fichier.
 * Une photo déjà dans public/covers est laissée telle quelle.
 *
 *   npm run covers:generate
 *   npm run covers:generate -- Lyon Bordeaux
 */
import { loadEnvFile } from "node:process";
import { generatedCityCoverJobs } from "../lib/crm/cover-catalog";
import { readPublicCover, toCoverWebp, writePublicCover } from "../lib/crm/cover-file";
import { cityCoverAuthFailed, generateCityCoverBytes } from "../lib/crm/cover-retouch";

try {
  loadEnvFile(".env.local");
} catch {
  /* variables déjà fournies par l’environnement */
}

function selected(place: string, id: string) {
  const args = process.argv
    .slice(2)
    .map((arg) => arg.trim().toLowerCase())
    .filter((arg) => arg && !arg.startsWith("-"));
  if (!args.length) return true;
  const label = `${place} ${id}`.toLowerCase();
  return args.some((arg) => label.includes(arg));
}

async function main() {
  const jobs = generatedCityCoverJobs().filter((job) => selected(job.place, job.id));
  let present = 0;
  let created = 0;
  let failed = 0;

  for (const job of jobs) {
    if (await readPublicCover(job.id)) {
      present += 1;
      console.log("présent", job.place);
      continue;
    }
    const raw = await generateCityCoverBytes(job.place, job.country);
    if (!raw) {
      failed += 1;
      console.error("échec", job.place);
      if (cityCoverAuthFailed()) {
        console.error("Clé image refusée. Le reste du catalogue n’est pas relancé.");
        break;
      }
      continue;
    }
    let webp: Buffer;
    try {
      webp = await toCoverWebp(raw);
    } catch {
      failed += 1;
      console.error("échec", job.place);
      continue;
    }
    if (!webp.byteLength || !(await writePublicCover(job.id, webp))) {
      failed += 1;
      console.error("échec", job.place);
      continue;
    }
    created += 1;
    console.log("générée", job.place);
  }

  console.log(
    `catalogue : ${created} générées, ${present} déjà là, ${failed} échecs, ${jobs.length} villes`
  );
  if (failed) process.exitCode = 1;
}

main();
