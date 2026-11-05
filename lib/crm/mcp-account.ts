import type { SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { isIsoDate } from "@/lib/crm/admin-schemas";
import { toAuditRow } from "@/lib/crm/audit-events";
import { parseCompanyRole } from "@/lib/crm/company-role";
import { resolveCountryCode, resolveNationality } from "@/lib/crm/countries";
import { customerPatchFromBody } from "@/lib/crm/customer-patch";
import { emptyToNull } from "@/lib/crm/identity";
import { getPortalAccess, inviteCustomer, type InviteResult, type PortalAccess } from "@/lib/crm/invite";
import { currentMcpAccess } from "@/lib/crm/mcp-auth";
import { McpWriteError } from "@/lib/crm/mcp-write";
import { isStaffRole, mustSetPassword } from "@/lib/crm/session";
import { insertTravelDocument } from "@/lib/crm/travel-document-write";
import type { CompanyRole, CrmCustomer } from "@/lib/crm/types";
import { createServiceClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const HOLDER_COLUMNS =
  "id, first_name, last_name, usage_name, birth_date, sex, nationality, address_line, postal_code, city, country, email, phone, auth_user_id, company_role, billing_parent_id, spending_allowance";

type Admin = SupabaseClient;

type PassportRow = {
  id: string;
  companion_id: string | null;
  booking_id: string | null;
  issuing_country: string | null;
  first_name: string | null;
  last_name: string | null;
  usage_name: string | null;
  birth_date: string | null;
  sex: string | null;
  nationality: string | null;
  place_of_birth: string | null;
  issued_on: string | null;
};

export type HolderResult = {
  id: string;
  titulaire: boolean;
  compagnon_id?: string;
  champs: string[];
  passeport: boolean;
  notifie: false;
  prenoms?: string;
  nom?: string;
  nom_passeport?: string;
  nom_usage?: string | null;
  date_naissance?: string | null;
  lieu_naissance?: string | null;
  sexe?: string | null;
  nationalite?: string | null;
  delivrance?: string | null;
  expiration?: string | null;
  adresse?: string | null;
  code_postal?: string | null;
  ville?: string | null;
  pays?: string | null;
  pays_passeport?: string | null;
};

export type HolderDraft = {
  id: string;
  /** Accompagnateur : le passeport de cette personne, pas celui du titulaire. */
  compagnonId: string | null;
  customer: Record<string, unknown>;
  passport: Record<string, unknown>;
  /** Délivrance, expiration, numéro, lieu ou nom de passeport : un livret précis. */
  documentSpecific: boolean;
  paysPasseport: string | null;
  champs: string[];
  echo: Record<string, unknown>;
};

export type CompanionDraft = {
  compagnonId: string;
  clientId: string;
  companion: Record<string, unknown>;
  passport: Record<string, unknown>;
  traveler: Record<string, unknown>;
  champs: string[];
  echo: Record<string, unknown>;
};

export type CompanyRoleDraft = {
  id: string;
  role: CompanyRole | null;
  payeurId: string | null;
  /** Absent : le plafond déjà enregistré reste, sauf pour un particulier. */
  spending: number | null | undefined;
};

export type AccountDeps = {
  invite?: (customer: CrmCustomer, origin: string) => Promise<InviteResult>;
  portal?: (customer: CrmCustomer) => Promise<PortalAccess["status"]>;
  origin?: string;
};

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

function clientId(input: Record<string, unknown>) {
  const raw = "id" in input ? input.id : input.client_id;
  return uuid(raw, "Client");
}

function fold(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\./g, "");
}

function text(value: unknown, label: string, max: number) {
  if (typeof value !== "string") throw new McpWriteError(`${label} invalide.`);
  const trimmed = value.trim();
  if (!trimmed) throw new McpWriteError(`${label} invalide.`);
  if (trimmed.length > max) throw new McpWriteError(`${label} : ${max} caractères maximum.`);
  return trimmed;
}

function optionalClear(value: unknown, label: string, max: number) {
  if (value == null || value === "") return null;
  return text(value, label, max);
}

function day(value: unknown, label: string) {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !isIsoDate(value.trim())) throw new McpWriteError(`${label} : AAAA-MM-JJ.`);
  return value.trim();
}

