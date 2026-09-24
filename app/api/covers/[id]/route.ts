import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { catalogCachePath, isCatalogPhotoId } from "@/lib/crm/cover-retouch";
import { downloadCrmFile } from "@/lib/crm/files";
import { publicCoverPath } from "@/lib/crm/cover-file";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
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
  if (!bytes?.byteLength) return new NextResponse(null, { status: 404 });

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
