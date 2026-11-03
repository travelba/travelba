import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SidebarGroups } from "../../components/admin/AdminNavParts";
import { roleAllows } from "./agency-access";
import { agencyGateDecision, classifyAgencyRoute } from "./agency-routes";
import { adminNavGroups, EMPTY_NAV_COUNTS } from "./admin-nav";
import { audienceFromRole } from "./client-session-cookie";
import { certificationEnvironmentAllowed } from "./ratehawk/config";
import { MCP_PARTNER_DENIAL, MCP_ROLE_DENIAL, mcpStaffDenial } from "./mcp-role";
import {
  isStaffRole,
  partnerAdminDestination,
  pathAfterPassword,
  RATEHAWK_ADMIN_HOME,
  ratehawkAdminDestination,
  restrictedRoleHome,
} from "./session";
import { jwtStaffRole, parseStaffRole, roleActionLabel, staffRoleLabel } from "./staff-team";
import type { StaffRole } from "./staff-team";

const ALLOWED = [
  ["POST", "/api/admin/ratehawk/search"],
  ["POST", "/api/admin/ratehawk/prebook"],
  ["POST", "/api/admin/ratehawk/book"],
  ["POST", "/api/admin/ratehawk/status"],
  ["POST", "/api/admin/ratehawk/cancel"],
  ["GET", "/api/admin/ratehawk/destinations"],
  ["POST", "/api/admin/ratehawk/hotel"],
  ["GET", "/api/admin/ratehawk/orders"],
] as const;

const DENIED = [
  ["GET", "/api/admin/clients"],
  ["POST", "/api/admin/clients"],
  ["GET", "/api/admin/bookings"],
  ["POST", "/api/admin/bookings"],
  ["GET", "/api/admin/little-emperors"],
  ["POST", "/api/admin/little-emperors"],
  ["GET", "/api/admin/transactions"],
  ["GET", "/api/admin/equipe"],
  ["GET", "/api/admin/revolut"],
  ["GET", "/api/admin/journal"],
  ["POST", "/api/admin/cles"],
] as const;

function decide(role: StaffRole, method: string, path: string) {
  const classified = classifyAgencyRoute(method, path);
  assert.ok(classified, `${method} ${path}`);
  return {
    classified,
    decision: agencyGateDecision({
      role,
      active: true,
      matrixReady: true,
      audience: classified.audience,
      permission: classified.permission,
      allows: classified.permission ? roleAllows(role, classified.permission, null) : false,
    }),
  };
}

test("le relecteur Ratehawk n’est pas un rôle d’agence", () => {
  assert.equal(parseStaffRole("ratehawk_cert"), "ratehawk_cert");
  assert.equal(staffRoleLabel("ratehawk_cert"), "Certification Ratehawk");
  assert.equal(jwtStaffRole("ratehawk_cert"), "ratehawk_cert");
  assert.equal(roleActionLabel("agent", "ratehawk_cert"), "Limiter à la certification Ratehawk");
  assert.equal(roleActionLabel("ratehawk_cert", "agent"), "Passer agent");
  assert.equal(roleActionLabel("partner", "agent"), "Passer agent");
  assert.equal(isStaffRole({ app_metadata: { crm_role: "ratehawk_cert" } }), false);
  assert.equal(isStaffRole({ app_metadata: { crm_role: "partner" } }), false);
  assert.equal(roleAllows("ratehawk_cert", "edit_dossiers"), false);
  assert.equal(roleAllows("ratehawk_cert", "view_finances"), false);
  assert.equal(roleAllows("partner", "edit_dossiers"), false);
  assert.equal(pathAfterPassword(null, "ratehawk"), RATEHAWK_ADMIN_HOME);
  assert.equal(pathAfterPassword(null, "partner"), "/admin/little-emperors");
  assert.equal(restrictedRoleHome("ratehawk_cert"), RATEHAWK_ADMIN_HOME);
  assert.equal(restrictedRoleHome("partner"), "/admin/little-emperors");
  assert.equal(restrictedRoleHome("agent"), null);
  assert.equal(audienceFromRole("ratehawk_cert"), "staff");
  assert.equal(certificationEnvironmentAllowed("sandbox"), true);
  assert.equal(certificationEnvironmentAllowed("production"), false);
  assert.equal(mcpStaffDenial("fiche_client", { role: "ratehawk_cert" }), MCP_ROLE_DENIAL);
  assert.equal(mcpStaffDenial("creer_dossier", { role: "partner" }), MCP_PARTNER_DENIAL);
});

