"use client";

import { useEffect, useState } from "react";
import { activityById, days, hotelById, type Activity, type Hotel } from "@/lib/catalog";
import type { FicheMedia } from "@/lib/fiche";
import { formatUsd } from "@/lib/format";
import type { Selection } from "@/lib/presets";

export type Focus = {
  dayId: string;
  kind: "hotel" | "activity";
};

type Props = {
  selection: Selection;
  focus: Focus;
  onFocus: (focus: Focus) => void;
};

export function FichePanel({ selection, focus, onFocus }: Props) {
  const hotel = hotelById(selection.hotels[focus.dayId]);
  const activity = activityById(selection.activities[focus.dayId]);
  const subject = focus.kind === "hotel" ? hotel : activity;
  const pageUrl = hotel && focus.kind === "hotel" ? hotel.url : activity?.sourceUrl;
  const nightsHere = hotel
    ? days.filter((day) => selection.hotels[day.id] === hotel.id).length
    : 0;

  const [media, setMedia] = useState<FicheMedia | null>(null);
  const [photo, setPhoto] = useState(0);
  const [photoBroken, setPhotoBroken] = useState(false);

  useEffect(() => {
    if (!pageUrl) return;
    const controller = new AbortController();
    setMedia(null);
    setPhoto(0);
    setPhotoBroken(false);
    fetch(`/api/fiche?url=${encodeURIComponent(pageUrl)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("fiche");
        return (await response.json()) as FicheMedia;
      })
      .then((next) => {
        if (!controller.signal.aborted) setMedia(next);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!controller.signal.aborted) {
          setMedia({
            url: pageUrl,
            title: null,
            description: null,
            images: [],
            sourceHost: "",
            fetchedAt: new Date().toISOString(),
            ok: false,
            error: "reseau",
          });
        }
      });
    return () => controller.abort();
  }, [pageUrl]);

  if (!hotel || !activity || !subject || !pageUrl) return null;

  const image = media?.images[photo];
  const description =
    media?.description ||
    (focus.kind === "hotel" ? hotel.note : `${activity.name}. Durée ${activity.duration}, niveau ${activity.level}.`);
  const host = media?.sourceHost || safeHost(pageUrl);

  return (
    <article id="fiche" className="overflow-hidden rounded-3xl border border-champagne/30 bg-marine-soft/90 shadow-2xl shadow-black/20">
      <div className="relative aspect-[16/10] bg-lagoon">
        {image && !photoBroken ? (
          // Photo officielle servie depuis le cache local, pas un domaine d’images Next.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/fiche/image?id=${image.id}`}
            alt={media?.title || subjectTitle(subject)}
            className="h-full w-full object-cover"
            onError={() => setPhotoBroken(true)}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="font-display text-4xl text-champagne-bright">{focus.kind === "hotel" ? hotel.dest : activity.name}</p>
            <p className="max-w-xs text-sm text-sand">
              {media == null
                ? "Chargement du visuel officiel…"
                : "Photo officielle indisponible. Le tarif catalogue reste affiché."}
            </p>
          </div>
        )}
        <p className="absolute bottom-3 left-3 rounded-full bg-marine/80 px-3 py-1 text-[0.68rem] uppercase tracking-[0.18em] text-champagne-bright">
          {focus.dayId} · {focus.kind === "hotel" ? "Hébergement" : "Activité"}
        </p>
      </div>

      {(media?.images.length ?? 0) > 1 ? (
        <div className="flex gap-2 px-4 pt-3">
          {media?.images.map((item, index) => (
            <button
              key={item.id}
              type="button"
              aria-label={`Photo ${index + 1}`}
              aria-pressed={index === photo}
              onClick={() => {
                setPhoto(index);
                setPhotoBroken(false);
              }}
              className={`h-1.5 flex-1 rounded-full ${index === photo ? "bg-champagne" : "bg-champagne/30"}`}
            />
          ))}
        </div>
      ) : null}

      <div className="space-y-4 p-5">
        <div className="flex gap-2">
          <button type="button" className="preset" aria-pressed={focus.kind === "hotel"} onClick={() => onFocus({ ...focus, kind: "hotel" })}>
            Hébergement
          </button>
          <button type="button" className="preset" aria-pressed={focus.kind === "activity"} onClick={() => onFocus({ ...focus, kind: "activity" })}>
            Activité
          </button>
        </div>

        <div>
          <h2 className="font-display text-4xl leading-none text-ivory">{subjectTitle(subject)}</h2>
          <p className="mt-2 text-sm text-sand">{focus.kind === "hotel" ? hotel.dest : `${activity.duration} · niveau ${activity.level}`}</p>
        </div>

        <p className="font-display text-3xl text-champagne-bright">
          {focus.kind === "hotel" ? `${formatUsd(hotel.usdNightMid)} / nuit` : formatUsd(activity.usdCouple)}
        </p>
        <p className="text-sm text-sand">
          {focus.kind === "hotel"
            ? `${nightsHere > 1 ? `${nightsHere} nuits` : "1 nuit"} sur ce séjour · ${formatUsd(hotel.usdNightMid * nightsHere)} · 1 chambre, 2 adultes`
            : "Tarif couple, 2 adultes"}
        </p>

        <p className="text-sm leading-relaxed text-ivory/90">{description}</p>
        {focus.kind === "hotel" && media?.description ? <p className="text-sm text-sand">Repère agence : {hotel.note}</p> : null}

        <a className="link-quiet inline-flex text-sm text-champagne-bright underline decoration-champagne/50 underline-offset-4" href={pageUrl} target="_blank" rel="noopener noreferrer">
          Site officiel
        </a>
        <p className="text-xs text-sand">Texte et visuels : {host}</p>
      </div>
    </article>
  );
}

function subjectTitle(subject: Hotel | Activity): string {
  return subject.name;
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