function sexOf(value: unknown) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new McpWriteError("Sexe invalide (M, F ou X).");
  const key = fold(value);
  if (!key) return null;
  if (["m", "h", "homme", "monsieur", "mr"].includes(key)) return "M";
  if (["f", "femme", "madame", "mme"].includes(key)) return "F";
  if (["x", "autre"].includes(key)) return "X";
  throw new McpWriteError("Sexe invalide (M, F ou X).");
}

function nationalityOf(value: unknown) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new McpWriteError("Nationalité invalide.");
  const code = resolveNationality(value);
  if (!code) throw new McpWriteError("Nationalité inconnue.");
  return code;
}

/** Numéro de livret. Jamais renvoyé, jamais journalisé en clair. */
function passportNumber(value: unknown) {
  if (typeof value !== "string") throw new McpWriteError("Numéro invalide.");
  const compact = value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (compact.length < 4 || compact.length > 20) throw new McpWriteError("Numéro invalide.");
  return compact;
}

function requiredDay(value: unknown, label: string) {
  if (typeof value !== "string" || !isIsoDate(value.trim())) throw new McpWriteError(`${label} : AAAA-MM-JJ.`);
  return value.trim();
}

function countryOf(value: unknown, label: string) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new McpWriteError(`${label} invalide.`);
  const code = resolveCountryCode(value);
  if (!code) throw new McpWriteError(`${label} inconnu.`);
  return code;
}

/**
 * Fiche du titulaire et passeport, ou passeport d’un accompagnateur (`compagnon_id`).
 * L’adresse reste celle du titulaire. Le numéro peut être corrigé : il n’est pas renvoyé.
 * Le pays du passeport n’est pas la nationalité.
 */
export function prepareHolderProfile(input: Record<string, unknown>): HolderDraft {
  const id = clientId(input);
  const compagnonId = "compagnon_id" in input && input.compagnon_id != null && input.compagnon_id !== ""
    ? uuid(input.compagnon_id, "Accompagnateur")
    : null;
  if (compagnonId) {
    for (const key of ["adresse", "code_postal", "ville", "pays"] as const) {
      if (key in input && input[key] != null && String(input[key]).trim() !== "") {
        throw new McpWriteError("L’adresse est celle du titulaire.");
      }
    }
  }
  const customer: Record<string, unknown> = {};
  const passport: Record<string, unknown> = {};
  const echo: Record<string, unknown> = {};
  const champs: string[] = [];
  let documentSpecific = false;
  let paysPasseport: string | null = null;

  if ("prenoms" in input) {
    const prenoms = text(input.prenoms, "Prénoms", 120);
    customer.first_name = prenoms;
    passport.first_name = prenoms;
    echo.prenoms = prenoms;
    champs.push("prenoms");
  }
  if ("nom" in input) {
    const nom = text(input.nom, "Nom", 80);
    customer.last_name = nom;
    echo.nom = nom;
    champs.push("nom");
  }
  if ("nom_passeport" in input) {
    const nom = text(input.nom_passeport, "Nom de passeport", 80);
    passport.last_name = nom;
    echo.nom_passeport = nom;
    champs.push("nom_passeport");
    documentSpecific = true;
  }
  if ("nom_usage" in input) {
    const usage = optionalClear(input.nom_usage, "Nom d’usage", 80);
    customer.usage_name = usage;
    passport.usage_name = usage;
    echo.nom_usage = usage;
    champs.push("nom_usage");
  }
  if ("date_naissance" in input) {
    const birth = day(input.date_naissance, "Date de naissance");
    customer.birth_date = birth;
    passport.birth_date = birth;
    echo.date_naissance = birth;
    champs.push("date_naissance");
  }
  if ("lieu_naissance" in input) {
    const place = optionalClear(input.lieu_naissance, "Lieu de naissance", 120);
    passport.place_of_birth = place;
    echo.lieu_naissance = place;
    champs.push("lieu_naissance");
    documentSpecific = true;
  }
  if ("sexe" in input) {
    const sex = sexOf(input.sexe);
    customer.sex = sex;
    passport.sex = sex;
    echo.sexe = sex;
    champs.push("sexe");
  }
  if ("nationalite" in input) {
    const nationality = nationalityOf(input.nationalite);
    customer.nationality = nationality;
    passport.nationality = nationality;
    echo.nationalite = nationality;
    champs.push("nationalite");
  }
  if ("delivrance" in input) {
    const issued = day(input.delivrance, "Date de délivrance");
    passport.issued_on = issued;
    echo.delivrance = issued;
    champs.push("delivrance");
    documentSpecific = true;
  }
  if ("expiration" in input) {
    const expires = requiredDay(input.expiration, "Date d’expiration");
    passport.expires_on = expires;
    echo.expiration = expires;
    champs.push("expiration");
    documentSpecific = true;
  }
  if ("numero" in input) {
    passport.number = passportNumber(input.numero);
    champs.push("numero");
    documentSpecific = true;
  }
  if (!compagnonId && "adresse" in input) {
    customer.address_line = optionalClear(input.adresse, "Adresse", 300);
    echo.adresse = customer.address_line;
    champs.push("adresse");
  }
  if (!compagnonId && "code_postal" in input) {
    customer.postal_code = optionalClear(input.code_postal, "Code postal", 20);
    echo.code_postal = customer.postal_code;
    champs.push("code_postal");
  }
  if (!compagnonId && "ville" in input) {
    customer.city = optionalClear(input.ville, "Ville", 80);
    echo.ville = customer.city;
    champs.push("ville");
  }
  if (!compagnonId && "pays" in input) {
    customer.country = countryOf(input.pays, "Pays");
    echo.pays = customer.country;
    champs.push("pays");
  }
  if ("pays_passeport" in input && input.pays_passeport != null && input.pays_passeport !== "") {
    paysPasseport = countryOf(input.pays_passeport, "Pays du passeport");
    echo.pays_passeport = paysPasseport;
    champs.push("pays_passeport");
  }
  if (!champs.length) throw new McpWriteError("Indiquez ce qu’il faut modifier.");
  if (champs.length === 1 && champs[0] === "pays_passeport") {
    throw new McpWriteError("Indiquez ce qu’il faut modifier.");
  }
  return { id, compagnonId, customer, passport, documentSpecific, paysPasseport, champs, echo };
}

