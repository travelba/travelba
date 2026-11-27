/**
 * Images de recette. Aucun WhatsApp n’est envoyé.
 * npx tsx scripts/render-train-previews.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { trainRecipeMarkdown, trainRecipes, type RecipeBubble } from "../lib/crm/train-recipe";

const OUT = path.join(process.cwd(), "docs/recette-billets-train");

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function bubbleHtml(bubble: RecipeBubble) {
  const side = bubble.from === "client" ? "client" : "agence";
  const menu = bubble.menu ? `<span class="btn menu">${escapeHtml(bubble.menu)}</span>` : "";
  const buttons = (bubble.buttons || []).map((label) => `<span class="btn">${escapeHtml(label)}</span>`).join("");
  return `<div class="row ${side}"><div class="bubble"><p>${escapeHtml(bubble.text).replace(/\n/g, "<br>")}</p>${
    menu || buttons ? `<div class="buttons">${menu}${buttons}</div>` : ""
  }</div></div>`;
}

function phoneHtml(title: string, bubbles: RecipeBubble[]) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { margin: 0; background: #0b192c; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; }
    .phone { width: 390px; background: #efeae2; }
    header { background: #075e54; color: white; padding: 28px 16px 12px; }
    header strong { display: block; font-size: 16px; }
    header span { font-size: 12px; opacity: .85; }
    main { padding: 12px; }
    h1 { margin: 0 0 10px; font-size: 13px; color: #3b4a54; font-weight: 600; }
    .row { display: flex; margin: 8px 0; }
    .agence { justify-content: flex-start; }
    .client { justify-content: flex-end; }
    .bubble { max-width: 86%; border-radius: 10px; padding: 8px 10px; font-size: 14px; line-height: 1.35; color: #111b21; }
    .agence .bubble { background: #fff; }
    .client .bubble { background: #d9fdd3; }
    .bubble p { margin: 0; }
    .buttons { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
    .btn { display: block; text-align: center; background: #fff; color: #027eb5; border: 1px solid #d1d7db; border-radius: 16px; padding: 6px 8px; font-size: 13px; font-weight: 600; }
    .btn.menu { background: #027eb5; color: #fff; border-color: #027eb5; }
  </style></head><body><div class="phone"><header><strong>Travel BA</strong><span>Conciergerie · exemple fictif</span></header><main><h1>${escapeHtml(title)}</h1>${bubbles.map((bubble) => bubbleHtml(bubble)).join("")}</main></div></body></html>`;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const recipes = trainRecipes();
  const markdown = trainRecipeMarkdown(recipes).replace(
    "## Modèles",
    `Les fils ci-dessous sont des images. Chaque fichier est dans \`docs/recette-billets-train/\`.\n\n## Modèles`
  );
  const withImages = recipes.reduce((text, recipe) => {
    const shot = `\n![${recipe.titre}](recette-billets-train/${recipe.id}.png)\n`;
    return text.replace(`## ${recipe.titre}\n`, `## ${recipe.titre}\n${shot}`);
  }, markdown);
  await writeFile(path.join(process.cwd(), "docs/recette-billets-train.md"), withImages);
  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 800, deviceScaleFactor: 2 });
    for (const recipe of recipes) {
      const bubbles = recipe.steps.flatMap((row) => row.bubbles);
      await page.setContent(phoneHtml(recipe.titre, bubbles), { waitUntil: "domcontentloaded" });
      const phone = await page.$(".phone");
      await phone?.screenshot({ path: path.join(OUT, `${recipe.id}.png`) });
    }
  } finally {
    await browser.close();
  }
  console.log(`écrit ${recipes.length} images`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "échec");
  process.exitCode = 1;
});
