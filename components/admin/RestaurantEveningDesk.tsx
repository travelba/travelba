"use client";

import { useEffect, useState } from "react";
import type { DeskFaceStatus, DeskPhase, DeskTone } from "@/lib/crm/restaurant-desk";

export type DeskFaceView = {
  seat: "A" | "B";
  restaurantId: string | null;
  name: string;
  time: string;
  photo: string | null;
  status: DeskFaceStatus;
  label: string;
  tone: DeskTone;
};

export type DeskSuggestionView = {
  id: string;
  name: string;
  photo: string | null;
  city: string;
  complete: boolean;
};

export type DeskPreviewCard = {
  kind: "salle" | "plat" | "carte";
  title: string;
  body: string;
  photo: string | null;
};

export type DeskRowView = {
  bookingId: string;
  date: string;
  dateLabel: string;
  client: string;
  reference: string;
  city: string;
  hotel: string;
  countdown: string;
  closesAt: number | null;
  phase: DeskPhase;
  sendBlock: string | null;
  delivery: "modele" | "libre" | "apercu";
  faces: DeskFaceView[];
  clicks: { at: string; label: string }[];
  suggestions: DeskSuggestionView[];
  previewIntro: string;
  previews: { seat: "A" | "B"; name: string; time: string; intro: string; cards: DeskPreviewCard[] }[];
};

const TONE: Record<DeskTone, string> = {
  gris: "bg-[#e7e2d8] text-[#5c564c]",
  encre: "bg-[#0B192C] text-white",
  vert: "bg-[#1f6b45] text-white",
  orange: "bg-[#c46a2d] text-white",
  mute: "bg-[#d9d1c3] text-[#5c564c]",
};

function photoStyle(src: string | null) {
  if (!src) return "bg-gradient-to-br from-[#1a3348] to-[#0B192C]";
  return "";
}

function Face({ face }: { face: DeskFaceView }) {
  return (
    <article className="overflow-hidden rounded-3xl bg-white shadow-[0_10px_30px_rgba(11,25,44,0.08)]">
      <div className={`relative aspect-[4/3] ${photoStyle(face.photo)}`}>
        {face.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={face.photo} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <div className="flex h-full items-end p-4 text-sm font-semibold text-[#f4efe4]">Photo à venir</div>
        )}
        <p className={`absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-semibold ${TONE[face.tone]}`}>{face.label}</p>
      </div>
      <div className="space-y-1 px-4 py-3">
        <p className="font-display text-xl font-semibold text-[#0B192C]">{face.name || "Restaurant"}</p>
        <p className="text-sm text-muted">{face.time || "Heure à fixer"}</p>
      </div>
    </article>
  );
}

function MiniCard({ card }: { card: DeskPreviewCard }) {
  return (
    <article className="w-52 shrink-0 overflow-hidden rounded-2xl bg-white text-[#0B192C]">
      <div className={`aspect-[16/10] ${card.photo ? "" : "bg-gradient-to-br from-[#1a3348] to-[#0B192C]"}`}>
        {card.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.photo} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
        ) : null}
      </div>
      <div className="space-y-2 p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8c7350]">{card.title}</p>
        <p className="text-sm leading-snug">{card.body}</p>
        <div className="grid grid-cols-2 gap-1">
          <p className="rounded-full bg-[#f4efe4] py-1 text-center text-[11px] font-semibold">J&apos;accepte</p>
          <p className="rounded-full bg-[#f4efe4] py-1 text-center text-[11px] font-semibold">Je refuse</p>
        </div>
      </div>
    </article>
  );
}

