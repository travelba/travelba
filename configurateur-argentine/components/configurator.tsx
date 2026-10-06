"use client";

import { useEffect, useMemo, useState } from "react";
import { ChoiceTile, ProductCard } from "@/components/product-card";
import { useFiche } from "@/components/use-fiche";
import {
  activitiesForStage,
  activityById,
  days,
  hotelById,
  hotelsForStage,
  seed,
  stages,
  type Activity,
  type Hotel,
} from "@/lib/catalog";
import { formatUsd, nightsLabel } from "@/lib/format";
import { quoteSelection } from "@/lib/pricing";
import { sanitizeSelection, selectionForPreset, type PresetId, type Selection } from "@/lib/presets";
import { legForDay, transferOption, transferOptions, type TransferMode } from "@/lib/transfers";

const STORAGE_KEY = "travelba-configurateur-argentine-v2";

const formulas: { id: PresetId; label: string; detail: string }[] = [
  { id: "luxe", label: "Luxe", detail: "Les adresses prévues pour le voyage." },
  { id: "hdg", label: "Haut de gamme", detail: "Un cran sous le luxe, le même itinéraire." },
  { id: "eco", label: "Moins cher", detail: "La nuit la plus basse à chaque étape." },
];

type Phase = "accueil" | "formule" | "borne" | "recap";
type PresetState = PresetId | "sur-mesure";
type Focus = { dayId: string; kind: "hotel" | "activity" };

const presetName: Record<PresetState, string> = {
  luxe: "Luxe",
  hdg: "Haut de gamme",
  eco: "Moins cher",
  "sur-mesure": "Sur mesure",
};

