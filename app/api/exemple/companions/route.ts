import { NextResponse } from "next/server";
import { exampleSessionEnabled } from "@/lib/crm/example-session";
import { removeExampleCompanion, saveExampleCompanion, updateExampleCompanion } from "@/lib/crm/example-store";
import { normalizeLoyaltyMap } from "@/lib/crm/loyalty";
import { storedCompanionPhone } from "@/lib/crm/trip-share";

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
  const phone = storedCompanionPhone(body?.phone);
  if (!phone.ok) return NextResponse.json({ error: "Téléphone invalide" }, { status: 400 });
  const companion = saveExampleCompanion({
    firstName: first,
    lastName: last,
    usageName: text(body?.usage_name),
    birthDate: text(body?.birth_date),
    sex: text(body?.sex),
    nationality: text(body?.nationality),
    relationship: text(body?.relationship),
    phone: phone.phone,
    loyalty: body && "loyalty" in body ? normalizeLoyaltyMap(body.loyalty) : null,
  });
  return NextResponse.json({ companion });
}

export async function PATCH(request: Request) {
  if (!exampleSessionEnabled()) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const id = text(body?.id);
  const first = text(body?.first_name);
  const last = text(body?.last_name);
  if (!id || !first || !last) return NextResponse.json({ error: "Champs requis" }, { status: 400 });
  const phone = body && Object.prototype.hasOwnProperty.call(body, "phone")
    ? storedCompanionPhone(body.phone)
    : { ok: true as const, phone: undefined };
  if (!phone.ok) return NextResponse.json({ error: "Téléphone invalide" }, { status: 400 });
  const companion = updateExampleCompanion(id, {
    firstName: first,
    lastName: last,
    usageName: text(body?.usage_name),
    birthDate: text(body?.birth_date),
    sex: text(body?.sex),
    nationality: text(body?.nationality),
    relationship: text(body?.relationship),
    phone: phone.phone,
    loyalty: body && "loyalty" in body ? normalizeLoyaltyMap(body.loyalty) : undefined,
  });
  if (!companion) return NextResponse.json({ error: "Voyageur introuvable" }, { status: 404 });
  return NextResponse.json({ companion });
}

export async function DELETE(request: Request) {
  if (!exampleSessionEnabled()) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  removeExampleCompanion(id);
  return NextResponse.json({ ok: true });
}
