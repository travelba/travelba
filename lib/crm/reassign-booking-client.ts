import type { SupabaseClient } from "@supabase/supabase-js";
import { attachSearchFold } from "@/lib/crm/attach-search";
import { CUSTOMER_EMAIL_COPY, customerEmailError, normalizeCustomerEmail } from "@/lib/crm/customer-email";
import { resolveBillingCustomerId } from "@/lib/crm/company-role";
import { toE164 } from "@/lib/crm/phone";
import { resolveFeesFollowStay } from "@/lib/crm/payer";
import { customerFullName } from "@/lib/crm/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ReassignClientError extends Error {}

type Person = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  company_role: string | null;
  billing_parent_id: string | null;
};

type Company = {
  id: string;
  customer_id: string;
  company_name: string | null;
  siret: string | null;
  sort_order: number;
};

type BookingRow = {
  id: string;
  reference: string | null;
  title: string | null;
  customer_id: string;
  billing_customer_id: string | null;
  billing_company_id: string | null;
  payer_kind: string | null;
  fees_follow_stay: boolean | null;
  visible_to_client: boolean | null;
};

type TravelerRow = {
  id: string;
  is_account_holder: boolean;
  companion_id: string | null;
  first_name: string | null;
  last_name: string | null;
};

type LedgerRow = {
  id: string;
  customer_id: string;
  booking_id: string | null;
  billing_company_id: string | null;
};

type PaymentRow = {
  id: string;
  customer_id?: string | null;
  matched_customer_id?: string | null;
  matched_booking_id?: string | null;
  matched_transaction_id?: string | null;
  booking_id?: string | null;
};

export type ClientDraft = {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  companyName?: string | null;
};

export type PreparedClientDraft = {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  companyName: string | null;
};

export type DuplicateClient = {
  id: string;
  nom: string;
  email: string | null;
  telephone: string | null;
  societe: string | null;
};

export type ChangeBookingClientInput = {
  bookingId?: string | null;
  reference?: string | null;
  customerId?: string | null;
  create?: ClientDraft | null;
  confirmer?: boolean;
};

export type ReassignClientResult = {
  applique: boolean;
  invite: false;
  messages: false;
  creation: boolean;
  dossier_id: string;
  reference: string;
  titre: string;
  visible: boolean;
  ancien: { id: string; nom: string };
  nouveau: { id: string; nom: string; cree: boolean };
  voyageurs: number;
  ecritures: number;
  paiements: { revolut: number; stripe: number; pliant: number; cartes: number };
  payeur: {
    suit: boolean;
    avant: string;
    apres: string;
    societe_avant: string | null;
    societe_apres: string | null;
  };
  doublons: DuplicateClient[];
  resume: string[];
  journal: { summary: string; diff: Record<string, unknown> };
};

type DbError = { code?: string; message?: string } | null;

function soft(error: DbError) {
  return error?.code === "42P01" || error?.code === "42703" || error?.code === "PGRST204" || error?.code === "PGRST205";
}

function personName(person: { first_name: string | null; last_name: string | null }) {
  return customerFullName({ first_name: person.first_name || "", last_name: person.last_name || "" });
}

