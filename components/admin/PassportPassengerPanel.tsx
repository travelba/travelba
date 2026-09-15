"use client";

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import type { MtripGuidePassenger } from "@/lib/mtrip/guide-types";
import {
  FIELD_LABELS,
  passengerCompleteness,
  type TravelDocumentField,
} from "@/lib/mtrip/passenger-schema";
import {
  multiFileProgressPct,
  xhrFormUpload,
} from "@/lib/agency/xhr-upload";

export function newPassenger(
  partial?: Partial<MtripGuidePassenger>
): MtripGuidePassenger {
  return {
    id: crypto.randomUUID(),
    first_name: "",
    last_name: "",
    middle_names: null,
    email: "",
    phone: "",
    role: "traveler",
    language: "fr",
    passport_number: null,
    nationality: null,
    issuing_country: null,
    birth_date: null,
    birth_place: null,
    passport_expiry: null,
    passport_issued_date: null,
    sex: null,
    source_file: null,
    import_status: "manual",
    import_warnings: [],
    ...partial,
  };
}

type ImportSummary = {
  summary?: string;
  added?: number;
  updated?: number;
  warnings?: string[];
  failed?: { file: string; message: string }[];
  results?: Array<{
    file: string;
    status: string;
    message?: string;
    passenger_name?: string;
  }>;
};

type ImportJob = {
  fileIndex: number;
  fileTotal: number;
  fileName: string;
  totalStartedAt: number;
  fileStartedAt: number;
  tick: number;
  /** 0–100 global */
  pct: number;
};

type Props = {
  passengers: MtripGuidePassenger[];
  onPassengersChange: (next: MtripGuidePassenger[]) => void;
  /** Si fourni, les passeports sont stockés en PJ sur le voyage */
  guideId?: string | null;
  /** Afficher email/tél/adresse sur le voyageur principal */
  requireLeadContact?: boolean;
  /** Uniquement les champs coordonnées (étape Contact) */
  contactOnly?: boolean;
  compact?: boolean;
  /** Masquer la zone de drop (gérée par le parent) */
  hideDropzone?: boolean;
  onGuideSynced?: (guide: unknown) => void;
  /** Expose l’état d’import au parent (wizard) */
  onImportingChange?: (
    importing: boolean,
    label?: string | null,
    pct?: number | null
  ) => void;
  /** Ref pour déclencher l’import depuis le parent */
  importApiRef?: MutableRefObject<{
    importPassports: (files: FileList | File[] | null) => Promise<void>;
  } | null>;
};

