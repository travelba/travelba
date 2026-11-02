import type { SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { isIsoDate } from "@/lib/crm/admin-schemas";
import { resolveNationality } from "@/lib/crm/countries";
import { customerEmailError, normalizeCustomerEmail } from "@/lib/crm/customer-email";
import { emptyToNull, greetingGivenName } from "@/lib/crm/identity";
import { loyaltyFromCustomer, LOYALTY_PROGRAMS, normalizeLoyaltyNumber, type LoyaltyKey, type LoyaltyMap } from "@/lib/crm/loyalty";
import { McpWriteError } from "@/lib/crm/mcp-write";
import { storedCompanionPhone } from "@/lib/crm/trip-share";
import { createServiceClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TravelerUpdateScope = {
  /** Le voyageur doit appartenir à ce client. */
  customerId?: string | null;
  /** Séjours autorisés. Absent : tous les séjours du client. */
  bookingIds?: string[] | null;
};

type Admin = SupabaseClient;

function client(admin?: Admin) {
  if (admin) return admin;
  if (typeof globalThis.WebSocket !== "function") {
    globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
  }
  return createServiceClient();
}

function uuid(value: unknown, label: string) {
  const id = typeof value === "string" ? value.trim() : "";
  if (!UUID.test(id)) throw new McpWriteError(`${label} invalide.`);
  return id;
}

function optionalId(value: unknown, label: string) {
  if (value == null || value === "") return "";
  return uuid(value, label);
}

function optionalText(value: unknown, label: string, max: number) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new McpWriteError(`${label} invalide.`);
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) throw new McpWriteError(`${label} : ${max} caractères maximum.`);
  return trimmed;
}

function phoneOf(value: unknown) {
  if (value == null || value === "") return null;
  const stored = storedCompanionPhone(value);
  if (!stored.ok || !stored.phone) throw new McpWriteError("Téléphone invalide.");
  return stored.phone;
}

function emailOf(value: unknown) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new McpWriteError("E-mail invalide.");
  const email = normalizeCustomerEmail(value);
  const error = customerEmailError(email);
  if (error) throw new McpWriteError(error);
  return email;
}

function birthOf(value: unknown) {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !isIsoDate(value.trim())) {
    throw new McpWriteError("Date de naissance : AAAA-MM-JJ.");
  }
  return value.trim();
}

function sexOf(value: unknown) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new McpWriteError("Sexe invalide (M, F ou X).");
  const key = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\./g, "");
  if (!key) return null;
  if (["m", "h", "homme", "monsieur", "mr"].includes(key)) return "M";
  if (["f", "femme", "madame", "mme"].includes(key)) return "F";
  if (["x", "autre"].includes(key)) return "X";
  throw new McpWriteError("Sexe invalide (M, F ou X).");
}

function programOf(value: unknown): LoyaltyKey | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new McpWriteError("Programme inconnu.");
  const folded = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  const found = LOYALTY_PROGRAMS.find(
    (program) =>
      program.key === folded.replace(/\s+/g, "_") ||
      program.label
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{M}/gu, "") === folded
  );
  if (!found) throw new McpWriteError("Programme inconnu.");
  return found.key;
}

type TravelerRow = {
  id: string;
  booking_id: string;
  companion_id: string | null;
  is_account_holder: boolean;
  first_name: string | null;
  last_name: string | null;
};

type PersonRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  usage_name?: string | null;
  phone?: string | null;
  email?: string | null;
  birth_date?: string | null;
  sex?: string | null;
  nationality?: string | null;
  relationship?: string | null;
  loyalty?: LoyaltyMap | null;
  flying_blue?: string | null;
};

/**
 * Met à jour le voyageur déjà sur le dossier, par `voyageur_id`
 * (`crm_booking_travelers.id`). Le téléphone et la naissance du titulaire
 * restent sur sa fiche. L’e-mail d’un accompagnateur est un contact : il
 * n’ouvre pas de compte. L’e-mail du titulaire ne change pas ici.
 */
