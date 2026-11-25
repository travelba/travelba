import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  PUSH_PREF_FIELDS,
  pushDefaultsPatch,
  shouldRequestIosPush,
  shouldShowPushSettingsBanner,
} from "./push-permission";

test("la permission iOS n’est demandée qu’une fois, sans écran préalable", () => {
  assert.equal(shouldRequestIosPush("prompt"), true);
  assert.equal(shouldRequestIosPush("prompt-with-rationale"), true);
  assert.equal(shouldRequestIosPush("granted"), false);
  assert.equal(shouldRequestIosPush("denied"), false);
  assert.equal(shouldRequestIosPush(""), false);
  assert.equal(shouldShowPushSettingsBanner("denied", false), true);
  assert.equal(shouldShowPushSettingsBanner("denied", true), false);
  assert.equal(shouldShowPushSettingsBanner("granted", false), false);
  assert.equal(shouldShowPushSettingsBanner("prompt", false), false);
});

test("accepter ouvre toutes les catégories", () => {
  const patch = pushDefaultsPatch();
  assert.deepEqual(Object.keys(patch).sort(), [...PUSH_PREF_FIELDS].sort());
  assert.equal(Object.values(patch).every((value) => value === true), true);
});

test("les colonnes nouvelles valent vrai par défaut", () => {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261123150000_ios_client_12.sql"), "utf8");
  for (const column of ["push_checkin", "push_flight_change", "push_departure", "push_balance"]) {
    assert.match(sql, new RegExp(`${column} boolean not null default true`));
    assert.match(sql, new RegExp(`alter column ${column} set default true`));
  }
});

test("le premier écran de l’application demande la permission avant la connexion", () => {
  const shell = readFileSync(join(process.cwd(), "mobile/www/shell.js"), "utf8");
  const ask = shell.indexOf("requestPermissions");
  const nav = shell.indexOf("location.replace");
  assert.ok(ask > 0);
  assert.ok(nav > ask);
  const plugin = readFileSync(
    join(process.cwd(), "node_modules/@capacitor/push-notifications/ios/Sources/PushNotificationsPlugin/PushNotificationsHandler.swift"),
    "utf8"
  );
  assert.match(plugin, /\[\.alert, \.sound, \.badge\]/);
});
