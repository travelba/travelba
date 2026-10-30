import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  AGENCY_SEED_USERS,
  agencySeedAllowed,
  departurePlan,
  dossierIntervenants,
  googleStaffEmailAllowed,
  maskEmail,
  maskKeepLast,
  PERMISSIONS,
  redactIdentityFields,
  refundAlert,
  responsableChangeAllowed,
  responsableChangeSummary,
  roleAllows,
  sanitizeMatrixUpdate,
} from "./agency-access";
import {
  journalCanonical,
  journalChainIntact,
  journalCsv,
  journalDiffLines,
  journalRowHash,
  maskJournalTree,
} from "./agency-journal";
import { agencyGateDecision, classifyAgencyRoute, dossierRouteSummary, samplePathForRouteFile } from "./agency-routes";
import { adminNavGroups } from "./admin-nav";
import { loginErrorMessage } from "./staff-login";
import { isFreshAuthUser, isGoogleUser } from "./google-staff";

const ROLES = ["admin", "manager", "agent", "comptable", "lecture"] as const;

test("aucun périmètre par dossier : la matrice ne connaît plus « ses dossiers seulement »", () => {
  assert.equal((PERMISSIONS as readonly string[]).includes("view_all_dossiers"), false);
  assert.equal((PERMISSIONS as readonly string[]).includes("view_assigned_dossiers"), false);
});

test("l’agent voit tout, marges et finances comprises ; l’admin reste ouvert", () => {
  assert.equal(roleAllows("admin", "manage_users", { admin: { manage_users: false } }), true);
  assert.equal(roleAllows("partner", "edit_dossiers"), false);
  assert.equal(roleAllows("agent", "view_finances"), true);
  assert.equal(roleAllows("agent", "view_margins"), true);
  assert.equal(roleAllows("agent", "edit_finances"), true);
  assert.equal(roleAllows("agent", "create_pliant_card"), true);
  assert.equal(roleAllows("agent", "passport_reveal"), true);
  assert.equal(roleAllows("agent", "reassign_dossier"), false);
  assert.equal(roleAllows("agent", "manage_users"), false);
  assert.equal(roleAllows("agent", "export_data"), false);
  assert.equal(roleAllows("manager", "reassign_dossier"), true);
  assert.equal(roleAllows("manager", "manage_users"), false);
  assert.equal(roleAllows("comptable", "edit_finances"), true);
  assert.equal(roleAllows("comptable", "edit_dossiers"), false);
  assert.equal(roleAllows("comptable", "passport_reveal"), false);
  assert.equal(roleAllows("lecture", "edit_dossiers"), false);
  assert.equal(roleAllows("lecture", "view_inbox"), false);
  for (const role of ROLES) {
    assert.equal(typeof roleAllows(role, "edit_dossiers"), "boolean");
  }
  assert.equal(sanitizeMatrixUpdate([{ role: "admin", permission: "manage_users", allowed: false }]), null);
  assert.equal(sanitizeMatrixUpdate([{ role: "agent", permission: "view_inbox", allowed: false }])?.length, 1);
  assert.equal(sanitizeMatrixUpdate([{ role: "agent", permission: "view_all_dossiers", allowed: true }]), null);
});

test("le menu : l’agent garde Argent et Boîte ; la lecture seule les perd ; Journal pour qui a le droit", () => {
  const agent = adminNavGroups({
    role: "agent",
    allows: { view_finances: true, view_inbox: true, view_journal: false, manage_users: false },
  });
  assert.ok(agent.some((group) => group.id === "argent"));
  assert.ok(agent.some((group) => group.id === "boite"));
  assert.equal(agent.find((group) => group.id === "reglages")?.items.some((item) => item.href === "/admin/journal"), false);
  const lecture = adminNavGroups({
    role: "lecture",
    allows: { view_finances: false, view_inbox: false, view_journal: false, manage_users: false },
  });
  assert.equal(lecture.some((group) => group.id === "argent"), false);
  assert.equal(lecture.some((group) => group.id === "boite"), false);
  const manager = adminNavGroups({
    role: "manager",
    allows: { view_finances: true, view_inbox: true, view_journal: true, manage_users: false },
  });
  assert.ok(manager.find((group) => group.id === "reglages")?.items.some((item) => item.href === "/admin/journal"));
  const admin = adminNavGroups({ role: "admin", allows: null });
  assert.ok(admin.find((group) => group.id === "reglages")?.items.some((item) => item.href === "/admin/journal"));
});