export function Configurator() {
  const initial = selectionForPreset("luxe");
  const [ready, setReady] = useState(false);
  const [canResume, setCanResume] = useState(false);
  const [phase, setPhase] = useState<Phase>("accueil");
  const [preset, setPreset] = useState<PresetState>("luxe");
  const [selection, setSelection] = useState<Selection>(initial);
  const [dayId, setDayId] = useState("J1");
  const [focus, setFocus] = useState<Focus>({ dayId: "J1", kind: "hotel" });
  const [ticketOpen, setTicketOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as {
          selection?: Selection;
          preset?: PresetState;
          phase?: Phase;
          dayId?: string;
          focus?: Focus;
        };
        setSelection(sanitizeSelection(parsed.selection));
        if (parsed.preset === "luxe" || parsed.preset === "hdg" || parsed.preset === "eco" || parsed.preset === "sur-mesure") {
          setPreset(parsed.preset);
        }
        if (parsed.dayId && days.some((day) => day.id === parsed.dayId)) setDayId(parsed.dayId);
        if (parsed.focus && days.some((day) => day.id === parsed.focus?.dayId)) setFocus(parsed.focus);
        if (parsed.phase === "borne" || parsed.phase === "recap" || parsed.phase === "formule") setCanResume(true);
      }
    } catch {
      /* mémoire illisible */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ selection, preset, phase, dayId, focus }));
  }, [ready, selection, preset, phase, dayId, focus]);

  useEffect(() => {
    if (phase !== "borne") return;
    document.getElementById(`rail-${dayId}`)?.scrollIntoView({ block: "nearest", inline: "center" });
    document.getElementById("kiosk-stage")?.scrollTo({ top: 0 });
  }, [dayId, phase]);

  const quote = useMemo(() => quoteSelection(selection), [selection]);
  const formulaQuotes = useMemo(
    () => formulas.map((item) => ({ ...item, total: quoteSelection(selectionForPreset(item.id)).total })),
    [],
  );

  function chooseFormula(next: PresetId) {
    setPreset(next);
    setSelection(selectionForPreset(next));
    setDayId("J1");
    setFocus({ dayId: "J1", kind: "hotel" });
    setPhase("borne");
  }

  function patch(partial: Partial<Selection>, nextFocus?: Focus) {
    setPreset("sur-mesure");
    setSelection((current) => ({
      ...current,
      hotels: { ...current.hotels, ...partial.hotels },
      activities: { ...current.activities, ...partial.activities },
      transfers: { ...current.transfers, ...partial.transfers },
    }));
    if (nextFocus) setFocus(nextFocus);
  }

  function openDay(nextDayId: string) {
    setDayId(nextDayId);
    setFocus({ dayId: nextDayId, kind: "hotel" });
    setPhase("borne");
    setTicketOpen(false);
  }

  function go(offset: number) {
    const index = days.findIndex((day) => day.id === dayId);
    const target = days[index + offset];
    if (target) openDay(target.id);
    else if (offset > 0) setPhase("recap");
    else setPhase("formule");
  }

  if (!ready) {
    return (
      <main className="kiosk-screen">
        <p className="font-display text-5xl text-champagne-bright">Préparation du séjour…</p>
      </main>
    );
  }

  if (phase === "accueil") {
    return (
      <main className="kiosk-screen">
        <button type="button" className="kiosk-start" onClick={() => setPhase("formule")}>
          <p className="text-xs uppercase tracking-[0.32em] text-champagne">Travelba</p>
          <h1 className="font-display text-7xl leading-none text-ivory sm:text-8xl">Argentine</h1>
          <p className="max-w-md text-lg text-sand">{seed.season} · 19 jours · 2 adultes · 1 chambre</p>
          <span className="kiosk-cta">Touchez pour commencer</span>
        </button>
        {canResume ? (
          <button type="button" className="kiosk-back" onClick={() => setPhase("borne")}>
            Reprendre le séjour
          </button>
        ) : null}
        <p className="max-w-md text-sm text-sand">EOLO, à El Calafate, est fermé en juillet–août et n’est pas proposé.</p>
      </main>
    );
  }

  if (phase === "formule") {
    return (
      <main className="kiosk-screen">
        <p className="text-xs uppercase tracking-[0.28em] text-champagne">Formule</p>
        <h1 className="font-display text-5xl leading-none text-ivory sm:text-6xl">Choisissez un menu</h1>
        <p className="max-w-xl text-sand">La formule remplit les 19 jours. Ensuite, chaque jour se modifie en touchant une carte.</p>
        <div className="kiosk-formulas">
          {formulaQuotes.map((item) => (
            <button key={item.id} type="button" className="kiosk-formula" onClick={() => chooseFormula(item.id)}>
              <strong>{item.label}</strong>
              <span className="text-sm text-sand">{item.detail}</span>
              <span className="font-display text-4xl text-champagne-bright">{formatUsd(item.total)}</span>
            </button>
          ))}
        </div>
        <button type="button" className="kiosk-back" onClick={() => setPhase("accueil")}>
          Retour
        </button>
      </main>
    );
  }

  if (phase === "recap") {
    return (
      <Recap
        selection={selection}
        preset={preset}
        total={quote.total}
        lodging={quote.lodging}
        activities={quote.activities}
        transfersOnRequest={quote.transfersOnRequest}
        onEdit={openDay}
        onRestart={() => setPhase("accueil")}
      />
    );
  }

  const day = days.find((item) => item.id === dayId) ?? days[0];
  const stage = stages.find((item) => item.id === day.stageId);
  const leg = legForDay(day.id);
  const dayIndex = days.findIndex((item) => item.id === day.id);

  return (
    <main className="kiosk">
      <nav className="kiosk-days" aria-label="Jours du séjour">
        {days.map((item) => (
          <button
            key={item.id}
            id={`rail-${item.id}`}
            type="button"
            className="kiosk-day"
            aria-current={item.id === day.id ? "step" : undefined}
            onClick={() => openDay(item.id)}
          >
            {item.id}
          </button>
        ))}
      </nav>

      <section id="kiosk-stage" className="kiosk-stage" aria-labelledby="kiosk-day-title">
        <p className="text-xs uppercase tracking-[0.22em] text-champagne">
          Étape {(stage ? stages.indexOf(stage) : 0) + 1} · {stage ? nightsLabel(stage.nights) : ""}
        </p>
        <h1 id="kiosk-day-title" className="font-display mt-1 text-5xl leading-none text-ivory">
          {day.id} · {day.stageLabel}
        </h1>
        <p className="mt-2 text-sand">Touchez une carte pour la mettre sur le ticket.</p>

        {leg ? (
          <div className="kiosk-section">
            <h2 className="text-lg font-semibold">Transfert · {leg.title}</h2>
            <div className="kiosk-tiles">
              {transferOptions.map((option) => (
                <ChoiceTile
                  key={option.id}
                  label={option.label}
                  detail={option.usdCouple == null ? "Sur devis" : formatUsd(option.usdCouple)}
                  selected={selection.transfers[leg.id] === option.id}
                  onSelect={() => patch({ transfers: { [leg.id]: option.id as TransferMode } })}
                />
              ))}
            </div>
          </div>
        ) : null}

        <div className="kiosk-section">
          <h2 className="text-lg font-semibold">Hébergement · 1 chambre</h2>
          {day.stageId === "calafate" ? (
            <p className="mt-1 text-sm text-sand">EOLO est fermé en juillet–août et n’est pas proposé.</p>
          ) : null}
          <div className="kiosk-grid">
            {hotelsForStage(day.stageId).map((hotel) => (
              <ProductCard
                key={hotel.id}
                name={hotel.name}
                meta={hotel.note}
                priceLabel={`${formatUsd(hotel.usdNightMid)} / nuit`}
                url={hotel.url}
                selected={selection.hotels[day.id] === hotel.id}
                onSelect={() => patch({ hotels: { [day.id]: hotel.id } }, { dayId: day.id, kind: "hotel" })}
              />
            ))}
          </div>
        </div>

        <div className="kiosk-section">
          <h2 className="text-lg font-semibold">Activité · 2 adultes</h2>
          <div className="kiosk-grid">
            {activitiesForStage(day.stageId).map((activity) => (
              <ProductCard
                key={activity.id}
                name={activity.name}
                meta={`${activity.duration} · niveau ${activity.level}`}
                priceLabel={formatUsd(activity.usdCouple)}
                url={activity.sourceUrl}
                selected={selection.activities[day.id] === activity.id}
                onSelect={() => patch({ activities: { [day.id]: activity.id } }, { dayId: day.id, kind: "activity" })}
              />
            ))}
          </div>
        </div>

        <DayFiche dayId={day.id} focus={focus.dayId === day.id ? focus : { dayId: day.id, kind: "hotel" }} selection={selection} />
      </section>

      <aside className="kiosk-ticket" aria-label="Ticket du séjour">
        <div className="kiosk-ticket-scroll" data-open={ticketOpen}>
          <p className="text-xs uppercase tracking-[0.2em] text-champagne">Votre séjour</p>
          <p className="mt-1 text-sm text-sand">{presetName[preset]}</p>
          <ul className="mt-3 space-y-0.5">
            {days.map((item) => {
              const hotel = hotelById(selection.hotels[item.id]);
              const activity = activityById(selection.activities[item.id]);
              const itemLeg = legForDay(item.id);
              const current = item.id === day.id;
              return (
                <li key={item.id}>
                  {itemLeg ? (
                    <TicketLine
                      current={current}
                      day={item.id}
                      label={transferOption(selection.transfers[itemLeg.id]).label}
                      amount={
                        transferOption(selection.transfers[itemLeg.id]).usdCouple == null
                          ? "sur devis"
                          : formatUsd(transferOption(selection.transfers[itemLeg.id]).usdCouple ?? 0)
                      }
                      onClick={() => openDay(item.id)}
                    />
                  ) : null}
                  <TicketLine
                    current={current}
                    day={item.id}
                    label={hotel?.name ?? "Hébergement"}
                    amount={hotel ? formatUsd(hotel.usdNightMid) : ""}
                    onClick={() => openDay(item.id)}
                  />
                  <TicketLine
                    current={current}
                    day={item.id}
                    label={activity?.name ?? "Activité"}
                    amount={activity ? formatUsd(activity.usdCouple) : ""}
                    onClick={() => openDay(item.id)}
                  />
                </li>
              );
            })}
          </ul>
        </div>
        <div className="kiosk-ticket-foot">
          <button type="button" className="kiosk-ticket-toggle" onClick={() => setTicketOpen((open) => !open)}>
            {ticketOpen ? "Masquer le ticket" : "Voir le ticket"} · {day.id} sur {days.length}
          </button>
          <p className="kiosk-total">{formatUsd(quote.total)}</p>
          <p className="text-xs text-sand">
            Hébergement {formatUsd(quote.lodging)} · Activités {formatUsd(quote.activities)}
            {quote.transfersOnRequest > 0 ? ` · ${quote.transfersOnRequest} transferts sur devis` : ""}
          </p>
          <div className="kiosk-actions">
            <button type="button" className="kiosk-back" onClick={() => go(-1)}>
              Retour
            </button>
            <button type="button" className="kiosk-next" onClick={() => go(1)}>
              {dayIndex === days.length - 1 ? "Valider" : "Jour suivant"}
            </button>
          </div>
        </div>
      </aside>
    </main>
  );
}

