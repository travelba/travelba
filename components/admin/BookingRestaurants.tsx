"use client";

import { useEffect, useState } from "react";
import { BusyBar } from "@/components/crm/BusyBar";
import type { EveningAlert, RestaurantChoice, TableStatus } from "@/lib/crm/restaurants";

type Suggestion = {
  id: string;
  name: string;
  categories: string[];
  distanceKm: number | null;
  featured: boolean;
  blocked: string | null;
};

type TableView = {
  id: string | null;
  seat: "A" | "B";
  restaurantId: string | null;
  time: string | null;
  covers: number;
  confirmation: string | null;
  account: string;
  cardLast4: string | null;
  status: TableStatus;
  statusLabel: string;
  cancelFeeCents: number | null;
  cancelledAt: string | null;
  restaurantClosed: boolean;
};

type Evening = {
  date: string;
  label: string;
  hotelName: string;
  city: string;
  timezone: string | null;
  choice: RestaurantChoice | null;
  choiceSource: "whatsapp" | "manuel" | null;
  messageStatus: string;
  messageSentAt: string | null;
  closed: boolean;
  tables: TableView[];
  suggestions: Suggestion[];
  alerts: EveningAlert[];
};

type Desk = {
  ready: boolean;
  message?: string;
  timezone: string | null;
  timezoneSource: string | null;
  coversDefault: number;
  hasPhone: boolean;
  hotels: { name: string; city: string }[];
  evenings: Evening[];
  messages: { id: string; eveningDate: string; direction: string; body: string; status: string; createdAt: string }[];
};

const ALERTS: Record<string, string> = {
  echec: "Échec de réservation",
  ferme: "Restaurant fermé ce jour-là",
  sans_whatsapp: "Client sans numéro WhatsApp",
  a_annuler: "Annulation non traitée après 18 h 30",
  fuseau: "Fuseau inconnu",
};

const MESSAGE: Record<string, string> = {
  aucun: "Message pas encore envoyé",
  en_file: "En file — le pré-message ou une fiche attend encore",
  envoye: "Sélection envoyée",
  echec: "Échec d’envoi",
};

const inputClass = "min-h-11 w-full rounded-xl border border-[#d9d1c3] bg-white px-3 text-sm text-[#0B192C]";

function distanceLabel(km: number | null) {
  if (km == null) return "";
  if (km < 1) return `${Math.max(1, Math.round(km * 1000))} m`;
  return `${km.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km`;
}

