import { createServiceClient } from "@/lib/supabase/admin";

export const CRM_BUCKET = "crm-files";

export async function uploadCrmFile(
  path: string,
  bytes: Buffer,
  contentType: string
) {
  const supabase = createServiceClient();
  const { error } = await supabase.storage.from(CRM_BUCKET).upload(path, bytes, {
    contentType,
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function signedCrmUrl(path: string, expiresIn = 120) {
  const supabase = createServiceClient();
  const { data, error } = await supabase.storage
    .from(CRM_BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) throw error || new Error("URL signée impossible");
  return data.signedUrl;
}

export function safeFileName(name: string) {
  return name.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "fichier";
}