function formatElapsed(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function StatusBadge({ p }: { p: MtripGuidePassenger }) {
  const { complete, label } = passengerCompleteness(p);
  const cls = complete
    ? "border-emerald-700/20 bg-emerald-600/12 text-emerald-800"
    : p.import_status === "manual"
      ? "border-border bg-[var(--admin-navy)]/5 text-[var(--admin-navy)]/70"
      : "border-amber-700/20 bg-amber-500/12 text-amber-900";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-tight ${cls}`}
    >
      {p.import_status === "manual" ? "Manuel" : label}
    </span>
  );
}

function MissingFields({ missing }: { missing: TravelDocumentField[] }) {
  if (!missing.length) return null;
  return (
    <p className="text-xs text-amber-800/90">
      Manquant pour billet / visa :{" "}
      {missing.map((f) => FIELD_LABELS[f] || f).join(", ")}
    </p>
  );
}

export function PassportPassengerPanel({
  passengers,
  onPassengersChange,
  guideId = null,
  requireLeadContact = true,
  contactOnly = false,
  compact = false,
  hideDropzone = false,
  onGuideSynced,
  onImportingChange,
  importApiRef,
}: Props) {
  const [importing, setImporting] = useState(false);
  const [importJob, setImportJob] = useState<ImportJob | null>(null);
  const [lastImport, setLastImport] = useState<ImportSummary | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const importAbort = useRef(false);

  useEffect(() => {
    if (!importJob) return;
    const id = window.setInterval(() => {
      setImportJob((job) => (job ? { ...job, tick: job.tick + 1 } : null));
    }, 1000);
    return () => window.clearInterval(id);
    // Timer lifecycle is keyed to one import, not each progress tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importJob?.totalStartedAt]);

  const lead =
    passengers.find((p) => p.role === "lead_traveler") || passengers[0];
  const leadContactOk =
    !requireLeadContact ||
    Boolean(lead?.email?.trim() && lead?.phone?.trim());

  function updatePassenger(id: string, patch: Partial<MtripGuidePassenger>) {
    onPassengersChange(
      passengers.map((p) => (p.id === id ? { ...p, ...patch } : p))
    );
  }

  function setAsLead(id: string) {
    onPassengersChange(
      passengers.map((p) => ({
        ...p,
        role: p.id === id ? "lead_traveler" : "traveler",
      }))
    );
  }

  async function importPassports(files: FileList | File[] | null) {
    if (!files?.length) return;
    const list = Array.from(files);
    setImporting(true);
    onImportingChange?.(
      true,
      `Lecture passeport — ${list[0].name}`,
      multiFileProgressPct(0, list.length, 0.02)
    );
    setLastImport(null);
    importAbort.current = false;

    let current = passengers;
    const allResults: ImportSummary["results"] = [];
    const allWarnings: string[] = [];
    let totalAdded = 0;
    let totalUpdated = 0;
    const totalStartedAt = Date.now();

    const report = (
      fileIndex0: number,
      fileName: string,
      fraction: number
    ) => {
      const pct = multiFileProgressPct(fileIndex0, list.length, fraction);
      const label =
        fraction < 0.93
          ? `Envoi ${fileIndex0 + 1}/${list.length} — ${fileName}`
          : `OCR ${fileIndex0 + 1}/${list.length} — ${fileName}`;
      setImportJob({
        fileIndex: fileIndex0 + 1,
        fileTotal: list.length,
        fileName,
        totalStartedAt,
        fileStartedAt: Date.now(),
        tick: 0,
        pct,
      });
      onImportingChange?.(true, label, pct);
    };

    for (let i = 0; i < list.length; i++) {
      if (importAbort.current) break;

      const file = list[i];
      report(i, file.name, 0.02);

      const form = new FormData();
      form.append("files", file);
      form.append("existing", JSON.stringify(current));
      if (guideId) form.append("guide_id", guideId);

      try {
        const { ok, json: data } = await xhrFormUpload({
          url: "/api/admin/mtrip/passports",
          formData: form,
          onUploadProgress: (fraction) => report(i, file.name, fraction),
        });

        if (ok) {
          current = (data.passengers as typeof current) || current;
          totalAdded += data.added || 0;
          totalUpdated += data.updated || 0;
          if (data.warnings?.length) allWarnings.push(...data.warnings);
          if (data.results?.length) allResults.push(...data.results);
          if (data.guide && onGuideSynced) onGuideSynced(data.guide);
        } else {
          allResults.push({
            file: file.name,
            status: "failed",
            message: data?.error || "Échec",
          });
        }
      } catch (err) {
        allResults.push({
          file: file.name,
          status: "failed",
          message: err instanceof Error ? err.message : "Erreur réseau",
        });
      }
    }

    onPassengersChange(current);
    setExpanded((prev) => {
      const next = { ...prev };
      for (const p of current) next[p.id] = true;
      return next;
    });

    const failed = allResults.filter((r) => r.status === "failed");
    const ok = allResults.filter((r) => r.status !== "failed");

    setLastImport({
      added: totalAdded,
      updated: totalUpdated,
      failed: failed.map((f) => ({
        file: f.file,
        message: f.message || "",
      })),
      results: allResults,
      warnings: allWarnings,
      summary:
        ok.length === 0
          ? "Aucun passeport importé — la liste existante est conservée."
          : `${ok.length}/${list.length} fichier(s) OK · ${totalAdded} ajouté(s) · ${totalUpdated} complété(s)${failed.length ? ` · ${failed.length} échec(s)` : ""}`,
    });

    setImporting(false);
    setImportJob(null);
    onImportingChange?.(false, null, null);
  }

  useEffect(() => {
    if (!importApiRef) return;
    importApiRef.current = { importPassports };
    return () => {
      importApiRef.current = null;
    };
  });

  useEffect(() => {
    if (!importing || !importJob) {
      if (!importing) onImportingChange?.(false, null, null);
      return;
    }
    onImportingChange?.(
      true,
      `Passeport ${importJob.fileIndex}/${importJob.fileTotal} — ${importJob.fileName}`,
      importJob.pct
    );
    // Callback identity is intentionally excluded to avoid restarting imports.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importing, importJob?.fileIndex, importJob?.fileName, importJob?.pct]);

  const globalWarnings = useMemo(
    () => lastImport?.warnings?.filter(Boolean) || [],
    [lastImport]
  );

  const progressPct = importJob?.pct ?? 0;
  const progressNow = importJob
    ? importJob.fileStartedAt + importJob.tick * 1000
    : 0;

  return (
    <div className="space-y-4">
      {!hideDropzone && (
        <label
          className={`relative flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-8 text-center transition ${
            importing
              ? "border-accent/60 bg-accent/5"
              : "border-border bg-background/30 hover:border-accent/50"
          }`}
        >
          {importing && importJob ? (
            <div className="w-full max-w-md space-y-3">
              <div className="flex items-center justify-center gap-2">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                <span className="text-sm font-medium">
                  Import — {progressPct}% · {importJob.fileIndex}/
                  {importJob.fileTotal}
                </span>
              </div>
              <p className="truncate text-xs text-muted">{importJob.fileName}</p>
              <div className="flex justify-center gap-4 font-mono text-xs text-accent">
                <span>
                  Total {formatElapsed(progressNow - importJob.totalStartedAt)}
                </span>
                <span>
                  Fichier {formatElapsed(progressNow - importJob.fileStartedAt)}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-200"
                  style={{ width: `${Math.max(progressPct, 2)}%` }}
                />
              </div>
              <p className="text-center font-mono text-2xl font-semibold tabular-nums text-accent">
                {progressPct}%
              </p>
              <p className="text-[10px] text-muted">
                OCR + MRZ — comptez ~10–30 s par passeport scanné
              </p>
            </div>
          ) : (
            <>
              <span className="text-sm font-medium">
                Déposer les passeports (plusieurs à la fois OK)
              </span>
              <span className="max-w-md text-xs text-muted">
                PDF scanné ou photo JPG/PNG · un fichier = un passager · les
                imports s&apos;ajoutent sans effacer la liste
              </span>
            </>
          )}
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,.pdf,.jpg,.jpeg,.png,.heic"
            multiple
            className="hidden"
            disabled={importing}
            onChange={(e) => {
              void importPassports(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      )}

      {lastImport?.summary && (
        <div className="rounded-lg border border-border/70 bg-background/40 px-4 py-3 text-sm">
          <p>{lastImport.summary}</p>
          {!!lastImport.results?.length && (
            <ul className="mt-2 space-y-1 text-xs text-muted">
              {lastImport.results.map((r) => (
                <li key={r.file}>
                  {r.status === "failed" ? "✕" : "✓"} {r.file}
                  {r.passenger_name ? ` → ${r.passenger_name}` : ""}
                  {r.message ? ` — ${r.message}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!!globalWarnings.length && (
        <ul className="space-y-1 text-xs text-amber-200/90">
          {globalWarnings.slice(0, 8).map((w) => (
            <li key={w}>• {w}</li>
          ))}
        </ul>
      )}

      {!passengers.length ? (
        <p className="text-sm text-muted">
          Aucun passager — importez les passeports ou{" "}
          <button
            type="button"
            className="text-accent hover:underline"
            onClick={() =>
              onPassengersChange([newPassenger({ role: "lead_traveler" })])
            }
          >
            saisir à la main
          </button>
          .
        </p>
      ) : (
        <div className="space-y-3">
          {(contactOnly
            ? passengers.filter(
                (p) =>
                  p.role === "lead_traveler" ||
                  (!passengers.some((x) => x.role === "lead_traveler") &&
                    p.id === passengers[0]?.id)
              )
            : passengers
          ).map((p) => {
            const { missing } = passengerCompleteness(p);
            const isOpen = contactOnly ? true : expanded[p.id] ?? !compact;
            const isLead = p.role === "lead_traveler" || (!passengers.some((x) => x.role === "lead_traveler") && p.id === passengers[0]?.id);
            return (
              <div
                key={p.id}
                className="rounded-lg border border-border/70 bg-background/40 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">
                      {p.first_name || p.last_name
                        ? `${p.first_name} ${p.middle_names ? `${p.middle_names} ` : ""}${p.last_name}`.trim()
                        : "Passager"}
                      {isLead ? " · voyageur principal" : " · accompagnateur"}
                    </p>
                    <StatusBadge p={p} />
                    {!isOpen && <MissingFields missing={missing} />}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!contactOnly && !isLead && (
                      <button
                        type="button"
                        className="text-xs text-accent hover:underline"
                        onClick={() => setAsLead(p.id)}
                      >
                        Définir principal
                      </button>
                    )}
                    {!contactOnly && compact && (
                      <button
                        type="button"
                        className="text-xs text-muted hover:text-foreground"
                        onClick={() =>
                          setExpanded((prev) => ({
                            ...prev,
                            [p.id]: !isOpen,
                          }))
                        }
                      >
                        {isOpen ? "Réduire" : "Détails"}
                      </button>
                    )}
                    {!contactOnly && (
                    <button
                      type="button"
                      className="text-xs text-muted hover:text-foreground"
                      onClick={() =>
                        onPassengersChange(
                          passengers.filter((x) => x.id !== p.id)
                        )
                      }
                    >
                      Retirer
                    </button>
                    )}
                  </div>
                </div>

                {isOpen && (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {!contactOnly && (
                      <>
                    <Field
                      label="Prénom (MRZ)"
                      value={p.first_name}
                      onChange={(v) => updatePassenger(p.id, { first_name: v })}
                      required
                    />
                    <Field
                      label="Nom (MRZ)"
                      value={p.last_name}
                      onChange={(v) => updatePassenger(p.id, { last_name: v })}
                      required
                    />
                    <Field
                      label="Autres prénoms"
                      value={p.middle_names || ""}
                      onChange={(v) =>
                        updatePassenger(p.id, { middle_names: v || null })
                      }
                    />
                    <Field
                      label="N° passeport"
                      value={p.passport_number || ""}
                      onChange={(v) =>
                        updatePassenger(p.id, {
                          passport_number: v.toUpperCase() || null,
                        })
                      }
                    />
                    <Field
                      label="Nationalité (ISO3)"
                      value={p.nationality || ""}
                      placeholder="FRA"
                      onChange={(v) =>
                        updatePassenger(p.id, {
                          nationality: v.toUpperCase() || null,
                        })
                      }
                    />
                    <Field
                      label="Pays émetteur (ISO3)"
                      value={p.issuing_country || ""}
                      placeholder="FRA"
                      onChange={(v) =>
                        updatePassenger(p.id, {
                          issuing_country: v.toUpperCase() || null,
                        })
                      }
                    />
                    <Field
                      label="Date de naissance"
                      type="date"
                      value={p.birth_date || ""}
                      onChange={(v) =>
                        updatePassenger(p.id, { birth_date: v || null })
                      }
                    />
                    <Field
                      label="Lieu de naissance"
                      value={p.birth_place || ""}
                      onChange={(v) =>
                        updatePassenger(p.id, { birth_place: v || null })
                      }
                    />
                    <Field
                      label="Sexe"
                      value={p.sex || ""}
                      placeholder="M / F"
                      onChange={(v) =>
                        updatePassenger(p.id, {
                          sex: v.toUpperCase().slice(0, 1) || null,
                        })
                      }
                    />
                    <Field
                      label="Expiration passeport"
                      type="date"
                      value={p.passport_expiry || ""}
                      onChange={(v) =>
                        updatePassenger(p.id, { passport_expiry: v || null })
                      }
                    />
                    <Field
                      label="Date de délivrance"
                      type="date"
                      value={p.passport_issued_date || ""}
                      onChange={(v) =>
                        updatePassenger(p.id, {
                          passport_issued_date: v || null,
                        })
                      }
                    />
                      </>
                    )}

                    {(isLead && requireLeadContact) || contactOnly ? (
                      <>
                        <Field
                          label="Email (obligatoire)"
                          type="email"
                          value={p.email || ""}
                          onChange={(v) =>
                            updatePassenger(p.id, { email: v })
                          }
                          required
                        />
                        <Field
                          label="Téléphone WhatsApp (obligatoire)"
                          value={p.phone || ""}
                          placeholder="+33…"
                          onChange={(v) =>
                            updatePassenger(p.id, { phone: v })
                          }
                          required
                        />
                        <Field
                          label="Adresse"
                          value={p.address_line || ""}
                          onChange={(v) =>
                            updatePassenger(p.id, {
                              address_line: v || null,
                            })
                          }
                        />
                        <Field
                          label="Code postal"
                          value={p.postal_code || ""}
                          onChange={(v) =>
                            updatePassenger(p.id, {
                              postal_code: v || null,
                            })
                          }
                        />
                        <Field
                          label="Ville"
                          value={p.city || ""}
                          onChange={(v) =>
                            updatePassenger(p.id, { city: v || null })
                          }
                        />
                        <Field
                          label="Pays"
                          value={p.country || ""}
                          onChange={(v) =>
                            updatePassenger(p.id, { country: v || null })
                          }
                        />
                      </>
                    ) : null}

                    {!contactOnly && (
                    <div className="sm:col-span-2">
                      <MissingFields missing={missing} />
                      {p.source_file && (
                        <p className="mt-1 text-[10px] text-muted">
                          Source : {p.source_file}
                          {p.attachment_path ? " · PJ conservée" : ""}
                        </p>
                      )}
                    </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!contactOnly && (
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() =>
            onPassengersChange([...passengers, newPassenger()])
          }
          className="admin-af-btn rounded-full px-4 py-2 text-sm"
        >
          + Passager manuel
        </button>
        {requireLeadContact && passengers.length > 0 && !leadContactOk && (
          <p className="text-xs text-amber-200/90">
            Email + téléphone requis pour le voyageur principal.
          </p>
        )}
      </div>
      )}
      {contactOnly && requireLeadContact && passengers.length > 0 && !leadContactOk && (
        <p className="text-xs text-amber-200/90">
          Email + téléphone requis pour le voyageur principal.
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="text-muted">{label}</span>
      <input
        type={type}
        required={required}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2"
      />
    </label>
  );
}