export async function updateVoyageur(input: Record<string, unknown>, admin?: Admin, scope?: TravelerUpdateScope) {
  const voyageurId = uuid(input.voyageur_id, "Voyageur");
  const dossierId = optionalId(input.dossier_id, "Dossier");
  const reference = optionalText(input.reference, "Référence", 80);
  const phone = phoneOf(input.telephone);
  const email = emailOf(input.email);
  const birth = birthOf(input.date_naissance);
  const sex = sexOf(input.sexe ?? input.civilite);
  const nationality = input.nationalite == null || input.nationalite === "" ? null : nationalityOf(input.nationalite);
  const prenoms = optionalText(input.prenoms, "Prénoms", 120);
  const nom = optionalText(input.nom, "Nom", 80);
  const usage = optionalText(input.nom_usage, "Nom d’usage", 80);
  const relationship = optionalText(input.lien, "Lien", 40);
  const program = programOf(input.programme);
  const loyaltyNumber = optionalText(input.numero_fidelite, "Numéro de fidélité", 40);
  if (program && !loyaltyNumber) throw new McpWriteError("Indiquez le numéro du programme.");
  if (!program && loyaltyNumber) throw new McpWriteError("Indiquez le programme.");
  const touched = [phone, email, birth, sex, nationality, prenoms, nom, usage, relationship, program].some(Boolean);
  if (!touched) throw new McpWriteError("Indiquez ce qu’il faut modifier.");

  const db = client(admin);
  const { data: travelerRow, error: travelerError } = await db
    .from("crm_booking_travelers")
    .select("id, booking_id, companion_id, is_account_holder, first_name, last_name")
    .eq("id", voyageurId)
    .maybeSingle();
  if (travelerError || !travelerRow) throw new McpWriteError("Ce voyageur n’est pas sur le dossier.");
  const traveler = travelerRow as TravelerRow;
  const { data: bookingRow, error: bookingError } = await db
    .from("crm_bookings")
    .select("id, reference, customer_id")
    .eq("id", traveler.booking_id)
    .maybeSingle();
  if (bookingError || !bookingRow) throw new McpWriteError("Ce voyageur n’est pas sur le dossier.");
  const booking = bookingRow as { id: string; reference: string; customer_id: string };
  if (dossierId && booking.id !== dossierId) throw new McpWriteError("Ce voyageur n’est pas sur ce dossier.");
  if (reference && booking.reference !== reference) throw new McpWriteError("Ce voyageur n’est pas sur ce dossier.");
  if (scope?.customerId && booking.customer_id !== scope.customerId) {
    throw new McpWriteError("Ce voyageur n’est pas sur le dossier de ce client.");
  }
  if (scope?.bookingIds && !scope.bookingIds.includes(booking.id)) {
    throw new McpWriteError("Ce voyageur n’est pas sur le dossier de ce client.");
  }

  const holder = traveler.is_account_holder;
  if (holder && email) {
    throw new McpWriteError("L’e-mail du titulaire se modifie avec mettre_a_jour_client.");
  }

  const person = holder
    ? await loadHolder(db, booking.customer_id)
    : await loadCompanion(db, traveler.companion_id, booking.customer_id);
  if (!person) throw new McpWriteError("Ce voyageur n’est pas sur la fiche du client.");

  const before = {
    telephone: emptyToNull(person.phone),
    email: emptyToNull(person.email),
    date_naissance: emptyToNull(person.birth_date),
  };
  const patch: Record<string, unknown> = {};
  const champs: string[] = [];
  if (phone && phone !== before.telephone) {
    patch.phone = phone;
    champs.push("telephone");
  } else if (phone) champs.push("telephone");
  if (email && email !== before.email) {
    patch.email = email;
    champs.push("email");
  } else if (email) champs.push("email");
  if (birth && birth !== before.date_naissance) {
    patch.birth_date = birth;
    champs.push("date_naissance");
  } else if (birth) champs.push("date_naissance");
  if (sex) {
    patch.sex = sex;
    champs.push("sexe");
  }
  if (nationality) {
    patch.nationality = nationality;
    champs.push("nationalite");
  }
  if (prenoms) {
    patch.first_name = prenoms;
    champs.push("prenoms");
  }
  if (nom) {
    patch.last_name = nom;
    champs.push("nom");
  }
  if (usage) {
    patch.usage_name = usage;
    champs.push("nom_usage");
  }
  if (!holder && relationship) {
    patch.relationship = relationship;
    champs.push("lien");
  }
  if (program && loyaltyNumber) {
    const loyalty = loyaltyFromCustomer({ loyalty: person.loyalty, flying_blue: person.flying_blue });
    loyalty[program] = normalizeLoyaltyNumber(loyaltyNumber);
    patch.loyalty = loyalty;
    if (holder && program === "flying_blue") patch.flying_blue = loyalty.flying_blue;
    champs.push("fidelite");
  }

  const writes = Object.keys(patch);
  if (writes.length) {
    const table = holder ? "crm_customers" : "crm_travel_companions";
    const { error } = await db.from(table).update(patch).eq("id", person.id);
    if (error) throw new McpWriteError("Voyageur non modifié.");
    if (!holder && (prenoms || nom)) {
      const namePatch: Record<string, unknown> = {};
      if (prenoms) namePatch.first_name = prenoms;
      if (nom) namePatch.last_name = nom;
      const { error: stayError } = await db.from("crm_booking_travelers").update(namePatch).eq("id", traveler.id);
      if (stayError) throw new McpWriteError("Voyageur non modifié.");
    }
  }

  const first = greetingGivenName(prenoms || person.first_name) || (prenoms || person.first_name || "").trim();
  const last = (nom || person.last_name || "").trim();
  return {
    voyageur_id: traveler.id,
    compagnon_id: holder ? null : person.id,
    titulaire: holder,
    client_id: booking.customer_id,
    dossier_id: booking.id,
    reference: booking.reference,
    prenom: first,
    nom: last,
    telephone: phone || before.telephone,
    email: holder ? null : email || before.email,
    date_naissance: birth || before.date_naissance,
    champs: [...new Set(champs)],
    avant: before,
    ecrit: writes.length > 0,
    notifie: false,
  };
}

