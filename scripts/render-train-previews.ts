/**
 * Images de recette. Aucun WhatsApp n’est envoyé.
 * npx tsx scripts/render-train-previews.ts
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
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

function bubbleHtml(bubble: RecipeBubble, media: string) {
  const side = bubble.from === "client" ? "client" : "agence";
  const buttons = (bubble.buttons || []).map((label) => `<span class="btn">${escapeHtml(label)}</span>`).join("");
  const cards = (bubble.cards || [])
    .map(
      (card) =>
        `<article class="card"><img src="${media}" alt=""><p class="title">${escapeHtml(card.title)}</p><p class="copy">${escapeHtml(card.body)}</p><span class="btn">${escapeHtml(card.button)}</span></article>`
    )
    .join("");
  return `<div class="row ${side}"><div class="${cards ? "stack" : "bubble"}"><p>${escapeHtml(bubble.text).replace(/\n/g, "<br>")}</p>${
    cards ? `<div class="cards">${cards}</div>` : ""
  }${buttons ? `<div class="buttons">${buttons}</div>` : ""}</div></div>`;
}

function phoneHtml(title: string, bubbles: RecipeBubble[], media: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { margin: 0; background: #0b192c; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; }
    .phone { width: 390px; background: #efeae2; }
    header { background: #075e54; color: white; padding: 28px 16px 12px; }
    header strong { display: block; font-size: 16px; }
    header span { font-size: 12px; opacity: .85; }
    main { padding: 12px; }
    h1 { margin: 0 0 10px; font-size: 13px; color: #3b4a54; font-weight: 600; }
    .row { display: flex; margin: 8px 0; }
    .agence { justify-content: flex-start; width: 100%; }
    .agence .stack { width: 100%; box-sizing: border-box; }
    .client { justify-content: flex-end; }
    .bubble, .stack { max-width: 100%; border-radius: 10px; padding: 8px 10px; font-size: 14px; line-height: 1.35; color: #111b21; }
    .agence .bubble, .agence .stack { background: #fff; }
    .client .bubble { background: #d9fdd3; max-width: 86%; }
    .bubble p, .stack p { margin: 0; }
    .cards { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
    .card { width: 168px; background: #f7f4ef; border-radius: 10px; overflow: hidden; }
    .card img { display: block; width: 100%; height: 72px; object-fit: cover; background: #0b192c; }
    .card .title { margin: 8px 8px 0; font-size: 13px; font-weight: 700; }
    .card .copy { margin: 4px 8px 8px; font-size: 11px; color: #3b4a54; }
    .card .btn { margin: 0 8px 8px; }
    .buttons { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
    .btn { display: block; text-align: center; background: #fff; color: #027eb5; border: 1px solid #d1d7db; border-radius: 16px; padding: 6px 8px; font-size: 13px; font-weight: 600; }
  </style></head><body><div class="phone"><header><strong>Travel BA</strong><span>Conciergerie · exemple fictif</span></header><main><h1>${escapeHtml(title)}</h1>${bubbles.map((bubble) => bubbleHtml(bubble, media)).join("")}</main></div></body></html>`;
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
  const bytes = await readFile(path.join(process.cwd(), "public/whatsapp/train-carte.jpg"));
  const media = `data:image/jpeg;base64,${bytes.toString("base64")}`;
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
      await page.setContent(phoneHtml(recipe.titre, bubbles, media), { waitUntil: "domcontentloaded" });
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
