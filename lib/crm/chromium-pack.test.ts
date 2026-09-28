import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import {
  CHROMIUM_BUNDLE_MESSAGE,
  CHROMIUM_TRACE_INCLUDES,
  chooseBrowserLaunch,
  findChromiumBin,
} from "./chromium-pack";

test("Chrome local passe avant le Chromium empaqueté", () => {
  const plan = chooseBrowserLaunch({
    localPaths: ["/usr/bin/google-chrome"],
    packagedBin: "/var/task/vendor/chromium",
  });
  assert.equal(plan.mode, "local");
  if (plan.mode === "local") assert.equal(plan.executablePath, "/usr/bin/google-chrome");
});

test("sans Chrome local, le robot prend le pack brotli", () => {
  const plan = chooseBrowserLaunch({ localPaths: [], packagedBin: "/var/task/vendor/chromium" });
  assert.deepEqual(plan, { mode: "packaged", binDir: "/var/task/vendor/chromium" });
});

test("sans Chrome et sans brotli, le portail ne démarre pas", () => {
  const plan = chooseBrowserLaunch({ localPaths: [" ", ""], packagedBin: null });
  assert.equal(plan.mode, "error");
  if (plan.mode === "error") {
    assert.equal(plan.message, CHROMIUM_BUNDLE_MESSAGE);
    assert.match(plan.message, /n’a pas pu s’ouvrir/);
  }
});

test("le pack est cherché hors du node_modules servi par Vercel", () => {
  const found = findChromiumBin((path) => path === "/app/vendor/chromium/chromium.br", "/app");
  assert.equal(found, "/app/vendor/chromium");
  assert.equal(findChromiumBin(() => false, "/app"), null);
});

test("le trace des routes robot inclut le pack, pas le bin npm", () => {
  const require = createRequire(import.meta.url);
  const picomatch = require("next/dist/compiled/picomatch") as (
    glob: string,
    opts: { dot: boolean; contains: boolean }
  ) => (value: string) => boolean;
  for (const [route, files] of Object.entries(CHROMIUM_TRACE_INCLUDES)) {
    assert.equal(picomatch(route, { dot: true, contains: true })(route), true, route);
    assert.ok(files.every((file) => file.startsWith("./vendor/chromium/")));
    assert.equal(files.some((file) => file.includes("node_modules")), false);
  }
  assert.ok(CHROMIUM_TRACE_INCLUDES["/api/client/bookings/[id]/visa"]);
  assert.ok(CHROMIUM_TRACE_INCLUDES["/api/admin/bookings/[id]/visa"]);
  assert.ok(CHROMIUM_TRACE_INCLUDES["/api/cron/visa-portal"]);
});
