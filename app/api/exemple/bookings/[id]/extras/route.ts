import { NextResponse } from "next/server";
import { exampleReferenceOk, ExampleStop, orderExampleExtra } from "@/lib/crm/example-store";
import { exampleSessionEnabled } from "@/lib/crm/example-session";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  if (!exampleSessionEnabled()) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  const { id } = await ctx.params;
  if (!exampleReferenceOk(id)) return NextResponse.json({ error: "Séjour introuvable" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  try {
    const result = orderExampleExtra({
      kind: typeof body?.kind === "string" ? body.kind : "",
      leg: typeof body?.leg === "string" ? body.leg : null,
      place: typeof body?.place === "string" ? body.place : null,
      moment: typeof body?.moment === "string" ? body.moment : null,
      address: typeof body?.address === "string" ? body.address : null,
      decline: body?.decline === true,
      cancel: body?.cancel === true,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ExampleStop) {
      return NextResponse.json({ error: err.message, issues: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Demande impossible" }, { status: 400 });
  }
}