function nationalityOf(value: unknown) {
  if (typeof value !== "string") throw new McpWriteError("Nationalité invalide.");
  const code = resolveNationality(value);
  if (!code) throw new McpWriteError("Nationalité inconnue.");
  return code;
}

async function loadHolder(db: Admin, customerId: string) {
  const { data, error } = await db
    .from("crm_customers")
    .select("id, first_name, last_name, usage_name, phone, birth_date, sex, nationality, loyalty, flying_blue")
    .eq("id", customerId)
    .maybeSingle();
  if (error || !data) return null;
  return data as PersonRow;
}

async function loadCompanion(db: Admin, companionId: string | null, customerId: string) {
  if (!companionId) return null;
  const withEmail = await db
    .from("crm_travel_companions")
    .select("id, first_name, last_name, usage_name, phone, email, birth_date, sex, nationality, relationship, loyalty")
    .eq("id", companionId)
    .eq("customer_id", customerId)
    .maybeSingle();
  if (!withEmail.error && withEmail.data) return withEmail.data as PersonRow;
  const plain = await db
    .from("crm_travel_companions")
    .select("id, first_name, last_name, usage_name, phone, birth_date, sex, nationality, relationship, loyalty")
    .eq("id", companionId)
    .eq("customer_id", customerId)
    .maybeSingle();
  if (plain.error || !plain.data) return null;
  return plain.data as PersonRow;
}
