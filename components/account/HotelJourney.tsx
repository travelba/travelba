"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { HotelMap } from "@/components/account/HotelMap";
import { Icon } from "@/components/crm/icons";
import { groupAdvantages, readStayRate } from "@/lib/crm/hotel-fr";
import { guestNameOk, type ClientHotelFile, type ClientRate, type ClientRoom } from "@/lib/crm/hotel-journey";
import type { ClientHotel, HotelPerks, HotelRoomOccupancy } from "@/lib/crm/hotel-search";
import { formatMoney } from "@/lib/crm/money";
import { siteConfig } from "@/lib/site";

type Step = "hotel" | "room" | "guests" | "confirm";

const STEPS: { id: Step; label: string }[] = [
  { id: "hotel", label: "Hôtel" },
  { id: "room", label: "Chambre" },
  { id: "guests", label: "Voyageurs" },
  { id: "confirm", label: "Demande" },
];

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

function clockFr(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return value;
  return match[2] === "00" ? `${Number(match[1])} h` : `${Number(match[1])} h ${match[2]}`;
}

function smoothScroll() {
  if (typeof window === "undefined") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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

function Gallery({ images, alt }: { images: string[]; alt: string }) {
  const [at, setAt] = useState(0);
  const [open, setOpen] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const index = images.length ? Math.min(at, images.length - 1) : 0;
  const shown = images[index];

  function shift(delta: number) {
    if (images.length < 2) return;
    setAt((current) => (current + delta + images.length) % images.length);
  }

  function onPointerDown(event: ReactPointerEvent) {
    start.current = { x: event.clientX, y: event.clientY };
  }

  function onPointerUp(event: ReactPointerEvent, lightbox: boolean) {
    if (!start.current) return;
    const dx = event.clientX - start.current.x;
    const dy = event.clientY - start.current.y;
    start.current = null;
    if (Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy)) shift(dx > 0 ? -1 : 1);
    else if (!lightbox && Math.abs(dx) < 10 && Math.abs(dy) < 10) setOpen(true);
  }

  return (
    <div data-hotel-gallery="1">
      <div
        className="relative aspect-[3/2] bg-[var(--h-header)]"
        style={{ touchAction: "pan-y" }}
        onPointerDown={onPointerDown}
        onPointerUp={(event) => onPointerUp(event, false)}
      >
        {shown ? <Photo src={shown} alt={alt} eager /> : <div className="h-skel h-full w-full" />}
        {images.length > 1 ? (
          <p className="h-pin absolute bottom-3 right-3">{index + 1}/{images.length}</p>
        ) : null}
        <button type="button" className="sr-only" onClick={() => setOpen(true)}>
          Ouvrir la galerie
        </button>
      </div>
      {open && shown ? (
        <Lightbox
          images={images}
          alt={alt}
          index={index}
          onShift={shift}
          onPointerDown={onPointerDown}
          onPointerUp={(event) => onPointerUp(event, true)}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

function Lightbox({
  images,
  alt,
  index,
  onShift,
  onPointerDown,
  onPointerUp,
  onClose,
}: {
  images: string[];
  alt: string;
  index: number;
  onShift: (delta: number) => void;
  onPointerDown: (event: ReactPointerEvent) => void;
  onPointerUp: (event: ReactPointerEvent) => void;
  onClose: () => void;
}) {
  const onCloseRef = useRef(onClose);
  const onShiftRef = useRef(onShift);
  useEffect(() => {
    onCloseRef.current = onClose;
    onShiftRef.current = onShift;
  }, [onClose, onShift]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
      if (event.key === "ArrowRight") onShiftRef.current(1);
      if (event.key === "ArrowLeft") onShiftRef.current(-1);
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="hotel-theme fixed inset-0 z-[80] flex flex-col bg-[var(--h-header)] text-[var(--h-header-ink)]" role="dialog" aria-modal="true" aria-label="Galerie">
      <header className="flex items-center justify-between px-2 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <p className="px-2 text-sm">{index + 1} / {images.length}</p>
        <button type="button" aria-label="Fermer la galerie" onClick={onClose} className="h-hit h-press grid h-11 w-11 place-items-center">
          <Icon name="close" className="h-5 w-5 text-[#c5a880]" />
        </button>
      </header>
      <div
        className="relative min-h-0 flex-1"
        style={{ touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        <Photo src={images[index]} alt={alt} eager />
      </div>
    </div>,
    document.body
  );
}

function Checks({ lines }: { lines: string[] }) {
  if (!lines.length) return null;
  const groups = groupAdvantages(lines);
  if (!groups.length) {
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
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.title}>
          <p className="h-kicker mb-2">{group.title}</p>
          <ul className="space-y-2">
            {group.lines.map((line) => (
              <li key={line} className="flex gap-2 text-sm h-ink">
                <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 h-gold" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function fileFromCard(hotel: ClientHotel): ClientHotelFile {
  const images = hotel.images.length ? hotel.images : hotel.photo ? [hotel.photo] : [];
  const rate: ClientRate = {
    offerId: hotel.offerId,
    room: hotel.room || "Séjour",
    title: "Séjour",
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

function Dock({
  label,
  price,
  action,
  disabled,
  onAction,
}: {
  label: string;
  price: string;
  action: string;
  disabled?: boolean;
  onAction: () => void;
}) {
  return (
    <div className="h-dock" data-hotel-dock="1">
      <div className="flex items-center justify-between gap-3 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div>
          <p className="h-kicker">{label}</p>
          <p className="text-lg font-semibold h-ink">{price}</p>
        </div>
        <button type="button" disabled={disabled} onClick={onAction} className="h-btn h-press h-11 px-5 text-sm font-semibold disabled:opacity-40">
          {action}
        </button>
      </div>
    </div>
  );
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
  const [room, setRoom] = useState<ClientRoom | null>(null);
  const [rate, setRate] = useState<ClientRate | null>(null);
  const [names, setNames] = useState<string[]>(() => stayRooms.map(() => ""));
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState("");
  const roomsRef = useRef<HTMLDivElement>(null);

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
  const whatsapp = `https://wa.me/${siteConfig.whatsappNumber}`;
  const benefits = file?.benefits.length
    ? file.benefits
    : PERK_LABEL.filter((perk) => hotel.perks[perk.key]).map((perk) => perk.label);
  const priced = file?.rooms.flatMap((item) => item.rates) ?? [];
  const from = priced.length ? Math.min(...priced.map((item) => item.sellCents)) : hotel.sellCents;
  const currency = priced[0]?.currency || hotel.currency;
  const reading = rate ? readStayRate(rate) : null;
  const order = STEPS.map((item) => item.id);
  const stepAt = order.indexOf(step);

  function chooseRoom(next: ClientRoom) {
    setRoom(next);
    setRate(next.rates.length === 1 ? next.rates[0] : null);
    setStep("room");
  }

  function chooseRate(next: ClientRate) {
    if (!next.offerId) return;
    setRate(next);
    setNames(stayRooms.map(() => ""));
    setNote("");
    setStep("guests");
  }

  function go(next: Step) {
    if (order.indexOf(next) >= stepAt) return;
    if (next === "room" && !room) return;
    if ((next === "guests" || next === "confirm") && !rate) return;
    setStep(next);
  }

  function back() {
    if (step === "hotel" || done) onBack();
    else if (step === "confirm") setStep("guests");
    else if (step === "guests") setStep("room");
    else setStep("hotel");
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
      setDone(json?.message || "Demande reçue. L’agence confirme le séjour avant tout paiement.");
      setStep("confirm");
    } finally {
      setSending(false);
    }
  }

  const cheapestRoomRate = room?.rates.slice().sort((a, b) => a.sellCents - b.sellCents)[0];

  return (
    <div className="h-bg -mx-4 min-h-[calc(100dvh-4rem)] pb-28">
      <header className="h-header sticky top-16 z-30">
        <div className="flex items-center gap-2 px-2 py-2">
          <button type="button" aria-label="Retour" onClick={back} className="h-hit h-press grid h-11 w-11 place-items-center">
            <Icon name="chevron_left" className="h-5 w-5" />
          </button>
          <p className="min-w-0 flex-1 truncate text-sm font-semibold tracking-wide">{file?.name || hotel.name}</p>
        </div>
        <div className="flex border-t border-white/15" data-hotel-steps="1">
          {STEPS.map((item, index) => {
            const on = item.id === step;
            const doneStep = index < stepAt;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => go(item.id)}
                className={`h-hit h-press flex-1 text-[11px] uppercase tracking-[0.14em] ${on || doneStep ? "text-[#c5a880]" : "text-white/45"}`}
                aria-current={on ? "step" : undefined}
              >
                <span className={`inline-block border-b-2 py-2 ${on ? "border-[#c5a880]" : "border-transparent"}`}>{item.label}</span>
              </button>
            );
          })}
        </div>
      </header>

      <div key={step} className="hotel-step">
        {step === "hotel" ? (
          <div data-hotel-detail="1">
            <Gallery images={images} alt={file?.name || hotel.name} />
            {!file ? (
              <div className="space-y-3 px-4 py-5" aria-hidden>
                <div className="h-8 w-2/3 h-skel" />
                <div className="h-4 w-1/2 h-skel" />
                <div className="h-24 w-full h-skel" />
              </div>
            ) : null}
            <div className="h-night space-y-4 px-4 py-5" data-hotel-hero="1">
              <div>
                <h2 className="h-display text-[1.65rem] font-semibold leading-tight tracking-tight h-ink">{file?.name || hotel.name}</h2>
                <div className="h-rule mt-3" />
                <p className="mt-3 text-sm h-muted">{[file?.city || hotel.city, datesLabel, party].filter(Boolean).join(" · ")}</p>
                {file?.address ? <p className="mt-1 text-sm h-ink">{file.address}</p> : null}
              </div>
              {benefits.length ? (
                <div>
                  <p className="h-kicker mb-3">Avantages</p>
                  <Checks lines={benefits} />
                  {file?.footnotes.map((line) => (
                    <p key={line} className="mt-2 text-xs h-muted">{line}</p>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="space-y-6 px-4 py-5">
              {file?.description ? <p className="h-copy text-sm leading-relaxed h-ink">{file.description}</p> : null}
              {file?.funFact ? <p className="text-sm h-gold">{file.funFact}</p> : null}
              {file?.checkInTime || file?.checkOutTime ? (
                <p className="text-sm h-ink">
                  {file.checkInTime ? `Arrivée ${clockFr(file.checkInTime)}` : ""}
                  {file.checkInTime && file.checkOutTime ? " · " : ""}
                  {file.checkOutTime ? `Départ ${clockFr(file.checkOutTime)}` : ""}
                </p>
              ) : null}
              {file?.amenities.length ? (
                <div>
                  <p className="h-kicker mb-3">Équipements</p>
                  <ul className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm h-ink">
                    {file.amenities.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {file?.sections.map((section) => (
                <div key={section.title}>
                  <p className="h-kicker mb-2">{section.title}</p>
                  <ul className="space-y-1 text-sm h-ink">
                    {section.lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              ))}
              {file?.coords ? (
                <HotelMap hotels={[{ ...hotel, name: file.name || hotel.name, city: file.city || hotel.city, coords: file.coords }]} />
              ) : null}
              {file?.rooms.length ? (
                <div data-hotel-rooms="1" ref={roomsRef} className="scroll-mt-28 space-y-3">
                  <p className="h-kicker">{file.rooms.length > 1 ? `${file.rooms.length} chambres` : "Chambre"}</p>
                  {file.rooms.map((item) => {
                    const cheapest = item.rates.slice().sort((a, b) => a.sellCents - b.sellCents)[0];
                    const photo = item.images[0];
                    return (
                      <button key={item.name} type="button" onClick={() => chooseRoom(item)} className="h-card h-line h-press flex w-full gap-3 border p-0 text-left">
                        <div className="h-28 w-28 shrink-0 bg-[var(--h-header)]">{photo ? <Photo src={photo} alt={item.name} /> : null}</div>
                        <span className="flex min-w-0 flex-1 flex-col justify-center py-3 pr-3">
                          <span className="text-sm font-semibold h-ink">{item.name}</span>
                          {cheapest ? <span className="mt-2 text-base font-semibold h-ink">{euros(cheapest.sellCents, cheapest.currency)}</span> : null}
                          {cheapest ? <span className="text-[11px] uppercase tracking-[0.12em] h-muted">Total du séjour</span> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : file ? (
                <p className="text-sm h-muted">Aucune chambre pour ces dates. Écrivez-nous si le séjour vous tient à cœur.</p>
              ) : null}
            </div>
          </div>
        ) : null}

        {step === "room" && room ? (
          <div data-hotel-rate="1" className="space-y-4 px-4 py-5">
            <Gallery images={room.images.length ? room.images : images} alt={room.name} />
            <div>
              <p className="text-sm h-muted">{file?.name}</p>
              <h2 className="h-display mt-1 text-2xl font-semibold h-ink">{room.name}</h2>
              <div className="h-rule mt-3" />
            </div>
            {room.rates.map((item) => {
              const read = readStayRate(item);
              return (
                <article key={`${item.title}-${item.sellCents}`} className="h-card h-line border">
                  <div className="space-y-4 p-4">
                    <h3 className="text-lg font-semibold h-ink">{read.title}</h3>
                    <dl className="space-y-3">
                      <div>
                        <dt className="h-kicker">Pension</dt>
                        <dd className="mt-1 text-sm h-ink">{read.board}</dd>
                      </div>
                      <div>
                        <dt className="h-kicker">Annulation</dt>
                        <dd className="mt-1 text-sm h-ink">{read.cancellation}</dd>
                      </div>
                    </dl>
                    {item.benefits.length ? (
                      <div>
                        <p className="h-kicker mb-2">Avantages</p>
                        <Checks lines={item.benefits} />
                      </div>
                    ) : null}
                    {item.footnotes.map((line) => (
                      <p key={line} className="text-xs h-muted">{line}</p>
                    ))}
                  </div>
                  <div className="flex items-end justify-between gap-3 border-t h-line px-4 py-4" data-hotel-rate-cta="1">
                    <div>
                      <p className="h-kicker">Total</p>
                      <p className="text-2xl font-semibold h-ink">{euros(item.sellCents, item.currency)}</p>
                      <p className="text-[11px] uppercase tracking-[0.12em] h-muted">{euros(item.perNightCents, item.currency)} / nuit</p>
                    </div>
                    <button type="button" disabled={!item.offerId} onClick={() => chooseRate(item)} className="h-btn h-press h-11 px-5 text-sm font-semibold disabled:opacity-40">
                      {item.offerId ? "Choisir" : "Tarif en préparation"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}

        {step === "guests" && rate && reading ? (
          <div data-hotel-guests="1" className="space-y-4 px-4 py-5">
            <div>
              <p className="text-sm h-muted">{file?.name || hotel.name}</p>
              <h2 className="h-display mt-1 text-xl font-semibold h-ink">{rate.room}</h2>
              <div className="h-rule mt-3" />
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="h-kicker">Pension</dt>
                  <dd className="mt-1 h-ink">{reading.board}</dd>
                </div>
                <div>
                  <dt className="h-kicker">Annulation</dt>
                  <dd className="mt-1 h-ink">{reading.cancellation}</dd>
                </div>
                <div>
                  <dt className="h-kicker">Total</dt>
                  <dd className="mt-1 text-lg font-semibold h-ink">{euros(rate.sellCents, rate.currency)} · {datesLabel}</dd>
                </div>
              </dl>
            </div>
            {stayRooms.map((stay, index) => (
              <label key={index} className="h-field block px-4 py-3">
                <span className="h-kicker">Chambre {index + 1}</span>
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
                  className="mt-2 h-11 w-full bg-transparent text-base h-ink outline-none"
                />
              </label>
            ))}
            {note ? <p className="text-sm h-gold">{note}</p> : null}
          </div>
        ) : null}

        {step === "confirm" && rate && reading ? (
          <div data-hotel-confirm="1" className="space-y-4 px-4 py-5">
            <h2 className="text-2xl font-semibold h-ink">{done ? "Demande reçue" : "Récapitulatif"}</h2>
            <div className="h-rule" />
            <article className="h-card h-line space-y-3 border p-4 text-sm">
              <p className="text-lg font-semibold h-ink">{file?.name || hotel.name}</p>
              <p className="h-muted">{[file?.city || hotel.city, datesLabel, party].filter(Boolean).join(" · ")}</p>
              <p className="h-ink">{rate.room}</p>
              <dl className="space-y-3">
                <div>
                  <dt className="h-kicker">Pension</dt>
                  <dd className="mt-1 h-ink">{reading.board}</dd>
                </div>
                <div>
                  <dt className="h-kicker">Annulation</dt>
                  <dd className="mt-1 h-ink">{reading.cancellation}</dd>
                </div>
              </dl>
              <Checks lines={rate.benefits} />
              <ul className="space-y-1 h-ink">
                {names.map((name, index) => (
                  <li key={`${name}-${index}`}>Chambre {index + 1} · {name}</li>
                ))}
              </ul>
              <p className="h-kicker pt-2">Total</p>
              <p className="text-2xl font-semibold h-ink">{euros(rate.sellCents, rate.currency)}</p>
            </article>
            {done ? (
              <p className="text-sm h-ink">
                {done}{" "}
                <a href={whatsapp} className="font-semibold underline">Écrire sur WhatsApp</a>
              </p>
            ) : (
              <p className="text-sm h-muted">Aucun paiement n’est lancé. L’agence confirme d’abord.</p>
            )}
            {note ? <p className="text-sm h-gold">{note}</p> : null}
          </div>
        ) : null}
      </div>

      {step === "hotel" ? (
        <Dock
          label="À partir de"
          price={euros(from, currency)}
          action={file?.rooms.length ? "Voir les chambres" : "Nous préparons la fiche"}
          disabled={!file?.rooms.length}
          onAction={() => roomsRef.current?.scrollIntoView({ behavior: smoothScroll() ? "smooth" : "auto", block: "start" })}
        />
      ) : null}
      {step === "room" && cheapestRoomRate ? (
        <Dock
          label="À partir de"
          price={euros(cheapestRoomRate.sellCents, cheapestRoomRate.currency)}
          action={cheapestRoomRate.offerId ? "Choisir" : "Tarif en préparation"}
          disabled={!cheapestRoomRate.offerId}
          onAction={() => chooseRate(cheapestRoomRate)}
        />
      ) : null}
      {step === "guests" && rate ? (
        <Dock
          label="Total"
          price={euros(rate.sellCents, rate.currency)}
          action="Récapitulatif"
          onAction={() => (names.every(guestNameOk) ? setStep("confirm") : setNote("Indiquez le prénom et le nom de chaque chambre."))}
        />
      ) : null}
      {step === "confirm" && rate && !done ? (
        <Dock
          label="Total"
          price={euros(rate.sellCents, rate.currency)}
          action={sending ? "Envoi…" : "Envoyer la demande"}
          disabled={sending || !rate.offerId}
          onAction={() => void send()}
        />
      ) : null}
    </div>
  );
}
