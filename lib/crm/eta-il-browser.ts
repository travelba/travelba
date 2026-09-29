import "server-only";
import { existsSync } from "node:fs";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { CHROMIUM_BUNDLE_MESSAGE, chooseBrowserLaunch, findChromiumBin } from "./chromium-pack";
import { ETA_IL_PORTAL } from "./eta-il-draft";
import { pickOptionLabel, portalUrlAllowed, type PortalPage } from "./eta-il-session";

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
          defaultViewport: { width: 1280, height: 720 },
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
    // Le bundler nomme les fonctions exécutées dans la page. Le helper doit survivre à chaque navigation.
    const arm = page as ChromePage & { evaluateOnNewDocument(fn: () => void): Promise<void> };
    await arm.evaluateOnNewDocument(() => {
      (0, eval)("globalThis.__name = function (fn) { return fn; }");
    });
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
        typeDigits: (code) => typeDigitCode(page, code),
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
  const snapshot = await evalPage(page, () => {
    const root = document.querySelector("#root") || document.body;
    const labels: string[] = [];
    const push = (raw: string) => {
      const clean = raw.replace(/\s+/g, " ").trim().slice(0, 80);
      if (!clean || labels.includes(clean) || labels.length >= 24) return;
      labels.push(clean);
    };
    const nodes = root.querySelectorAll("button, a, [role='button'], label, input, textarea, select, [role='combobox']");
    nodes.forEach((el) => {
      if (el.getAttribute("aria-hidden") === "true") return;
      if (el.getAttribute("role") === "combobox") {
        const ids = (el.getAttribute("aria-labelledby") || "").split(/\s+/);
        const labelled = ids.map((id) => document.getElementById(id)?.textContent || "").join(" ");
        push(labelled || el.textContent || "");
        return;
      }
      const field = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
      const raw = field
        ? el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.getAttribute("name") || ""
        : el.textContent || "";
      push(raw);
    });
    const excerpt = (root.textContent || "").replace(/\s+/g, " ").trim().slice(0, 400);
    const liste = document.querySelectorAll("[role='option']:not([aria-disabled='true'])").length;
    const widget = document.querySelector(
      "iframe[src*='recaptcha'], iframe[src*='hcaptcha'], .g-recaptcha, .h-captcha"
    );
    const image = Array.from(document.querySelectorAll("img, canvas")).some((el) =>
      /captcha/i.test(`${el.getAttribute("alt") || ""} ${el.getAttribute("src") || ""} ${el.id} ${el.getAttribute("class") || ""}`)
    );
    const captcha = widget ? "widget" : image ? "image" : /captcha/i.test(root.textContent || "") ? "texte" : "non";
    return { labels: labels.join(" | "), excerpt, liste, captcha };
  });
  return `url=${page.url()} contrôles=${snapshot.labels || "aucun"} extrait=${snapshot.excerpt} captcha=${snapshot.captcha} liste=${snapshot.liste}`;
}

async function mouseClick(page: ChromePage, x: number, y: number) {
  const mouse = (page as ChromePage & { mouse?: { click(x: number, y: number): Promise<void> } }).mouse;
  if (!mouse) throw new Error("cible");
  await mouse.click(x, y);
}

async function clickLabel(page: ChromePage, target: string) {
  const before = await pageMark(page);
  const point = await evalPage(page, findClickPoint, target);
  if (point) {
    await mouseClick(page, point.x, point.y);
  } else if (!(await chooseOption(page, target))) {
    throw new Error("cible");
  }
  await waitForChange(page, before);
}

async function evalPage<T>(page: ChromePage, fn: (arg: string) => T, arg = ""): Promise<T> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await page.evaluate(fn, arg);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (!/context was destroyed|Execution context|navigat/i.test(message)) throw err;
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
  throw new Error("immobile");
}

async function pageMark(page: ChromePage) {
  return evalPage(page, () => {
    const root = document.querySelector("#root") || document.body;
    const text = (root?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 240);
    const checks = Array.from(document.querySelectorAll("input[type='checkbox'], input[type='radio']"))
      .map((el) => (el instanceof HTMLInputElement && el.checked ? "1" : "0"))
      .join("");
    const lists = document.querySelectorAll("[role='listbox']").length;
    const combo = Array.from(document.querySelectorAll("[role='combobox']"))
      .map((el) => (el.textContent || "").replace(/\s+/g, " ").trim())
      .join("|");
    return `${location.href}|${text}|${checks}|${lists}|${combo}`;
  });
}

