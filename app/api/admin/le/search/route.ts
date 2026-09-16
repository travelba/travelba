import { NextResponse } from "next/server";
import { requireAdminUser, jsonError } from "@/lib/agency/auth";
import {
  LittleEmperorsError,
  predictiveSearch,
} from "@/lib/little-emperors/client";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireAdminUser();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query")?.trim();
  if (!query || query.length < 2) {
    return jsonError("Query trop courte");
  }

  try {
    const results = await predictiveSearch(query, 20);
    return NextResponse.json({ results });
  } catch (error) {
    if (error instanceof LittleEmperorsError) {
      return jsonError(error.message, error.status, error.body);
    }
    throw error;
  }
}
