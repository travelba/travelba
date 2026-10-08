"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus } from "lucide-react";
import type { CrmBillingCompany, CrmCompanion, CrmCustomer, CrmTravelDocument, CompanyRole } from "@/lib/crm/types";
import { countryName, resolveCountryCode } from "@/lib/crm/countries";
import { identityNationalityFromSources, nationalityFromIdentity } from "@/lib/crm/document-identity";
import { identityOverwriteWarning, RELATIONSHIP_OPTIONS, type ExtractedIdentity } from "@/lib/crm/identity";
import { appendPassportForm, appendPassportImportForm, listedIdentities } from "@/lib/crm/passport-extract";
import { formatIbanInput, ibanError, normalizeIban } from "@/lib/crm/billing";
import { loyaltyFromCustomer, type LoyaltyMap } from "@/lib/crm/loyalty";
import { companyRoleLabel } from "@/lib/crm/company-role";
import { billingCompanyTabLabel } from "@/lib/crm/billing-companies";
import { formatDateFr } from "@/lib/crm/money";
import { LoyaltyFields } from "@/components/crm/LoyaltyFields";
import {
  AddressFields,
  CountrySelect,
  DateFrInput,
  Field,
  fieldControlClass,
  OptionalSecondPhone,
  PhoneField,
  RelationshipSelect,
  SexSelect,
} from "@/components/crm/fields";
import {
  billingCompaniesPayload,
  billingCompanyDrafts,
  BillingCompaniesTabs,
} from "@/components/crm/BillingCompaniesTabs";
import { CompanyRoleFields } from "@/components/crm/CompanyRoleFields";
import { passportCompactLabel, PersonPassportCard } from "@/components/crm/PersonPassportCard";
import { SectionFold } from "@/components/crm/SectionFold";
import { BusyBar } from "@/components/crm/BusyBar";
import { ConfirmAction } from "@/components/crm/ConfirmAction";
import { adminAction } from "@/lib/crm/admin-action";
import { type ScanResult } from "@/components/crm/IdentityScan";
import { primaryIdentityDoc, vaultDocumentsForPerson } from "@/lib/crm/trip-documents";
import type { PickableCustomer } from "@/lib/crm/customer-search";

function applyIdentityState(
  id: ExtractedIdentity,
  setters: {
    setFirstName: (v: string) => void;
    setLastName: (v: string) => void;
    setUsageName: (v: string) => void;
    setBirthDate: (v: string) => void;
    setSex: (v: string) => void;
    setNationality: (v: string) => void;
  }
) {
  if (id.first_name) setters.setFirstName(id.first_name);
  if (id.last_name) setters.setLastName(id.last_name);
  setters.setUsageName(id.usage_name || "");
  if (id.birth_date) setters.setBirthDate(id.birth_date);
  if (id.sex) setters.setSex(id.sex);
  const nationalityIso = nationalityFromIdentity(id);
  if (nationalityIso) setters.setNationality(nationalityIso);
}

function relationshipLabel(value: string | null | undefined) {
  return RELATIONSHIP_OPTIONS.find((option) => option.value === value)?.label || value || "";
}

function loyaltySummary(loyalty: LoyaltyMap) {
  const count = Object.values(loyalty).filter(Boolean).length;
  if (!count) return "Aucun";
  return count > 1 ? `${count} programmes` : "1 programme";
}

function identitySummary(firstName: string, lastName: string, birthDate: string, nationality: string) {
  const name = [firstName, lastName].filter(Boolean).join(" ");
  const birth = birthDate ? formatDateFr(birthDate) : "";
  const nation = countryName(nationality);
  return [name, birth, nation].filter(Boolean).join(" · ") || "À compléter";
}

function pieceSummary(documents: CrmTravelDocument[], companionId: string | null) {
  const doc = primaryIdentityDoc(vaultDocumentsForPerson(documents, companionId));
  return doc ? passportCompactLabel(doc) : "Pièce à joindre";
}

function ficheSnapshot(values: {
  firstName: string;
  lastName: string;
  usageName: string;
  email: string;
  phone: string;
  phoneSecondary: string;
  birthDate: string;
  sex: string;
  nationality: string;
  country: string;
  addressLine: string;
  postalCode: string;
  city: string;
  loyalty: LoyaltyMap;
  iban: string;
  companyRole: CompanyRole | null;
  billingParentId: string;
  spendingAllowance: string;
  onHold: boolean;
  companyDrafts: unknown;
}) {
  return JSON.stringify(values);
}

