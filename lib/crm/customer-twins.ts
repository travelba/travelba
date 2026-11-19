import type { SupabaseClient } from "@supabase/supabase-js";
import { toAuditRow } from "@/lib/crm/audit-events";
import { recordAgencyJournal } from "@/lib/crm/agency-log";
import { isUuid } from "@/lib/crm/ids";
import { customerFullName } from "@/lib/crm/types";

export class TwinLinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TwinLinkError";
  }
}

export type TwinPerson = { id: string; nom: string };

export type TwinAction = "lier" | "delier";

export type TwinStaff = { id: string; name: string; path?: string | null };

export type TwinActionResult = {
  apercu: boolean;
  applique: boolean;
  deja: boolean;
  message: string;
  client: TwinPerson;
  jumeau: TwinPerson;
  dossiers_client: number;
  dossiers_jumeau: number;
  dossiers_visibles_client: number;
  dossiers_visibles_jumeau: number;
  references_visibles_client: string[];
  references_visibles_jumeau: string[];
  message_envoye: false;
};

type NameRow = { id: string; first_name: string | null; last_name: string | null };

type StayRow = {
  reference?: string | null;
  visible_to_client?: boolean | null;
  archived_at?: string | null;
  status?: string | null;
};

type Pair = { customer_a: string; customer_b: string };

const MISSING = new Set(["42P01", "PGRST205"]);

/** Paire canonique : le plus petit uuid d’abord. Null si ce n’est pas deux fiches distinctes. */
export function orderedTwinPair(left: string, right: string): Pair | null {
  const a = left.trim().toLowerCase();
  const b = right.trim().toLowerCase();
  if (!isUuid(a) || !isUuid(b) || a === b) return null;
  return a < b ? { customer_a: a, customer_b: b } : { customer_a: b, customer_b: a };
}

export function missingTwinTable(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  if (error.code && MISSING.has(error.code)) return true;
  const message = error.message || "";
  return /crm_customer_twins/i.test(message) && /does not exist|schema cache|could not find/i.test(message);
}

function person(row: NameRow): TwinPerson {
  return {
    id: row.id,
    nom: customerFullName({ first_name: row.first_name || "", last_name: row.last_name || "" }),
  };
}

function shownStay(row: StayRow) {
  return row.visible_to_client === true && !row.archived_at && row.status !== "cancelled";
}

function stayFacts(rows: StayRow[]) {
  const visibles = rows.filter(shownStay);
  const references = visibles.map((row) => (row.reference || "").trim()).filter(Boolean);
  return { total: rows.length, visibles: visibles.length, references };
}

function countPhrase(count: number) {
  return count === 1 ? "1 dossier visible" : `${count} dossiers visibles`;
}

function linkMessage(client: string, twin: string, clientVisible: number, twinVisible: number, hidden: number) {
  const hiddenLine =
    hidden === 0
      ? "Aucun dossier Non visible."
      : hidden === 1
        ? "1 dossier Non visible reste caché pour les deux."
        : `${hidden} dossiers Non visible restent cachés pour les deux.`;
  return `${client} et ${twin} voient les mêmes réservations montrées (${countPhrase(clientVisible)} d’un côté, ${countPhrase(twinVisible)} de l’autre). ${hiddenLine} Chacun garde son accès. Un seul dossier, un seul grand livre. Aucun message n’est envoyé.`;
}

async function readCustomer(admin: SupabaseClient, id: string) {
  const { data, error } = await admin
    .from("crm_customers")
    .select("id, first_name, last_name")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new TwinLinkError("Lecture de la fiche impossible.");
  return (data as NameRow | null) || null;
}

async function readStays(admin: SupabaseClient, customerId: string) {
  const { data, error } = await admin
    .from("crm_bookings")
    .select("reference, visible_to_client, archived_at, status")
    .eq("customer_id", customerId);
  if (error) return [] as StayRow[];
  return (data || []) as StayRow[];
}

async function readPair(admin: SupabaseClient, pair: Pair) {
  const { data, error } = await admin
    .from("crm_customer_twins")
    .select("customer_a")
    .eq("customer_a", pair.customer_a)
    .eq("customer_b", pair.customer_b)
    .maybeSingle();
  if (missingTwinTable(error)) throw new TwinLinkError("Le jumelage n’est pas encore en place.");
  if (error) throw new TwinLinkError("Lecture du jumelage impossible.");
  return Boolean(data);
}

/** Jumeaux directs d’une fiche. Vide si la table n’est pas encore là. */
export async function listCustomerTwins(admin: SupabaseClient, customerId: string): Promise<TwinPerson[]> {
  const map = await twinsForCustomers(admin, [customerId]);
  return map.get(customerId) || [];
}

/** Identifiants jumeaux, pour élargir la lecture des dossiers. */
export async function twinIdsOf(admin: SupabaseClient, customerId: string) {
  const twins = await listCustomerTwins(admin, customerId);
  return twins.map((row) => row.id);
}

