import "server-only";
import { existsSync } from "node:fs";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
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
  close(): Promise<void>;
};

type ChromeBrowser = { newPage(): Promise<ChromePage>; close(): Promise<void> };

export type PortalSession = PortalPage & { close(): Promise<void> };

async function launchBrowser(): Promise<ChromeBrowser | null> {
  for (const local of localChromePaths()) {
    try {
      return await puppeteer.launch({
        executablePath: local,
        headless: true,
        args: ["--no-sandbox", "--disable-dev-shm-usage"],
      });
    } catch (err) {
      console.error("[eta-il] chrome local", err instanceof Error ? err.message : "échec");
    }
  }
  try {
    chromium.setGraphicsMode = false;
    return await puppeteer.launch({
      executablePath: await chromium.executablePath(),
      headless: true,
      args: chromium.args,
      defaultViewport: { width: 1280, height: 720 },
    });
  } catch (err) {
    console.error("[eta-il] chromium", err instanceof Error ? err.message : "échec");
    return null;
  }
}

export async function openEtaIlPortal(): Promise<PortalSession | null> {
  const browser = await launchBrowser();
  if (!browser) return null;
  try {
    const page = await browser.newPage();
    await page.goto(ETA_IL_PORTAL, { waitUntil: "domcontentloaded", timeout: 20000 });
    if (!portalUrlAllowed(page.url())) {
      await browser.close();
      return null;
    }
    return {
      url: () => page.url(),
      open: async (url) => {
        if (!portalUrlAllowed(url)) throw new Error("hôte");
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
        if (!portalUrlAllowed(page.url())) throw new Error("hôte");
      },
      click: (target) => clickLabel(page, target),
      type: (target, text) => typeLabel(page, target, text),
      scroll: async () => {
        await page.evaluate(() => window.scrollBy(0, 480), "");
      },
      describe: async () => {
        const excerpt = await page.evaluate(
          () => (document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 800),
          ""
        );
        return `url=${page.url()} extrait=${excerpt}`;
      },
      close: async () => {
        await page.close().catch(() => undefined);
        await browser.close().catch(() => undefined);
      },
    };
  } catch (err) {
    console.error("[eta-il] portail", err instanceof Error ? err.message : "échec");
    await browser.close().catch(() => undefined);
    return null;
  }
}

async function clickLabel(page: ChromePage, target: string) {
  const ok = await page.evaluate((label) => {
    const nodes = Array.from(document.querySelectorAll("button, a, [role='button'], label"));
    const node = nodes.find((el) => (el.textContent || "").toLowerCase().includes(label.toLowerCase()));
    if (!(node instanceof HTMLElement)) return false;
    node.click();
    return true;
  }, target);
  if (!ok) throw new Error("cible");
}

async function typeLabel(page: ChromePage, target: string, text: string) {
  const ok = await page.evaluate((label) => {
    const labels = Array.from(document.querySelectorAll("label"));
    const match = labels.find((el) => (el.textContent || "").toLowerCase().includes(label.toLowerCase()));
    const id = match?.getAttribute("for");
    const field = id ? document.getElementById(id) : match?.querySelector("input, textarea");
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return false;
    field.focus();
    field.value = "";
    return true;
  }, target);
  if (!ok) throw new Error("champ");
  await page.evaluate((value) => {
    const field = document.activeElement;
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return;
    field.value = value;
    field.dispatchEvent(new Event("input", { bubbles: true }));
  }, text);
}

