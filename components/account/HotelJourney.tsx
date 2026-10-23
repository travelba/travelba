"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { HotelMap } from "@/components/account/HotelMap";
import { Icon } from "@/components/crm/icons";
import { cancellationPhrase, clientRateTitle, frenchClientProse, readStayRate } from "@/lib/crm/hotel-fr";
import { collapseRooms, guestNameOk, travelPrivileges, type ClientHotelFile, type ClientRate, type ClientRoom, type HotelJourneyStep } from "@/lib/crm/hotel-journey";
import { composeRoomGuests, roomOccupancyLabel } from "@/lib/crm/hotel-party";
import type { ClientHotel, HotelPerks, HotelRoomOccupancy } from "@/lib/crm/hotel-search";
import { formatMoney } from "@/lib/crm/money";
import { siteConfig } from "@/lib/site";

type Step = "hotel" | "room" | "guests" | "confirm";

const STEPS: { id: Step; label: string }[] = [
  { id: "hotel", label: "L’hôtel" },
  { id: "room", label: "La chambre" },
  { id: "guests", label: "Voyageurs" },
  { id: "confirm", label: "Récapitulatif" },
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
      className="h-fade h-full w-full object-cover"
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={eager ? "high" : "auto"}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

function Gallery({ images, alt }: { images: string[]; alt: string }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  const [open, setOpen] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const index = images.length ? Math.min(at, images.length - 1) : 0;

  function shift(delta: number) {
    if (images.length < 2) return;
    const next = (index + delta + images.length) % images.length;
    setAt(next);
    const node = scroller.current;
    if (node) node.scrollTo({ left: next * node.clientWidth, behavior: smoothScroll() ? "smooth" : "auto" });
  }

  function onScroll() {
    const node = scroller.current;
    if (!node || node.clientWidth < 1) return;
    setAt(Math.max(0, Math.min(images.length - 1, Math.round(node.scrollLeft / node.clientWidth))));
  }

  function onPointerDown(event: ReactPointerEvent) {
    start.current = { x: event.clientX, y: event.clientY };
  }

  function onPointerUp(event: ReactPointerEvent) {
    if (!start.current) return;
    const dx = event.clientX - start.current.x;
    const dy = event.clientY - start.current.y;
    start.current = null;
    if (Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy)) shift(dx > 0 ? -1 : 1);
  }

  return (
    <div data-hotel-gallery="1" className="relative">
      <div ref={scroller} onScroll={onScroll} className="h-gallery h-stage flex snap-x snap-mandatory overflow-x-auto bg-[#eceae6]">
        {images.length ? (
          images.map((src, imageIndex) => (
            <button
              key={`${src}-${imageIndex}`}
              type="button"
              onClick={() => {
                setAt(imageIndex);
                setOpen(true);
              }}
              className="h-full w-full shrink-0 snap-start"
              aria-label={images.length > 1 ? `Photo ${imageIndex + 1} sur ${images.length}` : "Ouvrir la photo"}
            >
              <Photo src={src} alt={imageIndex === 0 ? alt : ""} eager={imageIndex === 0} />
            </button>
          ))
        ) : (
          <div className="h-skel h-full w-full shrink-0" />
        )}
      </div>
      {images.length > 1 ? <p className="h-pin absolute bottom-3 right-3">{index + 1}/{images.length}</p> : null}
      {open && images[index] ? (
        <Lightbox
          images={images}
          alt={alt}
          index={index}
          onShift={shift}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
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

function splitOutlook(value: string) {
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  return {
    view: parts.filter((part) => !/balcon|terrasse/i.test(part)).join(", "),
    exterior: parts.filter((part) => /balcon|terrasse/i.test(part)).join(", "),
  };
}

function shownLabel(value: string) {
  const line = value.trim();
  if (!line) return "";
  return line.charAt(0).toLocaleUpperCase("fr") + line.slice(1);
}

function Fact({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <Icon name={icon} className="h-4 w-4 shrink-0 h-muted" strokeWidth={1.5} />
      <span className="min-w-0">
        <span className="block text-[11px] leading-4 h-muted">{label}</span>
        <span className="block text-sm h-ink">{shownLabel(value)}</span>
      </span>
    </div>
  );
}

function discreetPerk(perks: HotelPerks) {
  return PERK_LABEL.find((perk) => perks[perk.key])?.label || "";
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

function sameName(left: string, right: string) {
  return left.trim().toLocaleLowerCase("fr") === right.trim().toLocaleLowerCase("fr");
}

function RoomParty({
  index,
  occupancy,
  principal,
  others,
  selfName,
  skipSelf,
  onPrincipal,
  onSkip,
  onOther,
  onAdd,
  onRemove,
}: {
  index: number;
  occupancy: string;
  principal: string;
  others: string[];
  selfName: string;
  skipSelf: boolean;
  onPrincipal: (value: string) => void;
  onSkip: () => void;
  onOther: (at: number, value: string) => void;
  onAdd: () => void;
  onRemove: (at: number) => void;
}) {
  return (
    <section className="h-recap space-y-4" data-hotel-room-party={index + 1}>
      <div>
        <p className="h-kicker">Chambre {index + 1}</p>
        <p className="mt-1 text-sm h-ink">{occupancy}</p>
      </div>
      <label className="block">
        <span className="h-kicker">Voyageur principal</span>
        <input
          value={principal}
          onChange={(event) => onPrincipal(event.target.value)}
          aria-label={`Voyageur principal, chambre ${index + 1}`}
          placeholder="Prénom et nom"
          autoComplete="name"
          className="mt-1 h-11 w-full border-b border-[#efeae3] bg-transparent text-base h-ink outline-none"
        />
      </label>
      {index === 0 && selfName ? (
        <button
          type="button"
          onClick={onSkip}
          aria-pressed={skipSelf}
          className={`h-hit h-press px-1 text-sm ${skipSelf ? "h-on" : "h-muted"}`}
        >
          Je ne voyage pas
        </button>
      ) : null}
      {others.map((name, at) => (
        <label key={at} className="block pt-2">
          <span className="flex items-center justify-between gap-3">
            <span className="h-kicker">Autre occupant</span>
            <button type="button" onClick={() => onRemove(at)} className="h-hit h-press text-xs h-gold">
              Retirer
            </button>
          </span>
          <input
            value={name}
            onChange={(event) => onOther(at, event.target.value)}
            aria-label={`Autre occupant ${at + 1}, chambre ${index + 1}`}
            placeholder="Prénom et nom"
            autoComplete="name"
            className="mt-1 h-11 w-full border-b border-[#efeae3] bg-transparent text-base h-ink outline-none"
          />
        </label>
      ))}
      <button type="button" onClick={onAdd} className="h-hit h-press text-sm h-ink">
        Ajouter un occupant
      </button>
    </section>
  );
}

function Dock({
  label,
  price,
  action,
  disabled,
  marker,
  onAction,
}: {
  label?: string;
  price?: string;
  action: string;
  disabled?: boolean;
  marker?: boolean;
  onAction: () => void;
}) {
  return (
    <div className="h-dock shrink-0" data-hotel-dock="1">
      <div className={`px-4 pt-2 pb-9 md:pb-[max(0.5rem,env(safe-area-inset-bottom))] ${price ? "flex items-center justify-between gap-3" : ""}`}>
        {price ? (
          <div className="min-w-0">
            <p className="h-kicker">{label}</p>
            <p className="truncate text-lg font-semibold h-ink">{price}</p>
          </div>
        ) : null}
        <button
          type="button"
          disabled={disabled}
          onClick={onAction}
          data-hotel-rate-cta={marker ? "1" : undefined}
          className={`h-press h-11 text-sm font-semibold disabled:opacity-40 ${marker ? "h-select" : "h-btn"} ${price ? "shrink-0 px-5" : "w-full"}`}
        >
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
  step,
  onStep,
  onBack,
  others = [],
  onOpenOther,
}: {
  hotel: ClientHotel;
  stayRooms: HotelRoomOccupancy[];
  datesLabel: string;
  party: string;
  query: { destination: string; city: string; checkIn: string; checkOut: string; rooms: HotelRoomOccupancy[] };
  step: HotelJourneyStep;
  onStep: (step: HotelJourneyStep | "back") => void;
  onBack: () => void;
  others?: ClientHotel[];
  onOpenOther?: (hotel: ClientHotel) => void;
}) {
  const [file, setFile] = useState<ClientHotelFile | null>(hotel.hotelId ? null : fileFromCard(hotel));
  const [note, setNote] = useState("");
  const [room, setRoom] = useState<ClientRoom | null>(null);
  const [rate, setRate] = useState<ClientRate | null>(null);
  const [selfName, setSelfName] = useState("");
  const [known, setKnown] = useState<string[]>([]);
  const [skipSelf, setSkipSelf] = useState(false);
  const [lead, setLead] = useState<string[]>(() => stayRooms.map(() => ""));
  const [more, setMore] = useState<string[][]>(() => stayRooms.map(() => []));
  const [sending, setSending] = useState(false);
  const portal = useSyncExternalStore(
    () => () => {},
    () => document.body,
    () => null,
  );
  const [done, setDone] = useState("");
  const roomsRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/client/hotels/voyageurs", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((json: { self?: string; people?: string[] } | null) => {
        if (!json) return;
        if (typeof json.self === "string") setSelfName(json.self);
        if (Array.isArray(json.people)) setKnown(json.people.filter((name) => typeof name === "string" && guestNameOk(name)));
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  function principalAt(index: number) {
    const name = lead[index] || "";
    if (index === 0 && !name.trim() && selfName && !skipSelf) return selfName;
    return name;
  }

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: 0 });
  }, [step]);

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
        if (json?.file) setFile({ ...json.file, rooms: collapseRooms(json.file.rooms) });
        else setFile(fileFromCard(hotel));
      })
      .catch(() => {
        if (!controller.signal.aborted) setFile(fileFromCard(hotel));
      });
    return () => controller.abort();
  }, [hotel, query]);

  const images = file?.images.length ? file.images : hotel.photo ? [hotel.photo] : [];
  const whatsapp = `https://wa.me/${siteConfig.whatsappNumber}`;
  const reading = rate ? readStayRate(rate) : null;
  const view: Step = step === "confirm" && rate ? "confirm" : step === "guests" && rate ? "guests" : step === "room" && room ? "room" : "hotel";
  const fromOffer = file?.rooms
    .map((item) => item.rates[0])
    .filter((item): item is ClientRate => Boolean(item))
    .sort((left, right) => left.sellCents - right.sellCents)[0];

  function chooseRoom(next: ClientRoom) {
    const picked = collapseRooms([next])[0] || next;
    setRoom(picked);
    setRate(picked.rates[0] || null);
    onStep("room");
  }

  function chooseRate(next: ClientRate) {
    if (!next.offerId) return;
    setRate(next);
    setSkipSelf(false);
    setLead(stayRooms.map((_, index) => (index === 0 && selfName ? selfName : "")));
    setMore(stayRooms.map(() => []));
    setNote("");
    onStep("guests");
  }

  function guestLines() {
    return stayRooms.map((_, index) => composeRoomGuests(principalAt(index), more[index] || []));
  }

  function guestsReady() {
    return stayRooms.every((_, index) => {
      if (!guestNameOk(principalAt(index))) return false;
      return (more[index] || []).every((name) => !name.trim() || guestNameOk(name));
    });
  }

  function placePerson(name: string) {
    if (selfName && sameName(name, selfName)) setSkipSelf(false);
    const currentLead = stayRooms.map((_, index) => principalAt(index));
    const taken = (index: number) =>
      [currentLead[index], ...(more[index] || [])].some((value) => value.trim() && sameName(value, name));
    const empty = currentLead.findIndex((value, index) => !value.trim() && !taken(index));
    if (empty >= 0) {
      setLead(currentLead.map((value, index) => (index === empty ? name : value)));
      return;
    }
    const roomIndex = stayRooms.findIndex((_, index) => !taken(index));
    if (roomIndex < 0) return;
    setMore((current) => current.map((list, index) => (index === roomIndex ? [...list, name] : list)));
  }

  function skipSelfToggle() {
    setSkipSelf((on) => {
      const next = !on;
      setLead((current) =>
        current.map((name, index) => {
          if (index !== 0) return name;
          if (next && selfName && sameName(name, selfName)) return "";
          if (!next && !name.trim()) return selfName;
          return name;
        })
      );
      return next;
    });
  }

  function back() {
    if (done) onBack();
    else onStep("back");
  }

  async function send() {
    if (!rate?.offerId) return;
    const guests = guestLines();
    if (!guestsReady()) {
      setNote("Indiquez le prénom et le nom du voyageur principal de chaque chambre.");
      return;
    }
    setSending(true);
    setNote("");
    try {
      const response = await fetch("/api/client/hotels/demandes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ offerId: rate.offerId, guests }),
      });
      const json = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!response.ok) {
        setNote(json?.error || "La demande n’a pas pu être envoyée.");
        return;
      }
      setDone(json?.message || "Demande reçue. L’agence confirme le séjour avant tout paiement.");
    } finally {
      setSending(false);
    }
  }

  const panel = (
    <div className="hotel-theme">
    <div className="h-journey h-bg" data-hotel-journey="1">
      <header className="shrink-0 bg-white" data-hotel-steps="1">
        <div className="grid grid-cols-[2.75rem_1fr_2.75rem] items-center">
          <button
            type="button"
            aria-label="Retour"
            onClick={back}
            className="h-hit h-press grid w-11 place-items-center text-[#1a1a1a]"
          >
            <Icon name="chevron_left" className="h-5 w-5" />
          </button>
          <p className="h-serif truncate text-center text-[17px] font-semibold leading-none h-ink">{done && view === "confirm" ? "Demande reçue" : STEPS.find((item) => item.id === view)?.label}</p>
          <span />
        </div>
        {view === "hotel" ? (
          <div className="flex gap-2 overflow-x-auto px-4 pb-3">
            <button
              type="button"
              className="h-pill h-press"
              onClick={() => roomsRef.current?.scrollIntoView({ behavior: smoothScroll() ? "smooth" : "auto", block: "start" })}
            >
              Tarifs
            </button>
            <a className="h-pill h-press" href={whatsapp}>Contact</a>
          </div>
        ) : null}
      </header>

      <div ref={scrollerRef} className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
      <div key={view} className="hotel-step min-w-0 pb-4">
        {view === "hotel" ? (
          <div data-hotel-detail="1" className="h-paper pb-8">
            <div className="px-4 pb-3 pt-3">
              <article className="h-recap">
                <h2 className="h-serif text-[1.15rem] font-semibold leading-tight h-ink">{file?.name || hotel.name}</h2>
                <p className="mt-1 text-sm h-muted">{[datesLabel, party].filter(Boolean).join(" · ")}</p>
              </article>
            </div>
            <Gallery images={images} alt={file?.name || hotel.name} />
            <div className="space-y-3 bg-white px-5 py-5" data-hotel-hero="1">
              <h2 className="h-serif text-[1.35rem] font-semibold leading-tight h-ink">{file?.name || hotel.name}</h2>
              <p className="text-sm h-muted">{file?.city || hotel.city}</p>
              {file?.address ? <p className="text-sm h-ink">{file.address}</p> : null}
              {frenchClientProse(file?.description || "") ? <p className="text-[15px] leading-relaxed h-ink">{frenchClientProse(file?.description || "")}</p> : null}
              {!file ? <div className="h-4 w-1/2 animate-pulse h-skel" aria-hidden /> : null}
            </div>
            <div className="space-y-8 px-5 pt-6">
              {file?.rooms.length ? (
                <div data-hotel-rooms="1" ref={roomsRef}>
                  <p className="h-section">
                    {file.rooms.length > 1 ? `${file.rooms.length} types de chambres disponibles` : "1 type de chambre disponible"}
                  </p>
                  <div className="mt-4 -mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2">
                    {file.rooms.map((item) => {
                      const offer = item.rates[0];
                      const photo = item.images[0];
                      const perk = offer ? travelPrivileges(offer.perks, offer.benefits)[0] : "";
                      const outlook = splitOutlook(item.outlook || "");
                      return (
                        <button
                          key={item.name}
                          type="button"
                          onClick={() => chooseRoom(item)}
                          className="h-room h-press w-[78%] shrink-0 snap-start overflow-hidden text-left"
                        >
                          <span className="relative block aspect-[5/4] overflow-hidden bg-[#eceae6]">
                            {photo ? <Photo src={photo} alt="" /> : null}
                            {item.images.length > 1 ? <span className="h-pin absolute bottom-2 right-2">{`1/${item.images.length}`}</span> : null}
                          </span>
                          <span className="block space-y-2 px-3 py-3">
                            <span className="h-serif block text-[1.05rem] font-semibold leading-tight h-ink">{item.name}</span>
                            <span className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] h-muted">
                              {outlook.view ? (
                                <span className="inline-flex items-center gap-1">
                                  <Icon name="eye" className="h-3.5 w-3.5" strokeWidth={1.5} />
                                  {shownLabel(outlook.view)}
                                </span>
                              ) : null}
                              {item.bed ? (
                                <span className="inline-flex items-center gap-1">
                                  <Icon name="bed" className="h-3.5 w-3.5" strokeWidth={1.5} />
                                  {shownLabel(item.bed)}
                                </span>
                              ) : null}
                              {item.area ? (
                                <span className="inline-flex items-center gap-1">
                                  <Icon name="ruler" className="h-3.5 w-3.5" strokeWidth={1.5} />
                                  {item.area}
                                </span>
                              ) : null}
                            </span>
                            {offer ? (
                              <span className="block">
                                <span className="block text-base font-semibold tracking-tight h-ink">{euros(offer.sellCents, offer.currency)}</span>
                                <span className="block text-[11px] h-muted">Total TTC</span>
                              </span>
                            ) : null}
                            {perk ? <span className="inline-block text-[12px] text-[#8c7352]">{perk}</span> : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : file ? (
                <p className="text-sm h-muted">Aucune chambre pour ces dates. Écrivez-nous si le séjour vous tient à cœur.</p>
              ) : null}
              {file ? (
                <details className="h-fold">
                  <summary className="text-sm font-semibold h-ink">Le lieu</summary>
                  <div className="space-y-3 pb-3">
                    {file.funFact ? <p className="text-sm h-gold">{file.funFact}</p> : null}
                    {file.checkInTime || file.checkOutTime ? (
                      <p className="text-sm h-ink">
                        {file.checkInTime ? `Arrivée ${clockFr(file.checkInTime)}` : ""}
                        {file.checkInTime && file.checkOutTime ? " · " : ""}
                        {file.checkOutTime ? `Départ ${clockFr(file.checkOutTime)}` : ""}
                      </p>
                    ) : null}
                    {file.amenities.length ? (
                      <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm h-ink">
                        {file.amenities.map((item) => (
                          <li key={item} className="truncate">{item}</li>
                        ))}
                      </ul>
                    ) : null}
                    {file.sections.map((section) => (
                      <div key={section.title}>
                        <p className="h-kicker mb-1">{section.title}</p>
                        <ul className="space-y-1 text-sm h-ink">
                          {section.lines.map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
              {file?.coords ? (
                <div>
                  <p className="h-section">Localisation</p>
                  <div className="mt-4">
                    <HotelMap hotels={[{ ...hotel, name: file.name || hotel.name, city: file.city || hotel.city, coords: file.coords }]} />
                  </div>
                  {file.address ? <p className="mt-2 text-sm leading-relaxed h-ink">{file.address}</p> : null}
                </div>
              ) : null}
              {others.length ? (
                <div data-hotel-others="1">
                  <p className="h-section">Autres hôtels à {file?.city || hotel.city}</p>
                  <div className="mt-4 -mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2">
                    {others.map((item) => (
                      <button
                        key={item.hotelKey}
                        type="button"
                        onClick={() => onOpenOther?.(item)}
                        className="h-press w-[72%] shrink-0 snap-start text-left"
                      >
                        <span className="block aspect-[4/3] overflow-hidden bg-[#eceae6]">{item.photo ? <Photo src={item.photo} alt="" /> : null}</span>
                        <span className="block pt-3">
                          <span className="h-serif block text-[1.35rem] font-medium leading-tight h-ink">{item.name}</span>
                          <span className="mt-1 block text-sm h-muted">{item.city}</span>
                          <span className="mt-2 block text-sm font-semibold h-ink">{euros(item.sellCents, item.currency)}</span>
                          <span className="block text-[11px] h-muted">TTC</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {view === "room" && room && rate ? (
          <div data-hotel-rate="1" className="h-paper pb-8">
            <Gallery images={room.images.length ? room.images : images} alt={room.name} />
            <div className="space-y-5 px-4 pb-8 pt-4">
              <article className="h-recap">
                <p className="text-sm h-muted">{file?.city || hotel.city}</p>
                <h2 className="h-serif mt-1 text-[1.2rem] font-semibold leading-tight h-ink">{file?.name || hotel.name}</h2>
                <p className="h-serif mt-3 text-[1.05rem] font-semibold leading-tight h-ink">{room.name}</p>
              </article>
              {room.area || room.bed || room.outlook ? (
                <div className="space-y-1">
                  {room.area ? <Fact icon="ruler" label="Surface intérieure" value={room.area} /> : null}
                  {splitOutlook(room.outlook || "").exterior ? <Fact icon="eye" label="Extérieur" value={splitOutlook(room.outlook || "").exterior} /> : null}
                  {splitOutlook(room.outlook || "").view ? <Fact icon="eye" label="Vue" value={splitOutlook(room.outlook || "").view.replace(/^vue\s+/i, "")} /> : null}
                  {room.bed ? <Fact icon="bed" label="Couchage" value={room.bed} /> : null}
                </div>
              ) : null}
              <div>
                {cancellationPhrase(rate.cancellation) ? (
                  <div>
                    <p className="text-[15px] leading-relaxed h-ink">{cancellationPhrase(rate.cancellation)}</p>
                    {rate.footnotes.length ? (
                      <details className="h-fold">
                        <summary className="text-sm h-ink">Conditions</summary>
                        <div className="space-y-2 pb-1">
                          {rate.footnotes.map((line) => (
                            <p key={line} className="text-xs leading-relaxed h-muted">{line}</p>
                          ))}
                        </div>
                      </details>
                    ) : null}
                  </div>
                ) : null}
                <h3 className="h-serif mt-5 text-[1.15rem] font-semibold leading-tight h-ink">{clientRateTitle(rate.title)}</h3>
                {reading?.board && reading.board !== "Précisée à la confirmation" && !travelPrivileges(rate.perks, rate.benefits).some((line) => /petit-déjeuner/i.test(line) && /petit-déjeuner/i.test(reading.board)) ? (
                  <p className="mt-1 text-[15px] h-muted">{reading.board}</p>
                ) : null}
                {travelPrivileges(rate.perks, rate.benefits).length ? (
                  <div className="mt-5">
                    <p className="h-section">Privilèges Travel BA</p>
                    <ul className="mt-3 space-y-2">
                      {travelPrivileges(rate.perks, rate.benefits).map((line) => (
                        <li key={line} className="flex items-start gap-2.5 text-[15px] leading-snug h-ink">
                          <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-[#9a7b4f]" strokeWidth={1.5} />
                          {line}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {view === "guests" && rate && reading ? (
          <div data-hotel-guests="1" className="h-paper space-y-6 px-4 py-4">
            <article className="h-recap min-w-0">
              <p className="truncate text-sm h-muted">{[file?.name || hotel.name, rate.room].filter(Boolean).join(" · ")}</p>
              <h2 className="h-serif mt-1 text-[1.2rem] font-semibold leading-tight h-ink">{reading.title}</h2>
              <p className="mt-3 text-[15px] leading-relaxed h-ink">{reading.board}</p>
              <p className="mt-1 text-[15px] leading-relaxed h-muted">{reading.cancellation}</p>
              <p className="mt-4 text-2xl font-semibold tracking-tight h-ink">{euros(rate.sellCents, rate.currency)}</p>
              <p className="mt-1 text-sm h-muted">{datesLabel}</p>
            </article>
            {known.length ? (
              <div className="min-w-0">
                <p className="h-kicker mb-2">Déjà avec vous</p>
                <div className="flex flex-nowrap gap-2 overflow-x-auto">
                  {known.map((name) => {
                    const on = stayRooms.some((_, index) => sameName(principalAt(index), name)) || more.some((list) => list.some((value) => sameName(value, name)));
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => placePerson(name)}
                        aria-pressed={on}
                        className={`h-pill h-press shrink-0 ${on ? "h-on" : ""}`}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {stayRooms.map((stay, index) => (
              <RoomParty
                key={index}
                index={index}
                occupancy={roomOccupancyLabel(stay)}
                principal={principalAt(index)}
                others={more[index] || []}
                selfName={selfName}
                skipSelf={skipSelf}
                onPrincipal={(value) => {
                  if (index === 0 && selfName && !sameName(value, selfName)) setSkipSelf(value.trim() ? false : skipSelf);
                  setLead((current) => current.map((name, at) => (at === index ? value : name)));
                }}
                onSkip={skipSelfToggle}
                onOther={(at, value) =>
                  setMore((current) => current.map((list, roomIndex) => (roomIndex === index ? list.map((name, place) => (place === at ? value : name)) : list)))
                }
                onAdd={() => setMore((current) => current.map((list, roomIndex) => (roomIndex === index ? [...list, ""] : list)))}
                onRemove={(at) => setMore((current) => current.map((list, roomIndex) => (roomIndex === index ? list.filter((_, place) => place !== at) : list)))}
              />
            ))}
            {note ? <p className="text-sm h-gold">{note}</p> : null}
          </div>
        ) : null}

        {view === "confirm" && rate && reading && done ? (
          <div data-hotel-confirm="1" data-hotel-done="1" className="h-paper space-y-4 px-4 py-6">
            <article className="h-recap space-y-3 text-[15px]">
              <p className="h-ink">{done}</p>
              <p className="h-serif text-[1.2rem] font-semibold leading-tight h-ink">{file?.name || hotel.name}</p>
              <p className="h-muted">{[file?.city || hotel.city, datesLabel, party].filter(Boolean).join(" · ")}</p>
              <p className="h-ink">{rate.room}</p>
              <p className="h-ink"><span className="h-muted">Pension · </span>{reading.board}</p>
              <p className="h-ink"><span className="h-muted">Annulation · </span>{reading.cancellation}</p>
              <p className="pt-2 text-2xl font-semibold h-ink">{euros(rate.sellCents, rate.currency)}</p>
            </article>
            <a href={whatsapp} className="h-btn flex h-12 items-center justify-center text-sm font-semibold">Écrire sur WhatsApp</a>
          </div>
        ) : null}
        {view === "confirm" && rate && reading && !done ? (
          <div data-hotel-confirm="1" className="h-paper space-y-4 px-4 py-4">
            <article className="h-recap space-y-3 text-[15px]">
              <p className="h-serif text-[1.2rem] font-semibold leading-tight h-ink">{file?.name || hotel.name}</p>
              <p className="h-muted">{[file?.city || hotel.city, datesLabel, party].filter(Boolean).join(" · ")}</p>
              <p className="h-ink">{rate.room}</p>
              <p className="h-ink"><span className="h-muted">Pension · </span>{reading.board}</p>
              <p className="h-ink"><span className="h-muted">Annulation · </span>{reading.cancellation}</p>
              {discreetPerk(rate.perks) ? <p className="text-[#9a7b4f]">{discreetPerk(rate.perks)}</p> : null}
              <ul className="space-y-1 h-ink">
                {guestLines().map((name, index) => (
                  <li key={`${name}-${index}`}>Chambre {index + 1} · {name}</li>
                ))}
              </ul>
              <p className="pt-2 text-2xl font-semibold h-ink">{euros(rate.sellCents, rate.currency)}</p>
            </article>
            <p className="px-1 text-sm h-muted">Aucun paiement n’est lancé. L’agence confirme d’abord.</p>
            {note ? <p className="px-1 text-sm h-gold">{note}</p> : null}
          </div>
        ) : null}
      </div>
      </div>

      {view === "hotel" && fromOffer ? (
        <Dock
          label="À partir de"
          price={`${euros(fromOffer.sellCents, fromOffer.currency)} TTC`}
          action="Voir les chambres"
          onAction={() => roomsRef.current?.scrollIntoView({ behavior: smoothScroll() ? "smooth" : "auto", block: "start" })}
        />
      ) : null}
      {view === "room" && rate ? (
        <Dock
          label="Séjour"
          price={`${euros(rate.sellCents, rate.currency)} TTC`}
          action={rate.offerId ? "Sélectionner" : "Tarif en préparation"}
          disabled={!rate.offerId}
          marker
          onAction={() => chooseRate(rate)}
        />
      ) : null}
      {view === "guests" && rate ? (
        <Dock
          label="Séjour"
          price={`${euros(rate.sellCents, rate.currency)} TTC`}
          action="Récapitulatif"
          onAction={() => (guestsReady() ? onStep("confirm") : setNote("Indiquez le prénom et le nom du voyageur principal de chaque chambre."))}
        />
      ) : null}
      {view === "confirm" && rate && !done ? (
        <Dock
          label="Séjour"
          price={`${euros(rate.sellCents, rate.currency)} TTC`}
          action={sending ? "Envoi…" : "Envoyer la demande"}
          disabled={sending || !rate.offerId}
          onAction={() => void send()}
        />
      ) : null}
    </div>
    </div>
  );
  if (!portal) return panel;
  return createPortal(panel, portal);
}
