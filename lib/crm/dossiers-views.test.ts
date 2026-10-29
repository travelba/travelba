import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { DOSSIERS_VIEW_LABELS, DOSSIERS_VIEWS, dossiersHref, dossiersViewFromParam, LEGACY_DOSSIERS_ROUTES } from "./dossiers-views";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("Dossiers a quatre vues : La semaine, Liste, Formalités, Services à confirmer", () => {
  assert.deepEqual([...DOSSIERS_VIEWS], ["semaine", "liste", "formalites", "services"]);
  assert.deepEqual(
    DOSSIERS_VIEWS.map((view) => DOSSIERS_VIEW_LABELS[view]),
    ["La semaine", "Liste", "Formalités", "Services à confirmer"]
  );
  assert.equal(dossiersViewFromParam(undefined), "semaine");
  assert.equal(dossiersViewFromParam("liste"), "liste");
  assert.equal(dossiersViewFromParam("Formalites"), "formalites");
  assert.equal(dossiersViewFromParam("ailleurs"), "semaine");
  assert.equal(dossiersHref("semaine"), "/admin/reservations");
  assert.equal(dossiersHref("services"), "/admin/reservations?vue=services");
});

test("les anciennes pages Formalités et Services redirigent vers la vue de Dossiers", () => {
  assert.equal(LEGACY_DOSSIERS_ROUTES["/admin/formalites"], "formalites");
  assert.equal(LEGACY_DOSSIERS_ROUTES["/admin/services"], "services");
  for (const route of ["formalites", "services"]) {
    const page = readFileSync(join(root, `app/admin/${route}/page.tsx`), "utf8");
    assert.match(page, /redirect\(dossiersHref\(LEGACY_DOSSIERS_ROUTES\[/, route);
  }
  const list = readFileSync(join(root, "app/admin/reservations/page.tsx"), "utf8");
  assert.match(list, /title="Dossiers"/);
  assert.equal(list.includes('title="Réservations"'), false);
  assert.match(list, /<FormalitesPanel supabase=\{supabase\} \/>/);
  assert.match(list, /<ServicesPanel supabase=\{supabase\} \/>/);
});

test("Nouveau dossier : une seule zone de dépôt, Saisir à la main dedans, Créer le dossier", () => {
  const form = readFileSync(join(root, "components/admin/NewBookingForm.tsx"), "utf8");
  assert.equal(form.includes("Saisie manuelle"), false);
  assert.equal(form.includes("ManualNewBookingForm"), false);
  assert.match(form, /<BookingIngest/);
  const ingest = readFileSync(join(root, "components/crm/BookingIngest.tsx"), "utf8");
  assert.match(ingest, /Saisir à la main/);
  assert.match(ingest, /"Créer le dossier"/);
});

test("Clients : Pièces à échéance est un filtre de la liste, Créer la fiche puis Inviter", () => {
  const page = readFileSync(join(root, "app/admin/clients/page.tsx"), "utf8");
  assert.match(page, /filter === "echeance"/);
  assert.match(page, /params\.pieces\) === "echeance"\) redirect\(/);
  assert.equal(page.includes('title="Pièces à échéance"'), false);
  const filters = readFileSync(join(root, "components/admin/ClientsFilters.tsx"), "utf8");
  assert.match(filters, /<option value="echeance">Pièces à échéance<\/option>/);
  const create = readFileSync(join(root, "components/admin/NewCustomerForm.tsx"), "utf8");
  assert.match(create, /"Créer la fiche"/);
  const invite = readFileSync(join(root, "components/admin/InviteCustomerPanel.tsx"), "utf8");
  assert.match(invite, /status === "none" \? "Inviter"/);
  const fiche = readFileSync(join(root, "app/admin/clients/[id]/page.tsx"), "utf8");
  assert.match(fiche, /<StatementRequest endpoint=\{`\/api\/admin\/clients\/\$\{c\.id\}\/releve`\} audience="staff" \/>/);
});
