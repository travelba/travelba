"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CrmNotification } from "@/lib/crm/types";

type Preferences = {
  email_travel: boolean;
  email_payment: boolean;
  email_documents: boolean;
  whatsapp_operational: boolean;
};

export function NotificationsManager({ customerId, initialNotifications, initialPreferences }: {
  customerId: string;
  initialNotifications: CrmNotification[];
  initialPreferences: Preferences;
}) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [preferences, setPreferences] = useState(initialPreferences);
  const [message, setMessage] = useState<string | null>(null);

  async function markRead(id: string) {
    const readAt = new Date().toISOString();
    const { error } = await createClient().from("crm_notifications").update({ read_at: readAt }).eq("id", id).eq("customer_id", customerId);
    if (error) return setMessage(error.message);
    setNotifications((rows) => rows.map((row) => row.id === id ? { ...row, read_at: readAt } : row));
  }

  async function savePreferences(next: Preferences) {
    setPreferences(next);
    const { error } = await createClient().from("crm_notification_preferences").upsert({ customer_id: customerId, ...next });
    setMessage(error ? error.message : "Préférences enregistrées.");
  }

  return (
    <div className="space-y-5">
      <section className="account-card p-5">
        <h2 className="font-display text-lg font-bold">Préférences</h2>
        <div className="mt-3 grid gap-3 text-sm">
          {([
            ["email_travel", "Informations de voyage"],
            ["email_payment", "Paiements et échéances"],
            ["email_documents", "Documents et expirations"],
            ["whatsapp_operational", "WhatsApp opérationnel"],
          ] as const).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between gap-3">
              {label}
              <input type="checkbox" checked={preferences[key]} onChange={(event) => void savePreferences({ ...preferences, [key]: event.target.checked })} />
            </label>
          ))}
        </div>
        {message ? <p role="status" className="mt-3 text-xs text-muted">{message}</p> : null}
      </section>
      <div className="space-y-3">
        {notifications.length ? notifications.map((notification) => (
          <article key={notification.id} className={`account-card p-5 ${notification.read_at ? "opacity-70" : "border-l-4 border-l-[var(--aura-blue)]"}`}>
            <div className="flex justify-between gap-4"><h2 className="font-semibold">{notification.title}</h2><time className="text-xs text-muted">{new Date(notification.created_at).toLocaleDateString("fr-FR")}</time></div>
            <p className="mt-2 text-sm text-muted">{notification.message}</p>
            <div className="mt-3 flex flex-wrap gap-3">
              {notification.action_url?.startsWith("/") &&
              !notification.action_url.startsWith("//") &&
              !notification.action_url.includes("\\") ? (
                <Link href={notification.action_url} className="text-xs font-bold text-[var(--aura-blue)]">
                  Consulter
                </Link>
              ) : null}
              {!notification.read_at ? <button type="button" onClick={() => void markRead(notification.id)} className="text-xs font-bold text-[var(--aura-blue)]">Marquer comme lue</button> : null}
            </div>
          </article>
        )) : <div className="account-card p-8 text-center text-sm text-muted">Aucune notification.</div>}
      </div>
    </div>
  );
}
