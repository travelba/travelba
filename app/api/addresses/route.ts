import { NextResponse } from "next/server";
import { searchAddresses } from "@/lib/crm/address-suggest";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const hits = await searchAddresses(url.searchParams.get("q") || "", url.searchParams.get("near"));
  return NextResponse.json({ hits });
}
