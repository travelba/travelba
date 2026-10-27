import { readFile } from "node:fs/promises";
import { after, NextResponse } from "next/server";
import { cityCoverFailed, enqueueCityCover } from "@/lib/crm/cover-generate";
import { generatedCityCoverSpec } from "@/lib/crm/cover-catalog";
import { catalogCachePath, isCatalogPhotoId } from "@/lib/crm/cover-retouch";
import { coverWidthParam } from "@/lib/crm/covers";
import { downloadCrmFile } from "@/lib/crm/files";
import { publicCoverPath } from "@/lib/crm/cover-file";
import { trySharp } from "@/lib/crm/sharp";

type Ctx = { params: Promise<{ id: string }> };

export const maxDuration = 120;

async function sizedWebp(bytes: Uint8Array, width: number) {
  const sharp = await trySharp();
  if (!sharp) return Buffer.from(bytes);
  try {
    return await sharp(bytes, { failOn: "none" })
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: width <= 192 ? 70 : 80 })
      .toBuffer();
  } catch {
    return bytes;
  }
}

async function storedCover(id: string) {
  try {
    const file = await downloadCrmFile(catalogCachePath(id));
    if (file.bytes.byteLength) return Buffer.from(file.bytes);
  } catch {
    /* pas encore en cache */
  }
  try {
    return await readFile(publicCoverPath(id));
  } catch {
    return null;
  }
}

export async function GET(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const url = new URL(request.url);
  const width = coverWidthParam(url.searchParams.get("w"));
  const meta = url.searchParams.get("meta") === "1";
  if (!isCatalogPhotoId(id)) return new NextResponse(null, { status: 404 });

  const noStore = { "Cache-Control": "no-store" };
  const bytes = await storedCover(id);
  if (meta) {
    if (bytes?.byteLength) return NextResponse.json({ state: "ready" }, { headers: noStore });
    if (!generatedCityCoverSpec(id)) return NextResponse.json({ state: "missing" }, { headers: noStore });
    if (cityCoverFailed(id)) return NextResponse.json({ state: "failed" }, { headers: noStore });
    after(() => enqueueCityCover(id));
    return NextResponse.json({ state: "pending" }, { headers: noStore });
  }
  if (!bytes?.byteLength && generatedCityCoverSpec(id)) {
    after(() => enqueueCityCover(id));
    return new NextResponse(null, { status: 404, headers: noStore });
  }
  if (!bytes?.byteLength) return new NextResponse(null, { status: 404 });
  const body = width ? await sizedWebp(bytes, width) : bytes;

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