export async function twinsForCustomers(admin: SupabaseClient, ids: string[]) {
  const unique = [...new Set(ids.map((id) => id.trim().toLowerCase()).filter((id) => isUuid(id)))];
  const map = new Map<string, TwinPerson[]>();
  if (!unique.length) return map;
  const [byA, byB] = await Promise.all([
    admin.from("crm_customer_twins").select("customer_a, customer_b").in("customer_a", unique),
    admin.from("crm_customer_twins").select("customer_a, customer_b").in("customer_b", unique),
  ]);
  if (missingTwinTable(byA.error) || missingTwinTable(byB.error)) return map;
  if (byA.error || byB.error) return map;
  const pairs = [
    ...((byA.data || []) as Pair[]),
    ...((byB.data || []) as Pair[]),
  ];
  const others = new Set<string>();
  const links = new Map<string, string[]>();
  for (const pair of pairs) {
    for (const id of unique) {
      const other = pair.customer_a === id ? pair.customer_b : pair.customer_b === id ? pair.customer_a : "";
      if (!other) continue;
      const list = links.get(id) || [];
      if (!list.includes(other)) list.push(other);
      links.set(id, list);
      others.add(other);
    }
  }
  const names = new Map<string, TwinPerson>();
  for (const id of others) {
    const row = await readCustomer(admin, id);
    if (row) names.set(row.id, person(row));
  }
  for (const id of unique) {
    map.set(
      id,
      (links.get(id) || []).flatMap((other) => {
        const named = names.get(other);
        return named ? [named] : [];
      })
    );
  }
  return map;
}

/**
 * Lie ou délie deux fiches. Sans confirmer : aperçu, rien n’est écrit.
 * Aucun e-mail, aucun WhatsApp. Le grand livre n’est pas recopié.
 */
export async function setCustomerTwin(
  admin: SupabaseClient,
  input: {
    clientId: string;
    twinId: string;
    action: TwinAction;
    confirmer?: boolean;
    staff?: TwinStaff | null;
  }
): Promise<TwinActionResult> {
  const pair = orderedTwinPair(input.clientId, input.twinId);
  if (!pair) {
    throw new TwinLinkError(
      input.clientId.trim().toLowerCase() === input.twinId.trim().toLowerCase()
        ? "Une fiche ne se jumelle pas avec elle-même."
        : "Indiquez deux fiches."
    );
  }
  const clientId = input.clientId.trim().toLowerCase();
  const twinId = input.twinId.trim().toLowerCase();
  const [clientRow, twinRow] = await Promise.all([readCustomer(admin, clientId), readCustomer(admin, twinId)]);
  if (!clientRow || !twinRow) throw new TwinLinkError("Fiche introuvable.");
  const client = person(clientRow);
  const twin = person(twinRow);
  const [linked, clientStays, twinStays] = await Promise.all([
    readPair(admin, pair),
    readStays(admin, clientId),
    readStays(admin, twinId),
  ]);
  const clientFacts = stayFacts(clientStays);
  const twinFacts = stayFacts(twinStays);
  const hidden = clientStays.length - clientFacts.visibles + (twinStays.length - twinFacts.visibles);
  const linking = input.action !== "delier";
  const confirmer = input.confirmer === true;
  let applique = false;
  let deja = false;
  let message = linkMessage(client.nom, twin.nom, clientFacts.visibles, twinFacts.visibles, hidden);

  if (linking) {
    if (linked) {
      deja = true;
      message = `${client.nom} et ${twin.nom} sont déjà jumelés. ${message}`;
    } else if (confirmer) {
      const inserted = await admin.from("crm_customer_twins").insert({
        customer_a: pair.customer_a,
        customer_b: pair.customer_b,
        created_by: input.staff?.id || null,
      });
      if (missingTwinTable(inserted.error)) throw new TwinLinkError("Le jumelage n’est pas encore en place.");
      if (inserted.error) throw new TwinLinkError("Le jumelage n’a pas été enregistré.");
      applique = true;
      message = `Comptes jumelés. ${message}`;
    } else {
      message = `Aperçu. ${message}`;
    }
  } else if (!linked) {
    message = `${client.nom} et ${twin.nom} ne sont pas jumelés. Rien ne change. Aucun message n’est envoyé.`;
  } else if (confirmer) {
    const removed = await admin
      .from("crm_customer_twins")
      .delete()
      .eq("customer_a", pair.customer_a)
      .eq("customer_b", pair.customer_b);
    if (removed.error) throw new TwinLinkError("Le jumelage n’a pas été retiré.");
    applique = true;
    message = `${client.nom} et ${twin.nom} ne sont plus jumelés. Chacun ne voit plus que ses dossiers. Aucun message n’est envoyé.`;
  } else {
    message = `Aperçu. ${client.nom} et ${twin.nom} ne verront plus les dossiers l’un de l’autre. Aucun message n’est envoyé.`;
  }

  const result: TwinActionResult = {
    apercu: !confirmer,
    applique,
    deja,
    message,
    client,
    jumeau: twin,
    dossiers_client: clientFacts.total,
    dossiers_jumeau: twinFacts.total,
    dossiers_visibles_client: clientFacts.visibles,
    dossiers_visibles_jumeau: twinFacts.visibles,
    references_visibles_client: clientFacts.references,
    references_visibles_jumeau: twinFacts.references,
    message_envoye: false,
  };

  if (applique) {
    await admin
      .from("crm_audit_events")
      .insert(
        toAuditRow({
          actorKind: "human",
          actorId: input.staff?.id || null,
          action: linking ? "lier_compte_jumeau" : "delier_compte_jumeau",
          customerId: client.id,
          summary: result.message,
          source: "compte_jumeau",
        })
      )
      .then(() => undefined, () => undefined);
    if (input.staff?.id) {
      await recordAgencyJournal({
        staffId: input.staff.id,
        action: "update",
        entityType: "client",
        entityId: client.id,
        summary: result.message.slice(0, 500),
        path: input.staff.path || "/admin/clients",
      });
    }
  }
  return result;
}
