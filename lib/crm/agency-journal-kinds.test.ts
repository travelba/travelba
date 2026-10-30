import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  activityPeriodStart,
  agentColor,
  agentInitials,
  agentSummary,
  cardLast4Of,
  centsFromAmount,
  familiesPresent,
  filterJournalRows,
  formatJournalAmount,
  groupJournalByDay,
  JOURNAL_FAMILIES,
  JOURNAL_KIND_DEFS,
  JOURNAL_KINDS,
  journalAuthor,
  journalBusinessFields,
  journalByline,
  journalDayKey,
  journalDayTitle,
  journalFamilyOf,
  journalIconOf,
  journalIsSensitive,
  journalKindOf,
  journalPhrase,
  journalToneOf,
  journalWhen,
  maskedCard,
  parisStartOfDay,
  parisStartOfWeek,
} from "./agency-journal-kinds";
import { journalCanonical } from "./agency-journal";
import { activityFiltersFromParams, activityHref } from "./agency-activity";
import { PERMISSIONS, PERMISSION_LABELS, roleAllows } from "./agency-access";
import { adminNavGroups } from "./admin-nav";

const ICON_NAMES = (() => {
  const source = readFileSync(join(process.cwd(), "components/crm/icons.tsx"), "utf8");
  return new Set([...source.matchAll(/^\s{2}([a-z_]+):\s/gm)].map((match) => match[1]));
})();

test("chaque étiquette métier a un libellé, une famille connue et une icône qui existe", () => {
  assert.ok(JOURNAL_KINDS.length > 30);
  for (const kind of JOURNAL_KINDS) {
    const def = JOURNAL_KIND_DEFS[kind];
    assert.ok(def.label.length > 2, kind);
    assert.ok((JOURNAL_FAMILIES as readonly string[]).includes(def.family), kind);
    assert.match(kind, /^[a-z][a-z0-9_]{1,59}$/, `${kind} doit passer la contrainte SQL`);
    const icon = journalIconOf({ kind, action: "update", entity_type: "dossier" });
    assert.ok(ICON_NAMES.has(icon), `${kind} → icône ${icon} absente de components/crm/icons.tsx`);
  }
});

test("une ligne ancienne sans étiquette est rangée d’après son action et son entité", () => {
  assert.equal(journalKindOf({ action: "login", entity_type: "session" }), "connexion");
  assert.equal(journalKindOf({ action: "login_failed", entity_type: "session" }), "connexion_refusee");
  assert.equal(journalKindOf({ action: "reveal", entity_type: "card" }), "carte_ouverte");
  assert.equal(journalKindOf({ action: "reveal", entity_type: "document" }), "passeport_ouvert");
  assert.equal(journalKindOf({ action: "update", entity_type: "finance" }), "paiement_rapproche");
  assert.equal(journalKindOf({ action: "create", entity_type: "dossier" }), "dossier_cree");
  assert.equal(journalKindOf({ action: "delete", entity_type: "dossier" }), "dossier_archive");
  assert.equal(journalKindOf({ action: "send", entity_type: "message" }), "message_envoye");
  assert.equal(journalKindOf({ kind: "option_posee", action: "update", entity_type: "dossier" }), "option_posee");
  assert.equal(journalKindOf({ kind: "inconnue", action: "update", entity_type: "user" }), "equipe_modifiee");
});

test("cartes en rouge, paiements et fournisseurs en orange : le filtre sensible les retient", () => {
  assert.equal(journalToneOf({ kind: "carte_emise", action: "create", entity_type: "card" }), "danger");
  assert.equal(journalToneOf({ kind: "paiement_recu", action: "create", entity_type: "finance" }), "warning");
  assert.equal(journalToneOf({ kind: "fournisseur_paye", action: "update", entity_type: "finance" }), "warning");
  assert.equal(journalToneOf({ kind: "option_posee", action: "create", entity_type: "dossier" }), "accent");
  assert.equal(journalToneOf({ kind: "responsable_attribue", action: "update", entity_type: "dossier" }), "success");
  assert.equal(journalIsSensitive({ kind: "carte_ouverte", action: "reveal", entity_type: "card" }), true);
  assert.equal(journalIsSensitive({ kind: "email_envoye", action: "send", entity_type: "message" }), false);
  assert.equal(journalFamilyOf({ kind: "dossier_pris", action: "update", entity_type: "dossier" }), "responsable");
});

