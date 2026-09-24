import assert from "node:assert/strict";
import test from "node:test";
import {
  colleagueEmailError,
  colleagueInviteBlock,
  colleagueNameError,
  normalizeColleagueEmail,
  parseStaffRole,
  removalAuthPlan,
  removalBlockReason,
  roleActionLabel,
  roleChangeBlockReason,
  staffRoleLabel,
  STAFF_COPY,
} from "./staff-team";

test("libellés de rôle", () => {
  assert.equal(staffRoleLabel("admin"), "Administrateur");
  assert.equal(staffRoleLabel("agent"), "Agent");
  assert.equal(parseStaffRole("agent"), "agent");
  assert.equal(parseStaffRole("admin"), "admin");
  assert.equal(parseStaffRole("client"), null);
  assert.equal(parseStaffRole(""), null);
});

test("e-mail et nom d’un collègue", () => {
  assert.equal(normalizeColleagueEmail("  Ada@Agence.FR "), "ada@agence.fr");
  assert.equal(colleagueEmailError("ada@agence.fr"), null);
  assert.equal(colleagueEmailError("pas-un-email"), STAFF_COPY.email);
  assert.equal(colleagueNameError("  "), STAFF_COPY.name);
  assert.equal(colleagueNameError("Ada Lovelace"), null);
  assert.equal(colleagueNameError("A".repeat(121)), STAFF_COPY.nameLong);
});

test("un client ne devient pas collègue, un collègue n’est pas doublé", () => {
  assert.equal(
    colleagueInviteBlock({ isCustomer: true, isAlreadyStaff: false }),
    STAFF_COPY.customer
  );
  assert.equal(
    colleagueInviteBlock({ isCustomer: false, isAlreadyStaff: true }),
    STAFF_COPY.already
  );
  assert.equal(colleagueInviteBlock({ isCustomer: false, isAlreadyStaff: false }), null);
});

test("les administrateurs en place ne se retirent pas", () => {
  assert.equal(
    removalBlockReason({ actorId: "a", targetId: "b", targetRole: "admin" }),
    STAFF_COPY.removeAdmin
  );
  assert.equal(
    removalBlockReason({ actorId: "a", targetId: "a", targetRole: "admin" }),
    STAFF_COPY.removeAdmin
  );
  assert.equal(removalBlockReason({ actorId: "a", targetId: "b", targetRole: "agent" }), null);
  assert.equal(
    removalBlockReason({ actorId: "b", targetId: "b", targetRole: "agent" }),
    STAFF_COPY.removeSelf
  );
});

test("retirer un collègue qui est aussi client garde le compte voyageur", () => {
  assert.equal(removalAuthPlan(true), "keep-client");
  assert.equal(removalAuthPlan(false), "delete-user");
});

test("limiter le rôle, sans laisser l’agence sans administrateur", () => {
  assert.equal(
    roleChangeBlockReason({ targetRole: "admin", nextRole: "agent", adminCount: 1 }),
    STAFF_COPY.lastAdmin
  );
  assert.equal(
    roleChangeBlockReason({ targetRole: "admin", nextRole: "agent", adminCount: 4 }),
    null
  );
  assert.equal(
    roleChangeBlockReason({ targetRole: "agent", nextRole: "admin", adminCount: 4 }),
    null
  );
  assert.equal(
    roleChangeBlockReason({ targetRole: "agent", nextRole: "agent", adminCount: 1 }),
    null
  );
  assert.equal(roleActionLabel("admin", "agent"), "Limiter à agent");
  assert.equal(roleActionLabel("agent", "admin"), "Passer administrateur");
  assert.equal(roleActionLabel("agent", "agent"), null);
});
