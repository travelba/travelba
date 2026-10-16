"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CustomerPickDialog } from "@/components/admin/CustomerPickDialog";
import { BusyBar } from "@/components/crm/BusyBar";
import type { PickableCustomer } from "@/lib/crm/customer-search";

type Hit = { id: number; text: string; type: "hotel" | "location" | "inspiration"; location: string | null };
type Group = { id: number; name: string };
type Rate = {
  rate_index: string;
  title: string | null;
  total: string | null;
  currency: string | null;
  tax_included: boolean | null;
  cancellation_policy: string | null;
  payment_description: string | null;
  benefits: string[];
  benefits_footnotes: string[];
  stay_requirements: string[];
};
type Stay = {
  session_id: string | null;
  hotel_id: number | null;
  hotel_name: string | null;
  lowest_total: string | null;
  currency: string | null;
  widget_url: string | null;
  rooms: { name: string; description: string | null; rates: Rate[] }[];
};
type Day = { date: string; rate: string; currency: string | null; is_closed: boolean };
type FilterOption = { id: number; name: string };

const FILTER_LABELS: { key: string; label: string }[] = [
  { key: "activities", label: "Activités" },
  { key: "family_facilities", label: "Famille" },
  { key: "hotel_facilities", label: "Équipements" },
  { key: "property_types", label: "Type d’hôtel" },
  { key: "trip_types", label: "Type de voyage" },
  { key: "wellness", label: "Bien-être" },
];

type QuoteDraft = {
  hotelId: number | null;
  hotelName: string;
  city: string | null;
  roomName: string | null;
  benefits: string[];
  footnotes: string[];
  cancellation: string | null;
  payment: string | null;
  supplierCost: string | null;
  currency: string | null;
  sessionId: string | null;
  rateIndex: string | null;
  widgetUrl: string | null;
};