test("montant et carte : « 2 450 € », « •••• 4821 », jamais un numéro complet", () => {
  assert.equal(formatJournalAmount(245000), "2\u00a0450\u00a0€");
  assert.equal(formatJournalAmount(123450), "1\u00a0234,50\u00a0€");
  assert.equal(formatJournalAmount(18000, "USD"), "180\u00a0USD");
  assert.equal(formatJournalAmount(null), null);
  assert.equal(maskedCard("4821"), "•••• 4821");
  assert.equal(maskedCard("4242424242424242"), null);
  assert.equal(cardLast4Of("•••• 4821"), "4821");
  assert.equal(cardLast4Of("4242424242424242"), "4242");
  assert.equal(cardLast4Of("12"), null);
  assert.equal(centsFromAmount("2 450,00"), 245000);
  assert.equal(centsFromAmount(180), 18000);
  assert.equal(centsFromAmount("abc"), null);
});

test("la phrase complète le résumé du montant et de la carte sans les répéter", () => {
  assert.equal(journalPhrase({ summary: "Option posée au Negresco.", amount_cents: 245000 }), "Option posée au Negresco, 2\u00a0450\u00a0€");
  assert.equal(
    journalPhrase({ summary: "Carte Pliant émise •••• 4821, plafond 2\u00a0450\u00a0€.", amount_cents: 245000, card_last4: "4821" }),
    "Carte Pliant émise •••• 4821, plafond 2\u00a0450\u00a0€"
  );
  assert.equal(journalPhrase({ summary: "Carte Pliant bloquée.", card_last4: "9930" }), "Carte Pliant bloquée •••• 9930");
});

test("l’auteur : le collègue, sinon le connecteur, sinon l’agence ; initiales et couleur stables", () => {
  assert.equal(journalAuthor({ staff_id: "s1", actor: "Marie Dupont" }), "Marie Dupont");
  assert.equal(journalAuthor({ staff_id: null, actor: "Agence", actor_label: "grok" }), "connecteur grok");
  assert.equal(journalAuthor({ staff_id: null, actor: "Agence" }), "Agence");
  assert.equal(agentInitials("Marie Dupont"), "MD");
  assert.equal(agentInitials("Coralie"), "CO");
  assert.equal(agentInitials("connecteur grok"), "CG");
  assert.deepEqual(agentColor("abc"), agentColor("abc"));
  assert.ok(agentColor("Marie").bg.startsWith("#"));
});

test("heure de Paris : « 30/10 à 14h32 », jours groupés, minuit et lundi de la semaine", () => {
  // 13:32 UTC le 30 octobre 2026 = 14:32 à Paris (heure d’hiver).
  const iso = "2026-10-30T13:32:00.000Z";
  assert.equal(journalWhen(iso), "30/10 à 14h32");
  assert.equal(journalByline("Marie", iso), "par Marie · 30/10 à 14h32");
  assert.equal(journalDayKey(iso), "2026-10-30");
  // 23:30 UTC = 00:30 à Paris le lendemain : la ligne va dans le jour suivant.
  assert.equal(journalDayKey("2026-10-30T23:30:00.000Z"), "2026-10-31");
  const now = new Date("2026-10-30T15:00:00.000Z");
  assert.equal(journalDayTitle("2026-10-30", now), "Aujourd’hui");
  assert.equal(journalDayTitle("2026-10-29", now), "Hier");
  assert.equal(journalDayTitle("2026-10-27", now), "mar. 27/10");
  assert.equal(parisStartOfDay(now).toISOString(), "2026-10-29T23:00:00.000Z");
  // Le 30 octobre 2026 est un vendredi : la semaine commence le lundi 26.
  assert.equal(parisStartOfWeek(now).toISOString(), "2026-10-25T23:00:00.000Z");
  // Été : minuit à Paris = 22:00 UTC la veille.
  assert.equal(parisStartOfDay(new Date("2026-07-15T10:00:00.000Z")).toISOString(), "2026-07-14T22:00:00.000Z");
  assert.equal(activityPeriodStart("jour", now).toISOString(), "2026-10-29T23:00:00.000Z");
  assert.equal(activityPeriodStart("semaine", now).toISOString(), "2026-10-25T23:00:00.000Z");
  assert.equal(activityPeriodStart("mois", now).toISOString(), "2026-09-30T22:00:00.000Z");
  const grouped = groupJournalByDay([
    { occurred_at: "2026-10-30T13:32:00.000Z" },
    { occurred_at: "2026-10-30T08:00:00.000Z" },
    { occurred_at: "2026-10-29T18:00:00.000Z" },
  ]);
  assert.deepEqual(
    grouped.map((group) => [group.day, group.rows.length]),
    [
      ["2026-10-30", 2],
      ["2026-10-29", 1],
    ]
  );
});

