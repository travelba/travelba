import assert from "node:assert/strict";
import test from "node:test";
import { appleAppSiteAssociation } from "./apple-app-site";

test("les liens universels visent l’espace client", () => {
  const body = appleAppSiteAssociation("ABCDE12345");
  assert.equal(body.applinks.details[0].appID, "ABCDE12345.fr.travelba.espace");
  assert.ok(body.applinks.details[0].paths.includes("/mon-compte"));
  assert.ok(body.applinks.details[0].paths.includes("/e/*"));
  assert.equal(body.applinks.details[0].paths.some((path) => path.startsWith("/admin")), false);
});

test("sans team id, le fichier reste un modèle", () => {
  assert.equal(appleAppSiteAssociation(undefined).applinks.details[0].appID, "TEAMID.fr.travelba.espace");
});
