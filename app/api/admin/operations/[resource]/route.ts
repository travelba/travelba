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

function requestKey(body: Record<string, unknown>) {
  const value = String(body._request_id || "");
  return /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value) ? value : null;
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

function safeActionUrl(value: unknown) {
  if (value == null || value === "") return null;
  const actionUrl = String(value).trim();
  if (
    !actionUrl.startsWith("/") ||
    actionUrl.startsWith("//") ||
    actionUrl.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(actionUrl)
  ) {
    throw new Error("Le lien de notification doit être un chemin interne.");
  }
  const parsed = new URL(actionUrl, "https://travelba.invalid");
  if (parsed.origin !== "https://travelba.invalid") {
    throw new Error("Le lien de notification doit être un chemin interne.");
  }
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

async function deliverNotificationEmail(
  request: Request,
  notification: {
    id: string;
    customer_id: string;
    kind: string;
    title: string;
    message: string;
    action_url?: string | null;
  }
) {
  const service = createServiceClient();
  const [{ data: customer }, { data: preferences }] = await Promise.all([
    service
      .from("crm_customers")
      .select("first_name,email")
      .eq("id", notification.customer_id)
      .maybeSingle(),
    service
      .from("crm_notification_preferences")
      .select("email_travel,email_payment,email_documents")
      .eq("customer_id", notification.customer_id)
      .maybeSingle(),
  ]);
  const preference =
    notification.kind === "payment"
      ? preferences?.email_payment !== false
      : notification.kind === "document"
        ? preferences?.email_documents !== false
        : preferences?.email_travel !== false;
  if (!preference || !customer?.email) return { delivery: "portal", warning: null };

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return {
      delivery: "portal",
      warning: "Resend non configuré : notification disponible uniquement dans le portail.",
    };
  }
  const origin = new URL(request.url).origin;
  const link = notification.action_url
    ? `${origin}${notification.action_url}`
    : `${origin}/mon-compte/notifications`;
  const { error } = await new Resend(apiKey).emails.send({
    from: `Travelba <${process.env.CONTACT_FROM_EMAIL?.trim() || "contact@travelba.fr"}>`,
    to: [customer.email],
    subject: notification.title,
    text: `Bonjour ${customer.first_name},\n\n${notification.message}\n\nConsulter : ${link}\n\nL’équipe Travelba`,
  }, { idempotencyKey: `crm-notification/${notification.id}` });
  return error
    ? { delivery: "portal", warning: error.message }
    : { delivery: "email", warning: null };
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
  const operationKey = requestKey(body);
  if (resource === "notifications") {
    try {
      payload.action_url = safeActionUrl(payload.action_url);
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : "Lien invalide");
    }
    if (operationKey) payload.idempotency_key = `notification:${operationKey}`;
  }
  if (resource === "quotes") payload.created_by = auth.staff.id;
  const database = resource === "notifications" ? createServiceClient() : auth.supabase;
  const query = database.from(config.table);
  const { data, error } = resource === "notifications" && operationKey
    ? await query
        .upsert(payload, { onConflict: "idempotency_key" })
        .select("*")
        .single()
    : await query.insert(payload).select("*").single();
  if (error) return jsonError(error.message, 400);
  await audit(auth, resource, String(data.id), "created");
  if (resource === "notifications") {
    const result = await deliverNotificationEmail(request, data);
    return NextResponse.json({
      item: data,
      delivery: result.delivery,
      delivery_warning: result.warning,
    });
  }
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
  const operationKey = requestKey(body);
  if (resource === "notifications" && "action_url" in payload) {
    try {
      payload.action_url = safeActionUrl(payload.action_url);
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : "Lien invalide");
    }
  }
  let previousRequestResponse: string | null = null;
  let requestDeliveryRetry = false;
  if (resource === "requests" && payload.staff_response) {
    const { data: currentRequest } = await auth.supabase
      .from("crm_service_requests")
      .select("staff_response,response_delivery_key")
      .eq("id", id)
      .maybeSingle();
    previousRequestResponse = currentRequest?.staff_response || null;
    requestDeliveryRetry = Boolean(
      operationKey &&
        currentRequest?.response_delivery_key ===
          `request-response:${operationKey}`
    );
    if (
      operationKey &&
      String(payload.staff_response) !== previousRequestResponse
    ) {
      payload.response_delivery_key = `request-response:${operationKey}`;
    }
  }
  if (resource === "quotes" && payload.status === "sent") {
    const { data: current, error: quoteError } = await auth.supabase
      .from("crm_quotes")
      .select("*, crm_quote_lines(*)")
      .eq("id", id)
      .maybeSingle();
    if (quoteError || !current) return jsonError("Devis introuvable", 404);
    const deliveryRetry =
      operationKey &&
      current.delivery_idempotency_key === `quote:${operationKey}`;
    const nextVersion = deliveryRetry
      ? current.version
      : current.status === "draft"
        ? current.version
        : Number(current.version) + 1;
    payload.version = nextVersion;
    payload.sent_at = deliveryRetry ? current.sent_at : new Date().toISOString();
    if (operationKey) payload.delivery_idempotency_key = `quote:${operationKey}`;
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
  if (
    resource === "requests" &&
    payload.staff_response &&
    (String(payload.staff_response) !== previousRequestResponse ||
      requestDeliveryRetry)
  ) {
    const notificationPayload = {
        customer_id: data.customer_id,
        booking_id: data.booking_id,
        kind: "agency",
        title: `Réponse à votre demande : ${data.subject}`,
        message: String(payload.staff_response),
        action_url: "/mon-compte/demandes",
        ...(operationKey
          ? { idempotency_key: `request-response:${operationKey}` }
          : {}),
      };
    const notifications = createServiceClient().from("crm_notifications");
    const { data: notification, error: notificationError } = operationKey
      ? await notifications
          .upsert(notificationPayload, { onConflict: "idempotency_key" })
          .select("*")
          .single()
      : await notifications.insert(notificationPayload).select("*").single();
    if (notificationError) {
      deliveryWarning = notificationError.message;
    } else {
      const result = await deliverNotificationEmail(request, notification);
      delivery = result.delivery as typeof delivery;
      deliveryWarning = result.warning;
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
