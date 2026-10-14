/**
 * Vérifie l’accès à la base partners MB3M.
 * Lit MB3M_API_USER et MB3M_API_PASSWORD (environnement, sinon .env.local).
 * N’écrit aucune fiche et n’affiche pas les identifiants.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mb3mAgencyNames, mb3mConfigured } from "../lib/crm/mb3m";

function loadLocalEnv() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key]?.trim()) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

async function main() {
  loadLocalEnv();
  if (!mb3mConfigured()) {
    console.error("MB3M n’est pas configuré.");
    process.exit(1);
  }
  const names = await mb3mAgencyNames();
  const point = names.includes("Agence 1750") ? "présent" : "absent";
  console.log(`MB3M : ${names.length} agences sur la base partners. Point de vente Agence 1750 : ${point}.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Échec MB3M.");
  process.exit(1);
});