function phoneKey(value: string | null | undefined) {
  let digits = (value || "").replace(/\D/g, "");
  if (digits.startsWith("33") && digits.length >= 11) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

/** « Jonathan Amar » préremplit le prénom et le nom. Un seul mot reste le prénom. */
export function splitTypedClientName(query: string) {
  const parts = query.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] || "", lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export function prepareClientDraft(draft: ClientDraft): PreparedClientDraft {
  const firstName = draft.firstName.trim();
  const lastName = draft.lastName.trim();
  if (!firstName || !lastName) throw new ReassignClientError("Prénom et nom requis.");
  if (firstName.length > 80 || lastName.length > 80) throw new ReassignClientError("Prénom ou nom trop long.");
  const rawEmail = (draft.email || "").trim();
  let email: string | null = null;
  if (rawEmail) {
    email = normalizeCustomerEmail(rawEmail);
    const invalid = customerEmailError(email);
    if (invalid) throw new ReassignClientError(invalid);
  }
  const rawPhone = (draft.phone || "").trim();
  let phone: string | null = null;
  if (rawPhone) {
    phone = toE164(rawPhone);
    if (!phone) throw new ReassignClientError("Téléphone invalide.");
  }
  const companyName = (draft.companyName || "").trim();
  if (companyName.length > 200) throw new ReassignClientError("Raison sociale trop longue.");
  return { firstName, lastName, email, phone, companyName: companyName || null };
}

/** Même e-mail, même téléphone, ou mêmes prénom et nom. */
export function matchingClientDuplicates(
  rows: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    company_name: string | null;
  }[],
  draft: PreparedClientDraft
) {
  const first = attachSearchFold(draft.firstName);
  const last = attachSearchFold(draft.lastName);
  const email = (draft.email || "").trim().toLowerCase();
  const phone = phoneKey(draft.phone);
  const seen = new Set<string>();
  const hits: DuplicateClient[] = [];
  for (const row of rows) {
    if (!row.id || seen.has(row.id)) continue;
    const sameEmail = Boolean(email && (row.email || "").trim().toLowerCase() === email);
    const samePhone = Boolean(phone && phoneKey(row.phone) === phone);
    const sameName = Boolean(
      first && last && attachSearchFold(row.first_name) === first && attachSearchFold(row.last_name) === last
    );
    if (!sameEmail && !samePhone && !sameName) continue;
    seen.add(row.id);
    hits.push({
      id: row.id,
      nom: personName(row),
      email: row.email || null,
      telephone: row.phone || null,
      societe: row.company_name || null,
    });
  }
  return hits;
}

/** Le voyageur coché est l’ancien client lui-même, pas un compagnon homonyme. */
export function travelerIsFormerClient(
  traveler: TravelerRow,
  former: { first_name: string | null; last_name: string | null }
) {
  if (traveler.companion_id) return false;
  if (traveler.is_account_holder) return true;
  const first = attachSearchFold(former.first_name);
  const last = attachSearchFold(former.last_name);
  if (!first && !last) return false;
  return attachSearchFold(traveler.first_name) === first && attachSearchFold(traveler.last_name) === last;
}

function payerFollowsClient(booking: BookingRow, former: Person) {
  const payer = booking.billing_customer_id || booking.customer_id;
  if (payer === former.id) return true;
  return Boolean(former.company_role === "member" && former.billing_parent_id && payer === former.billing_parent_id);
}

function roleOf(person: Person) {
  return person.company_role === "admin" || person.company_role === "member" ? person.company_role : null;
}

function ownedCompanies(companies: Company[], customerId: string) {
  return companies
    .filter((company) => company.customer_id === customerId)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.id.localeCompare(b.id));
}

function siretKey(value: string | null | undefined) {
  return (value || "").replace(/\s/g, "");
}

function matchCompany(owned: Company[], previous: Company | null) {
  if (owned.length === 1) return owned[0];
  if (!previous) return null;
  const siret = siretKey(previous.siret);
  if (siret) {
    const hit = owned.find((company) => siretKey(company.siret) === siret);
    if (hit) return hit;
  }
  const name = attachSearchFold(previous.company_name);
  if (name) {
    const hit = owned.find((company) => attachSearchFold(company.company_name) === name);
    if (hit) return hit;
  }
  return null;
}

function payerLabel(person: Person, company: Company | null, kind: "company" | "personal") {
  const name = personName(person);
  if (kind === "personal") return `${name} · particulier`;
  const companyName = (company?.company_name || "").trim();
  return companyName ? `${name} · ${companyName}` : `${name} · société`;
}

type PlanInput = {
  booking: BookingRow;
  from: Person;
  to: Person;
  payerBefore: Person;
  payerAfter: Person;
  companies: Company[];
  travelers: TravelerRow[];
  transactions: LedgerRow[];
  revolut: PaymentRow[];
  stripe: PaymentRow[];
  pliantTx: PaymentRow[];
  pliantCards: PaymentRow[];
  items: { id: string; billing_company_id: string | null }[];
  creation: boolean;
  duplicates: DuplicateClient[];
};

type MovePatch = { id: string; patch: Record<string, unknown> };

