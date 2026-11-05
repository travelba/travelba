"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { HotelBookingWait } from "@/components/account/HotelBookingWait";
import { HotelPhotoStrip } from "@/components/account/HotelPhotoStrip";
import { HotelGuaranteeNight } from "@/components/account/HotelGuaranteeNight";
import { HotelMap } from "@/components/account/HotelMap";
import { BusyBar } from "@/components/crm/BusyBar";
import { HotelBenefits } from "@/components/crm/HotelBenefits";
import { Icon } from "@/components/crm/icons";
import { postHotelActivity } from "@/lib/crm/hotel-activity-client";
import { cancellationPhrase, clientRateTitle, frenchClientProse, readStayRate } from "@/lib/crm/hotel-fr";
import { HotelCardHold } from "@/components/account/HotelCardHold";
import { LE_PAY_COPY, PAY_COPY } from "@/lib/crm/hotel-direct";
import { lePrimaryGuest, leWidgetSignal, safeCardWidgetUrl } from "@/lib/crm/le-self-book";
import {
  BOOKING_STEPS,
  collapseRooms,
  guestNameOk,
  offeredPayMethods,
  payStepAction,
  rateBoardLine,
  rateChips,
  stayBenefits,
  type PayMethod,
  type BookingStep,
  type ClientHotelFile,
  type ClientRate,
  type ClientRoom,
  type HotelJourneyStep,
} from "@/lib/crm/hotel-journey";
import { roomOccupancyLabel } from "@/lib/crm/hotel-party";
import type { ClientHotel, HotelRoomOccupancy } from "@/lib/crm/hotel-search";
import { formatMoney } from "@/lib/crm/money";
import { siteConfig } from "@/lib/site";

type Step = "hotel" | BookingStep;

const BOOKING_FAILED = "La réservation n’a pas abouti.";

function euros(cents: number, currency: string) {
  return formatMoney(cents / 100, currency);
}

type BookingReply = {
  ok?: boolean;
  error?: string;
  code?: string;
  sellCents?: number;
  terms?: string;
  widgetUrl?: string;
  widgetOrigin?: string;
  clientSecret?: string;
  intentId?: string;
  phase?: string;
  view?: { id: string; label: string; cancel: "cancel" | "ask" | "none"; conditions: string; dossier?: string | null; confirmation?: string | null };
};

