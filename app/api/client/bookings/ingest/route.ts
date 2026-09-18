import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    { error: "L’import de documents se fait uniquement par l’agence." },
    { status: 404 }
  );
}