export type ReassignPlan = {
  result: ReassignClientResult;
  bookingPatch: Record<string, unknown>;
  travelerPatch: { first_name: string; last_name: string; is_account_holder: true } | null;
  travelerIds: string[];
  transactions: MovePatch[];
  revolut: MovePatch[];
  stripe: MovePatch[];
  pliantTx: MovePatch[];
  pliantCards: MovePatch[];
  items: MovePatch[];
};

export function planBookingClientChange(input: PlanInput): ReassignPlan {
  const follows = payerFollowsClient(input.booking, input.from);
  const oldPayerId = input.booking.billing_customer_id || input.booking.customer_id;
  const newPayerId = follows
    ? resolveBillingCustomerId({
        id: input.to.id || input.payerAfter.id,
        company_role: roleOf(input.to),
        billing_parent_id: input.to.billing_parent_id,
      })
    : oldPayerId;
  const targetWallet = follows ? newPayerId : input.to.id || "nouveau";
  const sources = new Set<string>([input.from.id]);
  if (follows) sources.add(oldPayerId);

  const wasCompany = input.booking.payer_kind === "company" || Boolean(input.booking.billing_company_id);
  const previousCompany =
    input.companies.find((company) => company.id === input.booking.billing_company_id) || null;
  const nextOwned = ownedCompanies(input.companies, newPayerId);
  let nextKind: "company" | "personal" = "personal";
  let nextCompany: Company | null = null;
  let companyCleared = false;
  if (follows) {
    if (wasCompany) {
      nextCompany = matchCompany(nextOwned, previousCompany);
      if (nextCompany) nextKind = "company";
      else companyCleared = true;
    }
  } else {
    nextKind = input.booking.payer_kind === "company" || input.booking.billing_company_id ? "company" : "personal";
    nextCompany = previousCompany;
  }

  const travelers = input.travelers.filter((traveler) => travelerIsFormerClient(traveler, input.from));
  const travelerPatch = travelers.length
    ? {
        first_name: input.to.first_name || "",
        last_name: input.to.last_name || "",
        is_account_holder: true as const,
      }
    : null;

  const bookingPatch: Record<string, unknown> = { customer_id: input.to.id };
  if (follows) {
    bookingPatch.billing_customer_id = newPayerId;
    bookingPatch.payer_kind = nextKind;
    bookingPatch.billing_company_id = nextKind === "company" ? nextCompany?.id || null : null;
    bookingPatch.fees_follow_stay = resolveFeesFollowStay({
      stayKind: nextKind,
      requested: input.booking.fees_follow_stay !== false,
      companyCount: nextOwned.length,
    });
  }

  function retargetCompany(current: string | null) {
    if (!current) return undefined;
    const company = input.companies.find((row) => row.id === current);
    if (company && company.customer_id === targetWallet) return undefined;
    if (!follows) return null;
    return nextKind === "company" ? nextCompany?.id || null : null;
  }

  const transactions: MovePatch[] = [];
  for (const row of input.transactions) {
    if (row.booking_id !== input.booking.id || !sources.has(row.customer_id)) continue;
    const patch: Record<string, unknown> = {};
    if (row.customer_id !== targetWallet) patch.customer_id = targetWallet;
    const company = retargetCompany(row.billing_company_id);
    if (company !== undefined && company !== row.billing_company_id) patch.billing_company_id = company;
    if (Object.keys(patch).length) transactions.push({ id: row.id, patch });
  }

  function paymentPatch(row: PaymentRow, fields: ("customer_id" | "matched_customer_id")[]) {
    const patch: Record<string, unknown> = {};
    for (const field of fields) {
      const current = row[field];
      if (!current || !sources.has(current) || current === targetWallet) continue;
      patch[field] = targetWallet;
    }
    return Object.keys(patch).length ? patch : null;
  }

  const movedTx = new Set(transactions.map((row) => row.id));
  const revolut: MovePatch[] = [];
  for (const row of input.revolut) {
    const onBooking = row.matched_booking_id === input.booking.id;
    const onLedger = Boolean(row.matched_transaction_id && movedTx.has(row.matched_transaction_id));
    if (!onBooking && !onLedger) continue;
    const patch = paymentPatch(row, ["matched_customer_id"]);
    if (patch) revolut.push({ id: row.id, patch });
  }
  const stripe: MovePatch[] = [];
  for (const row of input.stripe) {
    if (!row.matched_transaction_id || !movedTx.has(row.matched_transaction_id)) continue;
    const patch = paymentPatch(row, ["matched_customer_id"]);
    if (patch) stripe.push({ id: row.id, patch });
  }
  const pliantTx: MovePatch[] = [];
  for (const row of input.pliantTx) {
    if (row.booking_id !== input.booking.id) continue;
    const patch = paymentPatch(row, ["customer_id", "matched_customer_id"]);
    if (patch) pliantTx.push({ id: row.id, patch });
  }
  const pliantCards: MovePatch[] = [];
  for (const row of input.pliantCards) {
    if (row.booking_id !== input.booking.id) continue;
    const patch = paymentPatch(row, ["customer_id"]);
    if (patch) pliantCards.push({ id: row.id, patch });
  }
  const items: MovePatch[] = [];
  if (follows) {
    for (const row of input.items) {
      const company = retargetCompany(row.billing_company_id);
      if (company === undefined || company === row.billing_company_id) continue;
      items.push({ id: row.id, patch: { billing_company_id: company } });
    }
  }

  const fromName = personName(input.from);
  const toName = personName(input.to);
  const visible = input.booking.visible_to_client === true;
  const reference = input.booking.reference || "ce dossier";
  const title = (input.booking.title || "").trim();
  const avant = payerLabel(
    input.payerBefore,
    previousCompany,
    wasCompany ? "company" : "personal"
  );
  const apres = follows
    ? payerLabel(input.payerAfter, nextKind === "company" ? nextCompany : null, nextKind)
    : avant;
  const resume = [
    ...(input.creation ? [`Une fiche est créée pour ${toName}, sans invitation.`] : []),
    title
      ? `Le dossier ${reference} « ${title} » passe de ${fromName} à ${toName}.`
      : `Le dossier ${reference} passe de ${fromName} à ${toName}.`,
    travelers.length
      ? `${travelers.length} voyageur${travelers.length > 1 ? "s" : ""} coché${travelers.length > 1 ? "s" : ""} comme ${fromName} prend${travelers.length > 1 ? "nent" : ""} le nom de ${toName}.`
      : `Aucun voyageur n’était ${fromName} : la liste du séjour ne change pas.`,
    transactions.length
      ? `${transactions.length} écriture${transactions.length > 1 ? "s" : ""} du grand livre et du relevé suit le nouveau client.`
      : `Aucune écriture de ce dossier n’était au nom de ${fromName}.`,
    `Paiements de ce dossier : ${revolut.length} Revolut, ${stripe.length} Stripe, ${pliantTx.length} Pliant, ${pliantCards.length} carte${pliantCards.length > 1 ? "s" : ""}.`,
    follows
      ? `Le payeur passe de ${avant} à ${apres}.${companyCleared ? " La société de l’ancien client n’est pas sur la nouvelle fiche : le séjour redevient particulier." : ""}`
      : `Le payeur reste ${avant} : il ne venait pas de l’ancien client.`,
    visible
      ? `${fromName} ne voit plus ce séjour. ${toName} le voit.`
      : `Le séjour reste non visible : ${toName} ne le voit pas encore.`,
    "Aucun e-mail ni WhatsApp n’est envoyé.",
  ];
  const journal = {
    summary: `Client du dossier ${reference} : ${fromName} → ${toName}.`,
    diff: {
      client: { avant: fromName, apres: toName },
      voyageurs: travelers.length,
      ecritures: transactions.length,
      paiements: revolut.length + stripe.length + pliantTx.length + pliantCards.length,
      payeur: { avant, apres },
      visibilite: visible ? "Le nouveau client voit ce séjour." : "Le séjour reste non visible.",
      message: "Aucun",
    },
  };
  const result: ReassignClientResult = {
    applique: false,
    invite: false,
    messages: false,
    creation: input.creation,
    dossier_id: input.booking.id,
    reference: input.booking.reference || "",
    titre: title,
    visible,
    ancien: { id: input.from.id, nom: fromName },
    nouveau: { id: input.to.id, nom: toName, cree: false },
    voyageurs: travelers.length,
    ecritures: transactions.length,
    paiements: { revolut: revolut.length, stripe: stripe.length, pliant: pliantTx.length, cartes: pliantCards.length },
    payeur: {
      suit: follows,
      avant,
      apres,
      societe_avant: previousCompany?.company_name || null,
      societe_apres: follows && nextKind === "company" ? nextCompany?.company_name || null : null,
    },
    doublons: input.duplicates,
    resume,
    journal,
  };
  return {
    result,
    bookingPatch,
    travelerPatch,
    travelerIds: travelers.map((traveler) => traveler.id),
    transactions,
    revolut,
    stripe,
    pliantTx,
    pliantCards,
    items,
  };
}

