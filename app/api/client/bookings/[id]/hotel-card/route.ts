import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** La carte hôtel reste côté agence. Le client ne peut pas la lire. */
export async function POST() {
  return NextResponse.json({ error: "Carte introuvable" }, { status: 404 });
}
