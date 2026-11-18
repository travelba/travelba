import { NextResponse } from "next/server";
import { downloadCrmFile } from "@/lib/crm/files";
import { hotelPhotoStoragePath } from "@/lib/crm/hotel-research";

type Ctx = { params: Promise<{ id: string; index: string }> };

/** Photo d’hôtel déposée par la recherche. Ce préfixe seulement, rien du dossier client. */
export async function GET(_request: Request, ctx: Ctx) {
  const { id, index } = await ctx.params;
  const path = hotelPhotoStoragePath(id, Number(index));
  if (!path) return new NextResponse(null, { status: 404 });
  try {
    const file = await downloadCrmFile(path);
    if (!file.bytes.byteLength) return new NextResponse(null, { status: 404 });
    return new NextResponse(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