const ROWS = [
  { seq: 5, occurred_at: "2026-10-30T13:32:00.000Z", staff_id: "marie", actor: "Marie", action: "create", entity_type: "card", summary: "Carte Pliant émise", kind: "carte_emise", booking_id: "b1", amount_cents: 245000 },
  { seq: 4, occurred_at: "2026-10-30T12:00:00.000Z", staff_id: "marie", actor: "Marie", action: "create", entity_type: "dossier", entity_id: "b1", summary: "Option posée", kind: "option_posee" },
  { seq: 3, occurred_at: "2026-10-30T10:00:00.000Z", staff_id: "raphael", actor: "Raphael", action: "update", entity_type: "dossier", entity_id: "b2", summary: "En charge : à prendre → Coralie", kind: "responsable_attribue" },
  { seq: 2, occurred_at: "2026-10-29T10:00:00.000Z", staff_id: "coralie", actor: "Coralie", action: "update", entity_type: "finance", summary: "Fournisseur payé", kind: "fournisseur_paye", booking_id: "b2", amount_cents: 18000 },
  { seq: 1, occurred_at: "2026-10-28T10:00:00.000Z", staff_id: null, actor: "Agence", actor_label: "grok", action: "update", entity_type: "dossier", entity_id: "b1", summary: "Dossier mis à jour (connecteur)", kind: "dossier_modifie" },
];

test("filtres : type, collègue, dossier, cartes et paiements seulement ; familles présentes dans l’ordre", () => {
  assert.deepEqual(filterJournalRows(ROWS, { family: "carte" }).map((row) => row.seq), [5]);
  assert.deepEqual(filterJournalRows(ROWS, { staffId: "marie" }).map((row) => row.seq), [5, 4]);
  assert.deepEqual(filterJournalRows(ROWS, { bookingId: "b1" }).map((row) => row.seq), [5, 4, 1]);
  assert.deepEqual(filterJournalRows(ROWS, { sensitiveOnly: true }).map((row) => row.seq), [5, 2]);
  assert.deepEqual(filterJournalRows(ROWS, { family: "tous", staffId: "", bookingId: "" }).length, 5);
  assert.deepEqual(familiesPresent(ROWS), ["dossier", "option", "carte", "fournisseur", "responsable"]);
});

test("résumé d’un agent : actions du jour, cartes et paiements du jour, dernière activité", () => {
  const now = new Date("2026-10-30T15:00:00.000Z");
  assert.deepEqual(agentSummary(ROWS, { staffId: "marie", now }), { actionsToday: 2, sensitiveToday: 1, lastAt: "2026-10-30T13:32:00.000Z" });
  assert.deepEqual(agentSummary(ROWS, { staffId: "coralie", now }), { actionsToday: 0, sensitiveToday: 0, lastAt: "2026-10-29T10:00:00.000Z" });
  assert.deepEqual(agentSummary(ROWS, { staffId: "absent", now }), { actionsToday: 0, sensitiveToday: 0, lastAt: null });
});

test("champs écrits en base : étiquette connue, dossier uuid, montant arrondi, quatre chiffres, connecteur sans collègue", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  assert.deepEqual(
    journalBusinessFields({ staffId: null, kind: "carte_emise", bookingId: id, amountCents: 245000.4, currency: "eur", cardLast4: "4242424242424242", actorLabel: "grok" }),
    { kind: "carte_emise", booking_id: id, amount_cents: 245000, currency: "EUR", card_last4: "4242", actor_label: "grok" }
  );
  assert.deepEqual(
    journalBusinessFields({ staffId: "s1", kind: "pas_une_etiquette", bookingId: "b1", amountCents: null, currency: "EUR", cardLast4: "12", actorLabel: "grok" }),
    { kind: null, booking_id: null, amount_cents: null, currency: null, card_last4: null, actor_label: null }
  );
  assert.equal(journalBusinessFields({ staffId: null, actorLabel: "jeton 4242424242424242" }).actor_label, null);
  assert.equal(journalBusinessFields({ amountCents: 1000, currency: "dollars" }).currency, "EUR");
});

