"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/crm/icons";
import { guestNameOk, type ClientHotelFile, type ClientRate, type ClientRoom } from "@/lib/crm/hotel-journey";
import type { ClientHotel, HotelPerks, HotelRoomOccupancy } from "@/lib/crm/hotel-search";
import { formatMoney } from "@/lib/crm/money";
import { siteConfig } from "@/lib/site";

type Step = "hotel" | "room" | "guests" | "confirm";

const PERK_LABEL: { key: keyof HotelPerks; label: string }[] = [
  { key: "breakfast", label: "Petit-déjeuner" },
  { key: "freeCancellation", label: "Annulation gratuite" },
  { key: "upgrade", label: "Surclassement" },
  { key: "credit", label: "Crédit hôtel" },
  { key: "earlyCheckIn", label: "Arrivée anticipée" },
  { key: "lateCheckOut", label: "Départ tardif" },
];

function euros(cents: number, currency: string) {
  return formatMoney(cents / 100, currency);
}

function Photo({ src, alt, eager }: { src: string; alt: string; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <div className="h-skel grid h-full w-full place-items-center"><Icon name="hotel" className="h-8 w-8 h-gold" /></div>;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- photo fournisseur https, hors next/image
    <img
      src={src}
      alt={alt}
      width={900}
      height={600}
      className="h-full w-full object-cover"
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={eager ? "high" : "auto"}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

function Checks({ lines }: { lines: string[] }) {
  if (!lines.length) return null;
  return (
    <ul className="space-y-2">
      {lines.map((line) => (
        <li key={line} className="flex gap-2 text-sm h-ink">
          <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 h-gold" />
          <span>{line}</span>
        </li>
      ))}
    </ul>
  );
}

function fileFromCard(hotel: ClientHotel): ClientHotelFile {
  const images = hotel.images.length ? hotel.images : hotel.photo ? [hotel.photo] : [];
  const rate: ClientRate = {
    offerId: hotel.offerId,
    room: hotel.room || "Séjour",
    title: "Tarif du séjour",
    detail: "",
    cancellation: "",
    benefits: hotel.benefits,
    footnotes: hotel.footnotes,
    perks: hotel.perks,
    sellCents: hotel.sellCents,
    perNightCents: hotel.perNightCents,
    currency: hotel.currency,
    images,
  };
  return {
    name: hotel.name,
    city: hotel.city,
    address: "",
    description: hotel.description,
    funFact: "",
    images,
    amenities: [],
    sections: [],
    benefits: hotel.benefits,
    footnotes: hotel.footnotes,
    checkInTime: "",
    checkOutTime: "",
    coords: hotel.coords,
    rooms: [{ name: rate.room, detail: "", images, rates: [rate] }],
  };
}

export function HotelJourney({
  hotel,
  stayRooms,
  datesLabel,
  party,
  query,
  onBack,
}: {
  hotel: ClientHotel;
  stayRooms: HotelRoomOccupancy[];
  datesLabel: string;
  party: string;
  query: { destination: string; city: string; checkIn: string; checkOut: string; rooms: HotelRoomOccupancy[] };
  onBack: () => void;
}) {
  const [step, setStep] = useState<Step>("hotel");
  const [file, setFile] = useState<ClientHotelFile | null>(hotel.hotelId ? null : fileFromCard(hotel));
  const [note, setNote] = useState("");
  const [photoAt, setPhotoAt] = useState(0);
  const [room, setRoom] = useState<ClientRoom | null>(null);
  const [rate, setRate] = useState<ClientRate | null>(null);
  const [names, setNames] = useState<string[]>(() => stayRooms.map(() => ""));
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState("");

  useEffect(() => {
    if (!hotel.hotelId) return;
    const controller = new AbortController();
    void fetch("/api/client/hotels/fiche", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...query, hotelId: hotel.hotelId, destination: hotel.name || query.destination }),
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((json: { file?: ClientHotelFile } | null) => {
        if (json?.file) setFile(json.file);
        else setFile(fileFromCard(hotel));
      })
      .catch(() => {
        if (!controller.signal.aborted) setFile(fileFromCard(hotel));
      });
    return () => controller.abort();
  }, [hotel, query]);

  const images = file?.images.length ? file.images : hotel.photo ? [hotel.photo] : [];
  const shown = images[Math.min(photoAt, Math.max(images.length - 1, 0))];
  const whatsapp = `https://wa.me/${siteConfig.whatsappNumber}`;

  function chooseRoom(next: ClientRoom) {
    setRoom(next);
    setRate(next.rates.length === 1 ? next.rates[0] : null);
    setPhotoAt(0);
    setStep("room");
  }

  function chooseRate(next: ClientRate) {
    if (!next.offerId) return;
    setRate(next);
    setNames(stayRooms.map(() => ""));
    setNote("");
    setStep("guests");
  }

  async function send() {
    if (!rate?.offerId) return;
    if (names.some((name) => !guestNameOk(name))) {
      setNote("Indiquez le prénom et le nom de chaque chambre.");
      return;
    }
    setSending(true);
    setNote("");
    try {
      const response = await fetch("/api/client/hotels/demandes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ offerId: rate.offerId, guests: names }),
      });
      const json = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!response.ok) {
        setNote(json?.error || "La demande n’a pas pu être envoyée.");
        return;
      }
      setDone(json?.message || "Demande envoyée. L’agence la valide avant tout paiement.");
      setStep("confirm");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="h-bg -mx-4 min-h-[calc(100dvh-4rem)]">
      <header className="h-header sticky top-16 z-30 flex items-center gap-3 px-4 py-3">
        <button type="button" aria-label="Retour" onClick={() => (step === "hotel" ? onBack() : setStep(step === "confirm" ? "hotel" : step === "guests" ? "room" : "hotel"))} className="grid h-10 w-10 place-items-center">
          <Icon name="chevron_left" className="h-5 w-5" />
        </button>
        <p className="text-sm font-semibold tracking-wide">{step === "room" ? "La chambre" : step === "guests" ? "Voyageurs" : step === "confirm" ? "Demande" : "L’hôtel"}</p>
      </header>

      {step === "hotel" ? (
        <div data-hotel-detail="1">
          <div className="relative h-64 bg-[var(--h-header)]">
            {shown ? <Photo src={shown} alt={hotel.name} eager /> : <div className="h-skel h-full w-full" />}
            {images.length > 1 ? (
              <p className="h-pin absolute bottom-3 right-3">{photoAt + 1}/{images.length}</p>
            ) : null}
            {images.length > 1 ? (
              <div className="absolute inset-y-0 left-0 right-0 flex">
                <button type="button" aria-label="Photo précédente" className="h-full w-1/2" onClick={() => setPhotoAt((at) => (at - 1 + images.length) % images.length)} />
                <button type="button" aria-label="Photo suivante" className="h-full w-1/2" onClick={() => setPhotoAt((at) => (at + 1) % images.length)} />
              </div>
            ) : null}
          </div>
          {!file ? <div className="h-skel mx-4 mt-4 h-24 h-radius" /> : null}
          <div className="h-night space-y-4 px-4 py-5" data-hotel-hero="1">
            <div>
              <h2 className="h-display text-2xl font-semibold tracking-tight h-ink">{file?.name || hotel.name}</h2>
              <p className="mt-1 text-sm h-muted">{[file?.city || hotel.city, datesLabel, party].filter(Boolean).join(" · ")}</p>
              {file?.address ? <p className="mt-1 text-sm h-ink">{file.address}</p> : null}
            </div>
            {file && (file.benefits.length || PERK_LABEL.some((perk) => hotel.perks[perk.key])) ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] h-gold">Avantages</p>
                <Checks lines={file.benefits.length ? file.benefits : PERK_LABEL.filter((perk) => hotel.perks[perk.key]).map((perk) => perk.label)} />
                {file.footnotes.map((line) => (
                  <p key={line} className="mt-2 text-xs h-muted">{line}</p>
                ))}
              </div>
            ) : null}
          </div>
          <div className="space-y-5 px-4 py-5">
            {file?.description ? <p className="h-copy text-sm leading-relaxed h-ink">{file.description}</p> : null}
            {file?.funFact ? <p className="text-sm h-gold">{file.funFact}</p> : null}
            {file?.checkInTime || file?.checkOutTime ? (
              <p className="text-sm h-ink">
                {file.checkInTime ? `Arrivée ${file.checkInTime}` : ""}
                {file.checkInTime && file.checkOutTime ? " · " : ""}
                {file.checkOutTime ? `Départ ${file.checkOutTime}` : ""}
              </p>
            ) : null}
            {file?.amenities.length ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] h-gold">Équipements</p>
                <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm h-ink">
                  {file.amenities.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {file?.sections.map((section) => (
              <div key={section.title}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] h-gold">{section.title}</p>
                <ul className="space-y-1 text-sm h-ink">
                  {section.lines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            ))}
            {file?.rooms.length ? (
              <div data-hotel-rooms="1">
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] h-gold">{file.rooms.length > 1 ? `${file.rooms.length} chambres` : "Chambre"}</p>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {file.rooms.map((item) => {
                    const cheapest = item.rates.slice().sort((a, b) => a.sellCents - b.sellCents)[0];
                    const photo = item.images[0];
                    return (
                      <button key={item.name} type="button" onClick={() => chooseRoom(item)} className="h-card h-line w-56 shrink-0 border text-left">
                        <div className="h-36 bg-[var(--h-header)]">{photo ? <Photo src={photo} alt={item.name} /> : null}</div>
                        <div className="space-y-1 p-3">
                          <p className="text-sm font-semibold h-ink">{item.name}</p>
                          {cheapest ? <p className="text-base font-semibold h-ink">{euros(cheapest.sellCents, cheapest.currency)}</p> : null}
                          {cheapest ? <p className="text-[11px] uppercase tracking-[0.12em] h-muted">Total du séjour</p> : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : file ? (
              <p className="text-sm h-muted">Aucune chambre pour ces dates.</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {step === "room" && room ? (
        <div data-hotel-rate="1" className="space-y-4 px-4 py-5">
          <div className="h-56 overflow-hidden h-radius bg-[var(--h-header)]">
            {room.images[0] ? <Photo src={room.images[0]} alt={room.name} eager /> : null}
          </div>
          <div>
            <p className="text-sm h-muted">{file?.name}</p>
            <h2 className="h-display text-2xl font-semibold h-ink">{room.name}</h2>
          </div>
          {room.rates.map((item) => (
            <article key={`${item.title}-${item.sellCents}`} className="h-card h-line space-y-3 border p-4">
              <p className="text-base font-semibold h-ink">{item.title}</p>
              <Checks lines={item.benefits} />
              {item.cancellation ? <p className="text-sm h-muted">{item.cancellation}</p> : null}
              {item.footnotes.map((line) => (
                <p key={line} className="text-xs h-muted">{line}</p>
              ))}
              <div className="h-night -mx-4 -mb-4 flex items-end justify-between gap-3 px-4 py-4" data-hotel-rate-cta="1">
                <div>
                  <p className="text-2xl font-semibold h-ink">{euros(item.sellCents, item.currency)}</p>
                  <p className="text-[11px] uppercase tracking-[0.12em] h-muted">{euros(item.perNightCents, item.currency)} / nuit · total</p>
                </div>
                <button type="button" disabled={!item.offerId} onClick={() => chooseRate(item)} className="h-btn h-11 px-5 text-sm font-semibold disabled:opacity-40">
                  {item.offerId ? "Choisir" : "Préparation du tarif"}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {step === "guests" && rate ? (
        <div data-hotel-guests="1" className="space-y-4 px-4 py-5">
          <div>
            <p className="text-sm h-muted">{file?.name || hotel.name} · {rate.room}</p>
            <h2 className="h-display text-xl font-semibold h-ink">{rate.title}</h2>
            <p className="mt-1 text-sm h-ink">{euros(rate.sellCents, rate.currency)} · {datesLabel}</p>
          </div>
          {stayRooms.map((stay, index) => (
            <label key={index} className="h-field block px-4 py-3">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] h-gold">Chambre {index + 1}</span>
              <span className="mt-1 block text-xs h-muted">
                {stay.adults > 1 ? `${stay.adults} adultes` : "1 adulte"}
                {stay.children.length ? ` · ${stay.children.map((child) => (child.age === 0 ? "moins d’un an" : `${child.age} ans`)).join(", ")}` : ""}
              </span>
              <input
                value={names[index] || ""}
                onChange={(event) => setNames((current) => current.map((name, at) => (at === index ? event.target.value : name)))}
                aria-label={`Voyageur, chambre ${index + 1}`}
                placeholder="Prénom et nom"
                autoComplete="name"
                className="mt-2 w-full bg-transparent text-base h-ink outline-none"
              />
            </label>
          ))}
          {note ? <p className="text-sm h-gold">{note}</p> : null}
          <button type="button" onClick={() => (names.every(guestNameOk) ? setStep("confirm") : setNote("Indiquez le prénom et le nom de chaque chambre."))} className="h-btn h-12 w-full text-sm font-semibold">
            Récapitulatif
          </button>
        </div>
      ) : null}

      {step === "confirm" && rate ? (
        <div data-hotel-confirm="1" className="space-y-4 px-4 py-5">
          <h2 className="text-2xl font-semibold h-ink">{done ? "Demande envoyée" : "Récapitulatif"}</h2>
          <article className="h-card h-line space-y-2 border p-4 text-sm">
            <p className="text-lg font-semibold h-ink">{file?.name || hotel.name}</p>
            <p className="h-muted">{file?.city || hotel.city}</p>
            <p className="h-ink">{datesLabel} · {party}</p>
            <p className="h-ink">{rate.room} · {rate.title}</p>
            {rate.cancellation ? <p className="h-muted">{rate.cancellation}</p> : null}
            <Checks lines={rate.benefits} />
            <ul className="space-y-1 h-ink">
              {names.map((name, index) => (
                <li key={`${name}-${index}`}>Chambre {index + 1} · {name}</li>
              ))}
            </ul>
            <p className="pt-2 text-2xl font-semibold h-ink">{euros(rate.sellCents, rate.currency)}</p>
          </article>
          {done ? (
            <p className="text-sm h-ink">
              {done}{" "}
              <a href={whatsapp} className="font-semibold underline">WhatsApp</a>
            </p>
          ) : (
            <>
              <p className="text-sm h-muted">Aucun paiement n’est lancé. L’agence valide la demande.</p>
              {note ? <p className="text-sm h-gold">{note}</p> : null}
              <button type="button" disabled={sending || !rate.offerId} onClick={() => void send()} className="h-btn h-12 w-full text-sm font-semibold disabled:opacity-40">
                {sending ? "Envoi…" : "Envoyer la demande"}
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