async function readRows<T>(query: PromiseLike<{ data: T[] | null; error: DbError }>) {
  const { data, error } = await query;
  if (error) {
    if (soft(error)) return [] as T[];
    throw new ReassignClientError("Lecture impossible.");
  }
  return (data || []) as T[];
}

async function readOne<T>(query: PromiseLike<{ data: T | null; error: DbError }>, missing: string) {
  const { data, error } = await query;
  if (error) {
    if (soft(error)) return null;
    throw new ReassignClientError(missing);
  }
  return data;
}

async function writeRow(admin: SupabaseClient, table: string, id: string, patch: Record<string, unknown>) {
  const { error } = await admin.from(table).update(patch).eq("id", id);
  if (error && !soft(error)) throw new ReassignClientError("Le dossier n’a pas pu être rattaché.");
}

const PERSON =
  "id, first_name, last_name, email, phone, company_name, company_role, billing_parent_id";

async function loadPerson(admin: SupabaseClient, id: string) {
  if (!id) return null;
  return readOne<Person>(admin.from("crm_customers").select(PERSON).eq("id", id).maybeSingle(), "Client introuvable.");
}

async function loadCompanies(admin: SupabaseClient, ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return [] as Company[];
  return readRows<Company>(
    admin.from("crm_billing_companies").select("id, customer_id, company_name, siret, sort_order").in("customer_id", unique)
  );
}

