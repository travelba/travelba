import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { toE164 } from "@/lib/crm/phone";
import { createServiceClient } from "@/lib/supabase/admin";
import { embeddingLiteral, isKnowledgeKind, knowledgeSeed, parseExampleImport } from "@/lib/crm/concierge-knowledge";
import { conciergeOutboundArmed, decideProposal } from "@/lib/crm/concierge-proposals";
import { decideFollowupDelivery } from "@/lib/crm/carnet-addition";
import { clientTouchpointBody } from "@/lib/crm/concierge-touchpoints";
import { isVercelPreview } from "@/lib/crm/preview-secrets";
import { proactiveWhatsappAllowed } from "@/lib/crm/whatsapp-concierge";
import { withConciergeSignature } from "@/lib/crm/whatsapp";
import { sessionWindowOpen } from "@/lib/crm/whatsapp-inbox";
import { sendWhatsappSession, sessionAddress } from "@/lib/crm/whatsapp-session";

export const runtime = "nodejs";

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const body = (await request.json().catch(() => null)) as {
    action?: string;
    kind?: string;
    title?: string;
    text?: string;
    proposalId?: string;
    followupId?: string;
    edited?: string;
  } | null;
  const action = body?.action;
  let admin: ReturnType<typeof createServiceClient>;
  try {
    admin = createServiceClient();
  } catch {
    return jsonError("Service indisponible", 503);
  }

  if (action === "seed") {
    const rows = knowledgeSeed().map((item) => ({
      kind: item.kind,
      title: item.title,
      body: item.body,
      locale: item.locale,
      tags: item.tags,
      published: true,
      embedding: embeddingLiteral(`${item.title}\n${item.body}`),
    }));
    const { error } = await admin.from("crm_concierge_knowledge").insert(rows);
    if (error) return jsonError("La migration du Concierge n’est pas encore appliquée.", 503);
    return NextResponse.json({ ok: true, count: rows.length });
  }

  if (action === "save") {
    const kind = body?.kind || "";
    const title = (body?.title || "").trim();
    const text = (body?.text || "").trim();
    if (!isKnowledgeKind(kind) || title.length < 2 || text.length < 2) return jsonError("Texte incomplet", 400);
    const titleCut = title.slice(0, 120);
    const bodyCut = text.slice(0, 4000);
    const { error } = await admin.from("crm_concierge_knowledge").insert({
      kind,
      title: titleCut,
      body: bodyCut,
      locale: "fr",
      tags: [kind],
      published: true,
      embedding: embeddingLiteral(`${titleCut}\n${bodyCut}`),
    });
    if (error) return jsonError("La migration du Concierge n’est pas encore appliquée.", 503);
    return NextResponse.json({ ok: true });
  }

  if (action === "import") {
    const rows = parseExampleImport(body?.text || "");
    if (!rows.length) return jsonError("Aucun exemple", 400);
    const { error } = await admin.from("crm_concierge_knowledge").insert(
      rows.map((item) => ({
        kind: "example",
        title: item.title,
        body: item.body,
        locale: "fr",
        tags: item.tags,
        published: true,
        embedding: embeddingLiteral(`${item.title}\n${item.body}`),
      }))
    );
    if (error) return jsonError("La migration du Concierge n’est pas encore appliquée.", 503);
    return NextResponse.json({ ok: true, count: rows.length });
  }

  if (action === "approve" || action === "reject" || action === "edit") {
    const proposalId = body?.proposalId || "";
    if (!ID.test(proposalId)) return jsonError("Proposition manquante", 400);
    const { data, error } = await admin
      .from("crm_concierge_proposals")
      .select("id, draft_body, status, phone, customer_id, booking_id")
      .eq("id", proposalId)
      .maybeSingle();
    if (error || !data) return jsonError("La migration du Concierge n’est pas encore appliquée.", 503);
    const decision = decideProposal(
      { draftBody: String(data.draft_body || "") },
      action,
      body?.edited || null,
      conciergeOutboundArmed()
    );
    if ("error" in decision && decision.error) return jsonError(decision.error, 400);
    const { error: updateError } = await admin
      .from("crm_concierge_proposals")
      .update({
        status: decision.status,
        draft_body: decision.body || data.draft_body,
        decided_by: auth.staff.id,
        decided_at: new Date().toISOString(),
      })
      .eq("id", proposalId);
    if (updateError) return jsonError("La proposition n’a pas été mise à jour.", 503);
    let sent = false;
    const phone = toE164(String(data.phone || ""), "FR");
    const outbound = decision.body;
    const to = phone ? sessionAddress(phone) : null;
    if (decision.send && typeof outbound === "string" && to) {
      const result = await sendWhatsappSession({ to, body: outbound });
      sent = result.ok;
      if (result.ok) {
        await admin.from("crm_whatsapp_messages").insert({
          customer_id: data.customer_id,
          booking_id: data.booking_id,
          direction: "outbound",
          template_key: "chat",
          body: outbound,
          twilio_sid: result.sid,
          status: "sent",
          error: null,
        });
      }
    }
    return NextResponse.json({ ok: true, sent, status: decision.status });
  }

  if (action === "send-followup") {
    const followupId = body?.followupId || "";
    if (!ID.test(followupId)) return jsonError("Relance manquante", 400);
    const loaded = await admin
      .from("crm_concierge_followups")
      .select("id, phone, customer_id, booking_id, kind, template_key, draft_body, due_at, status")
      .eq("id", followupId)
      .maybeSingle();
    if (loaded.error || !loaded.data) return jsonError("La relance n’est pas encore disponible.", 503);
    const row = loaded.data as {
      id: string;
      phone: string;
      customer_id: string | null;
      booking_id: string | null;
      kind: string;
      template_key: string | null;
      draft_body: string;
      due_at: string;
      status: string;
    };
    if (row.status !== "planned") return jsonError("Cette relance est déjà traitée.", 400);
    const customer = row.customer_id
      ? await admin
          .from("crm_customers")
          .select("phone, whatsapp_opt_in_at, whatsapp_opt_out_at")
          .eq("id", row.customer_id)
          .maybeSingle()
      : { data: null, error: null };
    if (customer.error) return jsonError("La relance n’est pas encore disponible.", 503);
    const person = customer.data as {
      phone?: string | null;
      whatsapp_opt_in_at?: string | null;
      whatsapp_opt_out_at?: string | null;
    } | null;
    if (!person || !proactiveWhatsappAllowed({ whatsapp_opt_in_at: person.whatsapp_opt_in_at, whatsapp_opt_out_at: person.whatsapp_opt_out_at })) {
      return jsonError("Le client a coupé WhatsApp.", 400);
    }
    const phone = toE164(String(row.phone || person.phone || ""), "FR");
    const to = phone ? sessionAddress(phone) : null;
    if (!to) return jsonError("Pas de téléphone pour WhatsApp.", 400);
    const last = await admin
      .from("crm_whatsapp_messages")
      .select("created_at")
      .eq("phone", phone)
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const now = new Date();
    const windowOpen = sessionWindowOpen((last.data as { created_at?: string } | null)?.created_at || null, now);
    const decision = decideFollowupDelivery({
      kind: row.kind,
      templateKey: row.template_key,
      windowOpen,
      preview: isVercelPreview(),
      dueAt: row.due_at,
      now,
    });
    if (!decision.send) return jsonError(decision.error, 409);
    const plain = clientTouchpointBody(String(row.draft_body || ""));
    if (!plain || /[A-Z0-9<]{20,}/.test(plain)) return jsonError("Le message n’est pas parti.", 400);
    const claimed = await admin
      .from("crm_concierge_followups")
      .update({ status: "sent" })
      .eq("id", followupId)
      .eq("status", "planned")
      .select("id");
    if (claimed.error) return jsonError("La relance n’est pas encore disponible.", 503);
    if (!claimed.data?.length) return jsonError("Cette relance est déjà traitée.", 400);
    const text = withConciergeSignature(plain);
    const result = await sendWhatsappSession({ to, body: text });
    if (!result.ok) {
      await admin.from("crm_concierge_followups").update({ status: "planned" }).eq("id", followupId).eq("status", "sent");
      return jsonError("Le message n’est pas parti.", 502);
    }
    await admin.from("crm_whatsapp_messages").insert({
      customer_id: row.customer_id,
      booking_id: row.booking_id,
      phone,
      direction: "outbound",
      template_key: "chat",
      body: text,
      twilio_sid: result.sid,
      status: "sent",
      error: null,
    });
    return NextResponse.json({ ok: true, sent: true });
  }

  return jsonError("Action inconnue", 400);
}
