import { NextResponse } from "next/server";
import { exampleSessionEnabled } from "@/lib/crm/example-session";
import { exampleReferenceOk, ExampleStop, launchExampleVisa } from "@/lib/crm/example-store";
import type { EstaAnswers } from "@/lib/crm/visa-flow";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  if (!exampleSessionEnabled()) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  const { id } = await ctx.params;
  if (!exampleReferenceOk(id)) return NextResponse.json({ error: "Séjour introuvable" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as {
    country?: string;
    answers?: Partial<EstaAnswers>;
  };
  try {
    const requestRow = launchExampleVisa(body.country || "", body.answers || null);
    return NextResponse.json({ country: requestRow.country, step: requestRow.step });
  } catch (err) {
    if (err instanceof ExampleStop) return NextResponse.json({ error: err.message }, { status: 400 });
    return NextResponse.json({ error: "Demande impossible" }, { status: 400 });
  }
}
