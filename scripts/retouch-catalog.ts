import { catalogRetouchJobs } from "../lib/crm/cover-catalog";
import { readPublicCover, toCoverJpeg, toCoverWebp, writePublicCover } from "../lib/crm/cover-file";
import { downloadCoverImage } from "../lib/crm/cover-search";
import { retouchCoverBytes } from "../lib/crm/cover-retouch";

async function main() {
const jobs = catalogRetouchJobs();
let ok = 0;
let failed = 0;
for (const job of jobs) {
  if (await readPublicCover(job.id)) {
    ok += 1;
    continue;
  }
  const remote = `https://images.unsplash.com/${job.id}?auto=format&fit=crop&w=1600&h=900&q=80`;
  try {
    const source = await downloadCoverImage(remote);
    const jpeg = await toCoverJpeg(source);
    const retouched = await retouchCoverBytes(jpeg, job.label);
    if (!retouched) {
      failed += 1;
      console.error("marine", job.label);
      continue;
    }
    const webp = await toCoverWebp(retouched);
    if (!webp) {
      failed += 1;
      console.error("sharp", job.label);
      continue;
    }
    const written = await writePublicCover(job.id, webp);
    if (!written) {
      failed += 1;
      continue;
    }
    ok += 1;
    console.log("ok", job.label);
  } catch (err) {
    failed += 1;
    console.error("fail", job.label, err instanceof Error ? err.name : "error");
  }
}
console.log(`covers ${ok} ok, ${failed} marine, ${jobs.length} total`);
if (failed) process.exitCode = 1;
}

main();
