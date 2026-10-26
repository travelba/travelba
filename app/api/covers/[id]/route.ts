import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { ensureCityCover } from "@/lib/crm/cover-generate";
import { generatedCityCoverSpec } from "@/lib/crm/cover-catalog";
import { catalogCachePath, isCatalogPhotoId } from "@/lib/crm/cover-retouch";
import { coverWidthParam } from "@/lib/crm/covers";
import { downloadCrmFile } from "@/lib/crm/files";
import { publicCoverPath } from "@/lib/crm/cover-file";
import { trySharp } from "@/lib/crm/sharp";

type Ctx = { params: Promise<{ id: string }> };

export const maxDuration = 120;

async function sizedWebp(bytes: Buffer, width: number) {
  const sharp = await trySharp();
  if (!sharp) return bytes;
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

export async function GET(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const width = coverWidthParam(new URL(request.url).searchParams.get("w"));
  if (!isCatalogPhotoId(id)) return new NextResponse(null, { status: 404 });

  let bytes: Buffer | null = null;
  try {
    const file = await downloadCrmFile(catalogCachePath(id));
    bytes = Buffer.from(file.bytes);
  } catch {
    bytes = null;
  }
  if (!bytes) {
    try {
      bytes = await readFile(publicCoverPath(id));
    } catch {
      bytes = null;
    }
  }
  if (!bytes?.byteLength && generatedCityCoverSpec(id)) {
    bytes = await ensureCityCover(id);
  }
  if (!bytes?.byteLength) return new NextResponse(null, { status: 404 });
  if (width) bytes = await sizedWebp(bytes, width);

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