test("la page Ratehawk est la seule page admin du relecteur ; MyLER ne bouge pas", () => {
  assert.equal(ratehawkAdminDestination("/admin/ratehawk"), null);
  assert.equal(ratehawkAdminDestination("/admin/ratehawk/hotel"), null);
  for (const path of ["/admin", "/admin/login", "/admin/clients", "/admin/reservations", "/admin/little-emperors", "/admin/argent"]) {
    assert.equal(ratehawkAdminDestination(path), "/admin/ratehawk", path);
  }
  assert.equal(partnerAdminDestination("/admin/little-emperors"), null);
  assert.equal(partnerAdminDestination("/admin/little-emperors/sync"), null);
  assert.equal(partnerAdminDestination("/admin/ratehawk"), "/admin/little-emperors");
  assert.equal(partnerAdminDestination("/admin/clients"), "/admin/little-emperors");

  const cert = adminNavGroups({ role: "ratehawk_cert", showExample: true });
  assert.deepEqual(
    cert.flatMap((group) => group.items.map((item) => item.href)),
    ["/admin/ratehawk"]
  );
  const partner = adminNavGroups({ role: "partner", showExample: true });
  assert.deepEqual(
    partner.flatMap((group) => group.items.map((item) => item.href)),
    ["/admin/little-emperors"]
  );
  const agent = adminNavGroups({ role: "agent", showExample: false });
  assert.ok(agent.flatMap((group) => group.items).some((item) => item.href === "/admin/clients"));
  assert.ok(agent.flatMap((group) => group.items).some((item) => item.href === "/admin/ratehawk"));

  const html = renderToStaticMarkup(
    createElement(SidebarGroups, {
      groups: cert,
      activeHref: "/admin/ratehawk",
      counts: EMPTY_NAV_COUNTS,
      openIds: ["ratehawk"],
      onToggle: () => {},
    })
  );
  assert.match(html, /href="\/admin\/ratehawk"/);
  assert.equal(html.includes("/admin/clients"), false);
  assert.equal(html.includes("/admin/reservations"), false);
  assert.equal(html.includes("/admin/little-emperors"), false);
  assert.equal(html.includes("Réglages"), false);
  const partnerHtml = renderToStaticMarkup(
    createElement(SidebarGroups, {
      groups: partner,
      activeHref: "/admin/little-emperors",
      counts: EMPTY_NAV_COUNTS,
      openIds: ["boite"],
      onToggle: () => {},
    })
  );
  assert.match(partnerHtml, /href="\/admin\/little-emperors"/);
  assert.equal(partnerHtml.includes("/admin/ratehawk"), false);
});

test("les routes Ratehawk du bac à sable passent, le reste du CRM répond 403", () => {
  for (const [method, path] of ALLOWED) {
    const { classified, decision } = decide("ratehawk_cert", method, path);
    assert.equal(classified.audience, "ratehawk", path);
    assert.equal(decision.allow, true, path);
    assert.equal(decision.status, 200, path);
  }
  for (const [method, path] of DENIED) {
    const { decision } = decide("ratehawk_cert", method, path);
    assert.equal(decision.allow, false, `${method} ${path}`);
    assert.equal(decision.status, 403, `${method} ${path}`);
  }
  assert.equal(decide("partner", "GET", "/api/admin/little-emperors").decision.allow, true);
  assert.equal(decide("partner", "POST", "/api/admin/little-emperors").decision.allow, true);
  assert.equal(decide("partner", "POST", "/api/admin/ratehawk/search").decision.status, 403);
  assert.equal(decide("partner", "POST", "/api/admin/ratehawk/book").decision.status, 403);
  assert.equal(decide("partner", "GET", "/api/admin/clients").decision.status, 403);
  assert.equal(decide("agent", "POST", "/api/admin/ratehawk/book").decision.allow, true);
  assert.equal(decide("agent", "GET", "/api/admin/clients").decision.allow, true);
  assert.equal(decide("lecture", "GET", "/api/admin/ratehawk/orders").decision.allow, true);
  assert.equal(decide("lecture", "POST", "/api/admin/ratehawk/book").decision.status, 403);
  assert.equal(decide("ratehawk_cert", "GET", "/api/admin/ratehawk").decision.allow, true);
});

test("la migration ajoute le rôle sans l’ouvrir sur is_staff", () => {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261102210000_ratehawk_cert_role.sql"), "utf8");
  assert.match(sql, /'ratehawk_cert'/);
  assert.match(sql, /crm_staff_role_check/);
  assert.match(sql, /agency_role\(\) in \('partner', 'ratehawk_cert'\)/);
  assert.equal(/create or replace function crm_private\.is_staff/.test(sql), false);
  assert.doesNotMatch(sql, /insert into public\.crm_staff/i);
  assert.doesNotMatch(sql, /@travelba\.fr/);
});