async function waitForChange(page: ChromePage, before: string) {
  const deadline = Date.now() + 8000;
  let last = before;
  let stable = 0;
  while (Date.now() < deadline) {
    const now = await pageMark(page);
    if (now !== before && now === last) {
      stable += 1;
      if (stable >= 2) return;
    } else {
      stable = 0;
    }
    last = now;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (last !== before) return;
  throw new Error("immobile");
}

/** Point visible d’un bouton, d’une case, d’une liste ou d’une option. Le clic réel ouvre un select MUI. */
function findClickPoint(label: string): { x: number; y: number } | null {
  const needle = label.replace(/\s+/g, " ").trim().toLowerCase();
  if (!needle) return null;
  const textOf = (el: Element) => (el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
  const center = (el: Element) => {
    if (!(el instanceof HTMLElement)) return null;
    el.scrollIntoView({ block: "center", inline: "nearest" });
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return null;
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  };
  const options = Array.from(document.querySelectorAll("[role='option']")).filter((el) => {
    if (el.getAttribute("aria-disabled") === "true") return false;
    return textOf(el).includes(needle);
  });
  options.sort((a, b) => textOf(a).length - textOf(b).length);
  if (options[0]) return center(options[0]);
  const boxes = Array.from(document.querySelectorAll("[role='combobox']"));
  const box = boxes.find((el) => {
    const ids = (el.getAttribute("aria-labelledby") || "").split(/\s+/);
    const labelled = ids.map((id) => document.getElementById(id)?.textContent || "").join(" ");
    const bag = `${el.id} ${el.getAttribute("aria-label") || ""} ${labelled} ${el.textContent || ""}`.toLowerCase();
    return bag.includes(needle);
  });
  if (box) return center(box);
  const nodes = Array.from(document.querySelectorAll("button, a, [role='button'], label")).filter((el) =>
    textOf(el).includes(needle)
  );
  nodes.sort((a, b) => textOf(a).length - textOf(b).length);
  const node = nodes[0];
  if (!(node instanceof HTMLElement)) return null;
  if (node.tagName === "LABEL") {
    const id = node.getAttribute("for");
    const field = id ? document.getElementById(id) : node.querySelector("[role='combobox']");
    if (field?.getAttribute("role") === "combobox") return center(field);
  }
  const host = node.closest("button, a, [role='button']");
  return center(host instanceof HTMLElement ? host : node);
}

async function chooseOption(page: ChromePage, query: string) {
  const open = await listedOptions(page);
  if (await clickMatchedOption(page, open, query)) return true;
  const points = await evalPage(page, () => {
    return Array.from(document.querySelectorAll("[role='combobox']")).flatMap((el) => {
      if (!(el instanceof HTMLElement)) return [];
      el.scrollIntoView({ block: "center", inline: "nearest" });
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return [];
      return [{ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }];
    });
  });
  for (const point of points) {
    await mouseClick(page, point.x, point.y);
    const deadline = Date.now() + 2000;
    let options: string[] = [];
    while (Date.now() < deadline) {
      options = await listedOptions(page);
      if (options.length) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    if (await clickMatchedOption(page, options, query)) return true;
  }
  return false;
}

async function listedOptions(page: ChromePage) {
  return evalPage(page, () => {
    return Array.from(document.querySelectorAll("[role='option']"))
      .filter((el) => el.getAttribute("aria-disabled") !== "true")
      .map((el) => (el.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean);
  });
}

async function clickMatchedOption(page: ChromePage, options: string[], query: string) {
  const choice = pickOptionLabel(options, query);
  if (!choice) return false;
  const point = await evalPage(page, (exact) => {
    const node = Array.from(document.querySelectorAll("[role='option']")).find(
      (el) => (el.textContent || "").replace(/\s+/g, " ").trim() === exact
    );
    if (!(node instanceof HTMLElement)) return null;
    node.scrollIntoView({ block: "center", inline: "nearest" });
    const rect = node.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return null;
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, choice);
  if (!point) return false;
  await mouseClick(page, point.x, point.y);
  return true;
}

async function typeDigitCode(page: ChromePage, code: string) {
  const digits = code.replace(/\D/g, "");
  if (!/^\d{6}$/.test(digits)) throw new Error("champ");
  const focused = await evalPage(page, (countRaw) => {
    const count = Number(countRaw) || 6;
    const boxes = Array.from(document.querySelectorAll("input")).filter((el) => {
      if (!(el instanceof HTMLInputElement)) return false;
      if (el.disabled || el.type === "hidden" || el.type === "checkbox" || el.type === "radio" || el.type === "email") {
        return false;
      }
      const max = el.maxLength > 0 && el.maxLength < 100 ? el.maxLength : Number(el.getAttribute("maxlength") || 0);
      return max === 1;
    });
    const first = boxes[0];
    if (boxes.length < count || !(first instanceof HTMLInputElement)) return false;
    first.focus();
    return true;
  }, String(digits.length));
  const keyboard = (page as ChromePage & { keyboard?: { type(text: string, opts?: { delay?: number }): Promise<void> } }).keyboard;
  if (focused && keyboard) {
    await keyboard.type(digits, { delay: 40 });
    return;
  }
  if (focused) {
    const filled = await evalPage(page, (value) => {
      const boxes = Array.from(document.querySelectorAll("input")).filter((el) => {
        if (!(el instanceof HTMLInputElement)) return false;
        if (el.disabled || el.type === "hidden" || el.type === "checkbox" || el.type === "radio" || el.type === "email") {
          return false;
        }
        const max = el.maxLength > 0 && el.maxLength < 100 ? el.maxLength : Number(el.getAttribute("maxlength") || 0);
        return max === 1;
      });
      if (boxes.length < value.length) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      for (let index = 0; index < value.length; index += 1) {
        const field = boxes[index];
        if (!(field instanceof HTMLInputElement)) return false;
        field.focus();
        const digit = value[index] || "";
        if (setter) setter.call(field, digit);
        else field.value = digit;
        field.dispatchEvent(new InputEvent("input", { bubbles: true, data: digit, inputType: "insertText" }));
        field.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return true;
    }, digits);
    if (filled) return;
  }
  await typeLabel(page, "Code to 6 digits", digits);
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
      if (el.getAttribute("aria-hidden") === "true") return false;
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
  if (ok) return;
  const before = await pageMark(page);
  if (!(await chooseOption(page, text))) throw new Error("champ");
  await waitForChange(page, before);
}

