export const INGEST_TMP_PREFIX = "ingest-tmp";

function safeFileName(name: string) {
  return name.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "fichier";
}

export function isIngestUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

export function ingestTmpPath(staffUserId: string, batchId: string, fileName: string) {
  if (!isIngestUuid(staffUserId) || !isIngestUuid(batchId)) {
    throw new Error("Lot invalide");
  }
  const unique = `${crypto.randomUUID().slice(0, 8)}-${safeFileName(fileName)}`;
  return `${INGEST_TMP_PREFIX}/${staffUserId}/${batchId}/${unique}`;
}

export function parseIngestTmpPath(path: string) {
  const parts = (path || "").split("/").filter(Boolean);
  if (parts.length !== 4 || parts[0] !== INGEST_TMP_PREFIX) {
    throw new Error("Chemin invalide");
  }
  const [, staffUserId, batchId, fileName] = parts;
  if (!isIngestUuid(staffUserId) || !isIngestUuid(batchId)) {
    throw new Error("Chemin invalide");
  }
  if (!fileName || fileName.includes("..") || fileName.includes("\\")) {
    throw new Error("Chemin invalide");
  }
  return { staffUserId, batchId, fileName };
}

export function assertStaffIngestPath(
  path: string,
  staffUserId: string,
  batchId?: string
) {
  const parsed = parseIngestTmpPath(path);
  if (parsed.staffUserId !== staffUserId) throw new Error("Chemin invalide");
  if (batchId && parsed.batchId !== batchId) throw new Error("Chemin invalide");
  return parsed;
}

export function ingestBatchPrefix(staffUserId: string, batchId: string) {
  if (!isIngestUuid(staffUserId) || !isIngestUuid(batchId)) {
    throw new Error("Lot invalide");
  }
  return `${INGEST_TMP_PREFIX}/${staffUserId}/${batchId}`;
}
