import { NextResponse } from "next/server";
import { exampleSessionEnabled } from "@/lib/crm/example-session";

export const runtime = "nodejs";

export async function POST() {
  if (!exampleSessionEnabled()) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  return NextResponse.json({
    identity: null,
    identities: [],
    warning: "Lecture non faite sur cet aperçu. Aucun numéro n’est extrait.",
  });
}
