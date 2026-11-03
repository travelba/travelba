import { createServiceClient } from "@/lib/supabase/admin";
import { reusableSignedUrl, signedUrlMarginMs, type SignedCacheEntry } from "@/lib/crm/signed-url-cache";

const SIGNED_CACHE_MAX = 500;
const signedUrls = new Map<string, SignedCacheEntry>();
const signedInflight = new Map<string, Promise<string>>();

export const CRM_BUCKET = "crm-files";

export async function uploadCrmFile(
  path: string,
  bytes: Buffer,
  contentType: string,
  opts?: { upsert?: boolean }
) {
  const supabase = createServiceClient();
  const { error } = await supabase.storage.from(CRM_BUCKET).upload(path, bytes, {
    contentType,
    upsert: opts?.upsert ?? false,
  });
  if (error) throw error;
  return path;
}

export async function createSignedCrmUploadUrl(path: string) {
  const supabase = createServiceClient();
  const { data, error } = await supabase.storage
    .from(CRM_BUCKET)
    .createSignedUploadUrl(path, { upsert: true });
  if (error || !data?.signedUrl) {
    throw error || new Error("URL d’envoi impossible");
  }
  return data;
}

export async function downloadCrmFile(path: string): Promise<{
  bytes: Uint8Array;
  contentType: string;
}> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.storage.from(CRM_BUCKET).download(path);
  if (error || !data) throw error || new Error("Fichier introuvable");
  return {
    bytes: new Uint8Array(await data.arrayBuffer()),
    contentType: data.type || "application/octet-stream",
  };
}

export async function copyCrmFile(fromPath: string, toPath: string) {
  const supabase = createServiceClient();
  const { error } = await supabase.storage.from(CRM_BUCKET).copy(fromPath, toPath);
  if (error) throw error;
  return toPath;
}

export async function signedCrmUrl(path: string, expiresIn = 600) {
  const key = `${expiresIn}\n${path}`;
  const now = Date.now();
  const cached = reusableSignedUrl(signedUrls.get(key), now, signedUrlMarginMs(expiresIn));
  if (cached) return cached;
  const pending = signedInflight.get(key);
  if (pending) return pending;
  const created = createSignedCrmUrl(path, expiresIn, key);
  signedInflight.set(key, created);
  try {
    return await created;
  } finally {
    signedInflight.delete(key);
  }
}

async function createSignedCrmUrl(path: string, expiresIn: number, key: string) {
  const supabase = createServiceClient();
  const { data, error } = await supabase.storage.from(CRM_BUCKET).createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) throw error || new Error("URL signée impossible");
  const now = Date.now();
  signedUrls.set(key, { url: data.signedUrl, expiresAtMs: now + expiresIn * 1000 });
  if (signedUrls.size > SIGNED_CACHE_MAX) {
    const oldest = signedUrls.keys().next().value;
    if (oldest) signedUrls.delete(oldest);
  }
  return data.signedUrl;
}

export async function removeCrmFiles(paths: string[]) {
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return;
  const supabase = createServiceClient();
  const { error } = await supabase.storage.from(CRM_BUCKET).remove(unique);
  if (error) console.error("[crm-files] remove", error.message);
}

export async function listCrmFiles(prefix: string): Promise<string[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.storage.from(CRM_BUCKET).list(prefix, {
    limit: 1000,
  });
  if (error || !data?.length) return [];
  const files: string[] = [];
  for (const entry of data) {
    if (!entry.name) continue;
    const path = `${prefix}/${entry.name}`;
    if (entry.id) files.push(path);
    else files.push(...(await listCrmFiles(path)));
  }
  return files;
}

export function safeFileName(name: string) {
  return name.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "fichier";
}
