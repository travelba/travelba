"use client";

export type CompanyChoice = { key: string; name: string };

export type PersonalDossierChoice = {
  id: string;
  reference: string;
  title?: string | null;
  destination?: string | null;
};

/** Pour chaque dossier ouvert facturé en particulier : cette société, ou il reste en particulier. */
export function CompanyDossierPrompt({
  companies,
  dossiers,
  choices,
  onChoose,
}: {
  companies: CompanyChoice[];
  dossiers: PersonalDossierChoice[];
  choices: Record<string, string>;
  onChoose: (dossierId: string, choice: string) => void;
}) {
  if (!companies.length || !dossiers.length) return null;
  const named = companies.map((company) => company.name).filter(Boolean).join(", ");
  return (
    <section
      aria-label="Dossiers facturés en particulier"
      className="space-y-3 rounded-2xl border border-[var(--admin-gold)]/40 bg-[#f8f4ed] p-4"
    >
      <p className="font-semibold text-[var(--admin-navy)]">
        {companies.length > 1 ? "Ces sociétés s’ajoutent" : `${named || "Cette société"} s’ajoute`}
      </p>
      <p className="text-sm text-muted">
        Des dossiers ouverts sont encore facturés en particulier. Pour chacun, dites s’il passe sur la société ou s’il
        reste en particulier. Rien ne change tant que ce n’est pas choisi.
      </p>
      <ul className="space-y-3">
        {dossiers.map((dossier) => {
          const place = (dossier.title || dossier.destination || "").trim();
          return (
            <li key={dossier.id} className="rounded-xl bg-white px-3 py-3">
              <p className="text-sm font-semibold text-[var(--admin-navy)]">
                {dossier.reference}
                {place ? ` · ${place}` : ""}
              </p>
              <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={`Payeur de ${dossier.reference}`}>
                <button
                  type="button"
                  aria-pressed={choices[dossier.id] === "personal"}
                  onClick={() => onChoose(dossier.id, "personal")}
                  className={
                    choices[dossier.id] === "personal"
                      ? "rounded-full bg-[var(--admin-navy)] px-3 py-1.5 text-sm font-semibold text-white"
                      : "rounded-full border border-[#e5e3dc] bg-white px-3 py-1.5 text-sm font-semibold text-[var(--admin-navy)]"
                  }
                >
                  Rester en particulier
                </button>
                {companies.map((company) => (
                  <button
                    key={company.key}
                    type="button"
                    aria-pressed={choices[dossier.id] === company.key}
                    onClick={() => onChoose(dossier.id, company.key)}
                    className={
                      choices[dossier.id] === company.key
                        ? "rounded-full bg-[var(--admin-navy)] px-3 py-1.5 text-sm font-semibold text-white"
                        : "rounded-full border border-[#e5e3dc] bg-white px-3 py-1.5 text-sm font-semibold text-[var(--admin-navy)]"
                    }
                  >
                    Passer sur {company.name || "la société"}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
