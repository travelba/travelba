/** SID de contenu Twilio. Jamais un SID de compte (AC…) ni un jeton. */
export function isContentSid(value: unknown): value is string {
  return typeof value === "string" && /^HX[A-Za-z0-9]{8,80}$/.test(value);
}

export type ContentSidStore = {
  read(envName: string): Promise<string | null>;
  write(envName: string, sid: string, friendlyName: string): Promise<void>;
};

export function memoryContentSidStore(seed: Record<string, string> = {}): ContentSidStore & {
  rows: Record<string, string>;
  names: Record<string, string>;
} {
  const rows = { ...seed };
  const names: Record<string, string> = {};
  return {
    rows,
    names,
    async read(envName) {
      const sid = rows[envName];
      return isContentSid(sid) ? sid : null;
    },
    async write(envName, sid, friendlyName) {
      if (!isContentSid(sid)) throw new Error("sid");
      rows[envName] = sid;
      names[envName] = friendlyName;
    },
  };
}

/** Réglage en base. Une table absente ou une erreur de lecture vaut « pas de SID ». */
export function serviceContentSidStore(): ContentSidStore {
  return {
    async read(envName) {
      try {
        const { createServiceClient } = await import("@/lib/supabase/admin");
        const { data, error } = await createServiceClient()
          .from("crm_whatsapp_content_sids")
          .select("content_sid")
          .eq("env_name", envName)
          .maybeSingle();
        if (error || !isContentSid(data?.content_sid)) return null;
        return data.content_sid;
      } catch {
        return null;
      }
    },
    async write(envName, sid, friendlyName) {
      if (!isContentSid(sid)) throw new Error("sid");
      const { createServiceClient } = await import("@/lib/supabase/admin");
      const { error } = await createServiceClient().from("crm_whatsapp_content_sids").upsert({
        env_name: envName,
        content_sid: sid,
        friendly_name: friendlyName.slice(0, 80),
        updated_at: new Date().toISOString(),
      });
      if (error) throw new Error("réglage");
    },
  };
}