export function BookingRestaurants({ bookingId }: { bookingId: string }) {
  const [desk, setDesk] = useState<Desk | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [zone, setZone] = useState("");

  async function reload() {
    const response = await fetch(`/api/admin/bookings/${bookingId}/restaurants`);
    const json = (await response.json()) as Desk;
    setDesk(json);
    setZone(json.timezone || "");
    if (!json.ready) setError(json.message || "Lecture impossible.");
    else setError("");
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/admin/bookings/${bookingId}/restaurants`);
        const json = (await response.json()) as Desk;
        if (cancelled) return;
        setDesk(json);
        setZone(json.timezone || "");
        if (!json.ready) setError(json.message || "Lecture impossible.");
      } catch {
        if (!cancelled) setError("Lecture impossible.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/bookings/${bookingId}/restaurants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(json?.error || "Enregistrement impossible.");
        return;
      }
      await reload();
    } catch {
      setError("Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  if (!desk) {
    return <p className="rounded-3xl bg-[#faf9f6] px-5 py-4 text-sm text-muted">Chargement des restaurants…</p>;
  }
  if (!desk.ready) {
    return <p className="rounded-3xl bg-[#faf9f6] px-5 py-4 text-sm text-[#0B192C]">{error || desk.message}</p>;
  }

  return (
    <div className="space-y-4">
      <BusyBar active={busy} label="Enregistrement…" />
      <section className="admin-af-card space-y-3 rounded-3xl p-4 sm:p-5">
        <p className="text-sm text-[#0B192C]">
          {desk.hotels.length
            ? desk.hotels.map((hotel) => [hotel.name, hotel.city].filter(Boolean).join(", ")).join(" · ")
            : "Aucun hôtel sur le dossier."}
        </p>
        <p className="text-sm text-muted">
          À 16 h, heure locale, un mot part d’abord, puis une fiche par restaurant. Les couverts sont fixés à 2. À 18 h,
          la table non choisie passe à annuler. Accepter l’une passe l’autre à annuler tout de suite.
          {desk.hasPhone ? "" : " Ce client n’a pas de numéro WhatsApp."}
        </p>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            void post({ action: "fuseau", timezone: zone });
          }}
        >
          <label className="min-w-0 flex-1 text-sm text-[#0B192C]">
            Fuseau
            <input
              className={`${inputClass} mt-1`}
              value={zone}
              onChange={(event) => setZone(event.target.value)}
              placeholder="Europe/Paris"
              autoCapitalize="off"
              spellCheck={false}
            />
          </label>
          <button type="submit" className="admin-tap mt-auto min-h-11 rounded-full bg-[#0B192C] px-4 text-sm font-semibold text-white">
            Enregistrer le fuseau
          </button>
        </form>
        {desk.timezoneSource === "ville" || desk.timezoneSource === "hotel" ? (
          <p className="text-sm text-muted">Sans fuseau enregistré, il est déduit de la ville de l’hôtel.</p>
        ) : null}
      </section>
      {error ? <p className="text-sm font-semibold text-[#0B192C]">{error}</p> : null}
      {desk.evenings.length ? (
        desk.evenings.map((evening) => (
          <EveningCard key={evening.date} evening={evening} busy={busy} onPost={post} />
        ))
      ) : (
        <p className="rounded-3xl bg-[#faf9f6] px-5 py-4 text-sm text-muted">Aucune nuit sur ce dossier.</p>
      )}
      <section className="admin-af-card space-y-2 rounded-3xl p-4 sm:p-5">
        <h2 className="font-display text-lg font-semibold text-[#0B192C]">Messages</h2>
        {desk.messages.length ? (
          <ul className="space-y-2">
            {desk.messages.map((message) => (
              <li key={message.id} className="rounded-2xl bg-[#faf9f6] px-3 py-2 text-sm text-[#0B192C]">
                <span className="font-semibold">{message.direction === "inbound" ? "Client" : "Agence"}</span>
                <span className="text-muted"> · {message.eveningDate}</span>
                <p className="mt-1 whitespace-pre-wrap">{message.body}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Aucun message pour ces soirs.</p>
        )}
      </section>
    </div>
  );
}

function EveningCard({
  evening,
  busy,
  onPost,
}: {
  evening: Evening;
  busy: boolean;
  onPost: (body: Record<string, unknown>) => Promise<void>;
}) {
  const featured = evening.suggestions.filter((row) => row.featured && !row.blocked).slice(0, 8);
  return (
    <section className="admin-af-card space-y-4 rounded-3xl p-4 sm:p-5">
      <div>
        <h2 className="font-display text-lg font-semibold capitalize text-[#0B192C]">{evening.label}</h2>
        <p className="text-sm text-muted">
          {[evening.hotelName, evening.city, evening.timezone].filter(Boolean).join(" · ") || "Ville à confirmer"}
        </p>
        <p className="text-sm text-[#0B192C]">{MESSAGE[evening.messageStatus] || evening.messageStatus}</p>
        {evening.choice ? (
          <p className="text-sm font-semibold text-[#0B192C]">
            Choix {evening.choice === "aucune" ? "Aucune" : evening.choice}
            {evening.choiceSource === "manuel" ? " · saisi à la main" : evening.choiceSource === "whatsapp" ? " · WhatsApp" : ""}
          </p>
        ) : null}
      </div>
      {evening.alerts.length ? (
        <ul className="flex flex-wrap gap-2">
          {evening.alerts.map((alert) => (
            <li key={alert} className="rounded-full bg-[var(--admin-peach)] px-3 py-1 text-sm font-semibold text-[#0B192C]">
              {ALERTS[alert] || alert}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="grid grid-cols-3 gap-2">
        {(["A", "B", "aucune"] as const).map((choice) => (
          <button
            key={choice}
            type="button"
            disabled={busy}
            onClick={() => void onPost({ action: "choix", date: evening.date, choice })}
            className={`min-h-11 rounded-full text-sm font-semibold ${
              evening.choice === choice ? "bg-[#0B192C] text-white" : "border border-[#d9d1c3] bg-white text-[#0B192C]"
            }`}
          >
            {choice === "aucune" ? "Aucune" : choice}
          </button>
        ))}
      </div>
      {featured.length ? (
        <p className="text-sm text-muted">
          Mis en avant : {featured.map((row) => `${row.name}${distanceLabel(row.distanceKm) ? ` (${distanceLabel(row.distanceKm)})` : ""}`).join(", ")}
        </p>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {evening.tables.map((table) => (
          <TableForm
            key={`${table.seat}-${table.restaurantId || ""}-${table.status}-${table.confirmation || ""}-${table.cancelledAt || ""}`}
            evening={evening}
            table={table}
            busy={busy}
            onPost={onPost}
          />
        ))}
      </div>
    </section>
  );
}

function draftFrom(table: TableView) {
  return {
    restaurantId: table.restaurantId || "",
    time: table.time || "20:00",
    confirmation: table.confirmation || "",
    account: table.account || "concierge@travelba.fr",
    cardLast4: table.cardLast4 || "",
    status: table.status,
    frais: table.cancelFeeCents != null ? String(table.cancelFeeCents / 100) : "",
  };
}

function TableForm({
  evening,
  table,
  busy,
  onPost,
}: {
  evening: Evening;
  table: TableView;
  busy: boolean;
  onPost: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [draft, setDraft] = useState(() => draftFrom(table));

  return (
    <form
      className="space-y-3 rounded-2xl border border-[#d9d1c3] p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void onPost({
          action: "table",
          date: evening.date,
          seat: table.seat,
          restaurantId: draft.restaurantId,
          time: draft.time,
          covers: 2,
          confirmation: draft.confirmation,
          account: draft.account,
          cardLast4: draft.cardLast4,
          status: draft.status,
        });
      }}
    >
      <p className="font-display text-base font-semibold text-[#0B192C]">Table {table.seat}</p>
      <label className="block text-sm text-[#0B192C]">
        Restaurant
        <select
          className={`${inputClass} mt-1`}
          value={draft.restaurantId}
          onChange={(event) => setDraft({ ...draft, restaurantId: event.target.value })}
        >
          <option value="">Choisir</option>
          {evening.suggestions.map((row) => (
            <option key={row.id} value={row.id} disabled={Boolean(row.blocked)}>
              {row.name}
              {distanceLabel(row.distanceKm) ? ` · ${distanceLabel(row.distanceKm)}` : ""}
              {row.blocked ? ` · ${row.blocked}` : row.featured ? " · mis en avant" : ""}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm text-[#0B192C]">
          Heure
          <input className={`${inputClass} mt-1`} type="time" value={draft.time} onChange={(event) => setDraft({ ...draft, time: event.target.value })} />
        </label>
        <p className="text-sm text-[#0B192C]">
          Couverts
          <span className={`${inputClass} mt-1 flex items-center`}>2</span>
        </p>
      </div>
      <label className="block text-sm text-[#0B192C]">
        Confirmation
        <input className={`${inputClass} mt-1`} value={draft.confirmation} onChange={(event) => setDraft({ ...draft, confirmation: event.target.value })} />
      </label>
      <label className="block text-sm text-[#0B192C]">
        Compte
        <input className={`${inputClass} mt-1`} value={draft.account} onChange={(event) => setDraft({ ...draft, account: event.target.value })} autoCapitalize="off" />
      </label>
      <label className="block text-sm text-[#0B192C]">
        Garantie, 4 chiffres
        <input
          className={`${inputClass} mt-1`}
          inputMode="numeric"
          maxLength={4}
          autoComplete="off"
          value={draft.cardLast4}
          onChange={(event) => setDraft({ ...draft, cardLast4: event.target.value.replace(/\D/g, "").slice(0, 4) })}
        />
      </label>
      <label className="block text-sm text-[#0B192C]">
        Statut
        <select className={`${inputClass} mt-1`} value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as TableStatus })}>
          <option value="a_reserver">À réserver</option>
          <option value="reservee">Réservée</option>
          <option value="proposee">Proposée</option>
          <option value="choisie">Choisie</option>
          <option value="a_annuler">À annuler</option>
          <option value="annulee">Annulée</option>
          <option value="echec">Échec</option>
        </select>
      </label>
      {table.restaurantClosed ? <p className="text-sm font-semibold text-[#0B192C]">Fermé ce jour-là.</p> : null}
      {table.cancelledAt ? <p className="text-sm text-muted">Annulée. Frais {draft.frais ? `${draft.frais} €` : "non indiqués"}.</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className="admin-tap min-h-11 rounded-full bg-[#0B192C] px-4 text-sm font-semibold text-white disabled:opacity-50">
          Enregistrer
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onPost({ action: "annuler", date: evening.date, seat: table.seat, frais: draft.frais })}
          className="admin-tap min-h-11 rounded-full border border-[#0B192C] px-4 text-sm font-semibold text-[#0B192C] disabled:opacity-50"
        >
          Annuler la table
        </button>
      </div>
    </form>
  );
}