export function CustomerEditor({
  customer,
  companions,
  documents,
  companyAdmins = [],
  billingCompanies = [],
}: {
  customer: CrmCustomer;
  companions: CrmCompanion[];
  documents: CrmTravelDocument[];
  companyAdmins?: PickableCustomer[];
  billingCompanies?: CrmBillingCompany[];
}) {
  const router = useRouter();
  const [firstName, setFirstName] = useState(customer.first_name);
  const [lastName, setLastName] = useState(customer.last_name);
  const [usageName, setUsageName] = useState(customer.usage_name || "");
  const [email, setEmail] = useState(customer.email || "");
  const [phone, setPhone] = useState(customer.phone || "");
  const [phoneSecondary, setPhoneSecondary] = useState(customer.phone_secondary || "");
  const [birthDate, setBirthDate] = useState(customer.birth_date || "");
  const [sex, setSex] = useState(customer.sex || "");
  const [nationality, setNationality] = useState(
    identityNationalityFromSources(customer.nationality, vaultDocumentsForPerson(documents, null))
  );
  const [country, setCountry] = useState(resolveCountryCode(customer.country) || "FR");
  const [addressLine, setAddressLine] = useState(customer.address_line || "");
  const [postalCode, setPostalCode] = useState(customer.postal_code || "");
  const [city, setCity] = useState(customer.city || "");
  const [loyalty, setLoyalty] = useState<LoyaltyMap>(() => loyaltyFromCustomer(customer));
  const [iban, setIban] = useState(() => formatIbanInput(customer.iban || ""));
  const [companyRole, setCompanyRole] = useState<CompanyRole | null>(customer.company_role || null);
  const [billingParentId, setBillingParentId] = useState(customer.billing_parent_id || "");
  const [spendingAllowance, setSpendingAllowance] = useState(
    customer.spending_allowance == null ? "" : String(customer.spending_allowance).replace(".", ",")
  );
  const [nameWarn, setNameWarn] = useState<string | null>(null);
  const [companyDrafts, setCompanyDrafts] = useState(() =>
    billingCompanyDrafts(billingCompanies, customer, {
      country: resolveCountryCode(customer.country) || "FR",
      line: customer.address_line || "",
      postal: customer.postal_code || "",
      city: customer.city || "",
    })
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingLock = useRef(false);
  const [onHold, setOnHold] = useState(Boolean(customer.on_hold));
  const hasPassport = vaultDocumentsForPerson(documents, null).length > 0;
  const [openIdentity, setOpenIdentity] = useState(!customer.first_name && !hasPassport);
  const [openContact, setOpenContact] = useState(!customer.phone);
  const [openLoyalty, setOpenLoyalty] = useState(false);
  const [openAddress, setOpenAddress] = useState(false);
  const [openCompany, setOpenCompany] = useState(false);
  const [openBilling, setOpenBilling] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addingCompanion, setAddingCompanion] = useState(false);
  const holderOpen = expandedId === "holder";

  const profileAddress = {
    country,
    line: addressLine,
    postal: postalCode,
    city,
  };
  const snapshot = ficheSnapshot({
    firstName,
    lastName,
    usageName,
    email,
    phone,
    phoneSecondary,
    birthDate,
    sex,
    nationality,
    country,
    addressLine,
    postalCode,
    city,
    loyalty,
    iban,
    companyRole,
    billingParentId,
    spendingAllowance,
    onHold,
    companyDrafts,
  });
  const [initial, setInitial] = useState(snapshot);
  /** La barre Enregistrer ne se fixe en bas que lorsqu’il y a quelque chose à enregistrer. */
  const dirty = snapshot !== initial;
  const addressLineSummary = [addressLine, postalCode, city].filter(Boolean).join(", ") || "Aucune";
  const billingLine = companyDrafts.length
    ? companyDrafts
        .map((draft, index) => billingCompanyTabLabel(draft.values.companyName, index, companyDrafts.length))
        .join(", ")
    : "Aucune société";
  const companyLine = [
    companyRoleLabel(companyRole),
    iban || null,
  ]
    .filter(Boolean)
    .join(" · ");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingLock.current) return;
    const normalizedIban = normalizeIban(iban);
    const err = ibanError(normalizedIban);
    if (!email.trim()) {
      setOpenContact(true);
      setSaveError("L’e-mail est obligatoire.");
      return;
    }
    if (err) {
      setOpenCompany(true);
      setSaveError(err);
      return;
    }
    savingLock.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/admin/clients/${customer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          usage_name: usageName,
          email,
          phone,
          phone_secondary: phoneSecondary,
          birth_date: birthDate,
          sex,
          nationality,
          address_line: addressLine,
          postal_code: postalCode,
          city,
          country,
          loyalty,
          flying_blue: loyalty.flying_blue,
          iban: normalizedIban,
          company_role: companyRole,
          billing_parent_id: companyRole === "member" ? billingParentId || null : null,
          spending_allowance: companyRole ? spendingAllowance : null,
          on_hold: onHold,
          billing_companies: billingCompaniesPayload(companyDrafts, profileAddress),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(json.error || "Enregistrement impossible");
        return;
      }
      const nextDrafts = Array.isArray(json.billing_companies)
        ? billingCompanyDrafts(json.billing_companies, customer, profileAddress)
        : companyDrafts;
      if (Array.isArray(json.billing_companies)) setCompanyDrafts(nextDrafts);
      setInitial(
        ficheSnapshot({
          firstName,
          lastName,
          usageName,
          email,
          phone,
          phoneSecondary,
          birthDate,
          sex,
          nationality,
          country,
          addressLine,
          postalCode,
          city,
          loyalty,
          iban,
          companyRole,
          billingParentId,
          spendingAllowance,
          onHold,
          companyDrafts: nextDrafts,
        })
      );
      router.refresh();
    } finally {
      savingLock.current = false;
      setSaving(false);
    }
  }

  const holderLine = [
    "Voyageur principal",
    birthDate ? formatDateFr(birthDate) : "",
    pieceSummary(documents, null),
    onHold ? "En veille" : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section id="accompagnateurs" className="space-y-4">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--admin-gold-dark)]">Le foyer</p>
        <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-[var(--admin-navy)]">Voyageurs</h2>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <form
        onSubmit={save}
        className={`admin-af-card h-full rounded-3xl px-5 py-4 ${holderOpen ? "space-y-6 sm:col-span-2" : ""}`}
      >
        <button
          type="button"
          onClick={() => setExpandedId((current) => (current === "holder" ? null : "holder"))}
          className="flex w-full items-center gap-3 text-left"
          aria-expanded={holderOpen}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-base font-bold text-[var(--admin-navy)]">
              {firstName} {lastName}
            </span>
            <span className="block truncate text-xs text-muted">{holderLine}</span>
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 transition ${holderOpen ? "rotate-180" : ""}`} />
        </button>

        {holderOpen ? (
        <div className="space-y-6">
        <label className="flex items-start gap-2 text-sm text-[var(--admin-navy)]">
          <input type="checkbox" className="mt-1" checked={onHold} onChange={(e) => setOnHold(e.target.checked)} />
          <span>
            <span className="font-semibold">Compte en veille</span>
            <span className="mt-0.5 block text-xs text-muted">Badge interne. Aucun changement pour le client.</span>
          </span>
        </label>

        <PersonPassportCard
          variant="admin"
          customerId={customer.id}
          documents={documents}
          person={{ first_name: firstName, last_name: lastName }}
          onIdentity={(id) => {
            setExpandedId("holder");
            setOpenIdentity(true);
            setNameWarn(identityOverwriteWarning({ first_name: firstName, last_name: lastName }, id));
            applyIdentityState(id, {
              setFirstName,
              setLastName,
              setUsageName,
              setBirthDate,
              setSex,
              setNationality,
            });
          }}
        />
        {nameWarn ? (
          <p className="rounded-xl bg-[var(--admin-peach)] px-3 py-2 text-sm text-[var(--admin-navy)]">
            {nameWarn}
          </p>
        ) : null}

        <div>
          <SectionFold
            title="Identité"
            summary={identitySummary(firstName, lastName, birthDate, nationality)}
            open={openIdentity}
            onToggle={() => setOpenIdentity((value) => !value)}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Prénom(s)" hint="Tous les prénoms, dans l’ordre du passeport">
                <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={fieldControlClass} />
              </Field>
              <Field label="Nom" hint="Nom de naissance, comme sur la pièce">
                <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={fieldControlClass} />
              </Field>
              <Field label="Nom d'épouse" hint="Nom d'usage s'il est imprimé sur le passeport ou la CNI" className="sm:col-span-2">
                <input value={usageName} onChange={(e) => setUsageName(e.target.value)} className={fieldControlClass} />
              </Field>
              <Field label="Naissance">
                <DateFrInput
                  value={birthDate}
                  onChange={setBirthDate}
                  max={new Date().toISOString().slice(0, 10)}
                  autoComplete="bday"
                />
              </Field>
              <Field label="Sexe">
                <SexSelect name="sex" value={sex} onChange={setSex} />
              </Field>
              <Field label="Nationalité" className="sm:col-span-2">
                <CountrySelect name="nationality" value={nationality} onChange={setNationality} />
              </Field>
            </div>
          </SectionFold>

          <SectionFold
            title="Coordonnées"
            summary={[email, phone].filter(Boolean).join(" · ") || "À compléter"}
            open={openContact}
            onToggle={() => setOpenContact((value) => !value)}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="E-mail"
                hint="Adresse de connexion. L’invitation et l’accès suivent ce changement."
                className="sm:col-span-2"
              >
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="off"
                  className={`${fieldControlClass} admin-tap`}
                />
              </Field>
              <PhoneField name="phone" value={phone} onChange={setPhone} />
              <OptionalSecondPhone value={phoneSecondary} onChange={setPhoneSecondary} />
            </div>
          </SectionFold>

          <SectionFold
            title="Fidélité"
            summary={loyaltySummary(loyalty)}
            open={openLoyalty}
            onToggle={() => setOpenLoyalty((value) => !value)}
          >
            <LoyaltyFields values={loyalty} onChange={setLoyalty} onlyFilled />
          </SectionFold>

          <SectionFold
            title="Adresse"
            summary={addressLineSummary}
            open={openAddress}
            onToggle={() => setOpenAddress((value) => !value)}
          >
            <AddressFields
              country={country}
              onCountryChange={setCountry}
              line={addressLine}
              postal={postalCode}
              city={city}
              onLineChange={setAddressLine}
              onPostalChange={setPostalCode}
              onCityChange={setCity}
            />
          </SectionFold>

          <SectionFold
            title="Société et paiement"
            summary={companyLine}
            open={openCompany}
            onToggle={() => setOpenCompany((value) => !value)}
          >
            <Field label="IBAN" hint="Compte français, 27 caractères" error={ibanError(normalizeIban(iban))}>
              <input
                value={iban}
                onChange={(e) => setIban(formatIbanInput(e.target.value))}
                autoComplete="off"
                spellCheck={false}
                className={fieldControlClass}
                placeholder="FR76 XXXX XXXX XXXX XXXX XXXX XXX"
              />
            </Field>
            <CompanyRoleFields
              heading={false}
              role={companyRole}
              onRoleChange={(role) => {
                setCompanyRole(role);
                if (role !== "member") setBillingParentId("");
              }}
              billingParentId={billingParentId}
              onBillingParentChange={setBillingParentId}
              companyAdmins={companyAdmins}
              selfId={customer.id}
              spendingAllowance={spendingAllowance}
              onSpendingAllowanceChange={setSpendingAllowance}
            />
          </SectionFold>

          <SectionFold
            title="Facturation"
            summary={billingLine}
            open={openBilling}
            onToggle={() => setOpenBilling((value) => !value)}
          >
            <BillingCompaniesTabs
              heading={false}
              drafts={companyDrafts}
              onChange={setCompanyDrafts}
              profileAddress={profileAddress}
            />
          </SectionFold>
        </div>

        {saveError ? <p className="text-sm text-accent">{saveError}</p> : null}
        <div
          className={
            dirty
              ? "sticky bottom-4 z-20 -mx-1 rounded-2xl border border-[#e5e3dc] bg-white/95 p-3 shadow-lg backdrop-blur"
              : "border-t border-[#e5e3dc] pt-3"
          }
        >
          <BusyBar active={saving} label="Enregistrement…" />
          <button className="admin-af-btn admin-tap w-full rounded-full px-4 py-2 text-sm" disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
        </div>
        ) : null}
      </form>

        {companions.map((companion) => (
          <CompanionCard
            key={companion.id}
            customerId={customer.id}
            companion={companion}
            documents={documents}
            expanded={expandedId === companion.id}
            onToggle={() =>
              setExpandedId((current) => (current === companion.id ? null : companion.id))
            }
          />
        ))}
        <div className={addingCompanion ? "sm:col-span-2" : ""}>
          <AddCompanionForm customerId={customer.id} onOpenChange={setAddingCompanion} />
        </div>
      </div>
    </section>
  );
}

function CompanionCard({
  customerId,
  companion,
  documents,
  expanded,
  onToggle,
}: {
  customerId: string;
  companion: CrmCompanion;
  documents: CrmTravelDocument[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const router = useRouter();
  const [firstName, setFirstName] = useState(companion.first_name);
  const [lastName, setLastName] = useState(companion.last_name);
  const [usageName, setUsageName] = useState(companion.usage_name || "");
  const [relationship, setRelationship] = useState(companion.relationship || "");
  const [nationality, setNationality] = useState(
    identityNationalityFromSources(
      companion.nationality,
      vaultDocumentsForPerson(documents, companion.id)
    )
  );
  const [birthDate, setBirthDate] = useState(companion.birth_date || "");
  const [sex, setSex] = useState(companion.sex || "");
  const [phone, setPhone] = useState(companion.phone || "");
  const [loyalty, setLoyalty] = useState<LoyaltyMap>(() => loyaltyFromCustomer({ loyalty: companion.loyalty }));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [nameWarn, setNameWarn] = useState<string | null>(null);
  const [openIdentity, setOpenIdentity] = useState(!companion.first_name);
  const [openPhone, setOpenPhone] = useState(!companion.phone);
  const [openLoyalty, setOpenLoyalty] = useState(false);

  function edit<T>(setter: (value: T) => void) {
    return (value: T) => {
      setSaved(false);
      setter(value);
    };
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    const result = await adminAction("/api/admin/companions", {
      method: "PATCH",
      body: {
        id: companion.id,
        customer_id: customerId,
        first_name: firstName,
        last_name: lastName,
        usage_name: usageName,
        relationship,
        nationality,
        birth_date: birthDate,
        sex,
        phone,
        loyalty,
      },
    });
    setSaving(false);
    if (!result.ok) {
      setSaveError(result.error || "Enregistrement impossible. Réessayez.");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  /** Confirmé sur la carte : renvoie l’erreur pour l’afficher sous le bouton. */
  async function remove() {
    const result = await adminAction(`/api/admin/companions?id=${encodeURIComponent(companion.id)}`, {
      method: "DELETE",
    });
    if (!result.ok) return result.error || "Retrait impossible. Réessayez.";
    router.refresh();
    return undefined;
  }

  const closedLine = [
    relationshipLabel(relationship),
    birthDate ? formatDateFr(birthDate) : "",
    pieceSummary(documents, companion.id),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className={`admin-af-card rounded-3xl px-5 py-4 ${expanded ? "sm:col-span-2" : "h-full"}`}>
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-expanded={expanded}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-base font-bold text-[var(--admin-navy)]">
              {firstName} {lastName}
            </span>
            {closedLine ? <span className="block truncate text-xs text-muted">{closedLine}</span> : null}
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 transition ${expanded ? "rotate-180" : ""}`} />
        </button>
        <ConfirmAction
          size="sm"
          tone="danger"
          label="Retirer"
          confirmLabel="Retirer l’accompagnateur"
          ariaLabel={`Retirer ${firstName} ${lastName}`}
          question="L’accompagnateur et ses pièces d’identité sont supprimés du compte. Les séjours passés restent."
          align="end"
          onConfirm={remove}
        />
      </div>
      {expanded ? (
        <div className="mt-4 space-y-4">
          <PersonPassportCard
            variant="admin"
            customerId={customerId}
            companionId={companion.id}
            documents={documents}
            person={{ first_name: firstName, last_name: lastName }}
            onIdentity={(id) => {
              setSaved(false);
              setOpenIdentity(true);
              setNameWarn(identityOverwriteWarning({ first_name: firstName, last_name: lastName }, id));
              applyIdentityState(id, {
                setFirstName,
                setLastName,
                setUsageName,
                setBirthDate,
                setSex,
                setNationality,
              });
            }}
          />
          {nameWarn ? (
            <p className="rounded-xl bg-[var(--admin-peach)] px-3 py-2 text-sm text-[var(--admin-navy)]">
              {nameWarn}
            </p>
          ) : null}
          <div>
            <SectionFold
              title="Identité"
              summary={identitySummary(firstName, lastName, birthDate, nationality)}
              open={openIdentity}
              onToggle={() => setOpenIdentity((value) => !value)}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Prénom(s)" hint="Tous les prénoms, dans l’ordre du passeport">
                  <input value={firstName} onChange={(e) => edit(setFirstName)(e.target.value)} className={fieldControlClass} />
                </Field>
                <Field label="Nom" hint="Nom de naissance, comme sur la pièce">
                  <input value={lastName} onChange={(e) => edit(setLastName)(e.target.value)} className={fieldControlClass} />
                </Field>
                <Field label="Nom d'épouse" hint="Nom d'usage s'il est imprimé" className="sm:col-span-2">
                  <input value={usageName} onChange={(e) => edit(setUsageName)(e.target.value)} className={fieldControlClass} />
                </Field>
                <Field label="Lien">
                  <RelationshipSelect name="relationship" value={relationship} onChange={edit(setRelationship)} />
                </Field>
                <Field label="Nationalité">
                  <CountrySelect name="nationality" value={nationality} onChange={edit(setNationality)} />
                </Field>
                <Field label="Naissance">
                  <DateFrInput
                    value={birthDate}
                    onChange={edit(setBirthDate)}
                    max={new Date().toISOString().slice(0, 10)}
                  />
                </Field>
                <Field label="Sexe">
                  <SexSelect name="sex" value={sex} onChange={edit(setSex)} />
                </Field>
              </div>
            </SectionFold>
            <SectionFold
              title="Téléphone"
              summary={phone || "Aucun"}
              open={openPhone}
              onToggle={() => setOpenPhone((value) => !value)}
            >
              <PhoneField
                name={`companion-phone-${companion.id}`}
                label="Téléphone"
                value={phone}
                onChange={edit(setPhone)}
              />
            </SectionFold>
            <SectionFold
              title="Fidélité"
              summary={loyaltySummary(loyalty)}
              open={openLoyalty}
              onToggle={() => setOpenLoyalty((value) => !value)}
            >
              <LoyaltyFields values={loyalty} onChange={edit(setLoyalty)} onlyFilled />
            </SectionFold>
          </div>
          <BusyBar active={saving} label="Enregistrement…" />
          {saveError ? (
            <p role="alert" className="text-sm text-[var(--admin-red)]">
              {saveError}
            </p>
          ) : null}
          {saved ? (
            <p role="status" className="rounded-xl bg-[#fbf7ec] px-3 py-2 text-sm font-semibold text-[var(--admin-navy)]">
              Enregistré.
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void save()}
            className="admin-af-btn rounded-full px-4 py-2 text-sm"
            disabled={saving}
          >
            {saving ? "Enregistrement…" : "Enregistrer l’accompagnateur"}
          </button>
        </div>
      ) : null}
    </article>
  );
}

