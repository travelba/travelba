import { NextResponse } from "next/server";
import { requireAdminUser, jsonError } from "@/lib/agency/auth";
import { listAccounts, MtripError } from "@/lib/mtrip/client";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireAdminUser();
  if (auth instanceof NextResponse) return auth;

  try {
    const data = await listAccounts();
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof MtripError) {
      return jsonError(error.message, error.status, error.body);
    }
    throw error;
  }
}