/**
 * Identité d’un accompagnateur : prénoms, nom, nom d’usage, naissance, sexe.
 * Pas le numéro de passeport. Pas l’adresse du titulaire.
 */
export function prepareCompanionIdentity(input: Record<string, unknown>): CompanionDraft {
  const compagnonId = uuid(input.compagnon_id, "Accompagnateur");
  const clientId = "client_id" in input && input.client_id != null && input.client_id !== ""
    ? uuid(input.client_id, "Client")
    : "id" in input && input.id != null && input.id !== "" && input.id !== compagnonId
      ? uuid(input.id, "Client")
      : "";
  const companion: Record<string, unknown> = {};
  const passport: Record<string, unknown> = {};
  const traveler: Record<string, unknown> = {};
  const echo: Record<string, unknown> = {};
  const champs: string[] = [];
  if ("prenoms" in input) {
    const prenoms = text(input.prenoms, "Prénoms", 120);
    companion.first_name = prenoms;
    passport.first_name = prenoms;
    traveler.first_name = prenoms;
    echo.prenoms = prenoms;
    champs.push("prenoms");
  }
  if ("nom" in input) {
    const nom = text(input.nom, "Nom", 80);
    companion.last_name = nom;
    passport.last_name = nom;
    traveler.last_name = nom;
    echo.nom = nom;
    champs.push("nom");
  }
  if ("nom_usage" in input) {
    const usage = optionalClear(input.nom_usage, "Nom d’usage", 80);
    companion.usage_name = usage;
    passport.usage_name = usage;
    echo.nom_usage = usage;
    champs.push("nom_usage");
  }
  if ("date_naissance" in input) {
    const birth = day(input.date_naissance, "Date de naissance");
    companion.birth_date = birth;
    passport.birth_date = birth;
    echo.date_naissance = birth;
    champs.push("date_naissance");
  }
  if ("sexe" in input) {
    const sex = sexOf(input.sexe);
    companion.sex = sex;
    passport.sex = sex;
    echo.sexe = sex;
    champs.push("sexe");
  }
  if (!champs.length) throw new McpWriteError("Indiquez ce qu’il faut modifier.");
  return { compagnonId, clientId, companion, passport, traveler, champs, echo };
}

