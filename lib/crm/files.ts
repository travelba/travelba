import { createServiceClient } from "@/lib/supabase/admin";

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

export async function signedCrmUrl(path: string, expiresIn = 600) {
  const supabase = createServiceClient();
  const { data, error } = await supabase.storage
    .from(CRM_BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) throw error || new Error("URL signée impossible");
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
