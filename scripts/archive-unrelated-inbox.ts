/**
 * Classe les mails déjà dans la file qui ne répondent pas à un envoi du CRM.
 * Labels de pièces (Little Emperors, Expedia, billet, annulation, cdsgroupe) : conservés.
 * Boîte ouverte (`reservations-tba`, `crm`) : ignorés s’ils ne sont pas une réponse.
 *
 * N’efface rien dans Gmail. N’écrit rien sans --apply.
 *
 *   npx tsx scripts/archive-unrelated-inbox.ts
 *   npx tsx scripts/archive-unrelated-inbox.ts --apply
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { decideInboundMail, isOpenMailboxLabel } from "../lib/crm/email-reply-gate";
import { loadSentMailIndex } from "../lib/crm/sent-mail";

const QUEUE = ["received", "parsed", "matched", "error"];

function loadLocalEnv() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key]?.trim()) continue;
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

type QueueRow = {
  id: string;
  label: string | null;
  from_email: string | null;
  subject: string | null;
  gmail_thread_id: string | null;
};

function labelKey(label: string | null) {
  return (label || "(sans label)").trim().toLowerCase() || "(sans label)";
}

async function main() {
  loadLocalEnv();
  const apply = process.argv.includes("--apply");
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) {
    console.error("SUPABASE_SERVICE_ROLE_KEY manquant.");
    process.exit(1);
  }
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const sent = await loadSentMailIndex(admin);
  const { data, error } = await admin
    .from("crm_email_ingest")
    .select("id, label, from_email, subject, gmail_thread_id")
    .in("status", QUEUE);
  if (error) {
    console.error("Lecture de la file impossible.");
    process.exit(1);
  }
  const rows = (data || []) as QueueRow[];
  const archive: QueueRow[] = [];
  const kept = new Map<string, number>();
  const dropped = new Map<string, number>();
  for (const row of rows) {
    const decision = decideInboundMail(
      {
        label: row.label,
        from: row.from_email,
        subject: row.subject,
        threadId: row.gmail_thread_id,
      },
      sent
    );
    const open = isOpenMailboxLabel(row.label);
    const drop = open && decision.action !== "queue";
    const bucket = drop ? dropped : kept;
    const keyName = labelKey(row.label);
    bucket.set(keyName, (bucket.get(keyName) || 0) + 1);
    if (drop) archive.push(row);
  }

  console.log(apply ? "Application." : "Essai, rien n’est écrit.");
  console.log(`File : ${rows.length}. À classer : ${archive.length}. Conservés : ${rows.length - archive.length}.`);
  console.log("Conservés par label :");
  for (const [label, count] of [...kept.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${label} ${count}`);
  }
  console.log("À classer par label :");
  for (const [label, count] of [...dropped.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${label} ${count}`);
  }
  if (!apply || !archive.length) return;

  let updated = 0;
  for (const row of archive) {
    const decision = decideInboundMail(
      { label: row.label, from: row.from_email, subject: row.subject, threadId: row.gmail_thread_id },
      sent
    );
    const reason = decision.action === "queue" ? "Pas une réponse à un e-mail envoyé depuis le CRM" : decision.reason;
    const { error: updateError } = await admin
      .from("crm_email_ingest")
      .update({ status: "ignored", ignore_reason: reason, error: null })
      .eq("id", row.id)
      .in("status", QUEUE);
    if (!updateError) updated += 1;
  }
  console.log(`Classés : ${updated}. Gmail n’a pas été modifié.`);
}

main().catch(() => {
  console.error("Classement impossible.");
  process.exit(1);
});
