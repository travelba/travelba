import "server-only";
import { ETA_IL_PORTAL } from "./eta-il-draft";
import { portalUrlAllowed, type PortalPage } from "./eta-il-session";

type ChromePage = {
  url(): string;
  goto(url: string, opts: { waitUntil: "domcontentloaded"; timeout: number }): Promise<unknown>;
  evaluate<T>(fn: (arg: string) => T, arg: string): Promise<T>;
  close(): Promise<void>;
};

type ChromeBrowser = { newPage(): Promise<ChromePage>; close(): Promise<void> };

export type PortalSession = PortalPage & { close(): Promise<void> };

async function chromeLaunch(): Promise<{ puppeteer: { launch(opts: object): Promise<ChromeBrowser> }; executablePath: string; args: string[] } | null> {
  const load = new Function("name", "return import(name)") as (name: string) => Promise<unknown>;
  let puppeteer: { launch(opts: object): Promise<ChromeBrowser> };
  try {
    puppeteer = (await load("puppeteer-core")) as { launch(opts: object): Promise<ChromeBrowser> };
  } catch {
    return null;
  }
  const local = process.env.CHROME_PATH || "/usr/bin/google-chrome";
  try {
    const { access } = await import("node:fs/promises");
    await access(local);
    return { puppeteer, executablePath: local, args: ["--no-sandbox", "--disable-dev-shm-usage"] };
  } catch {
    // Chromium empaqueté pour la fonction Vercel.
  }
  try {
    const chromium = (await load("@sparticuz/chromium")) as {
      args: string[];
      executablePath: () => Promise<string>;
      setGraphicsMode: boolean;
    };
    chromium.setGraphicsMode = false;
    const executablePath = await chromium.executablePath();
    return { puppeteer, executablePath, args: chromium.args };
  } catch {
    return null;
  }
}

export async function openEtaIlPortal(): Promise<PortalSession | null> {
  const launch = await chromeLaunch();
  if (!launch) return null;
  const { puppeteer } = launch;
  let browser: ChromeBrowser;
  try {
    browser = await puppeteer.launch({
      executablePath: launch.executablePath,
      headless: true,
      args: launch.args,
    });
  } catch {
    return null;
  }
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
  } catch {
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

