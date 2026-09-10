import { readFileSync } from "fs";
import { parsePassportFile } from "../lib/mtrip/extract-passport.ts";

async function main() {
  const buf = readFileSync("c:/Users/benja/Downloads/All Passport Taieb.pdf");
  console.log("start", buf.length);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const r = await parsePassportFile(
    ab,
    "All Passport Taieb.pdf",
    "application/pdf"
  );
  console.log(
    JSON.stringify(
      {
        status: r.status,
        n: r.passengers.length,
        pax: r.passengers.map((p) => ({
          f: p.first_name,
          l: p.last_name,
          n: p.passport_number,
          nat: p.nationality,
        })),
        w: r.warnings,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
