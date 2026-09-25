import { NextResponse } from "next/server";
import { exampleSessionEnabled } from "@/lib/crm/example-session";
import { removeExampleCompanion, saveExampleCompanion } from "@/lib/crm/example-store";

export const runtime = "nodejs";

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(request: Request) {
  if (!exampleSessionEnabled()) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const first = text(body?.first_name);
  const last = text(body?.last_name);
  if (!first || !last) return NextResponse.json({ error: "Nom et prénom requis" }, { status: 400 });
  const companion = saveExampleCompanion({
    firstName: first,
    lastName: last,
    usageName: text(body?.usage_name),
    birthDate: text(body?.birth_date),
    sex: text(body?.sex),
    nationality: text(body?.nationality),
    relationship: text(body?.relationship),
  });
  return NextResponse.json({ companion });
}

export async function DELETE(request: Request) {
  if (!exampleSessionEnabled()) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  removeExampleCompanion(id);
  return NextResponse.json({ ok: true });
}
