import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const source = join(root, "node_modules/@sparticuz/chromium/bin");
const dest = join(root, "vendor/chromium");
const names = ["chromium.br", "fonts.tar.br", "swiftshader.tar.br", "al2023.tar.br"];

if (!existsSync(source)) {
  console.error("[chromium] bin introuvable dans @sparticuz/chromium");
  process.exit(1);
}

mkdirSync(dest, { recursive: true });
for (const name of names) {
  const from = join(source, name);
  if (!existsSync(from)) {
    console.error(`[chromium] fichier manquant : ${name}`);
    process.exit(1);
  }
  copyFileSync(from, join(dest, name));
}