export function LittleEmperorsDesk({ customers }: { customers: PickableCustomer[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [groupQuery, setGroupQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupId, setGroupId] = useState<number | null>(null);
  const [filters, setFilters] = useState<Record<string, FilterOption[]>>({});
  const [filterIds, setFilterIds] = useState<Record<string, number | null>>({});
  const [picked, setPicked] = useState<Hit | null>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [adults, setAdults] = useState("2");
  const [children, setChildren] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [stays, setStays] = useState<Stay[]>([]);
  const [days, setDays] = useState<Day[]>([]);
  const [draft, setDraft] = useState<QuoteDraft | null>(null);
  const [customer, setCustomer] = useState<PickableCustomer | null>(null);
  const [picking, setPicking] = useState<"quote" | "book" | null>(null);
  const [dossierId, setDossierId] = useState<string | null>(null);
  const [loyalty, setLoyalty] = useState<"" | "bonvoy" | "all_accor">("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function post(body: Record<string, unknown>) {
    setError(null);
    const response = await fetch("/api/admin/little-emperors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(json.error || "Little Emperors n’a pas répondu.");
      return null;
    }
    return json;
  }

  async function search() {
    setBusy("search");
    setStays([]);
    setDays([]);
    setDraft(null);
    const json = await post({ action: "search", query });
    setBusy(null);
    if (json) setHits(json.hits || []);
  }

  async function loadFilters() {
    setBusy("filters");
    const json = await post({ action: "filters" });
    setBusy(null);
    if (json) setFilters(json.filters || {});
  }

  async function findGroups() {
    setBusy("groups");
    const json = await post({ action: "groups", query: groupQuery });
    setBusy(null);
    if (json) setGroups(json.groups || []);
  }

  function childAges() {
    return children
      .split(/[,\s]+/)
      .map((age) => Number(age))
      .filter((age) => Number.isInteger(age) && age >= 0 && age <= 17);
  }

  async function availability(hit = picked) {
    if (!hit) return;
    setBusy("availability");
    setDays([]);
    setDraft(null);
    const json = await post({
      action: "availability",
      start,
      end,
      adults: Number(adults),
      children_ages: childAges(),
      currency,
      hotel_id: hit.type === "hotel" ? hit.id : null,
      location_id: hit.type === "location" ? hit.id : null,
      inspiration_id: hit.type === "inspiration" ? hit.id : null,
      hotel_group_ids: groupId ? [groupId] : [],
      activities_ids: filterIds.activities ? [filterIds.activities] : [],
      family_facilities_ids: filterIds.family_facilities ? [filterIds.family_facilities] : [],
      hotel_facilities_ids: filterIds.hotel_facilities ? [filterIds.hotel_facilities] : [],
      property_types_ids: filterIds.property_types ? [filterIds.property_types] : [],
      trip_types_ids: filterIds.trip_types ? [filterIds.trip_types] : [],
      wellness_ids: filterIds.wellness ? [filterIds.wellness] : [],
    });
    setBusy(null);
    if (json) setStays(json.stays || []);
  }

  async function calendar() {
    if (!picked || picked.type !== "hotel") return;
    setBusy("calendar");
    const json = await post({ action: "calendar", hotel_id: picked.id, currency });
    setBusy(null);
    if (json) setDays(json.days || []);
  }

  async function saveQuote(chosen: PickableCustomer) {
    if (!draft) return;
    setBusy("quote");
    setPicking(null);
    setCustomer(chosen);
    const json = await post({
      action: "quote",
      customer_id: chosen.id,
      hotel_id: draft.hotelId,
      hotel_name: draft.hotelName,
      city: draft.city,
      start,
      end,
      room_name: draft.roomName,
      benefits: draft.benefits,
      footnotes: draft.footnotes,
      cancellation: draft.cancellation,
      payment: draft.payment,
      supplier_cost: draft.supplierCost,
      currency: draft.currency,
      adults: Number(adults),
    });
    setBusy(null);
    if (json?.bookingId) {
      setDossierId(json.bookingId);
      setNotice("Devis enregistré. Il reste caché, sans prix vendu.");
      router.refresh();
    }
  }

  const book = useCallback(
    async (chosen?: PickableCustomer | null) => {
      const guest = chosen === undefined ? customer : chosen;
      if (!draft?.sessionId || !draft.rateIndex || !guest) return;
      setBusy("book");
      setError(null);
      const response = await fetch("/api/admin/little-emperors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "book",
          customer_id: guest.id,
          booking_id: dossierId,
          hotel_id: draft.hotelId,
          start,
          end,
          session_id: draft.sessionId,
          rate_index: draft.rateIndex,
          adults: Number(adults),
          children_ages: children
            .split(/[,\s]+/)
            .map((age) => Number(age))
            .filter((age) => Number.isInteger(age) && age >= 0 && age <= 17),
          loyalty_program: loyalty || null,
        }),
      });
      const json = await response.json().catch(() => ({}));
      setBusy(null);
      if (!response.ok) {
        setError(json.error || "Little Emperors n’a pas répondu.");
        return;
      }
      if (json?.bookingId) router.push(`/admin/reservations/${json.bookingId}`);
      else setNotice("Réservation envoyée à Little Emperors.");
    },
    [adults, children, customer, dossierId, draft, end, loyalty, router, start]
  );

  useEffect(() => {
    if (!draft?.widgetUrl) return;
    let origin = "";
    try {
      origin = new URL(draft.widgetUrl).origin;
    } catch {
      return;
    }
    function onMessage(event: MessageEvent) {
      if (event.origin !== origin) return;
      const data = event.data;
      if (!data || typeof data !== "object") return;
      const payload = data as { success?: unknown; errorMessage?: unknown };
      if (payload.success) {
        void book();
        return;
      }
      if (typeof payload.errorMessage === "string" && payload.errorMessage.trim()) {
        setError(payload.errorMessage.trim().slice(0, 240));
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [book, draft?.widgetUrl]);

  return (
    <section className="rounded-2xl border border-[#e5e3dc] bg-white p-4">
      {busy ? <BusyBar label="Little Emperors" /> : null}
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">Recherche</p>
      <h2 className="mt-1 font-display text-lg font-bold text-[var(--admin-navy)]">Disponibilités</h2>
      <p className="mt-2 text-sm text-muted">
        Le coût affiché est celui de Little Emperors. Il n’est pas le prix vendu. Rien n’est publié au client.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Hôtel, ville ou inspiration"
          className="min-w-[16rem] flex-1 rounded-md border border-[#e5e3dc] px-3 py-2 text-sm"
        />
        <button type="button" onClick={search} disabled={Boolean(busy)} className="admin-af-btn-accent rounded-md px-3 py-2 text-sm">
          Chercher
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          value={groupQuery}
          onChange={(event) => setGroupQuery(event.target.value)}
          placeholder="Enseigne"
          className="min-w-[12rem] rounded-md border border-[#e5e3dc] px-3 py-2 text-sm"
        />
        <button type="button" onClick={findGroups} disabled={Boolean(busy)} className="rounded-md border border-[#e5e3dc] px-3 py-2 text-sm">
          Enseignes
        </button>
        <button type="button" onClick={loadFilters} disabled={Boolean(busy)} className="rounded-md border border-[#e5e3dc] px-3 py-2 text-sm">
          Filtres
        </button>
        {groups.map((group) => (
          <button
            key={group.id}
            type="button"
            onClick={() => setGroupId(group.id === groupId ? null : group.id)}
            className={`rounded-full border px-3 py-1 text-xs ${group.id === groupId ? "border-[var(--admin-navy)] font-semibold" : "border-[#e5e3dc]"}`}
          >
            {group.name}
          </button>
        ))}
      </div>
      {hits.length ? (
        <ul className="mt-3 space-y-1">
          {hits.map((hit) => (
            <li key={`${hit.type}-${hit.id}`}>
              <button
                type="button"
                onClick={() => {
                  setPicked(hit);
                  setStays([]);
                  setDays([]);
                  setDraft(null);
                }}
                className={`w-full rounded-md px-2 py-1 text-left text-sm ${picked?.id === hit.id && picked.type === hit.type ? "bg-[#f8f4ee] font-semibold" : ""}`}
              >
                {hit.text}
                {hit.location ? ` · ${hit.location}` : ""} · {hit.type === "hotel" ? "hôtel" : hit.type === "location" ? "lieu" : "inspiration"}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {FILTER_LABELS.some((row) => filters[row.key]?.length) ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {FILTER_LABELS.filter((row) => filters[row.key]?.length).map((row) => (
            <label key={row.key} className="text-xs text-muted">
              {row.label}
              <select
                value={filterIds[row.key] || ""}
                onChange={(event) =>
                  setFilterIds((current) => ({
                    ...current,
                    [row.key]: event.target.value ? Number(event.target.value) : null,
                  }))
                }
                className="mt-1 block w-full rounded-md border border-[#e5e3dc] px-2 py-2 text-sm text-[var(--admin-navy)]"
              >
                <option value="">Tous</option>
                {filters[row.key].slice(0, 40).map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      ) : null}
      {picked ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          <input type="date" value={start} onChange={(event) => setStart(event.target.value)} className="rounded-md border border-[#e5e3dc] px-3 py-2 text-sm" />
          <input type="date" value={end} onChange={(event) => setEnd(event.target.value)} className="rounded-md border border-[#e5e3dc] px-3 py-2 text-sm" />
          <input value={adults} onChange={(event) => setAdults(event.target.value)} inputMode="numeric" aria-label="Adultes" className="rounded-md border border-[#e5e3dc] px-3 py-2 text-sm" />
          <input value={children} onChange={(event) => setChildren(event.target.value)} placeholder="Âges enfants" className="rounded-md border border-[#e5e3dc] px-3 py-2 text-sm" />
          <select value={currency} onChange={(event) => setCurrency(event.target.value)} className="rounded-md border border-[#e5e3dc] px-3 py-2 text-sm">
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
            <option value="USD">USD</option>
          </select>
          <button type="button" onClick={() => availability()} disabled={Boolean(busy)} className="admin-af-btn-accent rounded-md px-3 py-2 text-sm">
            Disponibilités
          </button>
          {picked.type === "hotel" ? (
            <button type="button" onClick={calendar} disabled={Boolean(busy)} className="rounded-md border border-[#e5e3dc] px-3 py-2 text-sm">
              Calendrier
            </button>
          ) : null}
        </div>
      ) : null}
      {days.length ? (
        <ul className="mt-3 grid max-h-40 grid-cols-2 gap-1 overflow-auto text-xs sm:grid-cols-4">
          {days.slice(0, 40).map((day) => (
            <li key={day.date} className="text-muted">
              {day.date} · {day.rate}
              {day.currency ? ` ${day.currency}` : ""}
              {day.is_closed ? " · fermé" : ""}
            </li>
          ))}
        </ul>
      ) : null}
      <ul className="mt-4 space-y-3">
        {stays.map((stay) => (
          <li key={`${stay.hotel_id}-${stay.hotel_name}`} className="rounded-xl border border-[#e5e3dc] p-3">
            <p className="font-semibold text-[var(--admin-navy)]">{stay.hotel_name || "Hôtel"}</p>
            {stay.lowest_total && !stay.rooms.length ? (
              <p className="text-sm text-muted">
                À partir de {stay.lowest_total}
                {stay.currency ? ` ${stay.currency}` : ""} · coût Little Emperors
              </p>
            ) : null}
            {!stay.session_id && stay.hotel_id ? (
              <button
                type="button"
                className="mt-2 text-sm font-semibold underline"
                onClick={() => {
                  const hit: Hit = { id: stay.hotel_id as number, text: stay.hotel_name || "Hôtel", type: "hotel", location: null };
                  setPicked(hit);
                  void availability(hit);
                }}
              >
                Voir les chambres
              </button>
            ) : null}
            {stay.rooms.map((room) => (
              <div key={room.name} className="mt-3">
                <p className="text-sm font-semibold">{room.name}</p>
                {room.description ? <p className="text-sm text-muted">{room.description}</p> : null}
                {room.rates.map((rate) => (
                  <div key={rate.rate_index} className="mt-2 rounded-lg bg-[#f8f4ee] p-2 text-sm">
                    <p className="font-medium">{rate.title || "Tarif"}</p>
                    {rate.total ? (
                      <p>
                        {rate.total}
                        {rate.currency ? ` ${rate.currency}` : ""} · coût Little Emperors
                        {rate.tax_included === false ? " · taxes en plus" : ""}
                      </p>
                    ) : null}
                    {rate.benefits.map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                    {rate.benefits_footnotes.map((line) => (
                      <p key={line} className="text-xs text-muted">
                        {line}
                      </p>
                    ))}
                    {rate.cancellation_policy ? <p className="text-muted">{rate.cancellation_policy}</p> : null}
                    {rate.payment_description ? <p className="text-muted">{rate.payment_description}</p> : null}
                    {rate.stay_requirements.map((line) => (
                      <p key={line} className="text-xs text-muted">
                        {line}
                      </p>
                    ))}
                    <button
                      type="button"
                      className="mt-2 rounded-md border border-[var(--admin-navy)] px-3 py-1 text-sm font-semibold"
                      onClick={() => {
                        setDraft({
                          hotelId: stay.hotel_id,
                          hotelName: stay.hotel_name || room.name,
                          city: picked?.location || null,
                          roomName: room.name,
                          benefits: rate.benefits,
                          footnotes: rate.benefits_footnotes,
                          cancellation: rate.cancellation_policy,
                          payment: rate.payment_description,
                          supplierCost: rate.total,
                          currency: rate.currency,
                          sessionId: stay.session_id,
                          rateIndex: rate.rate_index,
                          widgetUrl: stay.widget_url,
                        });
                        setPicking("quote");
                      }}
                    >
                      Enregistrer le devis
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </li>
        ))}
      </ul>
      {draft && customer ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm">
            {draft.hotelName}
            {draft.roomName ? ` · ${draft.roomName}` : ""} · {customer.first_name} {customer.last_name}
          </p>
          <label className="block text-sm">
            Numéro déjà sur la fiche
            <select value={loyalty} onChange={(event) => setLoyalty(event.target.value as "" | "bonvoy" | "all_accor")} className="mt-1 block rounded-md border border-[#e5e3dc] px-3 py-2">
              <option value="">Aucun</option>
              <option value="bonvoy">Marriott Bonvoy</option>
              <option value="all_accor">ALL Accor</option>
            </select>
          </label>
          {draft.widgetUrl ? (
            <>
              <p className="text-sm text-muted">La carte est saisie chez Little Emperors. Travelba ne la garde pas.</p>
              <iframe title="Carte Little Emperors" src={draft.widgetUrl} className="h-[450px] w-full rounded-xl border border-[#e5e3dc]" />
            </>
          ) : (
            <p className="text-sm text-muted">Ce résultat n’a pas de session de réservation. Ouvrez un hôtel précis.</p>
          )}
        </div>
      ) : null}
      {error ? <p className="mt-3 text-sm text-[#8a5a2a]">{error}</p> : null}
      {notice ? <p className="mt-3 text-sm text-[var(--admin-navy)]">{notice}</p> : null}
      <CustomerPickDialog
        open={picking === "quote"}
        customers={customers}
        title="Client du devis"
        onClose={() => setPicking(null)}
        onSelect={(chosen) => {
          void saveQuote(chosen);
        }}
      />
    </section>
  );
}
