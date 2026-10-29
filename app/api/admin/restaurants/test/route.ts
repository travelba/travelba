import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { RESTAURANT_TEST_COOKIE, restaurantTestOperator } from "@/lib/crm/restaurant-test";
import { ensureRestaurantTestStay, purgeRestaurantTest, simulateRestaurantTestClose } from "@/lib/crm/restaurant-test-db";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  if (!restaurantTestOperator(auth.user.email)) return jsonError("Réservé à Benjamin.", 403);
  const body = (await request.json().catch(() => null)) as { action?: string } | null;
  const action = body?.action || "";
  const jar = await cookies();
  if (action === "couper") {
    jar.delete(RESTAURANT_TEST_COOKIE);
    return NextResponse.json({ on: false });
  }
  const admin = createServiceClient();
  if (action === "activer") {
    const ready = await ensureRestaurantTestStay(admin);
    if ("error" in ready) return jsonError(ready.error || "Mode test indisponible.");
    jar.set(RESTAURANT_TEST_COOKIE, "1", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 12 });
    return NextResponse.json({ on: true });
  }
  if (action === "simuler") {
    const closed = await simulateRestaurantTestClose(admin);
    if ("error" in closed) return jsonError(closed.error || "Simulation impossible.");
    return NextResponse.json(closed);
  }
  if (action === "supprimer") {
    const purged = await purgeRestaurantTest(admin);
    if ("error" in purged) return jsonError(purged.error || "Suppression impossible.");
    jar.delete(RESTAURANT_TEST_COOKIE);
    return NextResponse.json(purged);
  }
  return jsonError("Action inconnue.");
}
