import { NextResponse } from "next/server";
import { downloadCrmFile } from "@/lib/crm/files";
import { catalogueCrawlerDecision, catalogueImageSegments, publicImageCacheHeaders } from "@/lib/crm/public-catalogue";

export const runtime = "nodejs";

const MAX_BYTES = 8_000_000;

type Ctx = { params: Promise<{ path: string[] }> };

/** Image catalogue servie par le CDN. Le navigateur ne va pas sur Storage. */
export async function GET(request: Request, ctx: Ctx) {
  const url = new URL(request.url);
  const crawler = catalogueCrawlerDecision({
    path: url.pathname,
    userAgent: request.headers.get("user-agent"),
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip"),
    now: Date.now(),
  });
  if (crawler.action === "limit") {
    return new NextResponse("Trop de requêtes.", {
      status: 429,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Retry-After": String(crawler.retryAfter),
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  }
  const { path: segments } = await ctx.params;
  const path = catalogueImageSegments(segments);
  if (!path) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });

  try {
    const file = await downloadCrmFile(path);
    if (!file.bytes.byteLength || file.bytes.byteLength > MAX_BYTES) {
      return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    const contentType = file.contentType.toLowerCase();
    if (!contentType.startsWith("image/")) {
      return new NextResponse(null, { status: 415, headers: { "Cache-Control": "no-store" } });
    }
    return new NextResponse(Buffer.from(file.bytes), { headers: publicImageCacheHeaders(contentType) });
  } catch {
    return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
}
