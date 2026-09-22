import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { extractBookingFromPrepared } from "@/lib/crm/ingest-file";
import { collectIngestFiles, matchCustomerId } from "@/lib/crm/ingest-booking";
import { assertStaffIngestPath } from "@/lib/crm/ingest-storage";
import { MAX_INGEST_FILES, type IngestStreamEvent } from "@/lib/crm/ingest-types";
import type { CrmCustomer } from "@/lib/crm/types";

export const runtime = "nodejs";
export const maxDuration = 300;

function encodeEvent(event: IngestStreamEvent) {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

type Staged = { path?: string; name: string; type: string; bytes?: Uint8Array };

export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;

  const contentType = request.headers.get("content-type") || "";
  let batchId = "";
  let staged: Staged[] = [];

  if (contentType.includes("multipart/form-data")) {
    try {
      const form = await request.formData();
      const files = collectIngestFiles(form);
      if (!files.length) return jsonError("Ajoutez au moins un PDF ou une photo.");
      for (const file of files) {
        staged.push({
          name: file.name,
          type: file.type || "",
          bytes: new Uint8Array(await file.arrayBuffer()),
        });
      }
    } catch (err) {
      console.error("[bookings/ingest] formData", err);
      return jsonError(
        "Envoi trop lourd pour cette page. Rechargez (Ctrl+Shift+R) : les PDF passent maintenant par un envoi sécurisé."
      );
    }
  } else {
    let raw = "";
    try {
      raw = await request.text();
    } catch (err) {
      console.error("[bookings/ingest] body_read", err);
      return jsonError("Requête invalide");
    }
    if (!raw.trim()) {
      console.error("[bookings/ingest] empty_body", { contentType });
      return jsonError(
        "Requête vide. Rechargez la page (Ctrl+Shift+R) puis réessayez l’import."
      );
    }
    let payload: {
      batchId?: string;
      files?: { path?: string; name?: string; type?: string }[];
    };
    try {
      payload = JSON.parse(raw) as typeof payload;
    } catch (err) {
      console.error("[bookings/ingest] json_parse", {
        contentType,
        bodyLength: raw.length,
        err: err instanceof Error ? err.message : String(err),
      });
      return jsonError(
        "Requête invalide. Rechargez la page (Ctrl+Shift+R) puis réessayez."
      );
    }

    batchId = String(payload.batchId || "");
    const incoming = Array.isArray(payload.files) ? payload.files : [];
    if (!incoming.length) return jsonError("Ajoutez au moins un PDF ou une photo.");
    if (incoming.length > MAX_INGEST_FILES) {
      return jsonError(`Maximum ${MAX_INGEST_FILES} fichiers.`);
    }

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
  }

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: IngestStreamEvent) => {
        controller.enqueue(encodeEvent(event));
      };
      try {
        const { extract, warnings } = await extractBookingFromPrepared(
          staged.map((file) =>
            file.bytes
              ? { name: file.name, type: file.type, bytes: file.bytes }
              : { name: file.name, type: file.type, path: file.path as string }
          ),
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
        console.error("[bookings/ingest] extract", err);
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
