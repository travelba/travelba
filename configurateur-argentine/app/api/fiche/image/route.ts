import { NextRequest } from "next/server";
import { readCachedImage } from "@/lib/og";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") ?? "";
  const image = await readCachedImage(id);
  if (!image) return new Response("Introuvable", { status: 404 });
  return new Response(new Uint8Array(image.bytes), {
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
