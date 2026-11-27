/** Captures de l’aperçu local. Aucune écriture en base. */
import path from "node:path";
import puppeteer from "puppeteer-core";

const OUT = path.join(process.cwd(), "docs/recette-billets-train");
const shots = [
  ["bouton", "crm-bouton.png"],
  ["formulaire", "crm-formulaire.png"],
  ["depart-inconnu", "crm-depart-inconnu.png"],
  ["suivi", "crm-suivi.png"],
  ["avant", "crm-avant.png"],
  ["apres", "crm-apres.png"],
  ["fil", "crm-fil.png"],
  ["billet", "crm-billet.png"],
] as const;

async function main() {
  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
    await page.goto("http://127.0.0.1:3000/apercu/demande-train", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("#suivi", { timeout: 60000 });
    for (const [id, file] of shots) {
      const handle = await page.$(`#${id}`);
      if (!handle) throw new Error(`section ${id} absente`);
      await handle.screenshot({ path: path.join(OUT, file) });
    }
  } finally {
    await browser.close();
  }
  console.log("captures crm ok");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "échec");
  process.exitCode = 1;
});
