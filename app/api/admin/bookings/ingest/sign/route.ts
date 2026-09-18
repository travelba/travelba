import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import {
  createSignedCrmUploadUrl,
  listCrmFiles,
  removeCrmFiles,
} from "@/lib/crm/files";
import {
  MAX_INGEST_BYTES,
  MAX_INGEST_FILES,
  isAllowedIngestType,
} from "@/lib/crm/ingest-types";
import {
  assertStaffIngestPath,
  ingestBatchPrefix,
  ingestTmpPath,
  isIngestUuid,
} from "@/lib/crm/ingest-storage";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  try {
    const body = (await request.json()) as {
      name?: string;
      type?: string;
      size?: number;
      batchId?: string;
    };
    const name = String(body.name || "").trim();
    const type = String(body.type || "");
    const size = Number(body.size || 0);
    const batchId = String(body.batchId || "");
    if (!name) return jsonError("Nom de fichier manquant");
    if (!isIngestUuid(batchId)) return jsonError("Lot invalide");
    if (!Number.isFinite(size) || size <= 0) return jsonError("Fichier vide");
    if (size > MAX_INGEST_BYTES) return jsonError(`${name} dépasse 25 Mo.`);
    if (!isAllowedIngestType(type, name)) {
      return jsonError(`${name} : PDF ou image uniquement.`);
    }
    const prefix = ingestBatchPrefix(auth.user.id, batchId);
    const existing = await listCrmFiles(prefix);
    if (existing.length >= MAX_INGEST_FILES) {
      return jsonError(`Maximum ${MAX_INGEST_FILES} fichiers.`);
    }
    const path = ingestTmpPath(auth.user.id, batchId, name);
    const signed = await createSignedCrmUploadUrl(path);
    return NextResponse.json({
      path,
      signedUrl: signed.signedUrl,
      token: signed.token,
      name,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Envoi impossible";
    return jsonError(message, 400);
  }
}

export async function DELETE(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  try {
    const body = (await request.json()) as { path?: string; batchId?: string };
    if (body.batchId) {
      const prefix = ingestBatchPrefix(auth.user.id, String(body.batchId));
      const paths = await listCrmFiles(prefix);
      await removeCrmFiles(paths);
      return NextResponse.json({ ok: true });
    }
    const path = String(body.path || "");
    assertStaffIngestPath(path, auth.user.id);
    await removeCrmFiles([path]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Suppression impossible";
    return jsonError(message, 400);
  }
}
