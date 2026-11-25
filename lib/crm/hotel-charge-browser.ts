/**
 * Navigateur du paiement hôtel.
 * Chrome local, sinon Chromium empaqueté sur la fonction Vercel.
 * Le numéro de carte ne sort pas de cette fonction.
 */

import { existsSync } from "node:fs";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { chooseBrowserLaunch, findChromiumBin } from "./chromium-pack";
import { runChargeSession, type ChargeFill } from "./hotel-auto";
import { checkoutAmount } from "./hotel-charge-page";

export function localChargeChrome() {
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

export async function chargeStayInBrowser(input: {
  url: string;
  secrets: { pan: string; expiry: string; cvc: string };
  stayCents: number;
  ceilingCents: number;
}) {
  const plan = chooseBrowserLaunch({ localPaths: localChargeChrome(), packagedBin: findChromiumBin() });
  if (plan.mode === "error") {
    return { status: "needs_agent" as const, reason: "erreur" as const, note: plan.message, screenshot: null as Uint8Array | null };
  }
  let executablePath = plan.mode === "local" ? plan.executablePath : "";
  let args = ["--no-sandbox", "--disable-dev-shm-usage"];
  if (plan.mode === "packaged") {
    chromium.setGraphicsMode = false;
    executablePath = await chromium.executablePath(plan.binDir);
    args = chromium.args;
  }
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args,
    defaultViewport: { width: 1280, height: 900 },
  });
  try {
    const page = await browser.newPage();
    await page.goto(input.url, { waitUntil: "domcontentloaded", timeout: 20000 });
    const fill: ChargeFill = {
      async url() {
        return page.url();
      },
      async text() {
        return page.evaluate(() => document.body?.innerText || "");
      },
      async amount() {
        const text = await page.evaluate(() => document.body?.innerText || "");
        return checkoutAmount(text);
      },
      async hasCardFields() {
        return page.evaluate(() => {
          const nodes = [...document.querySelectorAll("input")];
          const auto = nodes.map((node) => (node.getAttribute("autocomplete") || "").toLowerCase());
          return auto.includes("cc-number") && (auto.includes("cc-exp") || auto.includes("cc-exp-month")) && auto.includes("cc-csc");
        });
      },
      async fill(secrets) {
        await page.type('input[autocomplete="cc-number"]', secrets.pan, { delay: 0 });
        const exp = await page.$('input[autocomplete="cc-exp"]');
        if (exp) await exp.type(secrets.expiry);
        else {
          const month = secrets.expiry.slice(0, 2);
          const year = secrets.expiry.slice(-2);
          const monthField = await page.$('input[autocomplete="cc-exp-month"]');
          const yearField = await page.$('input[autocomplete="cc-exp-year"]');
          if (monthField) await monthField.type(month);
          if (yearField) await yearField.type(year);
        }
        await page.type('input[autocomplete="cc-csc"]', secrets.cvc, { delay: 0 });
      },
      async submit() {
        const button = await page.$('button[type="submit"], input[type="submit"]');
        if (!button) throw new Error("envoi");
        await button.click();
        await page.waitForNetworkIdle({ timeout: 15000 }).catch(() => undefined);
      },
      async clearSecrets() {
        await page.evaluate(() => {
          for (const node of document.querySelectorAll("input")) {
            const auto = (node.getAttribute("autocomplete") || "").toLowerCase();
            if (auto.startsWith("cc-")) (node as HTMLInputElement).value = "";
          }
        });
      },
      async screenshot() {
        const bytes = await page.screenshot({ type: "jpeg", quality: 60 });
        return bytes;
      },
    };
    return await runChargeSession(fill, input.secrets, {
      stayCents: input.stayCents,
      ceilingCents: input.ceilingCents,
    });
  } catch {
    return { status: "needs_agent" as const, reason: "erreur" as const, note: "Le navigateur n’a pas ouvert la page.", screenshot: null };
  } finally {
    await browser.close().catch(() => undefined);
  }
}
