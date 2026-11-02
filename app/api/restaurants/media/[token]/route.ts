import { lookup } from "node:dns/promises";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { isPrivateAddress, parseMediaToken, publicHttpsUrl } from "@/lib/crm/restaurant-media";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ token: string }> };

const IMAGE = /^image\/(jpeg|jpg|png|webp)$/i;
const MAX_BYTES = 4_000_000;

async function hostResolvesPublic(hostname: string) {
  if (isPrivateAddress(hostname)) return false;
  try {
    const found = await lookup(hostname, { all: true });
    return found.length > 0 && found.every((row) => !isPrivateAddress(row.address));
  } catch {
    return false;
  }
}

async function readPublicImage(raw: string, hops = 0): Promise<{ bytes: Uint8Array; type: string } | null> {
  if (hops > 2) return null;
  const target = publicHttpsUrl(raw);
  if (!target) return null;
  const url = new URL(target);
  if (!(await hostResolvesPublic(url.hostname))) return null;
  let response: Response;
  try {
    response = await fetch(target, { redirect: "manual", signal: AbortSignal.timeout(8_000) });
  } catch {
    return null;
  }
  if (response.status >= 300 && response.status < 400) {
    const next = response.headers.get("location");
    if (!next) return null;
    return readPublicImage(new URL(next, target).toString(), hops + 1);
  }
  if (!response.ok) return null;
  const type = (response.headers.get("content-type") || "").split(";")[0].trim();
  if (!IMAGE.test(type)) return null;
  const length = Number(response.headers.get("content-length") || 0);
  if (length > MAX_BYTES) return null;
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.byteLength || bytes.byteLength > MAX_BYTES) return null;
  return { bytes, type };
}

function photoOf(row: { photo_urls?: string[] | null; signature_photo_url?: string | null; menu_photo_url?: string | null }, slot: "salle" | "plat" | "carte") {
  if (slot === "salle") return row.photo_urls?.[0] || "";
  if (slot === "plat") return row.signature_photo_url || "";
  return row.menu_photo_url || "";
}

export async function GET(_request: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const parsed = parseMediaToken(token);
  if (!parsed) return new NextResponse(null, { status: 404 });
  if (parsed.kind === "sample") {
    const file = await readFile(path.join(process.cwd(), "public/brand/logo-tba.png"));
    return new NextResponse(new Uint8Array(file), {
      headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" },
    });
  }
  let row: { photo_urls?: string[] | null; signature_photo_url?: string | null; menu_photo_url?: string | null } | null = null;
  try {
    const db = createServiceClient();
    const found = await db
      .from("crm_restaurants")
      .select("photo_urls, signature_photo_url, menu_photo_url")
      .eq("id", parsed.id)
      .maybeSingle();
    row = found.data;
  } catch {
    return new NextResponse(null, { status: 404 });
  }
  const source = row ? photoOf(row, parsed.slot) : "";
  const image = source ? await readPublicImage(source) : null;
  if (!image) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(Buffer.from(image.bytes)), {
    headers: {
      "Content-Type": image.type,
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
