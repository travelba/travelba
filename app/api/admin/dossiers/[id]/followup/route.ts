import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { requireAdminUser, jsonError } from "@/lib/agency/auth";
import { buildHotelPaymentEmail } from "@/lib/agency/email-templates";
import { siteConfig } from "@/lib/site";

export const runtime = "nodejs";

const schema = z.object({
  booking_id: z.string().uuid().optional(),
  to_emails: z.array(z.string().email()).min(1),
  subject: z.string().optional(),
  body: z.string().optional(),
  send: z.boolean().default(true),
  payment_link: z.string().url().nullable().optional(),
  status: z
    .enum(["draft", "sent", "awaiting_link", "link_received", "paid", "cancelled"])
    .optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminUser();
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;
  const { id } = await context.params;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError("Validation échouée", 422, parsed.error.flatten());
  }

  const { data: dossier } = await supabase
    .from("agency_dossiers")
    .select("*, agency_clients(*)")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!dossier) return jsonError("Dossier introuvable", 404);

  let booking = null;
  if (parsed.data.booking_id) {
    const { data } = await supabase
      .from("agency_bookings")
      .select("*")
      .eq("id", parsed.data.booking_id)
      .eq("user_id", user.id)
      .single();
    booking = data;
  } else {
    const { data } = await supabase
      .from("agency_bookings")
      .select("*")
      .eq("dossier_id", id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    booking = data;
  }

  const template = buildHotelPaymentEmail({
    hotelName: booking?.hotel_name || dossier.hotel_name || "Hôtel",
    guestName:
      booking?.guest_name ||
      dossier.agency_clients?.name ||
      "Client",
    checkIn: booking?.check_in || dossier.start_date,
    checkOut: booking?.check_out || dossier.end_date,
    confirmationNumber: booking?.confirmation_number,
    totalCost: booking?.total_cost,
    currency: booking?.currency || dossier.currency,
  });

  const subject = parsed.data.subject || template.subject;
  const body = parsed.data.body || template.body;

  let resendId: string | null = null;
  let sentAt: string | null = null;
  let status = parsed.data.status || "draft";

  if (parsed.data.send) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return jsonError(
        "RESEND_API_KEY manquante — impossible d'envoyer l'email hôtel",
        500
      );
    }

    const resend = new Resend(apiKey);
    const from = process.env.CONTACT_FROM_EMAIL || "onboarding@resend.dev";
    const { data: sent, error } = await resend.emails.send({
      from: `${siteConfig.name} <${from}>`,
      to: parsed.data.to_emails,
      subject,
      text: body,
    });

    if (error) return jsonError(error.message, 502);
    resendId = sent?.id || null;
    sentAt = new Date().toISOString();
    status = "awaiting_link";

    await supabase
      .from("agency_dossiers")
      .update({ status: "payment_pending" })
      .eq("id", id)
      .eq("user_id", user.id);
  }

  if (parsed.data.payment_link) {
    status = "link_received";
  }

  const { data: followup, error: saveError } = await supabase
    .from("agency_payment_followups")
    .insert({
      dossier_id: id,
      booking_id: booking?.id || null,
      user_id: user.id,
      status,
      to_emails: parsed.data.to_emails,
      subject,
      body,
      payment_link: parsed.data.payment_link ?? null,
      resend_id: resendId,
      sent_at: sentAt,
    })
    .select("*")
    .single();

  if (saveError) return jsonError(saveError.message, 500);
  return NextResponse.json({ followup, preview: { subject, body } });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminUser();
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;
  const { id } = await context.params;

  const body = z
    .object({
      followup_id: z.string().uuid(),
      payment_link: z.string().url().nullable().optional(),
      status: z
        .enum([
          "draft",
          "sent",
          "awaiting_link",
          "link_received",
          "paid",
          "cancelled",
        ])
        .optional(),
    })
    .safeParse(await request.json().catch(() => null));

  if (!body.success) {
    return jsonError("Validation échouée", 422, body.error.flatten());
  }

  const updates: Record<string, unknown> = {};
  if (body.data.payment_link !== undefined) {
    updates.payment_link = body.data.payment_link;
    updates.status = "link_received";
  }
  if (body.data.status) updates.status = body.data.status;

  const { data, error } = await supabase
    .from("agency_payment_followups")
    .update(updates)
    .eq("id", body.data.followup_id)
    .eq("dossier_id", id)
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (error) return jsonError(error.message, 500);

  if (body.data.status === "paid") {
    await supabase
      .from("agency_dossiers")
      .update({ status: "paid" })
      .eq("id", id)
      .eq("user_id", user.id);
  }

  return NextResponse.json({ followup: data });
}