async function findDuplicates(admin: SupabaseClient, draft: PreparedClientDraft) {
  const rows: Person[] = [];
  if (draft.email) {
    rows.push(
      ...(await readRows<Person>(admin.from("crm_customers").select(PERSON).eq("email", draft.email).limit(5)))
    );
  }
  if (draft.phone) {
    rows.push(
      ...(await readRows<Person>(admin.from("crm_customers").select(PERSON).eq("phone", draft.phone).limit(5)))
    );
  }
  if (draft.lastName) {
    const literal = draft.lastName.replace(/[%_]/g, "").trim();
    if (literal) {
      rows.push(
        ...(await readRows<Person>(admin.from("crm_customers").select(PERSON).ilike("last_name", literal).limit(40)))
      );
    }
  }
  return matchingClientDuplicates(rows, draft);
}

async function loadContext(
  admin: SupabaseClient,
  booking: BookingRow,
  from: Person,
  to: Person,
  companies: Company[]
) {
  const [travelers, transactions, revolutByBooking, pliantTx, pliantCards, items] = await Promise.all([
    readRows<TravelerRow>(
      admin
        .from("crm_booking_travelers")
        .select("id, is_account_holder, companion_id, first_name, last_name")
        .eq("booking_id", booking.id)
    ),
    readRows<LedgerRow>(
      admin.from("crm_transactions").select("id, customer_id, booking_id, billing_company_id").eq("booking_id", booking.id)
    ),
    readRows<PaymentRow>(
      admin
        .from("crm_revolut_transactions")
        .select("id, matched_customer_id, matched_booking_id, matched_transaction_id")
        .eq("matched_booking_id", booking.id)
    ),
    readRows<PaymentRow>(
      admin
        .from("crm_pliant_transactions")
        .select("id, customer_id, matched_customer_id, booking_id")
        .eq("booking_id", booking.id)
    ),
    readRows<PaymentRow>(
      admin.from("crm_pliant_cards").select("id, customer_id, booking_id").eq("booking_id", booking.id)
    ),
    readRows<{ id: string; billing_company_id: string | null }>(
      admin.from("crm_booking_items").select("id, billing_company_id").eq("booking_id", booking.id)
    ),
  ]);
  const follows = payerFollowsClient(booking, from);
  const oldPayerId = booking.billing_customer_id || booking.customer_id;
  const sources = new Set<string>([from.id]);
  if (follows) sources.add(oldPayerId);
  const ledgerIds = transactions.filter((row) => sources.has(row.customer_id)).map((row) => row.id);
  const [revolutByLedger, stripe] = await Promise.all([
    ledgerIds.length
      ? readRows<PaymentRow>(
          admin
            .from("crm_revolut_transactions")
            .select("id, matched_customer_id, matched_booking_id, matched_transaction_id")
            .in("matched_transaction_id", ledgerIds)
        )
      : Promise.resolve([] as PaymentRow[]),
    ledgerIds.length
      ? readRows<PaymentRow>(
          admin
            .from("crm_stripe_transactions")
            .select("id, matched_customer_id, matched_transaction_id")
            .in("matched_transaction_id", ledgerIds)
        )
      : Promise.resolve([] as PaymentRow[]),
  ]);
  const revolut = [...revolutByBooking];
  for (const row of revolutByLedger) {
    if (!revolut.some((item) => item.id === row.id)) revolut.push(row);
  }
  return { travelers, transactions, revolut, stripe, pliantTx, pliantCards, items, companies };
}

