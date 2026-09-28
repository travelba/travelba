import "server-only";
import { existsSync } from "node:fs";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { CHROMIUM_BUNDLE_MESSAGE, chooseBrowserLaunch, findChromiumBin } from "./chromium-pack";
import { ETA_IL_PORTAL } from "./eta-il-draft";
import { portalUrlAllowed, type PortalPage } from "./eta-il-session";

/** Chrome local d’abord (machine de l’agence), puis Chromium empaqueté sur Vercel. */
export function localChromePaths() {
  const found: string[] = [];
  for (const value of [
    process.env.CHROME_PATH,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ]) {
    const path = value?.trim();
    if (!path || found.includes(path) || !existsSync(path)) continue;
    found.push(path);
  }
  return found;
}

type ChromePage = {
  url(): string;
  goto(url: string, opts: { waitUntil: "domcontentloaded"; timeout: number }): Promise<unknown>;
  evaluate<T>(fn: (arg: string) => T, arg: string): Promise<T>;
  screenshot(opts: { type: "jpeg"; quality: number }): Promise<Uint8Array>;
  close(): Promise<void>;
};

type ChromeBrowser = { newPage(): Promise<ChromePage>; close(): Promise<void> };

export type PortalSession = PortalPage & { close(): Promise<void> };

export type PortalOpen = { ok: true; session: PortalSession } | { ok: false; message: string };

async function launchBrowser(): Promise<{ browser: ChromeBrowser } | { message: string }> {
  for (const local of localChromePaths()) {
    try {
      return {
        browser: await puppeteer.launch({
          executablePath: local,
          headless: true,
          args: ["--no-sandbox", "--disable-dev-shm-usage"],
        }),
      };
    } catch (err) {
      console.error("[eta-il] chrome local", err instanceof Error ? err.message : "échec");
    }
  }
  const plan = chooseBrowserLaunch({ localPaths: [], packagedBin: findChromiumBin() });
  if (plan.mode !== "packaged") return { message: plan.mode === "error" ? plan.message : CHROMIUM_BUNDLE_MESSAGE };
  try {
    chromium.setGraphicsMode = false;
    return {
      browser: await puppeteer.launch({
        executablePath: await chromium.executablePath(plan.binDir),
        headless: true,
        args: chromium.args,
        defaultViewport: { width: 1280, height: 720 },
      }),
    };
  } catch (err) {
    console.error("[eta-il] chromium", err instanceof Error ? err.message : "échec");
    return { message: CHROMIUM_BUNDLE_MESSAGE };
  }
}

export async function openEtaIlPortal(): Promise<PortalOpen> {
  const launched = await launchBrowser();
  if (!("browser" in launched)) return { ok: false, message: launched.message };
  const browser = launched.browser;
  try {
    const page = await browser.newPage();
    await page.goto(ETA_IL_PORTAL, { waitUntil: "domcontentloaded", timeout: 20000 });
    if (!portalUrlAllowed(page.url())) {
      await browser.close();
      return { ok: false, message: "Le portail ETA-IL n’a pas pu s’ouvrir." };
    }
    await waitForPortal(page);
    return {
      ok: true,
      session: {
        url: () => page.url(),
        open: async (url) => {
          if (!portalUrlAllowed(url)) throw new Error("hôte");
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
          if (!portalUrlAllowed(page.url())) throw new Error("hôte");
          await waitForPortal(page);
        },
        click: (target) => clickLabel(page, target),
        type: (target, text) => typeLabel(page, target, text),
        scroll: async () => {
          await page.evaluate(() => window.scrollBy(0, 480), "");
        },
        describe: () => describePortal(page),
        capture: async () => page.screenshot({ type: "jpeg", quality: 55 }),
        close: async () => {
          await page.close().catch(() => undefined);
          await browser.close().catch(() => undefined);
        },
      },
    };
  } catch (err) {
    console.error("[eta-il] portail", err instanceof Error ? err.message : "échec");
    await browser.close().catch(() => undefined);
    return { ok: false, message: "Le portail ETA-IL n’a pas pu s’ouvrir." };
  }
}

/** La page est une SPA : #root est vide à domcontentloaded. On attend boutons ou texte. */
async function waitForPortal(page: ChromePage) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const ready = await page.evaluate(() => {
      const root = document.querySelector("#root") || document.body;
      const text = (root?.textContent || "").replace(/\s+/g, " ").trim();
      const controls = root?.querySelectorAll("button, a, input, textarea, select, [role='button']").length || 0;
      return text.length > 40 || controls > 0;
    }, "");
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function describePortal(page: ChromePage) {
  await waitForPortal(page);
  const snapshot = await page.evaluate(() => {
    const root = document.querySelector("#root") || document.body;
    const labels: string[] = [];
    const nodes = root.querySelectorAll("button, a, [role='button'], label, input, textarea, select");
    nodes.forEach((el) => {
      if (labels.length >= 24) return;
      const field = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
      const raw = field
        ? el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.getAttribute("name") || ""
        : el.textContent || "";
      const clean = raw.replace(/\s+/g, " ").trim().slice(0, 80);
      if (!clean || labels.includes(clean)) return;
      labels.push(clean);
    });
    const excerpt = (root.textContent || "").replace(/\s+/g, " ").trim().slice(0, 400);
    return { labels: labels.join(" | "), excerpt };
  }, "");
  return `url=${page.url()} contrôles=${snapshot.labels || "aucun"} extrait=${snapshot.excerpt}`;
}

async function clickLabel(page: ChromePage, target: string) {
  const before = await pageMark(page);
  const ok = await page.evaluate((label) => {
    const needle = label.toLowerCase();
    const nodes = Array.from(document.querySelectorAll("button, a, [role='button'], label")).filter((el) =>
      (el.textContent || "").toLowerCase().includes(needle)
    );
    nodes.sort((a, b) => (a.textContent || "").length - (b.textContent || "").length);
    const node = nodes[0];
    if (!(node instanceof HTMLElement)) return false;
    const host = node.closest("button, a, [role='button']");
    const targetNode = host instanceof HTMLElement ? host : node;
    targetNode.click();
    return true;
  }, target);
  if (!ok) throw new Error("cible");
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if ((await pageMark(page)) !== before) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("immobile");
}

async function pageMark(page: ChromePage) {
  return page.evaluate(() => {
    const root = document.querySelector("#root") || document.body;
    const text = (root?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 240);
    return `${location.href}|${text}`;
  }, "");
}

async function typeLabel(page: ChromePage, target: string, text: string) {
  const ok = await page.evaluate((payload) => {
    const parsed = JSON.parse(payload) as { label: string; value: string };
    const needle = parsed.label.replace(/\s+/g, " ").trim().toLowerCase();
    const labels = Array.from(document.querySelectorAll("label"));
    const match = labels.find((el) => (el.textContent || "").replace(/\s+/g, " ").toLowerCase().includes(needle));
    const id = match?.getAttribute("for");
    const fromLabel = id ? document.getElementById(id) : match?.querySelector("input, textarea");
    const inputs = Array.from(document.querySelectorAll("input, textarea"));
    const fromAttr = inputs.find((el) => {
      const bag = [el.getAttribute("aria-label"), el.getAttribute("placeholder"), el.getAttribute("name")]
        .join(" ")
        .toLowerCase();
      return bag.includes(needle);
    });
    const field = fromLabel instanceof HTMLInputElement || fromLabel instanceof HTMLTextAreaElement ? fromLabel : fromAttr;
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return false;
    field.focus();
    const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(field, parsed.value);
    else field.value = parsed.value;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }, JSON.stringify({ label: target, value: text }));
  if (!ok) throw new Error("champ");
}

