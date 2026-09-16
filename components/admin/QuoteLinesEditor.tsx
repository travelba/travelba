"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { QuoteLine } from "@/lib/mtrip/guide-types";
import { emptyQuoteLine, formatStayDateRangeFr, inferTripDates } from "@/lib/mtrip/quote-lines";
import { buildVoyageTitle } from "@/lib/mtrip/voyage-title";

type Props = {
  lines: QuoteLine[];
  tripTitle: string;
  startDate: string | null;
  endDate: string | null;
  /** Autosave debounce parent */
  onChange: (payload: {
    quote_lines: QuoteLine[];
    title: string;
    start_date: string | null;
    end_date: string | null;
  }) => void;
  saveState?: "idle" | "saving" | "saved" | "error";
  /** Ouvre l’aperçu du PDF/image source dans le dossier */
  onOpenDocument?: (documentId: string) => void;
};

const KINDS: QuoteLine["kind"][] = ["hotel", "flight", "transfer", "other"];

const KIND_LABEL: Record<QuoteLine["kind"], string> = {
  hotel: "Hôtel",
  flight: "Vol",
  transfer: "Transfert",
  other: "Autre",
};

export function QuoteLinesEditor({
  lines,
  tripTitle,
  startDate,
  endDate,
  onChange,
  saveState = "idle",
  onOpenDocument,
}: Props) {
  const [rows, setRows] = useState<QuoteLine[]>(lines);
  const [editingAmount, setEditingAmount] = useState<string | null>(null);
  const skipNext = useRef(true);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const autoTitle = useMemo(() => {
    const fromLines = inferTripDates(rows);
    return buildVoyageTitle({
      start_date: fromLines.start_date || startDate,
      end_date: fromLines.end_date || endDate,
      quote_lines: rows,
      currentTitle: tripTitle,
    });
  }, [rows, startDate, endDate, tripTitle]);

  useEffect(() => {
    // Reinitialize the controlled draft when another guide/extraction is loaded.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRows(lines);
    skipNext.current = true;
  }, [lines, tripTitle, startDate, endDate]);

  useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    const fromLines = inferTripDates(rows);
    onChangeRef.current({
      quote_lines: rows.map((r) => ({
        ...r,
        title: r.title.trim() || "Ligne devis",
        confirmation: r.confirmation?.trim() || null,
        start_date: r.start_date || null,
        end_date: r.end_date || null,
        room_type: r.room_type?.trim() || null,
        room_details: r.room_details?.trim() || null,
        amount:
          r.amount === null || r.amount === undefined || Number.isNaN(Number(r.amount))
            ? null
            : Number(r.amount),
        currency: (r.currency || "EUR").toUpperCase(),
      })),
      title: autoTitle,
      start_date: fromLines.start_date || startDate || null,
      end_date: fromLines.end_date || endDate || null,
    });
  }, [rows, autoTitle, startDate, endDate]);

  function patchRow(id: string, patch: Partial<QuoteLine>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  const total = rows.reduce(
    (sum, r) => sum + (typeof r.amount === "number" ? r.amount : 0),
    0
  );
  const currency = rows[0]?.currency || "EUR";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="min-w-0 flex-1 space-y-1.5">
          <span className="text-xs text-muted">
            Titre du voyage (villes, pays + dates)
          </span>
          <input
            value={autoTitle}
            readOnly
            className="w-full rounded-xl border border-border/80 bg-white px-4 py-3 text-base font-medium text-[var(--admin-navy)] outline-none focus:border-[var(--aura-blue)] focus:ring-2 focus:ring-[var(--aura-blue-soft)]"
          />
        </label>
        <div className="pb-3 text-xs text-muted">
          {saveState === "saving" && "Enregistrement…"}
          {saveState === "saved" && (
            <span className="text-emerald-700">✓ Sauvé</span>
          )}
          {saveState === "error" && (
            <span className="text-red-600">Erreur save</span>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {rows.map((line) => (
          <article
            key={line.id}
            className="admin-af-card group relative overflow-hidden rounded-2xl p-4 transition hover:border-[var(--aura-blue)]/40"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={line.kind}
                    onChange={(e) =>
                      patchRow(line.id, {
                        kind: e.target.value as QuoteLine["kind"],
                      })
                    }
                    className="rounded-full border border-border/60 bg-background/50 px-2.5 py-1 text-[11px] uppercase tracking-wide text-muted"
                  >
                    {KINDS.map((k) => (
                      <option key={k} value={k}>
                        {KIND_LABEL[k]}
                      </option>
                    ))}
                  </select>
                  <input
                    value={line.confirmation || ""}
                    onChange={(e) =>
                      patchRow(line.id, { confirmation: e.target.value })
                    }
                    placeholder="Réf. conf."
                    className="rounded-full border border-transparent bg-transparent px-2 py-1 text-xs text-muted outline-none placeholder:text-muted/50 focus:border-border"
                  />
                  {line.document_id && onOpenDocument && (
                    <button
                      type="button"
                      onClick={() => onOpenDocument(line.document_id!)}
                      className="rounded-full border border-border/60 px-2.5 py-1 text-[11px] text-accent hover:border-accent/50"
                      title={line.source_file || "Voir le document"}
                    >
                      Voir doc
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setRows((prev) => prev.filter((r) => r.id !== line.id))
                    }
                    className="rounded-full border border-border/60 px-2.5 py-1 text-[11px] text-muted hover:border-red-400/50 hover:text-red-600"
                    title="Supprimer la ligne"
                  >
                    Supprimer
                  </button>
                </div>
                <input
                  value={line.title}
                  onChange={(e) => patchRow(line.id, { title: e.target.value })}
                  placeholder={
                    line.kind === "hotel"
                      ? "Nom de l’hôtel"
                      : line.kind === "flight"
                        ? "Vol (compagnie + route)"
                        : "Libellé"
                  }
                  className="w-full bg-transparent text-lg font-medium tracking-tight outline-none placeholder:text-muted/40"
                />
                {(line.kind === "hotel" || line.kind === "flight") && (
                  <p className="text-sm font-medium text-[var(--admin-navy)]">
                    {formatStayDateRangeFr(line.start_date, line.end_date) ||
                      "Dates à préciser"}
                  </p>
                )}
                {line.kind === "hotel" || line.kind === "flight" ? (
                  <div className="space-y-2">
                    <input
                      value={line.room_type || ""}
                      onChange={(e) =>
                        patchRow(line.id, {
                          room_type: e.target.value || null,
                        })
                      }
                      placeholder={
                        line.kind === "hotel"
                          ? "Type de chambre"
                          : "Vol / cabine (ex. AF0431 · Business)"
                      }
                      className="w-full rounded-lg border border-border/40 bg-background/40 px-3 py-2 text-sm font-medium outline-none focus:border-accent/50"
                    />
                    <textarea
                      value={line.room_details || ""}
                      onChange={(e) =>
                        patchRow(line.id, {
                          room_details: e.target.value || null,
                        })
                      }
                      placeholder={
                        line.kind === "hotel"
                          ? "Détails chambre (occupants, lit, repas…)"
                          : "Détails vol (passager, horaires, siège, bagages…)"
                      }
                      rows={2}
                      className="w-full resize-y rounded-lg border border-border/40 bg-background/40 px-3 py-2 text-xs leading-relaxed text-muted outline-none focus:border-accent/50"
                    />
                    <div className="flex flex-wrap gap-2">
                      <input
                        type="date"
                        value={line.start_date || ""}
                        onChange={(e) =>
                          patchRow(line.id, {
                            start_date: e.target.value || null,
                          })
                        }
                        className="rounded-lg border border-border/50 bg-background/40 px-2 py-1 text-xs"
                      />
                      <span className="self-center text-xs text-muted">→</span>
                      <input
                        type="date"
                        value={line.end_date || ""}
                        onChange={(e) =>
                          patchRow(line.id, {
                            end_date: e.target.value || null,
                          })
                        }
                        className="rounded-lg border border-border/50 bg-background/40 px-2 py-1 text-xs"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="date"
                      value={line.start_date || ""}
                      onChange={(e) =>
                        patchRow(line.id, {
                          start_date: e.target.value || null,
                        })
                      }
                      className="rounded-lg border border-border/50 bg-background/40 px-2 py-1 text-xs"
                    />
                    <span className="self-center text-xs text-muted">→</span>
                    <input
                      type="date"
                      value={line.end_date || ""}
                      onChange={(e) =>
                        patchRow(line.id, {
                          end_date: e.target.value || null,
                        })
                      }
                      className="rounded-lg border border-border/50 bg-background/40 px-2 py-1 text-xs"
                    />
                  </div>
                )}
              </div>

              <div className="text-right">
                {editingAmount === line.id ? (
                  <div className="flex items-center gap-1">
                    <input
                      autoFocus
                      type="number"
                      step="0.01"
                      value={line.amount ?? ""}
                      onChange={(e) =>
                        patchRow(line.id, {
                          amount:
                            e.target.value === ""
                              ? null
                              : Number.parseFloat(e.target.value),
                        })
                      }
                      onBlur={() => setEditingAmount(null)}
                      className="w-28 rounded-lg border border-accent/50 bg-background px-2 py-1 text-right text-xl font-semibold outline-none"
                    />
                    <input
                      value={line.currency || "EUR"}
                      onChange={(e) =>
                        patchRow(line.id, { currency: e.target.value })
                      }
                      className="w-14 rounded-lg border border-border/50 bg-background/40 px-1 py-1 text-xs"
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingAmount(line.id)}
                    className="text-right"
                  >
                    <p className="text-2xl font-semibold tracking-tight text-foreground">
                      {line.amount != null
                        ? Number(line.amount).toLocaleString("fr-FR", {
                            style: "currency",
                            currency: line.currency || "EUR",
                          })
                        : "— €"}
                    </p>
                    <p className="text-[10px] text-muted">cliquer pour éditer</p>
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-4">
        <button
          type="button"
          onClick={() => setRows((prev) => [...prev, emptyQuoteLine()])}
          className="rounded-xl border border-dashed border-border px-4 py-2.5 text-sm text-muted transition hover:border-accent/50 hover:text-foreground"
        >
          + Ajouter une ligne
        </button>
        <p className="text-sm">
          <span className="text-muted">Total </span>
          <span className="text-lg font-semibold">
            {total.toLocaleString("fr-FR", {
              style: "currency",
              currency,
            })}
          </span>
        </p>
      </div>
    </div>
  );
}
