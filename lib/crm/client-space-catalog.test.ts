import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import { CLIENT_SPACE_ACTIONS, classifyClientSpace, isTripShareAsk, shareAddressee, shareClientHint } from "./client-space-catalog";

function walk(dir: string, out: string[] = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (entry.name === "route.ts") out.push(path);
  }
  return out;
}

test("chaque route de l’espace client a un outil concierge", () => {
  const root = join(process.cwd(), "app/api/client");
  const missing: string[] = [];
  for (const file of walk(root)) {
    const route = `/${relative(join(process.cwd(), "app"), file).replace(/\/route\.ts$/, "")}`;
    const text = readFileSync(file, "utf8");
    const methods = [...text.matchAll(/export async function (GET|POST|PATCH|DELETE)/g)].map((match) => match[1]);
    for (const method of methods) {
      const found = CLIENT_SPACE_ACTIONS.some((row) => row.route === route && row.method === method);
      if (!found) missing.push(`${method} ${route}`);
    }
  }
  assert.deepEqual(missing, []);
  const pages = walk(join(process.cwd(), "app/mon-compte")).filter((file) => file.endsWith("page.tsx"));
  // walk only finds route.ts. Pages are listed by hand below.
  assert.ok(pages.length === 0);
  const pageFiles = readdirPages(join(process.cwd(), "app/mon-compte"));
  const uncovered = pageFiles.filter((page) => !CLIENT_SPACE_ACTIONS.some((row) => row.page === page));
  assert.deepEqual(uncovered, []);
});

function readdirPages(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) readdirPages(path, out);
    else if (entry.name === "page.tsx") {
      out.push(`/${relative(join(process.cwd(), "app"), path).replace(/\/page\.ts$/, "").replace(/\/page\.tsx$/, "")}`);
    }
  }
  return out;
}

test("un numéro à ajouter n’est pas un autre geste", () => {
  assert.equal(classifyClientSpace("Peux tu ajouter le numéro de téléphone de Victoria 06 12 34 56 78 ?"), null);
});

const VICTORIA_SENTENCE =
  "Est-ce que tu peux envoyer la réservation partagée la réservation de Nice par WhatsApp à Victoria";

test("la phrase de Victoria est un partage, et Nice n’est pas la destinataire", () => {
  const found = classifyClientSpace(VICTORIA_SENTENCE);
  assert.equal(found?.id, "partager_carnet");
  assert.equal(found?.name, "Victoria");
  assert.equal(found?.clientName, "Nice");
  assert.equal(shareAddressee(VICTORIA_SENTENCE), "Victoria");
  assert.equal(isTripShareAsk("Peux-tu partager le voyage ?"), true);
});

test("le partage reconnaît le verbe, l’objet et le prénom", () => {
  const verbs = ["envoyer", "envoie", "envoyez", "partager", "partage", "partagé", "partagée", "partagés", "partagées"];
  const objects = ["carnet", "lien", "séjour", "réservation", "voyage", "dossier"];
  for (const verb of verbs) {
    for (const object of objects) {
      const message = `${verb} le ${object} à victoria`;
      const found = classifyClientSpace(message);
      assert.equal(found?.id, "partager_carnet", message);
      assert.equal(found?.name, "victoria", message);
    }
  }
  assert.equal(shareClientHint("Envoie la réservation de Camille Martin à Victoria", "Victoria"), "Camille Martin");
  assert.equal(classifyClientSpace("Envoie le séjour TB-2026-0096 à Victoria")?.reference, "TB-2026-0096");
});

test("annuler le séjour reste à l’agence, annuler l’hôtel est le geste du client", () => {
  assert.equal(classifyClientSpace("Annulez mon séjour s’il vous plaît"), null);
  assert.equal(classifyClientSpace("Annule l’hôtel Mondrian")?.id, "annuler_hotel");
  assert.equal(classifyClientSpace("Je veux payer mon encours")?.id, "regler_encours");
  assert.equal(classifyClientSpace("Change mon mot de passe")?.id, "mot_de_passe");
  assert.equal(classifyClientSpace("Ajoute l’accompagnateur Marie Martin")?.id, "ajouter_accompagnateur");
  assert.equal(classifyClientSpace("Importe ce PDF dans le dossier")?.id, "import_dossier");
});
