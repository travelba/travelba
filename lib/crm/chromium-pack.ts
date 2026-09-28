import { existsSync } from "node:fs";
import { join } from "node:path";

/** Chromium empaqueté, hors `node_modules` : le trace Vercel y laisse le JS et oublie `bin`. */
export const CHROMIUM_PACK_DIR = "vendor/chromium";

export const CHROMIUM_TRACE_INCLUDES: Record<string, string[]> = {
  "/api/admin/bookings/[id]/eta-il": [`./${CHROMIUM_PACK_DIR}/**`],
  "/api/admin/bookings/[id]/visa": [`./${CHROMIUM_PACK_DIR}/**`],
  "/api/client/bookings/[id]/visa": [`./${CHROMIUM_PACK_DIR}/**`],
  "/api/cron/visa-portal": [`./${CHROMIUM_PACK_DIR}/**`],
};

export const CHROMIUM_BUNDLE_MESSAGE =
  "Le portail ETA-IL n’a pas pu s’ouvrir. Chromium n’est pas dans le bundle.";

export function chromiumPackCandidates(cwd = process.cwd()) {
  return [
    join(cwd, CHROMIUM_PACK_DIR),
    "/var/task/vendor/chromium",
    join(cwd, "node_modules/@sparticuz/chromium/bin"),
    "/var/task/node_modules/@sparticuz/chromium/bin",
  ];
}

export function findChromiumBin(exists: (path: string) => boolean = existsSync, cwd = process.cwd()) {
  return chromiumPackCandidates(cwd).find((dir) => exists(join(dir, "chromium.br"))) ?? null;
}

export function chooseBrowserLaunch(input: { localPaths: string[]; packagedBin: string | null }):
  | { mode: "local"; executablePath: string }
  | { mode: "packaged"; binDir: string }
  | { mode: "error"; message: string } {
  const local = input.localPaths.find((path) => path.trim());
  if (local) return { mode: "local", executablePath: local };
  if (input.packagedBin) return { mode: "packaged", binDir: input.packagedBin };
  return { mode: "error", message: CHROMIUM_BUNDLE_MESSAGE };
}
