import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Little Emperors booking webhooks (configure URL with LE support).
 * Events: hotel_booking_create | hotel_booking_update | hotel_booking_cancel
 */
export async function POST(request: Request) {
  const accessKey = process.env.LITTLE_EMPERORS_WEBHOOK_KEY;
  if (accessKey) {
    const provided =
      request.headers.get("x-access-key") ||
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (provided !== accessKey) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let payload: { event?: string; data?: { id?: number } };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  console.info("[le-webhook]", payload.event, payload.data?.id);

  return NextResponse.json({
    status: "success",
    message: "Webhook received successfully",
  });
}