export function RestaurantEveningDesk({
  rows,
  banner,
  readOnly = false,
  test = null,
}: {
  rows: DeskRowView[];
  banner: { envoyer: number; annuler: number; reponses: number };
  readOnly?: boolean;
  test?: { allowed: boolean; on: boolean } | null;
}) {
  const [picking, setPicking] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Record<string, { A: string; B: string }>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  async function post(url: string, body: Record<string, unknown>) {
    if (readOnly) return;
    setBusy(true);
    setNote("");
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setNote(json?.error || "Enregistrement impossible.");
        return;
      }
      window.location.reload();
    } catch {
      setNote("Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  function remain(at: number | null, fallback: string) {
    if (at == null) return fallback;
    const delta = at - clock;
    if (delta <= 0) return "18 h passées";
    const minutes = Math.floor(delta / 60_000);
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return hours > 0 ? `${hours} h ${String(rest).padStart(2, "0")}` : `${rest} min`;
  }

  return (
    <div className="space-y-4">
      {test?.on ? (
        <div className="rounded-3xl bg-[#8f1d1d] px-4 py-3 text-white">
          <p className="font-display text-lg font-semibold tracking-wide">MODE TEST</p>
          <p className="text-sm text-white/90">
            Les messages partent seulement vers le numéro de test. Aucun client, aucun restaurant n’est contacté.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void post("/api/admin/restaurants/test", { action: "simuler" })}
              className="min-h-11 rounded-full bg-white px-4 text-sm font-semibold text-[#8f1d1d]"
            >
              Simuler 18 h
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void post("/api/admin/restaurants/test", { action: "supprimer" })}
              className="min-h-11 rounded-full border border-white px-4 text-sm font-semibold"
            >
              Supprimer les données de test
            </button>
          </div>
        </div>
      ) : null}
      {test?.allowed ? (
        <label className="inline-flex min-h-11 items-center gap-3 text-sm font-semibold text-[#0B192C]">
          <input
            type="checkbox"
            checked={Boolean(test.on)}
            onChange={(event) => void post("/api/admin/restaurants/test", { action: event.target.checked ? "activer" : "couper" })}
          />
          Mode test
        </label>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-3">
        {[
          ["À envoyer", banner.envoyer],
          ["À annuler", banner.annuler],
          ["Réponses", banner.reponses],
        ].map(([label, count]) => (
          <p key={String(label)} className="rounded-3xl bg-[#0B192C] px-4 py-3 text-white">
            <span className="block font-display text-2xl font-semibold">{count}</span>
            <span className="text-sm text-white/80">{label}</span>
          </p>
        ))}
      </div>
      {note ? <p className="text-sm font-semibold text-[#0B192C]">{note}</p> : null}
      {rows.length ? (
        <ul className="space-y-5">
          {rows.map((row) => {
            const key = `${row.bookingId}:${row.date}`;
            const pick = chosen[key] || { A: "", B: "" };
            return (
              <li key={key} id={row.bookingId} className="space-y-4 rounded-[28px] bg-[#faf9f6] p-3 sm:p-4">
                <div className="flex flex-wrap items-end justify-between gap-2 px-1">
                  <div>
                    <p className="font-display text-2xl font-semibold text-[#0B192C]">{row.client}</p>
                    <p className="text-sm text-muted">
                      {row.city || "Ville à confirmer"}
                      {row.hotel ? ` · ${row.hotel}` : ""} · {row.dateLabel}
                    </p>
                  </div>
                  <p className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-[#0B192C]">
                    {(() => {
                      const left = remain(row.closesAt, row.countdown);
                      return left === "18 h passées" || left === "Fuseau inconnu" ? left : `${left} avant 18 h`;
                    })()}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {row.faces.map((face) => (
                    <Face key={face.seat} face={face} />
                  ))}
                </div>
                {row.clicks.length ? (
                  <ul className="space-y-1 px-1 text-sm text-[#0B192C]">
                    {row.clicks.map((click) => (
                      <li key={`${click.at}-${click.label}`}>
                        {click.at} · {click.label}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {row.phase === "choisir" ? (
                  <div className="space-y-3">
                    {picking === key ? (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {row.suggestions.map((item) => {
                          const mark = pick.A === item.id ? "A" : pick.B === item.id ? "B" : "";
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() =>
                                setChosen({
                                  ...chosen,
                                  [key]: !pick.A || pick.A === item.id ? { ...pick, A: pick.A === item.id ? "" : item.id } : { ...pick, B: pick.B === item.id ? "" : item.id },
                                })
                              }
                              className="overflow-hidden rounded-2xl bg-white text-left"
                            >
                              <div className={`relative aspect-[4/3] ${item.photo ? "" : "bg-[#1a3348]"}`}>
                                {item.photo ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={item.photo} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                                ) : null}
                                {mark ? (
                                  <span className="absolute right-2 top-2 rounded-full bg-[#C5A880] px-2 py-1 text-xs font-semibold text-[#0B192C]">
                                    {mark}
                                  </span>
                                ) : null}
                              </div>
                              <p className="px-2 py-2 text-sm font-semibold text-[#0B192C]">{item.name}</p>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      disabled={busy || (picking === key && (!pick.A || !pick.B))}
                      onClick={() => {
                        if (picking !== key) {
                          setPicking(key);
                          return;
                        }
                        void post(`/api/admin/bookings/${row.bookingId}/restaurants`, {
                          action: "choisir",
                          date: row.date,
                          restaurantA: pick.A,
                          restaurantB: pick.B,
                          test: Boolean(test?.on),
                        });
                      }}
                      className="min-h-12 w-full rounded-full bg-[#0B192C] text-sm font-semibold text-white disabled:opacity-40"
                    >
                      Choisir 2 restaurants
                    </button>
                  </div>
                ) : null}
                {row.phase === "envoyer" ? (
                  <div className="space-y-3">
                    <div className="space-y-3 rounded-3xl bg-[#0B192C] p-3">
                      <p className="max-w-xl whitespace-pre-wrap rounded-2xl bg-[#f4efe4] px-3 py-3 text-sm text-[#0B192C]">{row.previewIntro}</p>
                      {row.previews.map((preview) => (
                        <div key={preview.seat} className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#C5A880]">
                            {preview.name} · {preview.time}
                          </p>
                          <p className="max-w-xl whitespace-pre-wrap rounded-2xl bg-[#f4efe4] px-3 py-3 text-sm text-[#0B192C]">{preview.intro}</p>
                          <div className="flex gap-2 overflow-x-auto pb-1">
                            {preview.cards.map((card) => (
                              <MiniCard key={`${preview.seat}-${card.kind}`} card={card} />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    {row.sendBlock ? <p className="text-sm font-semibold text-[#0B192C]">{row.sendBlock}</p> : null}
                    <button
                      type="button"
                      disabled={busy || Boolean(row.sendBlock) || row.delivery === "apercu"}
                      onClick={() =>
                        void post(`/api/admin/bookings/${row.bookingId}/restaurants`, {
                          action: "envoyer",
                          date: row.date,
                        })
                      }
                      className="min-h-12 w-full rounded-full bg-[#C5A880] text-sm font-semibold text-[#0B192C] disabled:opacity-40"
                    >
                      {row.delivery === "libre" ? "Envoyer en message libre" : row.delivery === "apercu" ? "Aperçu seul" : "Envoyer au client"}
                    </button>
                  </div>
                ) : null}
                {row.phase === "annuler"
                  ? row.faces
                      .filter((face) => face.status === "a_annuler" || face.status === "refusee")
                      .map((face) => (
                        <button
                          key={face.seat}
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void post(`/api/admin/bookings/${row.bookingId}/restaurants`, {
                              action: "annuler",
                              date: row.date,
                              seat: face.seat,
                            })
                          }
                          className="min-h-12 w-full rounded-full bg-[#c46a2d] text-sm font-semibold text-white"
                        >
                          J&apos;ai annulé auprès du restaurant · {face.name}
                        </button>
                      ))
                  : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-3xl bg-[#faf9f6] px-5 py-4 text-sm text-muted">Aucune soirée à traiter.</p>
      )}
    </div>
  );
}
