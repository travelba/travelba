import { NextResponse } from "next/server";
import { exampleSessionEnabled } from "@/lib/crm/example-session";
import {
  exampleReferenceOk,
  ExampleStop,
  requestExampleFullCredit,
  updateExampleFullCredit,
} from "@/lib/crm/example-store";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  if (!exampleSessionEnabled()) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  const { id } = await ctx.params;
  if (!exampleReferenceOk(id)) return NextResponse.json({ error: "Séjour introuvable" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as {
    itemId?: string;
    action?: string;
    creditId?: string;
    hotelEmail?: string;
    subject?: string;
    body?: string;
    paymentUrl?: string;
    amount?: unknown;
  };
  try {
    if (body.action) {
      const credit = updateExampleFullCredit({
        creditId: body.creditId || "",
        action: body.action,
        hotelEmail: body.hotelEmail,
        subject: body.subject,
        body: body.body,
        paymentUrl: body.paymentUrl,
        amount: body.amount,
      });
      return NextResponse.json({ status: credit.status });
    }
    const credit = requestExampleFullCredit((body.itemId || "").trim());
    return NextResponse.json({ status: credit.status });
  } catch (err) {
    if (err instanceof ExampleStop) return NextResponse.json({ error: err.message }, { status: 400 });
    return NextResponse.json({ error: "Demande impossible" }, { status: 400 });
  }
}
