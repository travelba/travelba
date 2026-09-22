import { NextResponse } from "next/server";
import { jsonError, requireCustomer, requireStaff } from "@/lib/crm/auth";
import { searchOfficialCompanies } from "@/lib/crm/entreprises";

export const runtime = "nodejs";

async function requireAgencyOrClient() {
  const staff = await requireStaff();
  if (!(staff instanceof NextResponse)) return staff;
  if (staff.status === 401) return staff;
  return requireCustomer();
}

export async function GET(request: Request) {
  const auth = await requireAgencyOrClient();
  if (auth instanceof NextResponse) return auth;
  const q = new URL(request.url).searchParams.get("q") || "";
  try {
    const companies = await searchOfficialCompanies(q);
    return NextResponse.json({ companies });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Annuaire indisponible";
    return jsonError(message, 502);
  }
}