async function readBookingResponse(response: Response, onPhase: (phase: "hotel" | "stay") => void): Promise<BookingReply | null> {
  const type = response.headers.get("content-type") || "";
  if (!type.includes("ndjson") || !response.body) {
    return (await response.json().catch(() => null)) as BookingReply | null;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let last: BookingReply | null = null;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as BookingReply;
      if (event.phase === "hotel" || event.phase === "stay") onPhase(event.phase);
      if (event.ok != null || event.error || event.view || event.widgetUrl) last = event;
    }
  }
  return last;
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
  return (
    <div data-hotel-gallery="1" className="relative aspect-[16/10] w-full bg-[#0B192C]">
      <HotelPhotoStrip images={images} alt={alt} eager fullscreen />
    </div>
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

function StayBenefits({ lines, discreet }: { lines: string[]; discreet: string }) {
  if (lines.length) {
    return (
      <div data-hotel-benefits="1">
        <HotelBenefits lines={lines} />
      </div>
    );
  }
  if (!discreet) return null;
  return (
    <p className="text-[12px] text-[#9a7b4f]" data-hotel-benefits="1">
      {discreet}
    </p>
  );
}

function StepNav({
  priceLabel,
  price,
  onPrevious,
  onNext,
  nextLabel,
  nextDisabled,
  marker,
}: {
  priceLabel?: string;
  price?: string;
  onPrevious: () => void;
  onNext: () => void;
  nextLabel: string;
  nextDisabled?: boolean;
  marker?: boolean;
}) {
  return (
    <div className="h-dock shrink-0" data-hotel-dock="1">
      <div className="px-4 pt-2 pb-9 md:pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {price ? (
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <p className="h-kicker">{priceLabel}</p>
            <p className="truncate text-lg font-semibold h-ink">{price}</p>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onPrevious} className="h-press h-btn-line h-11 text-sm font-semibold" data-hotel-prev="1">
            Précédent
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={nextDisabled}
            data-hotel-next="1"
            data-hotel-rate-cta={marker ? "1" : undefined}
            className="h-press h-btn h-11 text-sm font-semibold disabled:opacity-40"
          >
            {nextLabel}
          </button>
        </div>
      </div>
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
        <span className="mt-1 block text-sm h-muted">Prénom puis nom, le nom en entier.</span>
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
  trial = true,
  leApi = false,
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
  trial?: boolean;
  /** Réservation par l’API. Les autres clients gardent le parcours e-mail. */
  leApi?: boolean;
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
  const [placing, setPlacing] = useState(false);
  const [waitPhase, setWaitPhase] = useState<"hotel" | "stay">("hotel");
  const [fareBlock, setFareBlock] = useState<string | null>(null);
  const router = useRouter();
  const portal = useSyncExternalStore(
    () => () => {},
    () => document.body,
    () => null,
  );
  const [done, setDone] = useState("");
  const [payMethod, setPayMethod] = useState<PayMethod | "">("");
  const [stripeReady, setStripeReady] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  const [arrival, setArrival] = useState("");
  const [stayId, setStayId] = useState("");
  const [stayCancel, setStayCancel] = useState<"cancel" | "ask" | "none">("none");
  const [stayConditions, setStayConditions] = useState("");
  const [cardSecret, setCardSecret] = useState<{ clientSecret: string; intentId: string } | null>(null);
  const [widget, setWidget] = useState<{ url: string; origin: string; terms: string } | null>(null);
  const [cardFrame, setCardFrame] = useState<"idle" | "loading" | "ready" | "saved">("idle");
  const payCopy = leApi
    ? { cardTitle: LE_PAY_COPY.clientTitle, card: LE_PAY_COPY.client, agencyTitle: LE_PAY_COPY.agencyTitle, agency: LE_PAY_COPY.agency }
    : { cardTitle: PAY_COPY.cardTitle, card: PAY_COPY.card, agencyTitle: PAY_COPY.agencyTitle, agency: PAY_COPY.agency };
  const roomsRef = useRef<HTMLDivElement>(null);
  const confirmCard = useRef<(() => Promise<boolean>) | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const payCurrency = rate?.currency || "";
  const payMethods = useMemo(
    () => offeredPayMethods({ api: Boolean(leApi), currency: payCurrency }),
    [leApi, payCurrency]
  );
  const selectedPay: PayMethod | "" = payMethod && payMethods.includes(payMethod) ? payMethod : "";

  useEffect(() => {
    const lock = placing || Boolean(widget) || (sending && !widget);
    if (!lock) return;
    document.body.setAttribute("data-hotel-lock", "1");
    return () => document.body.removeAttribute("data-hotel-lock");
  }, [placing, widget, sending]);

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
  const programme = stayBenefits(hotel.benefits, hotel.perks);
  const boardLine = reading ? rateBoardLine(reading.board, programme.lines) : "";
  const view: Step = done && rate
    ? "confirm"
    : step === "pay" && rate
      ? "pay"
      : step === "confirm" && rate
        ? "pay"
        : step === "recap" && rate
          ? "recap"
          : step === "guests" && rate
            ? "guests"
            : step === "room" && room
              ? "room"
              : "hotel";
  const fromOffer = file?.rooms
    .map((item) => item.rates[0])
    .filter((item): item is ClientRate => Boolean(item))
    .sort((left, right) => left.sellCents - right.sellCents)[0];

  function chooseRoom(next: ClientRoom) {
    const picked = collapseRooms([next])[0] || next;
    setRoom(picked);
    setRate(picked.rates[0] || null);
    postHotelActivity({
      kind: "room",
      hotel: file?.name || hotel.name,
      room: picked.name,
      rate: picked.rates[0]?.title,
    });
    onStep("room");
  }

  function chooseRate(next: ClientRate) {
    if (!next.offerId) return;
    const same = rate?.offerId === next.offerId && rate.title === next.title && rate.sellCents === next.sellCents;
    setRate(next);
    if (!same) {
      setSkipSelf(false);
      setLead(stayRooms.map((_, index) => (index === 0 && selfName ? selfName : "")));
      setMore(stayRooms.map(() => []));
      setNote("");
      setFareBlock(null);
    }
    postHotelActivity({ kind: "room", hotel: file?.name || hotel.name, room: next.room, rate: next.title });
  }

  function roomPeople(index: number) {
    return [principalAt(index), ...(more[index] || [])].map((name) => name.replace(/\s+/g, " ").trim()).filter(Boolean);
  }

  function guestsReady() {
    return stayRooms.every((_, index) => {
      if (!lePrimaryGuest(principalAt(index))) return false;
      return (more[index] || []).every((name) => !name.trim() || Boolean(lePrimaryGuest(name)));
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

  function goPrevious() {
    if (widget && !placing && !done) {
      setWidget(null);
      setCardFrame("idle");
      return;
    }
    if (done || view === "confirm") {
      onBack();
      return;
    }
    if (view === "room") onStep("hotel");
    else if (view === "guests") onStep("room");
    else if (view === "recap") onStep("guests");
    else if (view === "pay") onStep("recap");
    else onStep("back");
  }

  useEffect(() => {
    if (!widget) return;
    const onMessage = (event: MessageEvent) => {
      const signal = leWidgetSignal({ origin: event.origin, allowedOrigin: widget.origin, data: event.data });
      if (signal === "ready") setCardFrame("saved");
      if (signal === "error") {
        setWidget(null);
        setCardFrame("idle");
        setStripeReady(false);
        setFareBlock("La carte n’a pas été acceptée. Vérifiez les informations.");
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [widget]);

  async function send(intentId?: string, cardReady?: boolean) {
    if (!rate?.offerId || !selectedPay) return;
    const guests = stayRooms.map((_, index) => principalAt(index).replace(/\s+/g, " ").trim());
    const companions = stayRooms.map((_, index) =>
      (more[index] || []).map((name) => name.replace(/\s+/g, " ").trim()).filter(Boolean)
    );
    if (!guestsReady()) {
      setNote("Indiquez le prénom et le nom de chaque voyageur, une personne par ligne.");
      return;
    }
    const books = cardReady === true || Boolean(intentId) || selectedPay === "agency";
    if (books) {
      setWaitPhase("hotel");
      setPlacing(true);
      scrollerRef.current?.scrollTo({ top: 0 });
    }
    setFareBlock(null);
    setSending(true);
    setNote("");
    let leaving = false;
    try {
      const response = await fetch("/api/client/hotels/reserver", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ offerId: rate.offerId, guests, companions, payMethod: selectedPay, arrival, intentId, cardReady: cardReady === true }),
      });
      const json = await readBookingResponse(response, (phase) => setWaitPhase(phase));
      const widgetUrl = json?.widgetUrl ? safeCardWidgetUrl(json.widgetUrl) : null;
      if (widgetUrl && json?.widgetOrigin) {
        setCardFrame("loading");
        setWidget({ url: widgetUrl, origin: json.widgetOrigin, terms: json.terms || rate.terms || "" });
        if (json.terms) setRate({ ...rate, terms: json.terms });
        setCardSecret(null);
        setStripeReady(false);
        if (!response.ok) setNote(json?.error || "La saisie de la carte a expiré. Recommencez.");
        return;
      }
      if (json?.error || !response.ok) {
        if (json?.code === "price_changed" && typeof json.sellCents === "number" && rate) {
          setRate({ ...rate, sellCents: json.sellCents, terms: json.terms || rate.terms });
        }
        setCardSecret(null);
        setStripeReady(false);
        setCardFrame("idle");
        setWidget(null);
        setFareBlock(json?.error || BOOKING_FAILED);
        setNote("");
        return;
      }
      if (json?.clientSecret && json.intentId) {
        setStripeReady(false);
        setCardSecret({ clientSecret: json.clientSecret, intentId: json.intentId });
        return;
      }
      if (json?.view) {
        if (json.view.dossier) {
          leaving = true;
          router.push(`/mon-compte/reservations/${json.view.dossier}?confirme=1`);
          return;
        }
        if (leApi && json.view.confirmation) {
          leaving = true;
          router.push("/mon-compte?confirme=1");
          return;
        }
        setStayId(json.view.id);
        setStayCancel(json.view.cancel);
        setStayConditions(json.view.conditions);
        setDone(json.view.label);
        setCardSecret(null);
        setStripeReady(false);
        setCardFrame("idle");
        setWidget(null);
        setFareBlock(null);
        onStep("confirm");
        scrollerRef.current?.scrollTo({ top: 0 });
      }
    } finally {
      if (!leaving) {
        setSending(false);
        setPlacing(false);
      }
    }
  }

  function choosePay(next: PayMethod) {
    if (next === selectedPay) return;
    setPayMethod(next);
    setCardFrame("idle");
    setWidget(null);
    setCardSecret(null);
    setStripeReady(false);
    confirmCard.current = null;
  }

  function movePay(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const index = payMethods.indexOf(selectedPay as PayMethod);
    const forward = event.key === "ArrowDown" || event.key === "ArrowRight";
    const nextIndex = index < 0 ? (forward ? 0 : payMethods.length - 1) : (index + (forward ? 1 : -1) + payMethods.length) % payMethods.length;
    const next = payMethods[nextIndex];
    if (!next) return;
    choosePay(next);
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-hotel-pay-choice="${next}"]`)?.focus();
  }

  async function confirmPay() {
    if (!rate?.offerId || !selectedPay || sending || authorizing) return;
    if (selectedPay === "card" && widget) {
      if (cardFrame !== "saved") return;
      await send(undefined, true);
      return;
    }
    if (selectedPay === "card" && cardSecret) {
      if (!stripeReady || !confirmCard.current) return;
      setAuthorizing(true);
      let accepted = false;
      try {
        accepted = await confirmCard.current();
      } finally {
        setAuthorizing(false);
      }
      if (!accepted) return;
      await send(cardSecret.intentId);
      return;
    }
    await send();
  }

  async function actStay(action: "cancel" | "ask") {
    if (!stayId) return;
    setSending(true);
    setNote("");
    try {
      const response = await fetch("/api/client/hotels/sejour", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stayId, action }),
      });
      const json = (await response.json().catch(() => null)) as {
        error?: string;
        view?: { label: string; cancel: "cancel" | "ask" | "none"; conditions: string };
      } | null;
      if (!response.ok || !json?.view) {
        setNote(json?.error || "L’action n’a pas abouti.");
        return;
      }
      setStayCancel(json.view.cancel);
      setStayConditions(json.view.conditions);
      setDone(json.view.label);
    } finally {
      setSending(false);
    }
  }

  const payAction = payStepAction({
    method: selectedPay,
    trial: Boolean(trial),
    failed: Boolean(fareBlock),
    sending: sending || authorizing,
    cardOpen: selectedPay === "card" && (Boolean(widget) || Boolean(cardSecret)),
    cardComplete: Boolean(widget) ? cardFrame === "saved" : Boolean(cardSecret) && stripeReady,
    offerReady: Boolean(rate?.offerId),
  });

  const panel = (
    <div className="hotel-theme">
    <div
      className="h-journey h-bg"
      data-hotel-journey="1"
      style={widget && !placing ? { background: "#0B192C", color: "#f7f4ee" } : undefined}
    >
      <header
        className="shrink-0"
        data-hotel-steps="1"
        style={widget && !placing ? { background: "#0B192C", color: "#f7f4ee" } : { background: "#fff" }}
      >
        <div className="grid grid-cols-[2.75rem_1fr_2.75rem] items-center">
          <button
            type="button"
            aria-label="Retour"
            onClick={goPrevious}
            className="h-hit h-press grid w-11 place-items-center"
            style={{ color: widget && !placing ? "#C5A880" : "#1a1a1a" }}
          >
            <Icon name="chevron_left" className="h-5 w-5" />
          </button>
          <p className={`h-serif truncate text-center text-[17px] font-semibold leading-none ${widget && !placing ? "" : "h-ink"}`}>
            {placing ? "Réservation" : view === "hotel" ? file?.name || hotel.name : BOOKING_STEPS.find((item) => item.id === view)?.label}
          </p>
          <span />
        </div>
        {placing || view === "hotel" ? null : (
          <ol data-hotel-stepper="1" className="flex items-center justify-between gap-1 overflow-x-auto px-3 pb-2 text-[10px] font-semibold">
            {BOOKING_STEPS.map((item, index) => (
              <li
                key={item.id}
                aria-current={item.id === view ? "step" : undefined}
                className={`shrink-0 ${item.id === view ? "text-[#8c7352]" : widget ? "text-[#f7f4ee]/45" : "text-[#1a1a1a]/40"}`}
              >
                {index + 1} {item.label}
              </li>
            ))}
          </ol>
        )}
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
        {placing ? <HotelBookingWait phase={waitPhase} /> : null}
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
              <StayBenefits lines={programme.lines} discreet={programme.discreet} />
              {!file ? (
                <div data-hotel-check="1" className="space-y-3 pt-2">
                  <p className="h-serif text-[1.15rem] font-semibold h-ink">Nous vérifions le tarif en temps réel…</p>
                  <BusyBar label="Nous vérifions le tarif en temps réel…" />
                  <div className="h-24 animate-pulse rounded-2xl h-skel" />
                  <div className="h-24 animate-pulse rounded-2xl h-skel" />
                </div>
              ) : null}
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
                      const perk = programme.lines.length ? "" : programme.discreet;
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
              {file?.rooms.length && others.length ? (
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
              <div className="space-y-3" role="radiogroup" aria-label="Tarifs" data-hotel-rates="1">
                {room.rates.map((item) => {
                  const line = readStayRate(item);
                  const selected = rate.offerId === item.offerId && rate.title === item.title && rate.sellCents === item.sellCents;
                  const chips = rateChips({ breakfast: item.perks.breakfast, freeCancellation: item.perks.freeCancellation, benefits: programme.lines });
                  return (
                    <button
                      key={`${item.offerId || ""}-${item.title}-${item.sellCents}`}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={!item.offerId}
                      onClick={() => chooseRate(item)}
                      className={`h-recap w-full space-y-2 text-left disabled:opacity-40 ${selected ? "ring-2 ring-[#C5A880]" : ""}`}
                    >
                      <span className="h-serif block text-[1.05rem] font-semibold h-ink">{clientRateTitle(item.title)}</span>
                      {chips.length ? (
                        <span className="flex flex-wrap gap-2">
                          {chips.map((chip) => (
                            <span key={chip} className="h-pill">{chip}</span>
                          ))}
                        </span>
                      ) : null}
                      <span className="block text-sm h-muted">{line.cancellation}</span>
                      <span className="block text-lg font-semibold h-ink">{euros(item.sellCents, item.currency)} TTC</span>
                    </button>
                  );
                })}
              </div>
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
                <div className="mt-5">
                  <StayBenefits lines={programme.lines} discreet={programme.discreet} />
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {view === "guests" && rate && reading ? (
          <div data-hotel-guests="1" className="h-paper space-y-6 px-4 py-4">
            <article className="h-recap min-w-0">
              <p className="truncate text-sm h-muted">{[file?.name || hotel.name, rate.room].filter(Boolean).join(" · ")}</p>
              <h2 className="h-serif mt-1 text-[1.2rem] font-semibold leading-tight h-ink">{reading.title}</h2>
              {boardLine ? <p className="mt-3 text-[15px] leading-relaxed h-ink">{boardLine}</p> : null}
              <p className="mt-1 text-[15px] leading-relaxed h-muted">{reading.cancellation}</p>
              <p className="mt-4 text-2xl font-semibold tracking-tight h-ink">{euros(rate.sellCents, rate.currency)}</p>
              <p className="mt-1 text-sm h-muted">{datesLabel}</p>
              <div className="mt-4">
                <StayBenefits lines={programme.lines} discreet={programme.discreet} />
              </div>
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

        {view === "recap" && rate && reading ? (
          <div data-hotel-recap="1" className="h-paper space-y-4 px-4 py-4">
            <article className="h-recap space-y-3 text-[15px]">
              <p className="h-serif text-[1.2rem] font-semibold leading-tight h-ink">{file?.name || hotel.name}</p>
              <p className="h-muted">{[file?.city || hotel.city, datesLabel].filter(Boolean).join(" · ")}</p>
              <p className="h-ink">{rate.room}</p>
              <p className="h-ink">{reading.title}</p>
              {boardLine ? <p className="h-ink"><span className="h-muted">Pension · </span>{boardLine}</p> : null}
              <p className="h-ink"><span className="h-muted">Annulation · </span>{reading.cancellation}</p>
              <StayBenefits lines={programme.lines} discreet={programme.discreet} />
              <ul className="space-y-1 h-ink">
                {stayRooms.map((_, index) => (
                  <li key={index}>
                    Chambre {index + 1}
                    {roomPeople(index).map((name) => (
                      <span key={name} className="block">{name}</span>
                    ))}
                  </li>
                ))}
              </ul>
              <p className="pt-2 text-2xl font-semibold h-ink">{euros(rate.sellCents, rate.currency)} TTC</p>
            </article>
          </div>
        ) : null}

        {!placing && view === "confirm" && rate && reading && done ? (
          <div data-hotel-confirm="1" data-hotel-done="1" className="h-paper space-y-4 px-4 py-6">
            <article className="h-recap space-y-3 text-[15px]">
              <p className="h-ink" data-hotel-status="1">{done}</p>
              <p className="h-serif text-[1.2rem] font-semibold leading-tight h-ink">{file?.name || hotel.name}</p>
              <p className="h-muted">{[file?.city || hotel.city, datesLabel, party].filter(Boolean).join(" · ")}</p>
              <p className="h-ink">{rate.room}</p>
              <StayBenefits lines={programme.lines} discreet={programme.discreet} />
              <p className="pt-2 text-2xl font-semibold h-ink">{euros(rate.sellCents, rate.currency)}</p>
              {stayConditions ? <p className="h-muted">{stayConditions}</p> : null}
            </article>
            {stayCancel === "cancel" ? (
              <button type="button" className="h-btn h-12 w-full text-sm font-semibold" disabled={sending} onClick={() => void actStay("cancel")}>
                Annuler
              </button>
            ) : null}
            {stayCancel === "ask" ? (
              <button type="button" className="h-btn h-12 w-full text-sm font-semibold" disabled={sending} onClick={() => void actStay("ask")}>
                Demander à l’agence
              </button>
            ) : null}
            {note ? <p className="text-sm h-gold">{note}</p> : null}
            <a href={whatsapp} className="flex h-12 items-center justify-center text-sm font-semibold h-ink">Écrire sur WhatsApp</a>
          </div>
        ) : null}
        {!placing && view === "pay" && rate && reading && widget ? (
          <HotelGuaranteeNight
            widgetUrl={widget.url}
            state={cardFrame === "saved" ? "saved" : cardFrame === "ready" ? "ready" : "loading"}
            onLoad={() => setCardFrame((current) => (current === "saved" ? current : "ready"))}
          />
        ) : null}
        {!placing && view === "pay" && sending && !widget ? (
          <div data-hotel-check="1" className="flex min-h-[70vh] flex-col items-center px-8 pt-16 text-center">
            <p className="h-serif text-[1.35rem] leading-snug h-ink">Nous vérifions le tarif en temps réel…</p>
            <div className="mt-6 w-full max-w-[16rem]">
              <BusyBar active label="Nous vérifions le tarif en temps réel…" />
            </div>
            <div className="mt-8 w-full space-y-3">
              <div className="h-24 animate-pulse rounded-2xl h-skel" />
              <div className="h-24 animate-pulse rounded-2xl h-skel" />
            </div>
          </div>
        ) : null}
        {!placing && view === "pay" && rate && reading && !widget && !sending ? (
          <div data-hotel-pay-step="1" className="h-paper space-y-4 px-4 py-4">
            <article className="h-recap space-y-3 text-[15px]">
              <p className="h-serif text-[1.2rem] font-semibold leading-tight h-ink">{file?.name || hotel.name}</p>
              <p className="h-muted">{[file?.city || hotel.city, datesLabel].filter(Boolean).join(" · ")}</p>
              <p className="h-ink">{reading.title}</p>
              <StayBenefits lines={programme.lines} discreet={programme.discreet} />
              <p className="pt-2 text-2xl font-semibold h-ink">{euros(rate.sellCents, rate.currency)} TTC</p>
              {rate.terms ? <p className="text-[15px] leading-relaxed h-ink">{rate.terms}</p> : null}
            </article>
            {fareBlock ? (
              <div role="alert" data-hotel-error="1" className="h-recap space-y-1">
                <p className="h-serif text-[1.05rem] font-semibold h-ink">{BOOKING_FAILED}</p>
                {fareBlock !== BOOKING_FAILED ? <p className="text-sm leading-relaxed h-muted">{fareBlock}</p> : null}
              </div>
            ) : null}
            <div
              className="space-y-2"
              role="radiogroup"
              aria-label="Règlement"
              data-hotel-pay="1"
              onKeyDown={movePay}
            >
              {payMethods.map((method, index) => {
                const selected = selectedPay === method;
                const title = method === "card" ? payCopy.cardTitle : payCopy.agencyTitle;
                const body = method === "card" ? payCopy.card : payCopy.agency;
                return (
                  <button
                    key={method}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    data-hotel-pay-choice={method}
                    tabIndex={selectedPay ? (selected ? 0 : -1) : index === 0 ? 0 : -1}
                    disabled={authorizing}
                    className={`h-recap flex w-full items-start gap-3 px-4 py-3 text-left border-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C5A880] disabled:opacity-60 ${selected ? "border-[#C5A880]" : "border-[#e7e1d6]"}`}
                    onClick={() => choosePay(method)}
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-[10px] border ${selected ? "border-[#C5A880] bg-[#C5A880] text-[#0B192C]" : "border-[#1a1a1a]/30 bg-white"}`}
                    >
                      {selected ? <Icon name="check" className="h-3 w-3" strokeWidth={3} /> : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold h-ink">{title}</span>
                      <span className="mt-1 block text-sm h-muted">{body}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="space-y-2">
              <label className="block px-1 text-sm h-muted">
                Heure d’arrivée
                <input
                  value={arrival}
                  onChange={(event) => setArrival(event.target.value.slice(0, 12))}
                  placeholder="18 h"
                  className="mt-1 h-11 w-full rounded-2xl bg-white px-3 text-[15px] h-ink"
                />
              </label>
              {trial ? <p className="px-1 text-sm h-muted">{PAY_COPY.trial}</p> : null}
            </div>
            {cardSecret ? (
              <HotelCardHold
                clientSecret={cardSecret.clientSecret}
                confirmRef={confirmCard}
                onComplete={setStripeReady}
                onFail={(message) => {
                  setCardSecret(null);
                  setStripeReady(false);
                  setCardFrame("idle");
                  setFareBlock(message || BOOKING_FAILED);
                }}
              />
            ) : null}
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
        <StepNav
          priceLabel="Séjour"
          price={`${euros(rate.sellCents, rate.currency)} TTC`}
          onPrevious={() => onStep("hotel")}
          onNext={() => {
            if (rate.offerId) onStep("guests");
          }}
          nextLabel="Suivant"
          nextDisabled={!rate.offerId}
          marker
        />
      ) : null}
      {view === "guests" && rate ? (
        <StepNav
          priceLabel="Séjour"
          price={`${euros(rate.sellCents, rate.currency)} TTC`}
          onPrevious={() => onStep("room")}
          onNext={() => (guestsReady() ? onStep("recap") : setNote("Indiquez le prénom et le nom de chaque voyageur, une personne par ligne."))}
          nextLabel="Suivant"
        />
      ) : null}
      {view === "recap" && rate ? (
        <StepNav
          priceLabel="Séjour"
          price={`${euros(rate.sellCents, rate.currency)} TTC`}
          onPrevious={() => onStep("guests")}
          onNext={() => onStep("pay")}
          nextLabel="Suivant"
        />
      ) : null}
      {view === "pay" && rate && !placing ? (
        <StepNav
          priceLabel="Séjour"
          price={`${euros(rate.sellCents, rate.currency)} TTC`}
          onPrevious={goPrevious}
          onNext={() => void confirmPay()}
          nextLabel={payAction.label}
          nextDisabled={payAction.disabled}
        />
      ) : null}
    </div>
    </div>
  );
  if (!portal) return panel;
  return createPortal(panel, portal);
}