test("Créé par, En charge, Intervenants : qui peut prendre, qui peut attribuer, ce que dit l’Historique", () => {
  const names = new Map([
    ["marie", "Marie"],
    ["coralie", "Coralie"],
    ["raphael", "Raphael"],
  ]);
  const people = dossierIntervenants({
    journalStaffIds: ["coralie", null, "marie", "coralie"],
    createdById: "raphael",
    ownerId: "marie",
    names,
  });
  assert.deepEqual(
    people.map((person) => person.name),
    ["Coralie", "Marie", "Raphael"]
  );
  assert.equal(responsableChangeAllowed({ actorId: "marie", canReassign: false, canEdit: true, nextOwnerId: "marie" }).ok, true);
  assert.equal(responsableChangeAllowed({ actorId: "marie", canReassign: false, canEdit: true, nextOwnerId: "coralie" }).ok, false);
  assert.equal(responsableChangeAllowed({ actorId: "marie", canReassign: true, canEdit: false, nextOwnerId: "coralie" }).ok, true);
  assert.equal(responsableChangeAllowed({ actorId: "robin", canReassign: false, canEdit: false, nextOwnerId: "robin" }).ok, false);
  assert.equal(
    responsableChangeSummary({ previousName: null, nextName: "Marie", selfTake: true }),
    "Prend le dossier en charge (avant : à prendre)."
  );
  assert.equal(
    responsableChangeSummary({ previousName: "Marie", nextName: "Coralie", selfTake: false }),
    "En charge : Marie → Coralie."
  );
  assert.equal(
    responsableChangeSummary({ previousName: "Marie", nextName: null, selfTake: false }),
    "Dossier remis à prendre (avant : Marie)."
  );
  assert.deepEqual(departurePlan({ ownedCount: 3, reassignToName: "Coralie", cutAccess: true }), [
    "Accès coupé et sessions fermées.",
    "3 dossiers réattribués à Coralie.",
  ]);
  assert.deepEqual(departurePlan({ ownedCount: 1, reassignToName: null, cutAccess: true }), [
    "Accès coupé et sessions fermées.",
    "1 dossier en charge reste à prendre.",
  ]);
  assert.deepEqual(departurePlan({ ownedCount: 0, reassignToName: null, cutAccess: false }), []);
});

test("connexion Google : domaine travelba.fr et collègue invité, vérifiés côté serveur", () => {
  const staff = ["marie@travelba.fr", "Coralie@Travelba.fr", ""];
  assert.deepEqual(googleStaffEmailAllowed("marie@travelba.fr", staff), { ok: true, email: "marie@travelba.fr" });
  assert.deepEqual(googleStaffEmailAllowed("coralie@travelba.fr", staff), { ok: true, email: "coralie@travelba.fr" });
  assert.deepEqual(googleStaffEmailAllowed("quelqu.un@gmail.com", staff), { ok: false, reason: "domaine" });
  assert.deepEqual(googleStaffEmailAllowed("marie@travelba.fr.evil.com", staff), { ok: false, reason: "domaine" });
  assert.deepEqual(googleStaffEmailAllowed("inconnu@travelba.fr", staff), { ok: false, reason: "inconnu" });
  assert.deepEqual(googleStaffEmailAllowed(null, staff), { ok: false, reason: "domaine" });
  assert.equal(isGoogleUser({ app_metadata: { provider: "google" }, identities: [] }), true);
  assert.equal(isGoogleUser({ app_metadata: { provider: "email", providers: ["email", "google"] }, identities: [] }), true);
  assert.equal(isGoogleUser({ app_metadata: { provider: "email" }, identities: [] }), false);
  const now = Date.parse("2026-10-30T09:00:00.000Z");
  assert.equal(isFreshAuthUser({ created_at: "2026-10-30T08:59:30.000Z" }, now), true);
  assert.equal(isFreshAuthUser({ created_at: "2026-10-29T08:59:30.000Z" }, now), false);
  assert.match(loginErrorMessage("google-domaine") || "", /travelba\.fr/);
  assert.match(loginErrorMessage("google-inconnu") || "", /invité/);
  assert.equal(loginErrorMessage("google-desactive"), "Cet accès est désactivé.");
  assert.equal(loginErrorMessage(null), null);
});

