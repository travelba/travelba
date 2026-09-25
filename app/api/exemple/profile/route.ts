import { NextResponse } from "next/server";
import { exampleSessionEnabled } from "@/lib/crm/example-session";
import { patchExampleCustomer } from "@/lib/crm/example-store";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  if (!exampleSessionEnabled()) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Corps manquant" }, { status: 400 });
  return NextResponse.json({ customer: patchExampleCustomer(body) });
}