test("le canonical porte les champs métier, dans l’ordre du trigger SQL", () => {
  const canonical = journalCanonical({
    action: "create",
    entityType: "card",
    entityId: "b1",
    summary: "Carte Pliant émise",
    diff: null,
    kind: "carte_emise",
    bookingId: "b1",
    amountCents: 245000,
    currency: "EUR",
    cardLast4: "4821",
    actorLabel: null,
  });
  assert.equal(canonical, "create|card|b1|Carte Pliant émise||carte_emise|b1|245000|EUR|4821|");
  assert.equal(journalCanonical({ action: "view", entityType: "dossier", entityId: null, summary: "x", diff: null }), "view|dossier||x|||||||");
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261030160000_agency_journal_metier.sql"), "utf8");
  assert.match(sql, /coalesce\(new\.kind, ''\)\s*\|\| '\|' \|\| coalesce\(new\.booking_id::text, ''\)\s*\|\| '\|' \|\| coalesce\(new\.amount_cents::text, ''\)\s*\|\| '\|' \|\| coalesce\(new\.currency, ''\)\s*\|\| '\|' \|\| coalesce\(new\.card_last4, ''\)\s*\|\| '\|' \|\| coalesce\(new\.actor_label, ''\)/);
});

test("la migration du journal métier est additive, scellée, sans numéro complet, et ne touche pas le registre clé/valeur", () => {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261030160000_agency_journal_metier.sql"), "utf8");
  const code = sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
  assert.match(code, /add column if not exists kind text/);
  assert.match(code, /add column if not exists booking_id uuid references public\.crm_bookings/);
  assert.match(code, /add column if not exists amount_cents bigint/);
  assert.match(code, /add column if not exists card_last4 text/);
  assert.match(code, /card_last4 ~ '\^\[0-9\]\{4\}\$'/);
  assert.match(code, /'view_activity'/);
  assert.doesNotMatch(code, /crm_agency_settings\b(?!_)/);
  assert.doesNotMatch(code, /\bcurrent_role\b/);
  assert.doesNotMatch(code, /drop table|drop column|truncate|delete from public\.crm_agency_journal|update public\.crm_agency_journal/i);
  assert.doesNotMatch(code, /grant\s+(insert|update|delete)[\s\S]{0,80}crm_agency_journal/i);
  for (const column of ["kind", "booking_id", "amount_cents", "currency", "card_last4", "actor_label"]) {
    assert.match(code, new RegExp(`add column if not exists ${column} `));
  }
  // Aucun nom de colonne nouveau n’est un mot réservé de Postgres.
  const reserved = new Set(["user", "role", "current_role", "current_user", "session_user", "order", "group", "table", "select", "from", "where", "to", "in", "on", "for", "with", "default", "check"]);
  for (const column of ["kind", "booking_id", "amount_cents", "currency", "card_last4", "actor_label"]) {
    assert.equal(reserved.has(column), false, column);
  }
});

test("le droit « Voir l’activité » est administrateur seulement par défaut ; le menu le suit", () => {
  assert.ok((PERMISSIONS as readonly string[]).includes("view_activity"));
  assert.ok(PERMISSION_LABELS.view_activity.length > 5);
  assert.equal(roleAllows("admin", "view_activity"), true);
  assert.equal(roleAllows("manager", "view_activity"), false);
  assert.equal(roleAllows("agent", "view_activity"), false);
  assert.equal(roleAllows("comptable", "view_activity"), false);
  assert.equal(roleAllows("manager", "view_activity", { manager: { view_activity: true } }), true);
  const adminHrefs = adminNavGroups({ role: "admin" }).flatMap((group) => group.items.map((item) => item.href));
  assert.ok(adminHrefs.includes("/admin/activite"));
  const agentHrefs = adminNavGroups({ role: "agent", allows: { view_finances: true, view_inbox: true, view_journal: false, manage_users: false, view_activity: false } }).flatMap((group) =>
    group.items.map((item) => item.href)
  );
  assert.equal(agentHrefs.includes("/admin/activite"), false);
  const managerHrefs = adminNavGroups({ role: "manager", allows: { view_finances: true, view_inbox: true, view_journal: true, manage_users: false, view_activity: true } }).flatMap((group) =>
    group.items.map((item) => item.href)
  );
  assert.ok(managerHrefs.includes("/admin/activite"));
});

test("filtres de la page Activité : lecture des paramètres et liens en un clic", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  assert.deepEqual(activityFiltersFromParams({}), { period: "jour", staffId: null, bookingId: null, family: null, sensitiveOnly: false });
  assert.deepEqual(activityFiltersFromParams({ periode: "semaine", agent: id, dossier: "pas-un-uuid", type: "carte", sensible: "1" }), {
    period: "semaine",
    staffId: id,
    bookingId: null,
    family: "carte",
    sensitiveOnly: true,
  });
  assert.equal(activityHref({ period: "jour" }), "/admin/activite");
  assert.equal(activityHref({ period: "semaine", staffId: id, family: "paiement", sensitiveOnly: true }), `/admin/activite?periode=semaine&agent=${id}&type=paiement&sensible=1`);
});
