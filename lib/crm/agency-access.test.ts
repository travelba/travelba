import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  AGENCY_OWNER_EMAIL,
  AGENCY_SEED_USERS,
  agencySeedAllowed,
  bookingVisibleTo,
  maskEmail,
  maskKeepLast,
  pliantCeilingAllows,
  redactIdentityFields,
  roleAllows,
  sanitizeMatrixUpdate,
} from "./agency-access";
import { journalCanonical, journalChainIntact, journalCsv, journalRowHash, maskJournalTree } from "./agency-journal";
import { agencyGateDecision, classifyAgencyRoute, samplePathForRouteFile } from "./agency-routes";

const ROLES = ["admin", "manager", "agent", "comptable", "lecture"] as const;

test("la matrice par défaut suit les rôles, l’admin reste ouvert", () => {
  assert.equal(roleAllows("admin", "manage_users", { admin: { manage_users: false } }), true);
  assert.equal(roleAllows("partner", "view_all_dossiers"), false);
  assert.equal(roleAllows("manager", "view_all_dossiers"), true);
  assert.equal(roleAllows("manager", "manage_users"), false);
  assert.equal(roleAllows("manager", "edit_finances"), false);
  assert.equal(roleAllows("manager", "pay_supplier"), false);
  assert.equal(roleAllows("agent", "view_all_dossiers"), false);
  assert.equal(roleAllows("agent", "view_assigned_dossiers"), true);
  assert.equal(roleAllows("agent", "view_finances"), false);
  assert.equal(roleAllows("agent", "export_data"), false);
  assert.equal(roleAllows("agent", "create_pliant_card"), true);
  assert.equal(roleAllows("comptable", "edit_finances"), true);
  assert.equal(roleAllows("comptable", "edit_dossiers"), false);
  assert.equal(roleAllows("comptable", "passport_reveal"), false);
  assert.equal(roleAllows("lecture", "view_all_dossiers"), true);
  assert.equal(roleAllows("lecture", "edit_dossiers"), false);
  assert.equal(roleAllows("lecture", "view_inbox"), false);
  for (const role of ROLES) {
    assert.equal(typeof roleAllows(role, "view_assigned_dossiers"), "boolean");
  }
  assert.equal(sanitizeMatrixUpdate([{ role: "admin", permission: "manage_users", allowed: false }]), null);
  assert.equal(sanitizeMatrixUpdate([{ role: "agent", permission: "view_inbox", allowed: false }])?.length, 1);
});

test("un agent voit son dossier, le pool, pas celui d’un autre", () => {
  const base = { role: "agent" as const, staffId: "moi", assigneeIds: [] as string[] };
  assert.equal(bookingVisibleTo({ ...base, ownerStaffId: null }), true);
  assert.equal(bookingVisibleTo({ ...base, ownerStaffId: "moi" }), true);
  assert.equal(bookingVisibleTo({ ...base, ownerStaffId: "autre", assigneeIds: ["moi"] }), true);
  assert.equal(bookingVisibleTo({ ...base, ownerStaffId: "autre" }), false);
  assert.equal(bookingVisibleTo({ ...base, role: "lecture", ownerStaffId: "autre" }), true);
  assert.equal(bookingVisibleTo({ ...base, role: "partner", ownerStaffId: null }), false);
});

test("le plafond Pliant et le masque", () => {
  assert.equal(pliantCeilingAllows("admin", null).ok, true);
  assert.equal(pliantCeilingAllows("manager", 9_000_000).ok, true);
  assert.equal(pliantCeilingAllows("agent", 200_000).ok, true);
  assert.equal(pliantCeilingAllows("agent", 200_001).ok, false);
  assert.equal(pliantCeilingAllows("lecture", 100).ok, false);
  assert.equal(pliantCeilingAllows("comptable", 100).ok, false);
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

test("la garde laisse l’agent d’aujourd’hui et ferme les nouveaux rôles", () => {
  assert.equal(
    agencyGateDecision({
      role: "agent",
      active: true,
      matrixReady: false,
      audience: "staff",
      permission: "view_finances",
      allows: false,
      bookingScoped: false,
      bookingVisible: null,
    }).allow,
    true
  );
  assert.equal(
    agencyGateDecision({
      role: "lecture",
      active: true,
      matrixReady: true,
      audience: "staff",
      permission: "edit_dossiers",
      allows: false,
      bookingScoped: false,
      bookingVisible: null,
    }).status,
    403
  );
  assert.equal(
    agencyGateDecision({
      role: "partner",
      active: true,
      matrixReady: true,
      audience: "partner",
      permission: null,
      allows: false,
      bookingScoped: false,
      bookingVisible: null,
    }).allow,
    true
  );
  assert.equal(
    agencyGateDecision({
      role: "partner",
      active: true,
      matrixReady: true,
      audience: "staff",
      permission: null,
      allows: false,
      bookingScoped: false,
      bookingVisible: null,
    }).status,
    403
  );
  assert.equal(
    agencyGateDecision({
      role: "agent",
      active: false,
      matrixReady: false,
      audience: "staff",
      permission: null,
      allows: true,
      bookingScoped: false,
      bookingVisible: null,
    }).status,
    403
  );
  assert.equal(
    agencyGateDecision({
      role: "agent",
      active: true,
      matrixReady: true,
      audience: "staff",
      permission: "edit_dossiers",
      allows: true,
      bookingScoped: true,
      bookingVisible: false,
    }).status,
    404
  );
  assert.equal(
    agencyGateDecision({
      role: null,
      active: true,
      matrixReady: true,
      audience: "staff",
      permission: null,
      allows: false,
      bookingScoped: false,
      bookingVisible: null,
    }).status,
    401
  );
});

test("chaque mutation admin est classée et journalisée", () => {
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
        assert.equal(classified.journal, true, `${method} ${path}`);
      }
    }
  }
  const scan = readFileSync(join(process.cwd(), "app/api/admin/travel-documents/scan/route.ts"), "utf8");
  const cards = readFileSync(join(process.cwd(), "app/api/admin/pliant/cards/route.ts"), "utf8");
  const archive = readFileSync(join(process.cwd(), "app/api/admin/bookings/[id]/route.ts"), "utf8");
  assert.match(scan, /passport_reveal/);
  assert.match(cards, /create_pliant_card/);
  assert.match(archive, /delete_archive/);
});

test("la migration est restrictive, append-only, et ne vide pas les dossiers", () => {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261025004500_agency_access.sql"), "utf8");
  assert.match(sql, /as restrictive/);
  assert.match(sql, /journal append-only/);
  assert.match(sql, new RegExp(AGENCY_OWNER_EMAIL.replace(".", "\\.")));
  assert.match(sql, /where owner_staff_id is null/);
  assert.equal(/grant\s+(insert|update|delete)[\s\S]{0,80}crm_agency_journal/i.test(sql), false);
  assert.match(sql, /'manager'/);
  assert.match(sql, /'comptable'/);
  assert.match(sql, /'lecture'/);
  assert.match(sql, /'partner'/);
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
