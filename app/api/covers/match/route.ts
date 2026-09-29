import { NextResponse } from "next/server";
import { photoForUnknownPlace } from "@/lib/crm/cover-geo";
import { isCatalogPhotoId } from "@/lib/crm/cover-retouch";

export const runtime = "nodejs";

/** Photo de catalogue pour un lieu écrit qui n’est pas déjà dans le dossier. */
export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get("q") || "").trim();
  if (q.length < 2 || q.length > 160) return NextResponse.json({ photo: null });
  const photo = await photoForUnknownPlace(q);
  if (!photo || !isCatalogPhotoId(photo)) return NextResponse.json({ photo: null });
  return NextResponse.json({ photo });
}