function TicketLine({
  current,
  day,
  label,
  amount,
  onClick,
}: {
  current: boolean;
  day: string;
  label: string;
  amount: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="kiosk-line" data-current={current} onClick={onClick}>
      <span>{day}</span>
      <span className="truncate">{label}</span>
      <span>{amount}</span>
    </button>
  );
}

function DayFiche({ dayId, focus, selection }: { dayId: string; focus: Focus; selection: Selection }) {
  const hotel = hotelById(selection.hotels[dayId]);
  const activity = activityById(selection.activities[dayId]);
  const subject: Hotel | Activity | undefined = focus.kind === "activity" ? activity : hotel;
  const url = subject && "usdNightMid" in subject ? subject.url : subject?.sourceUrl;
  const media = useFiche(url ?? null);
  if (!subject || !url || !hotel || !activity) return null;
  const description =
    media?.description ||
    ("usdNightMid" in subject ? subject.note : `${activity.name}. Durée ${activity.duration}, niveau ${activity.level}.`);
  const host = media?.sourceHost || safeHost(url);
  return (
    <article className="kiosk-fiche">
      <p className="text-xs uppercase tracking-[0.18em] text-champagne">Fiche · {focus.kind === "hotel" ? "hébergement" : "activité"}</p>
      <h2 className="font-display mt-1 text-4xl leading-none">{subject.name}</h2>
      <p className="mt-2 text-sm leading-relaxed text-ivory/90">{description}</p>
      {"usdNightMid" in subject && media?.description ? <p className="mt-2 text-sm text-sand">Repère agence : {subject.note}</p> : null}
      {"duration" in subject ? (
        <p className="mt-2 text-sm text-sand">
          {subject.duration} · niveau {subject.level} · {formatUsd(subject.usdCouple)} pour 2 adultes
        </p>
      ) : (
        <p className="mt-2 text-sm text-sand">{formatUsd(subject.usdNightMid)} / nuit · 1 chambre, 2 adultes</p>
      )}
      <a className="mt-3 inline-flex text-sm text-champagne-bright underline decoration-champagne/50 underline-offset-4" href={url} target="_blank" rel="noopener noreferrer">
        Site officiel
      </a>
      <p className="mt-1 text-xs text-sand">Texte et visuels : {host}</p>
    </article>
  );
}

