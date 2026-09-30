import { isJpeg, loadWhatsappImage, whatsappImageKind } from "@/lib/crm/whatsapp-images";

export async function GET(_request: Request, ctx: RouteContext<"/whatsapp/[name]">) {
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
