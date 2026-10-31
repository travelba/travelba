/**
 * Écriture du journal et des alertes. Service role uniquement.
 * Les alertes sont informatives : elles n’arrêtent jamais le geste.
 * Si la table n’est pas encore là, l’action métier continue.
 * Chaque ligne peut porter une étiquette métier, le dossier lié, un montant et quatre chiffres de carte :
 * jamais un numéro complet, jamais un CVC.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import {
  DEFAULT_FAILED_LOGIN_ALERTS,
  DEFAULT_PAYMENT_ALERT_CENTS,
  FAILED_LOGIN_WINDOW_MS,
  failedLoginAlert,
  paymentAlert,
  refundAlert,
  type AlertKind,
} from "@/lib/crm/agency-access";
import {
  journalCanonical,
  maskJournalTree,
  type JournalAction,
  type JournalEntity,
} from "@/lib/crm/agency-journal";
import { journalBusinessFields, type JournalKind } from "@/lib/crm/agency-journal-kinds";

export type AgencyJournalInput = {
  staffId: string | null;
  action: JournalAction;
  entityType: JournalEntity;
  entityId?: string | null;
  summary: string;
  diff?: unknown;
  ip?: string | null;
  userAgent?: string | null;
  path?: string | null;
  sensitive?: AlertKind | null;
  /** Montant en centimes : alerte au-dessus du seuil, et colonne `amount_cents` de la ligne. */
  amountCents?: number | null;
  /** Étiquette métier lisible (option posée, carte émise, paiement reçu…). */
  kind?: JournalKind | null;
  /** Dossier lié, quelle que soit l’entité. */
  bookingId?: string | null;
  currency?: string | null;
  /** Quatre derniers chiffres. Un numéro plus long est réduit à ses quatre derniers chiffres. */
  cardLast4?: string | null;
  /** Auteur hors équipe (connecteur), quand `staffId` est nul. */
  actorLabel?: string | null;
};

type Settings = {
  paymentAlertCents: number;
  failedLoginAlerts: number;
};

async function readSettings(admin: ReturnType<typeof createServiceClient>): Promise<Settings> {
  const fallback = {
    paymentAlertCents: DEFAULT_PAYMENT_ALERT_CENTS,
    failedLoginAlerts: DEFAULT_FAILED_LOGIN_ALERTS,
  };
  const { data, error } = await admin
    .from("crm_agency_access_settings")
    .select("payment_alert_cents, failed_login_alert_count")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return fallback;
  const row = data as { payment_alert_cents?: number; failed_login_alert_count?: number };
  return {
    paymentAlertCents: row.payment_alert_cents || fallback.paymentAlertCents,
    failedLoginAlerts: row.failed_login_alert_count || fallback.failedLoginAlerts,
  };
}

export async function recordAgencyJournal(entry: AgencyJournalInput) {
  try {
    const admin = createServiceClient({ allowPreview: true });
    const diff = entry.diff == null ? null : maskJournalTree(entry.diff);
    const summary = entry.summary.slice(0, 500);
    const business = journalBusinessFields(entry);
    const canonical = journalCanonical({
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      summary,
      diff,
      kind: business.kind,
      bookingId: business.booking_id,
      amountCents: business.amount_cents,
      currency: business.currency,
      cardLast4: business.card_last4,
      actorLabel: business.actor_label,
    });
    const base = {
      staff_id: entry.staffId,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      summary,
      diff,
      ip: entry.ip ?? null,
      user_agent: entry.userAgent ? entry.userAgent.slice(0, 300) : null,
      path: entry.path ?? null,
      canonical,
      row_hash: "pending",
    };
    let { error } = await admin.from("crm_agency_journal").insert({ ...base, ...business });
    if (error && /column|schema cache/i.test(error.message || "")) {
      // Avant la migration du journal métier : la ligne s’écrit sans les colonnes nouvelles.
      ({ error } = await admin.from("crm_agency_journal").insert(base));
    }
    if (error) return;

    const settings = await readSettings(admin);
    let alert: { kind: AlertKind; summary: string } | null = null;
    if (entry.sensitive === "passport_reveal") {
      alert = { kind: "passport_reveal", summary: "Passeport ouvert." };
    } else if (entry.sensitive === "export") {
      alert = { kind: "export", summary: "Export du journal." };
    } else if (entry.sensitive === "card_reveal") {
      alert = { kind: "card_reveal", summary: "Carte ouverte (numéro complet)." };
    } else if (entry.sensitive === "role_change") {
      alert = { kind: "role_change", summary: entry.summary || "Rôle modifié." };
    } else if (entry.sensitive === "refund") {
      alert = refundAlert(entry.amountCents);
    } else if (entry.sensitive === "payment") {
      alert = paymentAlert(entry.amountCents, settings.paymentAlertCents);
    } else if (entry.sensitive === "failed_login" && entry.staffId) {
      const since = new Date(Date.now() - FAILED_LOGIN_WINDOW_MS).toISOString();
      const { count } = await admin
        .from("crm_agency_journal")
        .select("id", { count: "exact", head: true })
        .eq("staff_id", entry.staffId)
        .eq("action", "login_failed")
        .gte("occurred_at", since);
      alert = failedLoginAlert(count ?? 0, settings.failedLoginAlerts);
    }
    if (!alert) return;
    await admin.from("crm_agency_alerts").insert({
      kind: alert.kind,
      summary: alert.summary,
      staff_id: entry.staffId,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
    });
  } catch {
    /* Table absente ou secret de preview : l’action métier n’est pas bloquée. */
  }
}

export async function loadAgencySettings(): Promise<Settings> {
  const fallback = {
    paymentAlertCents: DEFAULT_PAYMENT_ALERT_CENTS,
    failedLoginAlerts: DEFAULT_FAILED_LOGIN_ALERTS,
  };
  try {
    const admin = createServiceClient({ allowPreview: true });
    return await readSettings(admin);
  } catch {
    return fallback;
  }
}
