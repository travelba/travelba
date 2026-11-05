"use client";

import { useState } from "react";
import { HotelMap } from "@/components/account/HotelMap";
import type { ClientHotel, HotelPerks } from "@/lib/crm/hotel-search";

const perks: HotelPerks = {
  breakfast: false,
  freeCancellation: false,
  upgrade: false,
  credit: false,
  earlyCheckIn: false,
  lateCheckOut: false,
};

function hotel(name: string, lat: number, lng: number, cents: number): ClientHotel {
  return {
    offerId: null,
    hotelKey: `${name}|bordeaux`,
    name,
    city: "Bordeaux",
    room: null,
    photo: null,
    thumb: null,
    sellCents: cents,
    perNightCents: cents,
    currency: "EUR",
    nights: 1,
    benefits: [],
    perks,
    hotelId: null,
    description: "",
    images: [],
    coords: { lat, lng },
    footnotes: [],
    stars: null,
  };
}

const HOTELS: ClientHotel[] = [
  hotel("Quai des Chartrons", 44.853, -0.569, 21000),
  hotel("Les Carmes", 44.838, -0.571, 24000),
  hotel("Saint-Pierre", 44.84, -0.57, 18000),
  hotel("Chartrons", 44.855, -0.566, 19500),
  hotel("Bacalan", 44.862, -0.553, 16000),
];

/** Même carte que l’espace client. Fermé en production par le proxy. */
export function CarteApercu() {
  const [hidden, setHidden] = useState(false);
  return (
    <main className="hotel-theme min-h-screen bg-[#f4efe6] px-4 pt-4">
      <button type="button" data-carte-toggle="1" className="mb-3 text-sm font-semibold h-ink" onClick={() => setHidden((value) => !value)}>
        {hidden ? "Carte" : "Masquer"}
      </button>
      <div className={hidden ? "hidden" : undefined} data-carte-slot="1">
        <HotelMap hotels={HOTELS} />
      </div>
    </main>
  );
}