function AddCompanionForm({
  customerId,
  onOpenChange,
}: {
  customerId: string;
  onOpenChange?: (open: boolean) => void;
}) {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [usageName, setUsageName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [nationality, setNationality] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [sex, setSex] = useState("");
  const [phone, setPhone] = useState("");
  const [loyalty, setLoyalty] = useState<LoyaltyMap>(() => loyaltyFromCustomer({}));
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  function closeForm() {
    setOpen(false);
    onOpenChange?.(false);
    setFirstName("");
    setLastName("");
    setUsageName("");
    setRelationship("");
    setNationality("");
    setBirthDate("");
    setSex("");
    setPhone("");
    setLoyalty(loyaltyFromCustomer({}));
    setScan(null);
    setError(null);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const identities = listedIdentities(scan?.identity, scan?.identities);
    if (identities.length > 1 && scan?.file) {
      const patched = identities.map((identity, index) =>
        index === 0
          ? {
              ...identity,
              first_name: firstName || identity.first_name,
              last_name: lastName || identity.last_name,
              usage_name: usageName || identity.usage_name,
              birth_date: birthDate || identity.birth_date,
              nationality: nationality || identity.nationality,
              sex: (sex as ExtractedIdentity["sex"]) || identity.sex,
            }
          : identity
      );
      const form = appendPassportImportForm(new FormData(), {
        identities: patched,
        file: scan.file,
        customerId,
        createUnmatchedOnly: true,
      });
      const docs = await fetch("/api/admin/travel-documents", { method: "POST", body: form });
      const docsJson = await docs.json().catch(() => ({}));
      setSaving(false);
      if (!docs.ok) {
        setError(docsJson.error || "Impossible d’importer les passeports");
        return;
      }
      closeForm();
      router.refresh();
      return;
    }
    const res = await fetch("/api/admin/companions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_id: customerId,
        first_name: firstName,
        last_name: lastName,
        usage_name: usageName,
        relationship,
        nationality,
        birth_date: birthDate,
        sex,
        phone,
        loyalty,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setSaving(false);
      setError(json.error || "Impossible d’ajouter l’accompagnateur");
      return;
    }
    if (scan?.file) {
      const form = new FormData();
      form.set("customer_id", customerId);
      form.set("companion_id", json.companion.id);
      form.set("file", scan.file);
      appendPassportForm(form, scan.identity, true);
      await fetch("/api/admin/travel-documents", { method: "POST", body: form });
    }
    setSaving(false);
    closeForm();
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          onOpenChange?.(true);
        }}
        className="admin-af-card flex h-full min-h-[4.5rem] w-full items-center justify-center gap-2 rounded-3xl border border-dashed border-[var(--admin-gold)] px-5 py-4 text-sm font-semibold text-[var(--admin-navy)]"
      >
        <Plus className="h-4 w-4" />
        Ajouter un accompagnateur
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="admin-af-card space-y-4 rounded-3xl p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-base font-bold text-[var(--admin-navy)]">
          Ajouter un accompagnateur
        </h3>
        <button
          type="button"
          onClick={closeForm}
          className="text-xs font-semibold text-muted"
        >
          Annuler
        </button>
      </div>
      <PersonPassportCard
        variant="admin"
        customerId={customerId}
        documents={[]}
        persist={false}
        person={{ first_name: firstName, last_name: lastName }}
        onIdentity={(id) =>
          applyIdentityState(id, {
            setFirstName,
            setLastName,
            setUsageName,
            setBirthDate,
            setSex,
            setNationality,
          })
        }
        onScan={setScan}
        onImported={() => {
          closeForm();
          router.refresh();
        }}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Prénom(s)" hint="Tous les prénoms, dans l’ordre du passeport">
          <input required={listedIdentities(scan?.identity, scan?.identities).length < 2} value={firstName} onChange={(e) => setFirstName(e.target.value)} className={fieldControlClass} />
        </Field>
        <Field label="Nom">
          <input required={listedIdentities(scan?.identity, scan?.identities).length < 2} value={lastName} onChange={(e) => setLastName(e.target.value)} className={fieldControlClass} />
        </Field>
        <Field label="Nom d'épouse" hint="Nom d'usage s'il est imprimé" className="sm:col-span-2">
          <input value={usageName} onChange={(e) => setUsageName(e.target.value)} className={fieldControlClass} />
        </Field>
        <Field label="Lien">
          <RelationshipSelect name="relationship" value={relationship} onChange={setRelationship} />
        </Field>
        <Field label="Nationalité">
          <CountrySelect name="nationality" value={nationality} onChange={setNationality} />
        </Field>
        <Field label="Naissance">
          <DateFrInput
            value={birthDate}
            onChange={setBirthDate}
            max={new Date().toISOString().slice(0, 10)}
          />
        </Field>
        <Field label="Sexe">
          <SexSelect name="sex" value={sex} onChange={setSex} />
        </Field>
        <div className="sm:col-span-2">
          <PhoneField name="companion-phone" label="Téléphone" value={phone} onChange={setPhone} />
        </div>
        <div className="sm:col-span-2">
          <LoyaltyFields values={loyalty} onChange={setLoyalty} />
        </div>
      </div>
      {error ? <p className="text-sm text-accent">{error}</p> : null}
      <BusyBar active={saving} label="Enregistrement…" />
      <button className="admin-af-btn rounded-full px-4 py-2 text-sm" disabled={saving}>
        {saving ? "Enregistrement…" : "Ajouter l’accompagnateur"}
      </button>
    </form>
  );
}
