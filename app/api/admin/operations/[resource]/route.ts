import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { Resend } from "resend";

type Ctx = { params: Promise<{ resource: string }> };

const RESOURCES = {
  quotes: {
    table: "crm_quotes",
    fields: ["customer_id", "booking_id", "reference", "title", "status", "currency", "valid_until", "terms", "client_note", "version", "sent_at"],
  },
  quote_lines: {
    table: "crm_quote_lines",
    fields: ["quote_id", "kind", "title", "description", "quantity", "unit_price", "supplier_cost", "tax_rate", "optional", "selected", "sort_order"],
  },
  schedules: {
    table: "crm_payment_schedules",
    fields: ["customer_id", "booking_id", "quote_id", "label", "amount", "currency", "due_on", "status", "paid_amount", "paid_at"],
  },
  invoices: {
    table: "crm_invoices",
    fields: ["customer_id", "booking_id", "quote_id", "number", "kind", "status", "amount", "currency", "issued_on", "due_on", "paid_on", "storage_path"],
  },
  requests: {
    table: "crm_service_requests",
    fields: ["status", "priority", "assigned_to", "staff_response", "responded_at"],
  },
  tasks: {
    table: "crm_tasks",
    fields: ["customer_id", "booking_id", "assigned_to", "title", "description", "category", "priority", "status", "due_at", "completed_at"],
  },
  suppliers: {
    table: "crm_suppliers",
    fields: ["kind", "name", "contact_name", "email", "phone", "website", "account_reference", "notes", "active"],
  },
  notifications: {
    table: "crm_notifications",
    fields: ["customer_id", "booking_id", "kind", "title", "message", "action_url"],
  },
} as const;

const RESOURCE_CAPABILITY: Record<string, string> = {
  quotes: "quotes",
  quote_lines: "quotes",
  schedules: "finance",
  invoices: "finance",
  requests: "operations",
  tasks: "operations",
  notifications: "operations",
  suppliers: "suppliers",
};

function canMutate(auth: Exclude<Awaited<ReturnType<typeof requireStaff>>, NextResponse>, resource: string) {
  return auth.staff.role === "admin" || auth.staff.permissions?.[RESOURCE_CAPABILITY[resource]] === true;
}

function cleanBody(body: Record<string, unknown>, fields: readonly string[]) {
  return Object.fromEntries(fields.filter((field) => field in body).map((field) => [field, body[field]]));
}

async function audit(
  auth: Exclude<Awaited<ReturnType<typeof requireStaff>>, NextResponse>,
  resource: string,
  entityId: string,
  action: string
) {
  await createServiceClient().from("crm_audit_events").insert({
    actor_user_id: auth.user.id,
    actor_staff_id: auth.staff.id,
    entity_type: resource,
    entity_id: entityId,
    action,
  });
}

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { resource } = await ctx.params;
  const config = RESOURCES[resource as keyof typeof RESOURCES];
  if (!config) return jsonError("Ressource inconnue", 404);
  if (!canMutate(auth, resource)) return jsonError("Permission insuffisante", 403);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return jsonError("Corps JSON invalide");
  const payload = cleanBody(body, config.fields);
  if (resource === "quotes") payload.created_by = auth.staff.id;
  const database = resource === "notifications" ? createServiceClient() : auth.supabase;
  const { data, error } = await database.from(config.table).insert(payload).select("*").single();
  if (error) return jsonError(error.message, 400);
  await audit(auth, resource, String(data.id), "created");
  return NextResponse.json({ item: data });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { resource } = await ctx.params;
  const config = RESOURCES[resource as keyof typeof RESOURCES];
  if (!config) return jsonError("Ressource inconnue", 404);
  if (!canMutate(auth, resource)) return jsonError("Permission insuffisante", 403);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const id = String(body?.id || "");
  if (!body || !id) return jsonError("id requis");
  const payload = cleanBody(body, config.fields);
  if (resource === "quotes" && payload.status === "sent") {
    const { data: current, error: quoteError } = await auth.supabase
      .from("crm_quotes")
      .select("*, crm_quote_lines(*)")
      .eq("id", id)
      .maybeSingle();
    if (quoteError || !current) return jsonError("Devis introuvable", 404);
    const nextVersion = current.status === "draft" ? current.version : Number(current.version) + 1;
    payload.version = nextVersion;
    payload.sent_at = new Date().toISOString();
    const snapshot = {
      ...current,
      ...payload,
      crm_quote_lines: current.crm_quote_lines,
      captured_at: new Date().toISOString(),
    };
    const { error: versionError } = await auth.supabase
      .from("crm_quote_versions")
      .upsert(
        { quote_id: id, version: nextVersion, snapshot, created_by: auth.staff.id },
        { onConflict: "quote_id,version" }
      );
    if (versionError) return jsonError(versionError.message, 400);
  }
  if (resource === "requests" && payload.staff_response) payload.responded_at = new Date().toISOString();
  if (resource === "tasks" && payload.status === "done") payload.completed_at = new Date().toISOString();
  const database = resource === "notifications" ? createServiceClient() : auth.supabase;
  const { data, error } = await database.from(config.table).update(payload).eq("id", id).select("*").single();
  if (error) return jsonError(error.message, 400);
  await audit(auth, resource, id, "updated");
  let delivery: "not_requested" | "portal" | "email" = "not_requested";
  let deliveryWarning: string | null = null;
  if (resource === "quotes" && payload.status === "sent") {
    delivery = "portal";
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (apiKey) {
      const { data: recipient } = await auth.supabase
        .from("crm_customers")
        .select("first_name,email")
        .eq("id", data.customer_id)
        .maybeSingle();
      if (recipient?.email) {
        const origin = new URL(request.url).origin;
        const { error: sendError } = await new Resend(apiKey).emails.send({
          from: `Travelba <${process.env.CONTACT_FROM_EMAIL?.trim() || "contact@travelba.fr"}>`,
          to: [recipient.email],
          subject: `Votre devis Travelba ${data.reference}`,
          text: `Bonjour ${recipient.first_name},\n\nVotre devis « ${data.title} » est disponible dans votre espace sécurisé :\n${origin}/mon-compte/devis/${encodeURIComponent(data.reference)}\n\nL’équipe Travelba`,
        }, { idempotencyKey: `crm-quote/${data.id}/version/${data.version}` });
        if (sendError) deliveryWarning = sendError.message;
        else delivery = "email";
      }
    } else {
      deliveryWarning = "Resend non configuré : le devis est publié au portail sans e-mail.";
    }
  }
  return NextResponse.json({ item: data, delivery, delivery_warning: deliveryWarning });
}

export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { resource } = await ctx.params;
  const config = RESOURCES[resource as keyof typeof RESOURCES];
  if (!config) return jsonError("Ressource inconnue", 404);
  if (!canMutate(auth, resource)) return jsonError("Permission insuffisante", 403);
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return jsonError("id requis");
  const database = resource === "notifications" ? createServiceClient() : auth.supabase;
  const { error } = await database.from(config.table).delete().eq("id", id);
  if (error) return jsonError(error.message, 400);
  await audit(auth, resource, id, "deleted");
  return NextResponse.json({ ok: true });
}
