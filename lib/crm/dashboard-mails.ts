import { loadRecentHotelReplies, type HotelTemplateReply } from "./hotel-reply-list";
import type { SupabaseClient } from "@supabase/supabase-js";

export type DashboardMail = {
  id: string;
  title: string;
  detail: string;
  receivedAt: string;
  href: string;
  mark: string;
};

/** Réponses d’hôtel aux courriers du CRM, les plus récentes en premier. */
export function dashboardMailLines(replies: HotelTemplateReply[], limit = 8): DashboardMail[] {
  return replies
    .filter((reply) => reply.receivedAt && reply.kindLabel)
    .sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt) || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, limit))
    .map((reply) => ({
      id: reply.id,
      title: reply.hotel,
      detail: [reply.reference, reply.excerpt].filter(Boolean).join(" · "),
      receivedAt: reply.receivedAt,
      href: reply.href,
      mark: reply.kindLabel,
    }));
}

/** Dernières réponses d’hôtel aux courriers envoyés par le CRM. */
export async function loadDashboardMails(supabase: SupabaseClient): Promise<DashboardMail[]> {
  return dashboardMailLines(await loadRecentHotelReplies(supabase));
}