/** Même modèle que la fiche agence : admin, membre (payeur admin), particulier. */
export function prepareCompanyRole(input: Record<string, unknown>): CompanyRoleDraft {
  const id = clientId(input);
  if (!("role" in input) || input.role == null || input.role === "") {
    throw new McpWriteError("Rôle inconnu (admin, membre ou particulier).");
  }
  const raw = typeof input.role === "string" ? fold(input.role) : "";
  let role: CompanyRole | null;
  if (raw === "admin") role = "admin";
  else if (raw === "member" || raw === "membre" || raw === "collaborateur") role = "member";
  else if (raw === "particulier" || raw === "aucun") role = null;
  else throw new McpWriteError("Rôle inconnu (admin, membre ou particulier).");
  const payeurRaw = input.payeur_id ?? input.admin_id;
  const payeurId = payeurRaw == null || payeurRaw === "" ? null : uuid(payeurRaw, "Payeur");
  if (role === "member") {
    if (!payeurId) throw new McpWriteError("Choisissez l’admin société qui paie pour ce collaborateur.");
    if (payeurId === id) throw new McpWriteError("Le payeur ne peut pas être le collaborateur lui-même.");
  }
  let spending: number | null | undefined;
  if ("droit_depense" in input) {
    const parsed = customerPatchFromBody({ spending_allowance: input.droit_depense });
    if (parsed.error) throw new McpWriteError(parsed.error);
    spending = (parsed.patch.spending_allowance as number | null) ?? null;
  }
  return { id, role, payeurId: role === "member" ? payeurId : null, spending };
}

export function roleLabel(role: CompanyRole | null) {
  if (role === "admin") return "admin";
  if (role === "member") return "membre";
  return "particulier";
}

/** Un accès déjà ouvert (invité ou prêt) ne part pas une seconde fois. */
export function inviteAgain(status: PortalAccess["status"]) {
  return status === "none";
}

