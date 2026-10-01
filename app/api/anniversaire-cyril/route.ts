import { NextResponse } from "next/server";
import { buildCyrilSheetRow, type CyrilGuest } from "@/lib/crm/cyril-flights";
import { appendCyrilRow, CyrilSheetError } from "@/lib/crm/cyril-sheet";

export const runtime = "nodejs";

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  if (text(body.tb_hp).trim()) {
    return NextResponse.json({ ok: true });
  }

  const guest: CyrilGuest = {
    lastName: text(body.lastName),
    firstName: text(body.firstName),
    phone: text(body.phone),
    companion: text(body.companion),
    outboundId: text(body.outboundId),
    returnId: text(body.returnId),
  };
  const built = buildCyrilSheetRow(guest);
  if (!built.ok) {
    return NextResponse.json({ error: built.error }, { status: 400 });
  }

  try {
    await appendCyrilRow(built.row);
  } catch (error) {
    if (error instanceof CyrilSheetError && error.code === "unconfigured") {
      return NextResponse.json(
        { error: "Le classeur n’est pas encore relié." },
        { status: 503 }
      );
    }
    console.error("[anniversaire-cyril] classeur");
    return NextResponse.json({ error: "Envoi impossible" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
