import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { userMenuPosition } from "./user-menu";

test("le menu s’ouvre sous l’avatar, au-delà de l’en-tête téléphone", () => {
  const headerBottom = 115;
  const anchor = { top: 63, right: 374, bottom: 103, left: 334 };
  const box = userMenuPosition(anchor, { width: 390, height: 844 }, "right");
  assert.equal(box.top, anchor.bottom + 8);
  assert.ok(box.top < headerBottom);
  assert.ok(box.top + 160 > headerBottom, "Réglages et Se déconnecter dépassent l’en-tête");
  assert.equal(box.left, 374 - 256);
  assert.equal(box.width, 256);
  assert.ok(box.left >= 8);
  assert.ok(box.left + box.width <= 390 - 8);
});

test("le menu passe au-dessus de l’avatar si le bas de l’écran manque", () => {
  const anchor = { top: 700, right: 200, bottom: 740, left: 160 };
  const box = userMenuPosition(anchor, { width: 390, height: 800 }, "right");
  assert.ok(box.top < anchor.top);
  assert.ok(box.top >= 8);
  assert.ok(box.top + 248 <= 800 - 8);
});

test("un écran étroit garde le menu dans la fenêtre", () => {
  const box = userMenuPosition(
    { top: 40, right: 390, bottom: 80, left: 350 },
    { width: 320, height: 700 },
    "right",
  );
  assert.equal(box.left, 320 - 256 - 8);
  assert.ok(box.left + box.width <= 320 - 8);
});

test("l’agence et le client réutilisent la déconnexion de cet appareil", () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
  const nav = read("../../components/admin/AdminNav.tsx");
  const parts = read("../../components/admin/AdminNavParts.tsx");
  const settings = read("../../components/admin/AdminSignOutButton.tsx");
  const layout = read("../../app/admin/reglages/layout.tsx");
  const chrome = read("../../components/account/AccountChrome.tsx");
  const account = read("../../components/account/AccountUserMenu.tsx");
  const button = read("../../components/account/SignOutButton.tsx");

  assert.match(nav, /overflow-x-clip/);
  assert.doesNotMatch(nav, /overflow-hidden bg-\[var\(--admin-navy\)\]/);
  assert.match(nav, /signOutAccount\("local"/);
  assert.doesNotMatch(nav, /auth\.signOut/);
  assert.match(parts, /createPortal/);
  assert.match(parts, /SIGN_OUT_LABEL/);
  assert.doesNotMatch(parts, /absolute top-12/);
  assert.match(settings, /signOutAccount\("local", "\/admin\/login"\)/);
  assert.doesNotMatch(settings, /auth\.signOut/);
  assert.match(layout, /<AdminSignOutButton/);
  const menuAt = chrome.indexOf("<AccountUserMenu");
  const desktopOnly = chrome.indexOf('className="mx-auto hidden max-w-[480px]');
  assert.ok(menuAt > 0 && desktopOnly > menuAt, "le menu avatar n’est pas dans la rangée masquée sur téléphone");
  assert.match(account, /createPortal/);
  assert.match(account, /SIGN_OUT_LABEL/);
  assert.match(button, /signOutAccount\("local", "\/connexion"\)/);
  assert.match(button, /SIGN_OUT_LABEL/);
  assert.doesNotMatch(button, /auth\.signOut/);
});