async function peopleForPlan(admin: SupabaseClient, booking: BookingRow, from: Person, to: Person, companies: Company[]) {
  const follows = payerFollowsClient(booking, from);
  const oldPayerId = booking.billing_customer_id || booking.customer_id;
  const newPayerId = follows
    ? resolveBillingCustomerId({
        id: to.id || "nouveau",
        company_role: roleOf(to),
        billing_parent_id: to.billing_parent_id,
      })
    : oldPayerId;
  const payerBefore = (await loadPerson(admin, oldPayerId)) || from;
  let payerAfter = to;
  if (newPayerId && newPayerId !== to.id) {
    payerAfter = (await loadPerson(admin, newPayerId)) || to;
  } else if (!follows) {
    payerAfter = payerBefore;
  }
  const extra = await loadCompanies(admin, [from.id, to.id, oldPayerId, newPayerId]);
  const merged = [...companies];
  for (const company of extra) {
    if (!merged.some((row) => row.id === company.id)) merged.push(company);
  }
  return { payerBefore, payerAfter, companies: merged };
}

async function applyPlan(admin: SupabaseClient, plan: ReassignPlan) {
  await writeRow(admin, "crm_bookings", plan.result.dossier_id, plan.bookingPatch);
  if (plan.travelerPatch) {
    for (const id of plan.travelerIds) {
      await writeRow(admin, "crm_booking_travelers", id, plan.travelerPatch);
    }
  }
  for (const row of plan.transactions) await writeRow(admin, "crm_transactions", row.id, row.patch);
  for (const row of plan.revolut) await writeRow(admin, "crm_revolut_transactions", row.id, row.patch);
  for (const row of plan.stripe) await writeRow(admin, "crm_stripe_transactions", row.id, row.patch);
  for (const row of plan.pliantTx) await writeRow(admin, "crm_pliant_transactions", row.id, row.patch);
  for (const row of plan.pliantCards) await writeRow(admin, "crm_pliant_cards", row.id, row.patch);
  for (const row of plan.items) await writeRow(admin, "crm_booking_items", row.id, row.patch);
}

async function insertClient(admin: SupabaseClient, draft: PreparedClientDraft) {
  if (draft.email) {
    const taken = await readRows<{ id: string }>(
      admin.from("crm_customers").select("id").eq("email", draft.email).limit(1)
    );
    if (taken.length) throw new ReassignClientError(CUSTOMER_EMAIL_COPY.taken);
  }
  const { data, error } = await admin
    .from("crm_customers")
    .insert({
      email: draft.email,
      first_name: draft.firstName,
      last_name: draft.lastName,
      phone: draft.phone,
      company_name: draft.companyName,
      language: "fr",
    })
    .select(PERSON)
    .single();
  if (error || !data) {
    if (error?.code === "23505") throw new ReassignClientError(CUSTOMER_EMAIL_COPY.taken);
    throw new ReassignClientError("La fiche n’a pas pu être créée.");
  }
  const created = data as Person;
  if (!draft.companyName) return created;
  const { error: companyError } = await admin.from("crm_billing_companies").insert({
    customer_id: created.id,
    company_name: draft.companyName,
    sort_order: 0,
  });
  if (companyError && !soft(companyError)) {
    await admin.from("crm_customers").delete().eq("id", created.id);
    throw new ReassignClientError("La société n’a pas été enregistrée.");
  }
  return created;
}

