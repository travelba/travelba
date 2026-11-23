import { NextResponse } from "next/server";
import { requireCustomer } from "@/lib/crm/auth";
import { pushTargetPath } from "@/lib/crm/native-portal";

export const runtime = "nodejs";

/** Messages déjà posés par les notifications (vol, départ, règlement). */
export async function GET() {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const { data, error } = await auth.supabase
    .from("crm_notifications")
    .select("id, title, message, action_url, created_at")
    .eq("customer_id", auth.customer.id)
    .order("created_at", { ascending: false })
    .limit(8);
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return NextResponse.json({ notices: [] });
    return NextResponse.json({ notices: [] });
  }
  const notices = ((data || []) as { id: string; title: string; message: string; action_url: string | null; created_at: string }[])
    .map((row) => {
      const url = pushTargetPath(row.action_url || "");
      if (!url) return null;
      return {
        id: row.id,
        title: row.title,
        message: row.message,
        url,
        createdAt: row.created_at,
      };
    })
    .filter((row) => row !== null);
  return NextResponse.json({ notices });
}
