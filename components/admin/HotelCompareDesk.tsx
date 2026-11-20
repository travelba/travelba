"use client";

import { useState, type FormEvent } from "react";
import { ProviderRates } from "@/components/hotel/ProviderRates";
import { HotelBenefits } from "@/components/crm/HotelBenefits";
import { addIsoDays, parisTodayIso } from "@/lib/crm/dates";
import type { ClientCompareRate } from "@/lib/crm/hotel-search";
import { formatMoney } from "@/lib/crm/money";

type DeskRate = ClientCompareRate & { provider?: string; bookable?: boolean };

type DeskHotel = {
  hotelKey: string;
  name: string;
  city: string;
  photo: string | null;
  stars: number | null;
  sellCents: number;
  currency: string;
  benefits: string[];
  compares: DeskRate[];
};

type Review = { leName: string; expediaName: string; city: string; confidence: number };

type Source = { provider: string; ok: boolean; message?: string };

export function HotelCompareDesk({ expediaEnabled }: { expediaEnabled: boolean }) {
  const today = parisTodayIso();
  const [destination, setDestination] = useState("");
  const [checkIn, setCheckIn] = useState(() => addIsoDays(today, 21));
  const [checkOut, setCheckOut] = useState(() => addIsoDays(today, 24));
  const [adults, setAdults] = useState(2);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [hotels, setHotels] = useState<DeskHotel[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [sources, setSources] = useState<Source[]>([]);

  async function onSearch(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNote("");
    setHotels([]);
    setReviews([]);
    try {
      const response = await fetch("/api/admin/hotels/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          destination,
          city: destination,
          checkIn,
          checkOut,
          rooms: [{ adults, children: [] }],
          screen: window.matchMedia("(max-width: 767px)").matches ? "mobile" : "desktop",
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        hotels?: DeskHotel[];
        reviews?: Review[];
        sources?: Source[];
      } | null;
      if (!response.ok) {
        setNote(payload?.error || "La recherche n’a pas abouti.");
        return;
      }
      setHotels(payload?.hotels || []);
      setReviews(payload?.reviews || []);
      setSources(payload?.sources || []);
      if (!(payload?.hotels || []).length) setNote("Aucun hôtel pour ces dates.");
    } catch {
      setNote("La recherche n’a pas abouti.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onSearch} className="grid gap-3 rounded-2xl border border-[#e5e3dc] bg-white p-4 sm:grid-cols-2 lg:grid-cols-5">
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8c7352]">Destination</span>
          <input
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            required
            minLength={2}
            className="h-11 w-full rounded-xl border border-[#e5e3dc] px-3 text-[#0B192C]"
            placeholder="Paris"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8c7352]">Arrivée</span>
          <input type="date" value={checkIn} onChange={(event) => setCheckIn(event.target.value)} required className="h-11 w-full rounded-xl border border-[#e5e3dc] px-3" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8c7352]">Départ</span>
          <input type="date" value={checkOut} onChange={(event) => setCheckOut(event.target.value)} required className="h-11 w-full rounded-xl border border-[#e5e3dc] px-3" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8c7352]">Adultes</span>
          <input
            type="number"
            min={1}
            max={6}
            value={adults}
            onChange={(event) => setAdults(Number(event.target.value))}
            className="h-11 w-full rounded-xl border border-[#e5e3dc] px-3"
          />
        </label>
        <div className="sm:col-span-2 lg:col-span-5">
          <button
            type="submit"
            disabled={busy}
            className="h-11 rounded-full bg-[#0B192C] px-5 text-sm font-semibold text-[#C5A880] disabled:opacity-60"
          >
            {busy ? "Recherche…" : "Rechercher"}
          </button>
          <p className="mt-2 text-sm text-[#5c5348]">
            {expediaEnabled
              ? "Little Emperors et Expedia sont interrogés. Deux offres du même hôtel s’affichent côte à côte. Expedia ne se réserve pas."
              : "Expedia est désactivé. La recherche interroge Little Emperors."}
          </p>
        </div>
      </form>
      {note ? <p className="text-sm text-[#0B192C]">{note}</p> : null}
      {sources.length ? (
        <ul className="flex flex-wrap gap-2 text-xs text-[#5c5348]">
          {sources.map((source) => (
            <li key={source.provider} className="rounded-full bg-[#f4efe6] px-3 py-1">
              {source.provider === "expedia" ? "Expedia" : "Little Emperors"}
              {source.ok ? "" : source.message ? ` · ${source.message}` : " · indisponible"}
            </li>
          ))}
        </ul>
      ) : null}
      {reviews.length ? (
        <section className="rounded-2xl border border-[#e7c98a] bg-[#fbf6ee] p-4">
          <h2 className="text-sm font-semibold text-[#0B192C]">Correspondances à vérifier</h2>
          <ul className="mt-2 space-y-1 text-sm text-[#3d3428]">
            {reviews.map((review) => (
              <li key={`${review.leName}-${review.expediaName}`}>
                {review.leName} et {review.expediaName}
                {review.city ? ` · ${review.city}` : ""} · score {review.confidence}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <ul className="space-y-4">
        {hotels.map((hotel) => (
          <li key={hotel.hotelKey} className="overflow-hidden rounded-2xl border border-[#e5e3dc] bg-white">
            <div className="flex gap-3 p-4">
              {hotel.photo ? (
                // eslint-disable-next-line @next/next/no-img-element -- photo fournisseur https, hors next/image
                <img src={hotel.photo} alt="" referrerPolicy="no-referrer" className="h-20 w-24 shrink-0 rounded-xl object-cover" />
              ) : (
                <div className="h-20 w-24 shrink-0 rounded-xl bg-[#0B192C]" />
              )}
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-[#0B192C]">{hotel.name}</h2>
                <p className="text-sm text-[#5c5348]">
                  {hotel.city}
                  {hotel.stars ? ` · ${hotel.stars} étoiles` : ""}
                </p>
                {hotel.compares.length < 2 ? (
                  <p className="mt-1 text-sm font-medium text-[#0B192C]">{formatMoney(hotel.sellCents / 100, hotel.currency)} TTC</p>
                ) : null}
              </div>
            </div>
            <ProviderRates rates={hotel.compares} />
            {hotel.benefits.length ? (
              <div className="px-4 pb-4">
                <HotelBenefits lines={hotel.benefits} />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
