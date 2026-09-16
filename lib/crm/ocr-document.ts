import "server-only";
import { createWorker, PSM, type Worker } from "tesseract.js";
import { parseMrzFromOcr } from "./mrz-parse";
import type { ExtractedIdentity } from "./identity";
import { trySharp } from "./sharp";

const MAX_BYTES = 8 * 1024 * 1024;
const WHITELIST = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<";

type GlobalOcr = {
  worker?: Promise<Worker>;
  queue: Promise<unknown>;
};

const g = globalThis as typeof globalThis & { __travelbaMrzOcr?: GlobalOcr };
if (!g.__travelbaMrzOcr) g.__travelbaMrzOcr = { queue: Promise.resolve() };

function getWorker() {
  if (!g.__travelbaMrzOcr!.worker) {
    g.__travelbaMrzOcr!.worker = createWorker("eng", 1, {
      ...(process.env.VERCEL ? { cachePath: "/tmp" } : {}),
      langPath: "https://tessdata.projectnaptha.com/4.0.0",
    }).then(async (worker) => {
      await worker.setParameters({
        tessedit_char_whitelist: WHITELIST,
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        user_defined_dpi: "300",
      });
      return worker;
    });
  }
  return g.__travelbaMrzOcr!.worker;
}

async function withWorker<T>(fn: (worker: Worker) => Promise<T>) {
  const run = g.__travelbaMrzOcr!.queue.then(async () => {
    const worker = await getWorker();
    return fn(worker);
  });
  g.__travelbaMrzOcr!.queue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function variants(buffer: Buffer) {
  const sharp = await trySharp();
  if (!sharp) return [buffer];
  const rotated = sharp(buffer, { failOn: "none" }).rotate();
  const meta = await rotated.metadata();
  const width = meta.width || 1200;
  const height = meta.height || 800;
  const images: Buffer[] = [];

  images.push(
    await rotated
      .clone()
      .grayscale()
      .normalize()
      .resize({ width: Math.min(1800, Math.max(width, 1400)), withoutEnlargement: false })
      .png()
      .toBuffer()
  );

  if (height > 80 && width > 80) {
    const top = Math.floor(height * 0.55);
    images.push(
      await sharp(buffer, { failOn: "none" })
        .rotate()
        .extract({ left: 0, top, width, height: height - top })
        .grayscale()
        .normalize()
        .sharpen()
        .resize({ width: 1800, withoutEnlargement: false })
        .png()
        .toBuffer()
    );
  }

  return images;
}

export async function scanTravelDocument(file: File): Promise<{
  identity: ExtractedIdentity | null;
  warning: string | null;
}> {
  if (file.size > MAX_BYTES) {
    throw new Error("Photo trop lourde (max 8 Mo).");
  }
  if (!file.type.startsWith("image/")) {
    return {
      identity: null,
      warning: "La lecture automatique fonctionne avec une photo (JPEG, PNG, HEIC…).",
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const images = await variants(buffer);

  const identity = await withWorker(async (worker) => {
    let best: ExtractedIdentity | null = null;
    for (const image of images) {
      const { data } = await worker.recognize(image);
      const parsed = parseMrzFromOcr(data.text || "");
      if (!parsed) continue;
      if (!best || (parsed.valid && !best.valid)) best = parsed;
      if (best.valid) break;
    }
    return best;
  });

  if (!identity) {
    return {
      identity: null,
      warning:
        "Zone illisible. Cadrez le bas du passeport ou de la carte (bande de caractères) et réessayez.",
    };
  }

  return {
    identity,
    warning: identity.valid
      ? null
      : "Lecture partielle : vérifiez chaque champ avant d’enregistrer.",
  };
}