test("les alertes informent, le masque tient, le diff se lit avant → après", () => {
  assert.equal(refundAlert(12_050)?.summary, "Remboursement de 120,50 €.");
  assert.equal(refundAlert(null)?.summary, "Remboursement enregistré.");
  const masked = maskJournalTree({
    document_number: "12AB34567",
    pan: "4242424242424242",
    password: "secret",
    note: "ok",
  }) as Record<string, string>;
  assert.equal(masked.password, "[masqué]");
  assert.equal(masked.pan, "[masqué]");
  assert.equal(masked.document_number.endsWith("567"), true);
  assert.equal(masked.document_number.includes("12AB"), false);
  assert.equal(maskKeepLast("ABCD").endsWith("BCD"), true);
  assert.equal(maskEmail("benjamin@travelba.fr"), "b•••@travelba.fr");
  const doc = redactIdentityFields({ number: "12AB34567", doc_type: "passport" }, false);
  assert.equal(String(doc.number).includes("12AB"), false);
  const lines = journalDiffLines({ en_charge: { avant: "À prendre", apres: "Marie" }, actif: false, masked: true });
  assert.deepEqual(lines, [
    { key: "en_charge", label: "En charge", before: "À prendre", after: "Marie" },
    { key: "actif", label: "Actif", before: null, after: "non" },
  ]);
  assert.deepEqual(journalDiffLines(null), []);
  const csv = journalCsv([
    {
      occurred_at: "2026-10-24",
      actor: "Alex",
      action: "Création",
      entity_type: "Dossier",
      entity_id: "",
      summary: "Création d’un dossier",
    },
  ]);
  assert.match(csv, /Quand,Qui/);
  assert.equal(csv.includes("4242"), false);
});

test("la chaîne de hash reprend le calcul prev|canonical", async () => {
  const canonical = journalCanonical({
    action: "update",
    entityType: "setting",
    entityId: null,
    summary: "Matrice",
    diff: { ok: true },
  });
  const first = await journalRowHash(null, canonical);
  const secondCanonical = journalCanonical({
    action: "create",
    entityType: "dossier",
    entityId: "x",
    summary: "Dossier",
    diff: null,
  });
  const second = await journalRowHash(first, secondCanonical);
  assert.equal(
    await journalChainIntact([
      { prev_hash: null, row_hash: first, canonical },
      { prev_hash: first, row_hash: second, canonical: secondCanonical },
    ]),
    true
  );
  assert.equal(
    await journalChainIntact([{ prev_hash: null, row_hash: "non", canonical }]),
    false
  );
});

test("la garde : l’agent d’aujourd’hui passe, les rôles sans droit sont refusés, aucun périmètre de dossier", () => {
  assert.equal(
    agencyGateDecision({ role: "agent", active: true, matrixReady: false, audience: "staff", permission: "view_finances", allows: false }).allow,
    true
  );
  assert.equal(
    agencyGateDecision({ role: "lecture", active: true, matrixReady: true, audience: "staff", permission: "edit_dossiers", allows: false }).status,
    403
  );
  assert.equal(
    agencyGateDecision({ role: "partner", active: true, matrixReady: true, audience: "partner", permission: null, allows: false }).allow,
    true
  );
  assert.equal(
    agencyGateDecision({ role: "partner", active: true, matrixReady: true, audience: "staff", permission: null, allows: false }).status,
    403
  );
  assert.equal(
    agencyGateDecision({ role: "agent", active: false, matrixReady: false, audience: "staff", permission: null, allows: true }).status,
    403
  );
  assert.equal(
    agencyGateDecision({ role: null, active: true, matrixReady: true, audience: "staff", permission: null, allows: false }).status,
    401
  );
  const id = "11111111-1111-4111-8111-111111111111";
  const responsable = classifyAgencyRoute("PATCH", `/api/admin/bookings/${id}/responsable`);
  assert.equal(responsable?.permission, "edit_dossiers");
  assert.equal(responsable?.journal, false);
  const depart = classifyAgencyRoute("POST", `/api/admin/equipe/${id}/depart`);
  assert.equal(depart?.permission, "manage_users");
  assert.equal(depart?.journal, false);
  assert.equal(dossierRouteSummary("POST", `/api/admin/bookings/${id}/extras`)?.startsWith("Options du séjour"), true);
  assert.equal(classifyAgencyRoute("PATCH", `/api/admin/bookings/${id}/items/abc`)?.summary, "Étape du carnet modifiée.");
  assert.equal(classifyAgencyRoute("POST", "/api/admin/bookings")?.summary, "Dossier créé.");
});