/**
 * Aperçu ou rattachement d’un dossier à un autre client.
 * Sans confirmer, rien n’est écrit. La création n’invite pas et n’envoie rien.
 */
export async function changeBookingClient(
  admin: SupabaseClient,
  input: ChangeBookingClientInput
): Promise<ReassignClientResult> {
  const bookingId = (input.bookingId || "").trim();
  const reference = (input.reference || "").trim();
  if (bookingId && !UUID.test(bookingId)) throw new ReassignClientError("Dossier invalide.");
  if (!bookingId && !reference) throw new ReassignClientError("Indiquez le dossier.");
  let bookingQuery = admin
    .from("crm_bookings")
    .select(
      "id, reference, title, customer_id, billing_customer_id, billing_company_id, payer_kind, fees_follow_stay, visible_to_client"
    );
  bookingQuery = bookingId ? bookingQuery.eq("id", bookingId) : bookingQuery.eq("reference", reference);
  const booking = await readOne<BookingRow>(bookingQuery.maybeSingle(), "Dossier introuvable.");
  if (!booking) throw new ReassignClientError("Dossier introuvable.");
  const from = await loadPerson(admin, booking.customer_id);
  if (!from) throw new ReassignClientError("Client introuvable.");

  const customerId = (input.customerId || "").trim();
  const draft = input.create ? prepareClientDraft(input.create) : null;
  if (customerId && !UUID.test(customerId)) throw new ReassignClientError("Client invalide.");
  if (!customerId && !draft) throw new ReassignClientError("Indiquez le client, ou un prénom et un nom pour le créer.");
  if (customerId && customerId === from.id) throw new ReassignClientError("Ce dossier est déjà attribué à ce client.");

  const duplicates = draft && !customerId ? await findDuplicates(admin, draft) : [];
  if (draft && !customerId && draft.email && duplicates.some((row) => (row.email || "").toLowerCase() === draft.email)) {
    throw new ReassignClientError(CUSTOMER_EMAIL_COPY.taken);
  }

  let to: Person | null = null;
  let created = false;
  if (customerId) {
    to = await loadPerson(admin, customerId);
    if (!to) throw new ReassignClientError("Client introuvable.");
  } else if (input.confirmer === true && draft) {
    to = await insertClient(admin, draft);
    created = true;
  } else if (draft) {
    to = {
      id: "",
      first_name: draft.firstName,
      last_name: draft.lastName,
      email: draft.email,
      phone: draft.phone,
      company_name: draft.companyName,
      company_role: null,
      billing_parent_id: null,
    };
  }
  if (!to) throw new ReassignClientError("Client introuvable.");

  let companies = await loadCompanies(admin, [from.id, to.id]);
  if (!to.id && draft?.companyName) {
    companies = [
      ...companies,
      { id: "nouvelle-societe", customer_id: "", company_name: draft.companyName, siret: null, sort_order: 0 },
    ];
  }
  const people = await peopleForPlan(admin, booking, from, to, companies);
  const context = await loadContext(admin, booking, from, to, people.companies);
  const plan = planBookingClientChange({
    booking,
    from,
    to,
    payerBefore: people.payerBefore,
    payerAfter: people.payerAfter.id ? people.payerAfter : to,
    companies: context.companies,
    travelers: context.travelers,
    transactions: context.transactions,
    revolut: context.revolut,
    stripe: context.stripe,
    pliantTx: context.pliantTx,
    pliantCards: context.pliantCards,
    items: context.items,
    creation: Boolean(draft && !customerId),
    duplicates,
  });
  if (input.confirmer !== true) return plan.result;
  if (!to.id) throw new ReassignClientError("Client introuvable.");
  plan.bookingPatch.customer_id = to.id;
  if (plan.bookingPatch.billing_customer_id === "") plan.bookingPatch.billing_customer_id = to.id;
  await applyPlan(admin, plan);
  return {
    ...plan.result,
    applique: true,
    nouveau: { id: to.id, nom: personName(to), cree: created },
  };
}
