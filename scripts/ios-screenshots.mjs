/**
 * Captures de l’aperçu /exemple (données fictives) et composition App Store.
 * 6,9" 1320×2868 et 6,5" 1284×2778. Aucun client réel.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import sharp from "sharp";

const root = join(import.meta.dirname, "..");
const out = join(root, "mobile/store-assets/screenshots");
const base = process.env.SCREENSHOT_BASE || "http://127.0.0.1:3000";

const SCREENS = [
  {
    slug: "01-sejour",
    path: "/exemple",
    kicker: "L’espace client",
    title: "Votre séjour,\ndans la poche.",
    text: "Le carnet publié par l’agence : vols, hôtel et documents du voyage.",
  },
  {
    slug: "02-carnet",
    path: "/exemple/reservations/TB-EXEMPLE-0001",
    kicker: "Le carnet",
    title: "Chaque étape,\nà sa place.",
    text: "Les villes du séjour, les horaires du dossier, les pièces jointes.",
  },
  {
    slug: "03-reservations",
    path: "/exemple/reservations",
    kicker: "Les voyages",
    title: "Tous vos séjours,\nau même endroit.",
    text: "Le prochain départ, avec la photo du lieu.",
  },
  {
    slug: "04-hotel",
    path: "/exemple/reservations/TB-EXEMPLE-0001",
    scrollText: "Maison Horizon",
    kicker: "L’hôtel",
    title: "La nuit,\net ce qui suit.",
    text: "L’hôtel du dossier, le transfert, puis la suite du voyage.",
  },
  {
    slug: "05-pieces",
    path: "/exemple/profil/documents",
    kicker: "Les pièces",
    title: "Passeports et pièces,\nau coffre.",
    text: "Une photo depuis l’application, puis la lecture par l’agence.",
  },
  {
    slug: "06-compte",
    path: "/exemple/profil",
    kicker: "Votre compte",
    title: "Vos coordonnées,\nrien de plus.",
    text: "Le téléphone, les voyageurs du foyer, et la facturation.",
  },
];

const FRAMES = [
  { folder: "iphone-6.9", cssWidth: 440, cssHeight: 956, width: 1320, height: 2868 },
  { folder: "iphone-6.5", cssWidth: 428, cssHeight: 926, width: 1284, height: 2778 },
];

async function fontFace() {
  const urls = [
    "https://cdn.jsdelivr.net/fontsource/fonts/plus-jakarta-sans@5.2.5/latin-700-normal.woff2",
    "https://cdn.jsdelivr.net/fontsource/fonts/plus-jakarta-sans@5.2.5/latin-500-normal.woff2",
  ];
  const faces = [];
  for (const [index, url] of urls.entries()) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const bytes = Buffer.from(await response.arrayBuffer());
      const path = `/tmp/tba-jakarta-${index}.woff2`;
      await writeFile(path, bytes);
      faces.push(`@font-face{font-family:"TBA";font-weight:${index === 0 ? 700 : 500};src:url("file://${path}") format("woff2");}`);
    } catch {
      /* repli système */
    }
  }
  return faces.join("");
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function compose(shot, frame, screen, faces) {
  const caption = Math.round(frame.height * 0.3);
  const gap = Math.round(frame.width * 0.045);
  const availableH = frame.height - caption - gap;
  const availableW = frame.width - gap * 2;
  const scale = Math.min(availableW / frame.width, availableH / frame.height);
  const drawW = Math.round(frame.width * scale);
  const drawH = Math.round(frame.height * scale);
  const left = Math.round((frame.width - drawW) / 2);
  const top = caption;
  const radius = Math.round(drawW * 0.045);
  const rounded = await sharp(shot)
    .resize(drawW, drawH)
    .composite([
      {
        input: Buffer.from(
          `<svg width="${drawW}" height="${drawH}"><rect x="0" y="0" width="${drawW}" height="${drawH}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`
        ),
        blend: "dest-in",
      },
    ])
    .png()
    .toBuffer();

  const title = escapeHtml(screen.title).replace(/\n/g, "<br>");
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    ${faces}
    html,body{margin:0;width:${frame.width}px;height:${frame.height}px;background:#0B192C;color:#FAF9F6;font-family:"TBA","Plus Jakarta Sans",Georgia,serif;}
    .wrap{padding:${Math.round(frame.width * 0.08)}px ${gap}px 0;}
    .kicker{margin:0;color:#C5A880;letter-spacing:.18em;text-transform:uppercase;font-weight:700;font-size:${Math.round(frame.width * 0.028)}px;}
    h1{margin:${Math.round(frame.width * 0.03)}px 0 0;font-weight:700;letter-spacing:-.035em;line-height:.98;font-size:${Math.round(frame.width * 0.078)}px;}
    p{margin:${Math.round(frame.width * 0.028)}px 0 0;max-width:18em;color:#E7E1D6;font-weight:500;line-height:1.35;font-size:${Math.round(frame.width * 0.032)}px;}
  </style></head><body><div class="wrap"><p class="kicker">${escapeHtml(screen.kicker)}</p><h1>${title}</h1><p>${escapeHtml(screen.text)}</p></div></body></html>`;

  return { html, rounded, left, top };
}

const faces = await fontFace();
const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars"],
});

try {
  for (const frame of FRAMES) {
    const dir = join(out, frame.folder);
    await mkdir(dir, { recursive: true });
    const page = await browser.newPage();
    await page.setViewport({ width: frame.cssWidth, height: frame.cssHeight, deviceScaleFactor: 3 });
    for (const screen of SCREENS) {
      await page.goto(base + screen.path, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.evaluate((scrollText) => {
        const style = document.createElement("style");
        style.textContent = "nextjs-portal{display:none !important}";
        document.head.appendChild(style);
        document.querySelectorAll("p").forEach((node) => {
          if ((node.textContent || "").includes("Aperçu local")) node.style.display = "none";
        });
        if (!scrollText) return;
        const node = [...document.querySelectorAll("h2, h3, p, article, li")].find((item) => {
          const text = (item.textContent || "").replace(/\s+/g, " ");
          return text.includes(scrollText) && text.length < 80;
        });
        if (!node) return;
        const top = node.getBoundingClientRect().top + window.scrollY - 96;
        window.scrollTo(0, Math.max(0, top));
      }, screen.scrollText || "");
      await page
        .waitForFunction(() => {
          const images = [...document.querySelectorAll("img")];
          return images.length === 0 || images.every((img) => img.complete && img.naturalWidth > 0);
        }, { timeout: 8000 })
        .catch(() => {});
      await page.evaluate(() => {
        const tab = document.querySelector(".account-tabbar");
        const main = document.querySelector("main");
        if (!tab || !main) return;
        const gap = () => tab.getBoundingClientRect().top - bottomOf(main);
        function bottomOf(root) {
          let bottom = 0;
          for (const node of root.querySelectorAll("article, section, a, li, form")) {
            const rect = node.getBoundingClientRect();
            if (rect.width < 160 || rect.height < 28) continue;
            if (rect.bottom > bottom) bottom = rect.bottom;
          }
          return bottom;
        }
        const missing = gap();
        if (missing < 120) return;
        const blocks = [...main.querySelectorAll("article, section")].filter(
          (node) => node.getBoundingClientRect().height > 48
        );
        const last = blocks.at(-1);
        if (!last) return;
        const frame = last.querySelector("[class*='h-']") || last;
        const rect = frame.getBoundingClientRect();
        frame.style.height = `${Math.round(rect.height + missing - 16)}px`;
        frame.style.minHeight = frame.style.height;
      });
      await new Promise((resolve) => setTimeout(resolve, 250));
      const shot = await page.screenshot({ type: "png" });
      const layout = await compose(shot, frame, screen, faces);
      const poster = await browser.newPage();
      await poster.setViewport({ width: frame.width, height: frame.height, deviceScaleFactor: 1 });
      await poster.setContent(layout.html, { waitUntil: "load" });
      const basePng = await poster.screenshot({ type: "png" });
      await poster.close();
      const file = join(dir, `${screen.slug}.png`);
      await sharp(basePng)
        .composite([{ input: layout.rounded, left: layout.left, top: layout.top }])
        .flatten({ background: "#0B192C" })
        .removeAlpha()
        .png()
        .toFile(file);
      const meta = await sharp(file).metadata();
      console.log(frame.folder, screen.slug, meta.width, meta.height, "alpha", meta.hasAlpha);
    }
    await page.close();
  }
} finally {
  await browser.close();
}
