"use client";

import { useEffect, useMemo, useState } from "react";
import { FichePanel, type Focus } from "@/components/fiche-panel";
import { activitiesForStage, days, hotelsForStage, seed, stages } from "@/lib/catalog";
import { formatUsd, nightsLabel } from "@/lib/format";
import { quoteSelection } from "@/lib/pricing";
import { sanitizeSelection, selectionForPreset, type PresetId, type Selection } from "@/lib/presets";
import { legForDay, transferOptions, type TransferMode } from "@/lib/transfers";

const STORAGE_KEY = "travelba-configurateur-argentine-v1";

const presetLabels: { id: PresetId; label: string }[] = [
  { id: "luxe", label: "Luxe" },
  { id: "hdg", label: "Haut de gamme" },
  { id: "eco", label: "Moins cher" },
];

type PresetState = PresetId | "sur-mesure";

export function Configurator() {
  const initial = selectionForPreset("luxe");
  const [ready, setReady] = useState(false);
  const [preset, setPreset] = useState<PresetState>("luxe");
  const [selection, setSelection] = useState<Selection>(initial);
  const [focus, setFocus] = useState<Focus>({ dayId: "J1", kind: "hotel" });
  const [detail, setDetail] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as {
          selection?: Selection;
          preset?: PresetState;
          focus?: Focus;
        };
        setSelection(sanitizeSelection(parsed.selection));
        if (parsed.preset === "luxe" || parsed.preset === "hdg" || parsed.preset === "eco" || parsed.preset === "sur-mesure") {
          setPreset(parsed.preset);
        }
        if (parsed.focus && days.some((day) => day.id === parsed.focus?.dayId)) setFocus(parsed.focus);
      }
    } catch {
      /* mémoire illisible */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ selection, preset, focus }));
  }, [ready, selection, preset, focus]);

  const quote = useMemo(() => quoteSelection(selection), [selection]);

  function applyPreset(next: PresetId) {
    setPreset(next);
    setSelection(selectionForPreset(next));
    setFocus({ dayId: "J1", kind: "hotel" });
  }

  function patch(partial: Partial<Selection>, nextFocus?: Focus) {
    setPreset("sur-mesure");
    setSelection((current) => ({ ...current, ...partial, hotels: { ...current.hotels, ...partial.hotels }, activities: { ...current.activities, ...partial.activities }, transfers: { ...current.transfers, ...partial.transfers } }));
    if (nextFocus) setFocus(nextFocus);
  }

  if (!ready) {
    return (
      <main className="mx-auto flex min-h-screen max-w-5xl items-center px-5">
        <p className="font-display text-4xl text-champagne-bright">Préparation du séjour…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pb-36 pt-8 sm:px-6">
      <header className="mb-8 flex flex-col gap-6 border-b border-champagne/25 pb-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[0.72rem] uppercase tracking-[0.28em] text-champagne">Travelba</p>
          <h1 className="font-display mt-2 text-5xl leading-none text-ivory sm:text-6xl">Argentine</h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-sand">
            {seed.season} · 19 jours · couple, 2 adultes, 1 chambre. Choisissez l’hébergement, l’activité du jour et le transfert entre les étapes. Le total se met à jour en dollars.
          </p>
          <p className="mt-2 text-sm text-sand">EOLO, à El Calafate, est fermé en juillet–août et n’est pas proposé.</p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Paliers">
          {presetLabels.map((item) => (
            <button key={item.id} type="button" className="preset" aria-pressed={preset === item.id} onClick={() => applyPreset(item.id)}>
              {item.label}
            </button>
          ))}
          {preset === "sur-mesure" ? <span className="self-center text-xs uppercase tracking-[0.16em] text-champagne">Sur mesure</span> : null}
        </div>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22.5rem]">
        <div className="order-2 space-y-8 lg:order-1">
          {stages.map((stage, stageIndex) => {
            const stageDays = days.filter((day) => day.stageId === stage.id);
            const stageSum = stageDays.reduce((sum, day) => {
              const lineH = quote.lodgingLines.find((line) => line.dayId === day.id);
              const lineA = quote.activityLines.find((line) => line.dayId === day.id);
              return sum + (lineH?.amount ?? 0) + (lineA?.amount ?? 0);
            }, 0);
            return (
              <section key={stage.id} aria-labelledby={`etape-${stage.id}`}>
                <div className="mb-3 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[0.68rem] uppercase tracking-[0.22em] text-champagne">Étape {stageIndex + 1}</p>
                    <h2 id={`etape-${stage.id}`} className="font-display text-3xl text-ivory">
                      {stage.label}
                    </h2>
                  </div>
                  <p className="text-right text-sm text-sand">
                    {nightsLabel(stage.nights)}
                    <span className="mt-1 block text-champagne-bright">{formatUsd(stageSum)}</span>
                  </p>
                </div>
                <div className="space-y-3">
                  {stageDays.map((day) => {
                    const leg = legForDay(day.id);
                    const hotelChoices = hotelsForStage(stage.id);
                    const activityChoices = activitiesForStage(stage.id);
                    const daySum =
                      (quote.lodgingLines.find((line) => line.dayId === day.id)?.amount ?? 0) +
                      (quote.activityLines.find((line) => line.dayId === day.id)?.amount ?? 0);
                    return (
                      <article key={day.id} className="day-card" data-active={focus.dayId === day.id}>
                        <div className="mb-3 flex items-baseline justify-between">
                          <button type="button" className="font-display text-2xl text-ivory" onClick={() => setFocus({ dayId: day.id, kind: "hotel" })}>
                            {day.id}
                          </button>
                          <p className="text-sm text-champagne-bright">{formatUsd(daySum)}</p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {leg ? (
                            <label className="block text-sm sm:col-span-2">
                              <span className="mb-1 block text-[0.68rem] uppercase tracking-[0.16em] text-sand">Transfert · {leg.title}</span>
                              <select
                                className="select"
                                value={selection.transfers[leg.id]}
                                onChange={(event) =>
                                  patch(
                                    { transfers: { [leg.id]: event.target.value as TransferMode } },
                                    { dayId: day.id, kind: "hotel" },
                                  )
                                }
                              >
                                {transferOptions.map((option) => (
                                  <option key={option.id} value={option.id}>
                                    {option.label} — {option.usdCouple == null ? "sur devis" : formatUsd(option.usdCouple)}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : null}
                          <label className="block text-sm">
                            <span className="mb-1 block text-[0.68rem] uppercase tracking-[0.16em] text-sand">Hébergement</span>
                            <select
                              className="select"
                              aria-label={`Hébergement ${day.id}`}
                              value={selection.hotels[day.id]}
                              onChange={(event) =>
                                patch({ hotels: { [day.id]: event.target.value } }, { dayId: day.id, kind: "hotel" })
                              }
                            >
                              {hotelChoices.map((hotel) => (
                                <option key={hotel.id} value={hotel.id}>
                                  {hotel.name} — {formatUsd(hotel.usdNightMid)} / nuit
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="block text-sm">
                            <span className="mb-1 block text-[0.68rem] uppercase tracking-[0.16em] text-sand">Activité</span>
                            <select
                              className="select"
                              aria-label={`Activité ${day.id}`}
                              value={selection.activities[day.id]}
                              onChange={(event) =>
                                patch({ activities: { [day.id]: event.target.value } }, { dayId: day.id, kind: "activity" })
                              }
                            >
                              {activityChoices.map((activity) => (
                                <option key={activity.id} value={activity.id}>
                                  {activity.name} — {formatUsd(activity.usdCouple)} · {activity.duration} · {activity.level}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
        <aside className="order-1 lg:sticky lg:top-4 lg:order-2">
          <FichePanel selection={selection} focus={focus} onFocus={setFocus} />
        </aside>
      </div>

      <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-champagne/30 bg-marine/95 backdrop-blur">
        {detail ? (
          <div className="mx-auto max-h-[46vh] max-w-6xl overflow-auto px-4 py-4 text-sm sm:px-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <LineList title="Hébergement" lines={quote.lodgingLines.map((line) => `${line.dayId} · ${line.label} · ${formatUsd(line.amount)}`)} />
              <LineList title="Activités" lines={quote.activityLines.map((line) => `${line.dayId} · ${line.label} · ${formatUsd(line.amount)}`)} />
              <LineList
                title="Transferts"
                lines={quote.transferLines.map((line) => `${line.title} · ${line.modeLabel} · ${line.amount == null ? "sur devis" : formatUsd(line.amount)}`)}
              />
            </div>
          </div>
        ) : null}
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div>
            <p className="text-[0.68rem] uppercase tracking-[0.18em] text-sand">Total couple · 2 adultes · 1 chambre</p>
            <p className="font-display text-3xl text-champagne-bright sm:text-4xl">{formatUsd(quote.total)}</p>
            <p className="text-xs text-sand">
              Hébergement {formatUsd(quote.lodging)} · Activités {formatUsd(quote.activities)}
              {quote.transfersOnRequest > 0 ? ` · ${quote.transfersOnRequest} transfert${quote.transfersOnRequest > 1 ? "s" : ""} sur devis` : ""}
            </p>
          </div>
          <button type="button" className="preset shrink-0" aria-expanded={detail} onClick={() => setDetail((open) => !open)}>
            {detail ? "Fermer" : "Détail"}
          </button>
        </div>
      </footer>
    </main>
  );
}

function LineList({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div>
      <p className="mb-2 text-[0.68rem] uppercase tracking-[0.16em] text-champagne">{title}</p>
      <ul className="space-y-1 text-sand">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