function Recap({
  selection,
  preset,
  total,
  lodging,
  activities,
  transfersOnRequest,
  onEdit,
  onRestart,
}: {
  selection: Selection;
  preset: PresetState;
  total: number;
  lodging: number;
  activities: number;
  transfersOnRequest: number;
  onEdit: (dayId: string) => void;
  onRestart: () => void;
}) {
  return (
    <main className="kiosk-screen kiosk-recap">
      <p className="text-xs uppercase tracking-[0.28em] text-champagne">Récapitulatif · {presetName[preset]}</p>
      <h1 className="font-display text-6xl leading-none text-ivory">Votre séjour</h1>
      <p className="font-display text-5xl text-champagne-bright">{formatUsd(total)}</p>
      <p className="text-sm text-sand">
        Hébergement {formatUsd(lodging)} · Activités {formatUsd(activities)}
        {transfersOnRequest > 0 ? ` · ${transfersOnRequest} transferts sur devis` : ""}
      </p>
      <ul className="grid w-full max-w-3xl gap-2 text-left">
        {days.map((day) => {
          const hotel = hotelById(selection.hotels[day.id]);
          const activity = activityById(selection.activities[day.id]);
          const leg = legForDay(day.id);
          return (
            <li key={day.id}>
              <button type="button" className="kiosk-formula w-full min-h-0" onClick={() => onEdit(day.id)}>
                <span className="text-xs uppercase tracking-[0.16em] text-champagne">{day.id} · {day.stageLabel}</span>
                <span className="text-base text-ivory">
                  {hotel?.name} · {activity?.name}
                  {leg ? ` · ${transferOption(selection.transfers[leg.id]).label}` : ""}
                </span>
                <span className="text-sm text-sand">Modifier ce jour</span>
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" className="kiosk-back" onClick={onRestart}>
        Recommencer
      </button>
    </main>
  );
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