test("chaque mutation admin est classée ; elle est journalisée par la garde ou par la route", () => {
  const root = join(process.cwd(), "app/api/admin");
  const files = walk(root).filter((file) => file.endsWith("route.ts"));
  assert.ok(files.length > 40);
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const relative = file.slice(process.cwd().length + 1);
    for (const method of ["POST", "PATCH", "PUT", "DELETE"] as const) {
      if (!new RegExp(`export async function ${method}\\b`).test(text)) continue;
      const path = samplePathForRouteFile(relative);
      const classified = classifyAgencyRoute(method, path);
      assert.ok(classified, `${method} ${path}`);
      if (classified.audience !== "public") {
        // staff-departure écrit lui-même une ligne par geste (accès coupé, chaque dossier réattribué).
        assert.ok(classified.journal || /recordAgencyJournal|staff-departure/.test(text), `${method} ${path} sans journal`);
      }
    }
  }
  const scan = readFileSync(join(process.cwd(), "app/api/admin/travel-documents/scan/route.ts"), "utf8");
  const cards = readFileSync(join(process.cwd(), "app/api/admin/pliant/cards/route.ts"), "utf8");
  const bookingCards = readFileSync(join(process.cwd(), "app/api/admin/bookings/[id]/cards/route.ts"), "utf8");
  const archive = readFileSync(join(process.cwd(), "app/api/admin/bookings/[id]/route.ts"), "utf8");
  assert.match(scan, /passport_reveal/);
  assert.match(cards, /create_pliant_card/);
  assert.doesNotMatch(cards, /pliantCeilingAllows|ceiling/);
  assert.match(bookingCards, /card_reveal/);
  assert.match(archive, /delete_archive/);
});

test("la migration : idempotente, append-only, sans backfill de responsable, sans périmètre ni plafond", () => {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261030090000_agency_access.sql"), "utf8");
  assert.match(sql, /as restrictive/);
  assert.match(sql, /journal append-only/);
  assert.match(sql, /created_by_staff_id/);
  assert.match(sql, /owner_staff_id/);
  assert.doesNotMatch(sql, /benjamin@travelba\.fr/);
  assert.doesNotMatch(sql, /set owner_staff_id\s*=/i);
  assert.doesNotMatch(sql, /pliant_agent_ceiling_cents integer/);
  assert.doesNotMatch(sql, /create or replace function crm_private\.can_read_booking/);
  assert.doesNotMatch(sql, /'view_all_dossiers'\)/);
  assert.equal(/grant\s+(insert|update|delete)[\s\S]{0,80}crm_agency_journal/i.test(sql), false);
  assert.match(sql, /'manager'/);
  assert.match(sql, /'comptable'/);
  assert.match(sql, /'lecture'/);
  assert.match(sql, /'partner'/);
  assert.match(sql, /'role_change'/);
  assert.match(sql, /'refund'/);
  for (const statement of sql.split("\n").filter((line) => /^create table/i.test(line))) {
    assert.match(statement, /if not exists/i);
  }
  assert.equal(agencySeedAllowed("fsmfozxgujskluxakeoq"), false);
  assert.equal(agencySeedAllowed("autre-projet"), true);
  assert.equal(AGENCY_SEED_USERS.some((user) => user.role === "lecture"), true);
  assert.equal(AGENCY_SEED_USERS.every((user) => user.email.endsWith(".invalid")), true);
  const seed = readFileSync(join(process.cwd(), "scripts/seed-agency-roles.mjs"), "utf8");
  assert.match(seed, /fsmfozxgujskluxakeoq/);
});

function walk(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found.push(...walk(path));
    else found.push(path);
  }
  return found;
}