async function loadHolder(db: Admin, id: string) {
  const { data, error } = await db.from("crm_customers").select(HOLDER_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new McpWriteError("Client introuvable.");
  return (data as CrmCustomer | null) ?? null;
}

type CompanionIdentity = {
  id: string;
  customer_id: string;
  first_name: string | null;
  last_name: string | null;
  usage_name: string | null;
  birth_date: string | null;
  sex: string | null;
  nationality: string | null;
};

async function loadCompanion(db: Admin, companionId: string, customerId: string) {
  const { data, error } = await db
    .from("crm_travel_companions")
    .select("id, customer_id, first_name, last_name, usage_name, birth_date, sex, nationality")
    .eq("id", companionId)
    .eq("customer_id", customerId)
    .maybeSingle();
  if (error) throw new McpWriteError("Accompagnateur introuvable.");
  return (data as CompanionIdentity | null) ?? null;
}

async function loadPassports(db: Admin, customerId: string, companionId: string | null) {
  const { data, error } = await db
    .from("crm_travel_documents")
    .select(
      "id, companion_id, booking_id, issuing_country, first_name, last_name, usage_name, birth_date, sex, nationality, place_of_birth, issued_on"
    )
    .eq("customer_id", customerId)
    .eq("doc_type", "passport")
    .limit(80);
  if (error) throw new McpWriteError("Passeport non enregistré.");
  return ((data || []) as PassportRow[]).filter((row) => (row.companion_id || null) === companionId);
}

async function journal(db: Admin, action: string, customerId: string, summary: string, detail: Record<string, unknown>) {
  const row = toAuditRow({
    actorKind: "auto",
    action,
    customerId,
    summary,
    detail: { ...detail, acteur: currentMcpAccess().actor },
    source: "mcp",
  });
  const first = await db.from("crm_audit_events").insert(row);
  if (!first.error) return;
  const missingSource = first.error.code === "PGRST204" || first.error.code === "42703";
  if (missingSource) {
    const { source: _source, ...rest } = row;
    const second = await db.from("crm_audit_events").insert(rest);
    if (!second.error) return;
  }
  console.error("[mcp] journal", action, first.error.code ?? "?");
}

async function staffLinked(db: Admin, authUserId: string | null) {
  if (!authUserId) return false;
  const { data, error } = await db.from("crm_staff").select("id").eq("auth_user_id", authUserId).maybeSingle();
  if (error || data) return true;
  const getter = db.auth?.admin?.getUserById;
  if (typeof getter !== "function") return false;
  const user = await getter(authUserId);
  if (user.error || !user.data?.user) return true;
  return isStaffRole(user.data.user);
}

async function portalStatus(customer: CrmCustomer, db: Admin, deps?: AccountDeps): Promise<PortalAccess["status"]> {
  if (deps?.portal) return deps.portal(customer);
  if (!customer.auth_user_id) return "none";
  const getter = db.auth?.admin?.getUserById;
  if (typeof getter === "function") {
    const user = await getter(customer.auth_user_id);
    if (user.error || !user.data?.user) return "none";
    return mustSetPassword(user.data.user) ? "invited" : "ready";
  }
  return (await getPortalAccess(customer)).status;
}

/**
 * Met à jour la fiche du titulaire et son passeport, ou le passeport d’un
 * accompagnateur quand `compagnon_id` est indiqué. Aucun message.
 * Le numéro peut être écrit. Il n’est ni renvoyé ni journalisé.
 */
export async function updateHolderProfile(input: Record<string, unknown>, admin?: Admin): Promise<HolderResult> {
  const draft = prepareHolderProfile(input);
  const db = client(admin);
  const holder = await loadHolder(db, draft.id);
  if (!holder) throw new McpWriteError("Client introuvable.");
  const companion = draft.compagnonId ? await loadCompanion(db, draft.compagnonId, draft.id) : null;
  if (draft.compagnonId && !companion) throw new McpWriteError("Accompagnateur introuvable.");

  const passportPatch = draft.passport;
  const wantsPassport = draft.documentSpecific || Object.keys(passportPatch).length > 0;
  let targets: PassportRow[] = [];
  let create = false;
  if (wantsPassport) {
    const rows = await loadPassports(db, draft.id, draft.compagnonId);
    const countries = new Set(rows.map((row) => row.issuing_country || ""));
    if (draft.paysPasseport) {
      targets = rows.filter((row) => (row.issuing_country || "") === draft.paysPasseport);
      if (!targets.length) {
        if (draft.documentSpecific) create = true;
        else if (rows.length) throw new McpWriteError("Passeport introuvable pour ce pays.");
      }
    } else if (draft.documentSpecific && countries.size > 1) {
      throw new McpWriteError("Plusieurs passeports. Indiquez pays_passeport.");
    } else {
      targets = rows;
      if (!targets.length && draft.documentSpecific) create = true;
    }
  }

  const person = companion || holder;
  if (draft.compagnonId) {
    if (Object.keys(draft.customer).length) {
      const { error } = await db
        .from("crm_travel_companions")
        .update(draft.customer)
        .eq("id", draft.compagnonId)
        .eq("customer_id", draft.id);
      if (error) throw new McpWriteError("Fiche non enregistrée.");
    }
  } else if (Object.keys(draft.customer).length) {
    const { error } = await db.from("crm_customers").update(draft.customer).eq("id", draft.id);
    if (error) throw new McpWriteError("Fiche non enregistrée.");
  }
  if ((draft.customer.first_name || draft.customer.last_name) && ("prenoms" in input || "nom" in input)) {
    const name: Record<string, unknown> = {};
    if ("prenoms" in input) name.first_name = draft.customer.first_name;
    if ("nom" in input) name.last_name = draft.customer.last_name;
    if (draft.compagnonId) {
      const { error } = await db.from("crm_booking_travelers").update(name).eq("companion_id", draft.compagnonId);
      if (error) throw new McpWriteError("Fiche non enregistrée.");
    } else {
      const { data: bookings, error: bookingError } = await db.from("crm_bookings").select("id").eq("customer_id", draft.id);
      if (bookingError) throw new McpWriteError("Fiche non enregistrée.");
      const ids = ((bookings || []) as { id: string }[]).map((row) => row.id);
      if (ids.length) {
        const { error } = await db
          .from("crm_booking_travelers")
          .update(name)
          .in("booking_id", ids)
          .eq("is_account_holder", true);
        if (error) throw new McpWriteError("Fiche non enregistrée.");
      }
    }
  }
  if (Object.keys(passportPatch).length) {
    for (const row of targets) {
      const { error } = await db.from("crm_travel_documents").update(passportPatch).eq("id", row.id).eq("customer_id", draft.id);
      if (error) throw new McpWriteError("Passeport non enregistré.");
    }
  }
  if (create) {
    const sex = passportPatch.sex === "M" || passportPatch.sex === "F" || passportPatch.sex === "X"
      ? passportPatch.sex
      : person.sex === "M" || person.sex === "F" || person.sex === "X"
        ? person.sex
        : null;
    try {
      await insertTravelDocument(db, {
        customerId: draft.id,
        companionId: draft.compagnonId,
        docType: "passport",
        number: (passportPatch.number as string | null) ?? null,
        issuingCountry: draft.paysPasseport,
        issuedOn: (passportPatch.issued_on as string | null) ?? null,
        expiresOn: (passportPatch.expires_on as string | null) ?? null,
        placeOfBirth: (passportPatch.place_of_birth as string | null) ?? null,
        first_name: (passportPatch.first_name as string | null) ?? person.first_name,
        last_name: (passportPatch.last_name as string | null) ?? person.last_name,
        usage_name: (passportPatch.usage_name as string | null) ?? person.usage_name ?? null,
        birth_date: (passportPatch.birth_date as string | null) ?? person.birth_date,
        nationality: (passportPatch.nationality as string | null) ?? person.nationality ?? null,
        sex,
        formalities: false,
        replacePrevious: false,
      });
    } catch (err) {
      console.error("[mcp] passeport", err instanceof Error ? err.name : "error");
      throw new McpWriteError("Passeport non enregistré.");
    }
  }
  await journal(
    db,
    draft.compagnonId ? "passeport_accompagnant" : "fiche_titulaire",
    draft.id,
    draft.compagnonId ? "Passeport de l’accompagnateur mis à jour" : "Fiche du titulaire mise à jour",
    { champs: draft.champs, ...(draft.compagnonId ? { compagnon_id: draft.compagnonId } : {}) }
  );
  return {
    ...(draft.echo as HolderResult),
    id: draft.id,
    titulaire: !draft.compagnonId,
    ...(draft.compagnonId ? { compagnon_id: draft.compagnonId } : {}),
    champs: draft.champs,
    passeport: targets.length > 0 || create,
    notifie: false,
  };
}

/**
 * Renomme un accompagnateur et aligne son passeport (noms, naissance, sexe).
 * Le numéro, la délivrance et l’expiration ne changent pas. Aucun message.
 */
export async function updateCompanionIdentity(input: Record<string, unknown>, admin?: Admin) {
  const draft = prepareCompanionIdentity(input);
  const db = client(admin);
  let query = db
    .from("crm_travel_companions")
    .select("id, customer_id, first_name, last_name")
    .eq("id", draft.compagnonId);
  if (draft.clientId) query = query.eq("customer_id", draft.clientId);
  const { data, error } = await query.maybeSingle();
  if (error || !data) throw new McpWriteError("Accompagnateur introuvable.");
  const companion = data as { id: string; customer_id: string };
  if (draft.clientId && companion.customer_id !== draft.clientId) {
    throw new McpWriteError("Cet accompagnateur n’est pas sur cette fiche.");
  }
  const { error: updateError } = await db
    .from("crm_travel_companions")
    .update(draft.companion)
    .eq("id", companion.id)
    .eq("customer_id", companion.customer_id);
  if (updateError) throw new McpWriteError("Accompagnateur non enregistré.");
  if (Object.keys(draft.traveler).length) {
    const { error: stayError } = await db.from("crm_booking_travelers").update(draft.traveler).eq("companion_id", companion.id);
    if (stayError) throw new McpWriteError("Accompagnateur non enregistré.");
  }
  if (Object.keys(draft.passport).length) {
    const { error: passportError } = await db
      .from("crm_travel_documents")
      .update(draft.passport)
      .eq("customer_id", companion.customer_id)
      .eq("companion_id", companion.id)
      .eq("doc_type", "passport");
    if (passportError) throw new McpWriteError("Accompagnateur non enregistré.");
  }
  await journal(db, "fiche_accompagnant", companion.customer_id, "Accompagnateur mis à jour", {
    champs: draft.champs,
    compagnon_id: companion.id,
  });
  return {
    ...(draft.echo as Record<string, unknown>),
    id: companion.customer_id,
    compagnon_id: companion.id,
    titulaire: false,
    champs: draft.champs,
    notifie: false,
  };
}

/**
 * Rôle sur la société du client. ADMIN voit le wallet. Un membre est rattaché
 * à un admin société. Un particulier n’a ni payeur ni plafond. Aucun message.
 */
export async function setCompanyRole(input: Record<string, unknown>, admin?: Admin) {
  const draft = prepareCompanyRole(input);
  const db = client(admin);
  const holder = await loadHolder(db, draft.id);
  if (!holder) throw new McpWriteError("Client introuvable.");
  if (draft.role === "member" && draft.payeurId) {
    const { data: parent, error } = await db
      .from("crm_customers")
      .select("id, company_role, billing_parent_id")
      .eq("id", draft.payeurId)
      .maybeSingle();
    if (error || !parent) throw new McpWriteError("Admin société introuvable.");
    const parentRole = parseCompanyRole((parent as { company_role?: unknown }).company_role);
    const parentOfParent = emptyToNull((parent as { billing_parent_id?: unknown }).billing_parent_id);
    if (parentRole !== "admin" || parentOfParent) {
      throw new McpWriteError("Le payeur doit être un client en rôle « Admin société ».");
    }
  }
  const patch: Record<string, unknown> = {
    company_role: draft.role,
    billing_parent_id: draft.role === "member" ? draft.payeurId : null,
  };
  if (draft.role == null) patch.spending_allowance = null;
  else if (draft.spending !== undefined) patch.spending_allowance = draft.spending;
  const { error } = await db.from("crm_customers").update(patch).eq("id", draft.id);
  if (error) throw new McpWriteError("Rôle non enregistré.");
  const storedAllowance =
    draft.role == null ? null : draft.spending !== undefined ? draft.spending : (holder.spending_allowance ?? null);
  await journal(db, "role_societe", draft.id, "Rôle société mis à jour", {
    role: roleLabel(draft.role),
    payeur: draft.role === "member",
  });
  return {
    id: draft.id,
    role: roleLabel(draft.role),
    payeur_id: draft.role === "member" ? draft.payeurId : null,
    droit_depense: storedAllowance,
    notifie: false,
  };
}

/**
 * Crée l’accès de l’espace client et envoie l’invitation, le même flux que la fiche.
 * Le canal du lien est l’e-mail, ou WhatsApp si ce message part. Un second appel
 * ne renvoie rien. Le lien n’est pas renvoyé.
 */
export async function inviteClientAccess(input: Record<string, unknown>, admin?: Admin, deps?: AccountDeps) {
  const id = clientId(input);
  const db = client(admin);
  const holder = await loadHolder(db, id);
  if (!holder) throw new McpWriteError("Client introuvable.");
  if (!holder.email?.trim()) throw new McpWriteError("Cette fiche n'a pas d'e-mail.");
  if (await staffLinked(db, holder.auth_user_id)) throw new McpWriteError("Réservé à un client.");
  const status = await portalStatus(holder, db, deps);
  if (!inviteAgain(status)) {
    await journal(db, "invitation_client", id, "Invitation déjà envoyée", { deja: true });
    return {
      id,
      envoye: false,
      email: false,
      whatsapp: false,
      deja: true,
      acces: status === "ready" ? "pret" : "invite",
      canal: null,
      notifie: false,
    };
  }
  const origin = (deps?.origin || process.env.NEXT_PUBLIC_SITE_URL || "https://travelba.fr").replace(/\/$/, "");
  let result: InviteResult;
  try {
    result = await (deps?.invite ?? inviteCustomer)(holder, origin);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    throw new McpWriteError(message || "Invitation impossible.");
  }
  const canal = result.whatsapp.ok ? "whatsapp" : "email";
  await journal(db, "invitation_client", id, "Invitation envoyée", {
    deja: false,
    canal,
    email: result.delivered,
    whatsapp: result.whatsapp.ok,
  });
  return {
    id,
    envoye: result.delivered || result.whatsapp.ok,
    email: result.delivered,
    whatsapp: result.whatsapp.ok,
    deja: false,
    acces: "invite" as const,
    canal,
    notifie: true,
  };
}
