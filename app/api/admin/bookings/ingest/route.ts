import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { extractBookingFromPrepared } from "@/lib/crm/ingest-file";
import { matchCustomerId } from "@/lib/crm/ingest-booking";
import { assertStaffIngestPath } from "@/lib/crm/ingest-storage";
import { MAX_INGEST_FILES, type IngestStreamEvent } from "@/lib/crm/ingest-types";
import type { CrmCustomer } from "@/lib/crm/types";

export const runtime = "nodejs";
export const maxDuration = 300;

function encodeEvent(event: IngestStreamEvent) {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;

  let payload: {
    batchId?: string;
    files?: { path?: string; name?: string; type?: string }[];
  };
  try {
    payload = await request.json();
  } catch {
    return jsonError("Requête invalide");
  }

  const batchId = String(payload.batchId || "");
  const incoming = Array.isArray(payload.files) ? payload.files : [];
  if (!incoming.length) return jsonError("Ajoutez au moins un PDF ou une photo.");
  if (incoming.length > MAX_INGEST_FILES) {
    return jsonError(`Maximum ${MAX_INGEST_FILES} fichiers.`);
  }

  let staged: { path: string; name: string; type: string }[];
  try {
    staged = incoming.map((row) => {
      const path = String(row.path || "");
      assertStaffIngestPath(path, auth.user.id, batchId || undefined);
      return {
        path,
        name: String(row.name || path.split("/").pop() || "fichier"),
        type: String(row.type || ""),
      };
    });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Chemin invalide");
  }

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: IngestStreamEvent) => {
        controller.enqueue(encodeEvent(event));
      };
      try {
        const { extract, warnings } = await extractBookingFromPrepared(
          staged.map((file) => ({
            name: file.name,
            type: file.type,
            path: file.path,
          })),
          {
            signal: request.signal,
            onEvent: emit,
          }
        );
        const { data: customers } = await auth.supabase.from("crm_customers").select("*");
        const suggested_customer_id = matchCustomerId(
          (customers || []) as CrmCustomer[],
          extract
        );
        emit({
          event: "done",
          extract,
          suggested_customer_id,
          warnings,
        });
      } catch (err) {
        emit({
          event: "fatal",
          error: err instanceof Error ? err.message : "Lecture impossible",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
