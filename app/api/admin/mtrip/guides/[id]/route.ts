import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminUser, jsonError } from "@/lib/agency/auth";
import { upsertClientFromLead } from "@/lib/agency/upsert-client";
import { deleteTrips, MtripError } from "@/lib/mtrip/client";
import { passengerSchema } from "@/lib/mtrip/passenger-schema";
import type {
  AgencyMtripGuide,
  MtripGuidePassenger,
} from "@/lib/mtrip/guide-types";
import { buildVoyageTitle } from "@/lib/mtrip/voyage-title";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const quoteLineSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["flight", "hotel", "transfer", "other"]),
  title: z.string(),
  confirmation: z.string().nullable().optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  amount: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
  document_id: z.string().nullable().optional(),
  source_file: z.string().nullable().optional(),
  room_type: z.string().nullable().optional(),
  room_details: z.string().nullable().optional(),
});

const patchSchema = z.object({
  title: z.string().min(2).optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  dossier_id: z.string().uuid().nullable().optional(),
  passengers: z.array(passengerSchema).optional(),
  status: z.enum(["draft", "ready", "error"]).optional(),
  quote_lines: z.array(quoteLineSchema).optional(),
});

export async function GET(_request: Request, { params }: Params) {
  const auth = await requireAdminUser();
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;
  const { id } = await params;

  const { data, error } = await supabase
    .from("agency_mtrip_guides")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return jsonError(error.message, 500);
  if (!data) return jsonError("Voyage introuvable", 404);
  return NextResponse.json({ guide: data });
}

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireAdminUser();
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;
  const { id } = await params;

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError("Validation échouée", 422, parsed.error.flatten());
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    ...parsed.data,
  };

  if (parsed.data.passengers) {
    const passengers = parsed.data.passengers as MtripGuidePassenger[];
    const lead =
      passengers.find((p) => p.role === "lead_traveler") || passengers[0];
    try {
      const client = await upsertClientFromLead(supabase, user.id, passengers, {
        address_line: lead?.address_line,
        postal_code: lead?.postal_code,
        city: lead?.city,
        country: lead?.country,
      });
      if (client) updates.client_id = client.id;
    } catch (err) {
      return jsonError(
        err instanceof Error ? err.message : "Compte client impossible",
        500
      );
    }
  }

  if (parsed.data.quote_lines) {
    const { data: current } = await supabase
      .from("agency_mtrip_guides")
      .select("extraction,start_date,end_date,title")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    const start =
      (parsed.data.start_date !== undefined
        ? parsed.data.start_date
        : current?.start_date) || null;
    const end =
      (parsed.data.end_date !== undefined
        ? parsed.data.end_date
        : current?.end_date) || null;
    updates.title = buildVoyageTitle({
      start_date: start,
      end_date: end,
      quote_lines: parsed.data.quote_lines,
      extraction: (current?.extraction as AgencyMtripGuide["extraction"]) || undefined,
      currentTitle:
        typeof parsed.data.title === "string"
          ? parsed.data.title
          : current?.title,
    });
  } else if (
    parsed.data.start_date !== undefined ||
    parsed.data.end_date !== undefined
  ) {
    const { data: current } = await supabase
      .from("agency_mtrip_guides")
      .select("extraction,quote_lines,start_date,end_date,title")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    updates.title = buildVoyageTitle({
      start_date:
        parsed.data.start_date !== undefined
          ? parsed.data.start_date
          : current?.start_date,
      end_date:
        parsed.data.end_date !== undefined
          ? parsed.data.end_date
          : current?.end_date,
      quote_lines: (current?.quote_lines as AgencyMtripGuide["quote_lines"]) || [],
      extraction: (current?.extraction as AgencyMtripGuide["extraction"]) || undefined,
      currentTitle: current?.title,
    });
  }

  if (parsed.data.quote_lines && !parsed.data.status) {
    updates.status = "ready";
  }
  if (
    [
      "title",
      "start_date",
      "end_date",
      "dossier_id",
      "passengers",
      "quote_lines",
    ].some((field) => field in parsed.data)
  ) {
    updates.status = "ready";
    updates.payload = null;
    updates.app_links = {};
    updates.published_at = null;
    updates.mtrip_trip_id = null;
    updates.last_error = null;
  }

  const { data, error } = await supabase
    .from("agency_mtrip_guides")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ guide: data });
}

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireAdminUser();
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;
  const { id } = await params;

  const { data: guide, error: fetchError } = await supabase
    .from("agency_mtrip_guides")
    .select("id, mtrip_identifier, documents, passport_files")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchError) return jsonError(fetchError.message, 500);
  if (!guide) return jsonError("Voyage introuvable", 404);

  const identifier = (guide as Pick<AgencyMtripGuide, "mtrip_identifier">)
    .mtrip_identifier;
  let mtripDeleted = false;
  if (identifier) {
    try {
      await deleteTrips([identifier]);
      mtripDeleted = true;
    } catch (err) {
      // Trip déjà absent côté mTrip → on continue la purge CRM
      const status = err instanceof MtripError ? err.status : 0;
      if (status !== 404) {
        console.warn("[mtrip] delete trip failed:", identifier, err);
        return jsonError(
          "Suppression mTrip non confirmée. Le dossier CRM est conservé pour permettre une nouvelle tentative.",
          502
        );
      }
    }
  }

  const paths = [
    ...((guide.documents || []) as Array<{ storage_path?: string }>),
    ...((guide.passport_files || []) as Array<{ storage_path?: string }>),
  ]
    .map((file) => file.storage_path)
    .filter((path): path is string => Boolean(path));
  if (paths.length) {
    const { error: storageError } = await supabase.storage
      .from("agency-mtrip")
      .remove(paths);
    if (storageError) {
      return jsonError(
        "Suppression des fichiers impossible. Le dossier CRM est conservé.",
        502
      );
    }
  }

  const { error } = await supabase
    .from("agency_mtrip_guides")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true, mtrip_deleted: mtripDeleted });
}
