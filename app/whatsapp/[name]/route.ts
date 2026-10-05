import { isJpeg, loadWhatsappImage, whatsappImageKind } from "@/lib/crm/whatsapp-images";

type Ctx = { params: Promise<{ name: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const { name } = await ctx.params;
  const kind = whatsappImageKind(name);
  if (!kind) return new Response("Introuvable", { status: 404 });
  const bytes = await loadWhatsappImage(kind);
  if (!bytes || !isJpeg(bytes)) return new Response("Introuvable", { status: 404 });
  return new Response(Buffer.from(bytes), {
    headers: {
      "content-type": "image/jpeg",
      "cache-control": "public, max-age=86400",
    },
  });
}
