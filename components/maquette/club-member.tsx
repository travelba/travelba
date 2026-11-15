"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { HotelBenefits } from "@/components/crm/HotelBenefits";
import { HotelWait } from "@/components/account/HotelWait";
import { Icon } from "@/components/crm/icons";
import { ClubBanner, ClubButton, ClubField, ClubMemberFrame, GoldChoice } from "@/components/maquette/club-chrome";
import {
  CLUB_FEE_EXAMPLE,
  CLUB_HOTELS,
  CLUB_MEMBER,
  CLUB_SCREENS,
  CLUB_STAY,
  clubHotel,
  clubScreenById,
  type ClubHotel,
} from "@/lib/crm/club-maquette";
import { formatMoney } from "@/lib/crm/money";
import { siteConfig } from "@/lib/site";

const SIGNED = new Set([
  "search",
  "hotel",
  "rate",
  "group",
  "guest",
  "pay",
  "price",
  "soldout",
  "expired",
  "dues",
  "confirm",
  "email",
  "whatsapp",
  "reminder",
  "stays",
  "stay",
  "cancel",
  "fee",
  "fee-pay",
  "referral",
  "concierge",
  "account",
  "delete",
]);

function euros(amount: number) {
  return formatMoney(amount, "EUR");
}

function Dock({ signedIn, children }: { signedIn?: boolean; children: ReactNode }) {
  return (
    <div
      className="h-dock fixed inset-x-0 z-40"
      style={{ bottom: signedIn ? "calc(3.5rem + env(safe-area-inset-bottom, 0px))" : "0" }}
    >
      <div className="mx-auto max-w-[480px] px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">{children}</div>
    </div>
  );
}

function perNight(hotel: ClubHotel) {
  return Math.round(hotel.total / hotel.nights);
}

function rateOf(hotel: ClubHotel, rateId: string) {
  for (const room of hotel.rooms) {
    const rate = room.rates.find((item) => item.id === rateId);
    if (rate) return { room, rate };
  }
  const room = hotel.rooms[0];
  return { room, rate: room.rates[0] };
}

function groupQuote(hotel: ClubHotel) {
  const text = `Bonjour, je voudrais un devis groupe pour le Club Travel BA — ${hotel.name}, ${hotel.city}.`;
  return `https://wa.me/${siteConfig.whatsappNumber}?text=${encodeURIComponent(text)}`;
}

export function ClubMember({
  path,
  screen,
  hotelSlug,
}: {
  path: string;
  screen: string;
  hotelSlug: string;
}) {
  const hotel = clubHotel(hotelSlug) || CLUB_HOTELS[0];
  const meta = clubScreenById(screen);
  const title = screen === "index" ? "Club Travel BA" : meta?.title || "Club Travel BA";

  if (screen === "search-wait") {
    return (
      <div className="hotel-theme" data-maquette="club">
        <ClubBanner />
        <HotelWait place="Marrakech" detail="12–15 mars 2027 · 2 adultes · exemple" />
        <Link
          href="/maquette/club/recherche"
          className="fixed bottom-8 left-1/2 z-[80] -translate-x-1/2 rounded-full bg-[#C5A880] px-5 py-3 text-sm font-semibold text-[#0B192C]"
        >
          Voir les résultats d’exemple
        </Link>
      </div>
    );
  }

  return (
    <ClubMemberFrame title={title} path={path} signedIn={SIGNED.has(screen)} wide={screen === "index"}>
      {screen === "index" ? <Index /> : null}
      {screen === "public" ? <PublicScreen /> : null}
      {screen === "signup" ? <SignupScreen /> : null}
      {screen === "phone" ? <PhoneScreen /> : null}
      {screen === "password" ? <PasswordScreen /> : null}
      {screen === "relatives" ? <RelativesScreen /> : null}
      {screen === "card" ? <CardScreen /> : null}
      {screen === "wait" ? <WaitScreen /> : null}
      {screen === "refuse" ? <RefuseScreen /> : null}
      {screen === "existing" ? <ExistingScreen /> : null}
      {screen === "login" ? <LoginScreen /> : null}
      {screen === "search" ? <SearchScreen /> : null}
      {screen === "hotel" ? <HotelScreen hotel={hotel} /> : null}
      {screen === "rate" ? <RateScreen hotel={hotel} /> : null}
      {screen === "group" ? <GroupScreen hotel={hotel} /> : null}
      {screen === "guest" ? <GuestScreen hotel={hotel} /> : null}
      {screen === "pay" ? <PayScreen /> : null}
      {screen === "price" ? <PriceScreen /> : null}
      {screen === "soldout" ? <SoldOutScreen /> : null}
      {screen === "expired" ? <ExpiredScreen /> : null}
      {screen === "dues" ? <DuesScreen /> : null}
      {screen === "confirm" ? <ConfirmScreen /> : null}
      {screen === "email" ? <EmailScreen /> : null}
      {screen === "whatsapp" ? <WhatsappScreen /> : null}
      {screen === "reminder" ? <ReminderScreen /> : null}
      {screen === "stays" ? <StaysScreen /> : null}
      {screen === "stay" ? <StayScreen /> : null}
      {screen === "cancel" ? <CancelScreen /> : null}
      {screen === "fee" ? <FeeScreen /> : null}
      {screen === "fee-pay" ? <FeePayScreen /> : null}
      {screen === "referral" ? <ReferralScreen /> : null}
      {screen === "concierge" ? <ConciergeScreen /> : null}
      {screen === "account" ? <AccountScreen /> : null}
      {screen === "delete" ? <DeleteScreen /> : null}
    </ClubMemberFrame>
  );
}

function Index() {
  const lanes = [
    ["parcours", "Parcours membre"],
    ["cas", "Cas particuliers"],
    ["agence", "Agence"],
  ] as const;
  return (
    <div className="space-y-8">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8c7352]">Travel BA</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-[#0B192C]">Club Travel BA</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-[#1a1a1a]">
          Maquette cliquable, dans l’ordre du parcours. Les noms sont inventés. Rien n’est enregistré, aucun paiement ne part.
          RateHawk et Expedia ne sont pas dans cette maquette.
        </p>
      </div>
      {lanes.map(([lane, label]) => (
        <section key={lane}>
          <h2 className="font-display text-lg font-semibold text-[#0B192C]">{label}</h2>
          <ol className="mt-3 space-y-2">
            {CLUB_SCREENS.filter((item) => item.lane === lane).map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="h-recap flex items-start gap-3">
                  <span className="mt-0.5 text-sm font-semibold text-[#8c7352]">{CLUB_SCREENS.indexOf(item) + 1}</span>
                  <span>
                    <span className="block font-semibold text-[#1a1a1a]">{item.title}</span>
                    <span className="mt-0.5 block text-sm text-[#6d675f]">{item.summary}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function PublicScreen() {
  return (
    <div className="space-y-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8c7352]">Travel BA</p>
      <h1 className="font-display text-[2rem] font-semibold leading-none text-[#1a1a1a]">Club Travel BA</h1>
      <p className="text-[15px] leading-relaxed">
        Le programme hôtelier de l’agence, pour les particuliers qui voyagent, où qu’ils habitent. Une adresse e-mail suffit, même gratuite.
      </p>
      <ul className="space-y-2 text-sm">
        <li>Hôtels Little Emperors, au prix du séjour, TTC, en euros.</li>
        <li>Petit-déjeuner, surclassement et avantages du programme.</li>
        <li>Un concierge sur WhatsApp, et vos séjours dans l’application.</li>
      </ul>
      <ClubButton href="/maquette/club/inscription">S’inscrire</ClubButton>
      <ClubButton href="/maquette/club/connexion">J’ai déjà un accès</ClubButton>
      <Link href="/maquette/club/deja-client" className="block text-center text-sm font-semibold text-[#8c7352]">
        Je suis déjà client de l’agence
      </Link>
    </div>
  );
}

function SignupScreen() {
  const [code, setCode] = useState("");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const ready = first.trim().length > 1 && last.trim().length > 1 && email.includes("@");
  return (
    <form className="space-y-4" onSubmit={(event) => event.preventDefault()}>
      <p className="text-sm h-muted">Exemple : {CLUB_MEMBER.firstName} {CLUB_MEMBER.lastName}, {CLUB_MEMBER.email}</p>
      <ClubField label="Code de parrainage (facultatif)" value={code} onChange={(event) => setCode(event.target.value)} placeholder="CLUB-EXEMPLE" autoComplete="off" />
      <ClubField label="Prénom" value={first} onChange={(event) => setFirst(event.target.value)} autoComplete="off" />
      <ClubField label="Nom" value={last} onChange={(event) => setLast(event.target.value)} autoComplete="off" />
      <ClubField label="E-mail" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="off" />
      <p className="text-sm h-muted">Gmail, Outlook ou une adresse professionnelle : toutes conviennent.</p>
      <Dock>
        <ClubButton href={ready ? "/maquette/club/inscription/telephone" : undefined} disabled={!ready}>
          Suivant
        </ClubButton>
      </Dock>
    </form>
  );
}

function PhoneScreen() {
  const [code, setCode] = useState("");
  const ready = /^\d{6}$/.test(code);
  return (
    <form className="space-y-4" onSubmit={(event) => event.preventDefault()}>
      <p className="text-[15px] leading-relaxed">Nous envoyons un code au {CLUB_MEMBER.phone}. Dans cette maquette, saisissez 000000.</p>
      <ClubField label="Téléphone" defaultValue={CLUB_MEMBER.phone} autoComplete="off" />
      <ClubField label="Code reçu" inputMode="numeric" value={code} onChange={(event) => setCode(event.target.value)} autoComplete="off" />
      <Dock>
        <ClubButton href={ready ? "/maquette/club/inscription/mot-de-passe" : undefined} disabled={!ready}>
          Suivant
        </ClubButton>
      </Dock>
    </form>
  );
}

function PasswordScreen() {
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const ready = password.length >= 8 && password === again;
  return (
    <form className="space-y-4" onSubmit={(event) => event.preventDefault()}>
      <p className="text-[15px] leading-relaxed">Vous vous connecterez avec ce mot de passe. Huit caractères au minimum.</p>
      <ClubField label="Mot de passe" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" />
      <ClubField label="Confirmation" type="password" value={again} onChange={(event) => setAgain(event.target.value)} autoComplete="new-password" />
      <Dock>
        <ClubButton href={ready ? "/maquette/club/inscription/proches" : undefined} disabled={!ready}>
          Suivant
        </ClubButton>
      </Dock>
    </form>
  );
}

function RelativesScreen() {
  return (
    <form className="space-y-4" onSubmit={(event) => event.preventDefault()}>
      <p className="text-[15px] leading-relaxed">Vous pourrez réserver au nom d’un proche. Cette étape est facultative.</p>
      <ClubField label="Prénom et nom" placeholder={CLUB_MEMBER.relative} autoComplete="off" />
      <ClubButton href="/maquette/club/garantie">Suivant</ClubButton>
      <Link href="/maquette/club/garantie" className="block text-center text-sm font-semibold text-[#8c7352]">
        Passer cette étape
      </Link>
    </form>
  );
}

function CardScreen() {
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const ready = number.replace(/\s/g, "").length >= 12 && expiry.length >= 4 && cvc.length >= 3;
  return (
    <form className="space-y-4" onSubmit={(event) => event.preventDefault()}>
      <p className="text-[15px] leading-relaxed">
        La carte est enregistrée sans débit. Elle sert seulement en cas de no-show ou de frais d’annulation. Stripe n’est pas appelé dans cette maquette.
      </p>
      <ClubField label="Numéro de carte" inputMode="numeric" value={number} onChange={(event) => setNumber(event.target.value)} placeholder="0000 0000 0000 4242" autoComplete="off" />
      <div className="grid grid-cols-2 gap-3">
        <ClubField label="Expiration" value={expiry} onChange={(event) => setExpiry(event.target.value)} placeholder="12/28" autoComplete="off" />
        <ClubField label="Cryptogramme" value={cvc} onChange={(event) => setCvc(event.target.value)} placeholder="000" autoComplete="off" />
      </div>
      <Dock>
        <ClubButton href={ready ? "/maquette/club/attente" : undefined} disabled={!ready}>
          Enregistrer la carte
        </ClubButton>
      </Dock>
    </form>
  );
}

function WaitScreen() {
  const lines = [
    "Votre inscription est entre nos mains.",
    "Un conseiller la relit sous 24 h.",
    "Vous êtes un client VIP.",
    "La recherche s’ouvrira après validation.",
  ];
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setIndex((current) => current + 1), 3600);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div className="px-2 py-10 text-center" role="status">
      <span className="h-wait-ring mx-auto" aria-hidden>
        <span />
      </span>
      <h1 className="h-serif mt-6 text-[1.35rem] font-semibold">Validation sous 24 h</h1>
      <p className="h-wait-copy mx-auto mt-4 max-w-[18rem] text-[1.05rem] font-semibold leading-snug">{lines[index % lines.length]}</p>
      <p className="mt-6 text-sm h-muted">Cet écran est seul. La recherche n’est pas accessible.</p>
    </div>
  );
}

function RefuseScreen() {
  const href = `https://wa.me/${siteConfig.whatsappNumber}?text=${encodeURIComponent("Bonjour, je souhaite échanger au sujet de mon inscription au Club Travel BA.")}`;
  return (
    <div className="space-y-4">
      <h1 className="h-serif text-[1.5rem] font-semibold">Inscription non retenue</h1>
      <p className="text-[15px] leading-relaxed">Votre inscription n’a pas été retenue. L’agence reste joignable si vous souhaitez en parler.</p>
      <a href={href} className="h-btn flex h-12 w-full items-center justify-center text-sm font-semibold">
        Écrire sur WhatsApp
      </a>
    </div>
  );
}

function ExistingScreen() {
  return (
    <div className="space-y-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8c7352]">Déjà client</p>
      <h1 className="h-serif text-[1.7rem] font-semibold">Votre accès est ouvert</h1>
      <p className="text-[15px] leading-relaxed">
        Vous êtes déjà client de l’agence. L’accès au Club est direct : pas de nouvelle validation, pas de carte à enregistrer pour entrer.
      </p>
      <ClubButton href="/maquette/club/recherche">Entrer</ClubButton>
    </div>
  );
}

function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const ready = email.includes("@") && password.length >= 8;
  return (
    <form className="space-y-4" onSubmit={(event) => event.preventDefault()}>
      <h1 className="h-serif text-[1.7rem] font-semibold">Connexion</h1>
      <p className="text-[15px] leading-relaxed">La recherche est réservée aux membres connectés.</p>
      <ClubField label="E-mail" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="off" />
      <ClubField label="Mot de passe" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
      <ClubButton href={ready ? "/maquette/club/recherche/attente" : undefined} disabled={!ready}>
        Se connecter
      </ClubButton>
    </form>
  );
}

function SearchScreen() {
  const [breakfast, setBreakfast] = useState(false);
  const [sort, setSort] = useState<"privileges" | "prix">("privileges");
  const shown = useMemo(() => {
    const rows = CLUB_HOTELS.filter((hotel) => !breakfast || hotel.breakfast);
    return [...rows].sort((a, b) => (sort === "prix" ? a.total - b.total : b.benefits.length - a.benefits.length || a.total - b.total));
  }, [breakfast, sort]);
  return (
    <div className="space-y-4">
      <p className="text-sm h-muted">Connectée en tant que {CLUB_MEMBER.firstName} {CLUB_MEMBER.lastName}, exemple.</p>
      <div className="h-search-stack">
        <div className="h-stack-field">
          <Icon name="search" className="h-4 w-4 shrink-0 text-[#C5A880]" />
          <span>Marrakech</span>
        </div>
        <div className="h-stack-field">
          <Icon name="event" className="h-4 w-4 shrink-0 text-[#C5A880]" />
          <span>12–15 mars 2027 · 3 nuits</span>
        </div>
        <div className="h-stack-field">
          <Icon name="person" className="h-4 w-4 shrink-0 text-[#C5A880]" />
          <span className="flex-1">2 adultes</span>
          <Icon name="bed" className="h-4 w-4 text-[#C5A880]" />
          <span>1 chambre</span>
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto">
        <button type="button" className="h-pill h-on shrink-0" aria-pressed="true">Liste</button>
        <button type="button" className={`h-pill shrink-0 ${breakfast ? "h-on" : ""}`} aria-pressed={breakfast} onClick={() => setBreakfast((value) => !value)}>
          Filtres{breakfast ? " · 1" : ""}
        </button>
        <button type="button" className="h-pill shrink-0" onClick={() => setSort((value) => (value === "prix" ? "privileges" : "prix"))}>
          {sort === "prix" ? "Prix" : "Privilèges"}
        </button>
      </div>
      {breakfast ? <p className="text-sm h-muted">Filtre : petit-déjeuner inclus.</p> : null}
      <p className="text-sm h-muted">Little Emperors · prix TTC, en euros, sans majoration. {shown.length} hôtels.</p>
      <div className="space-y-5">
        {shown.map((hotel) => (
          <HotelResult key={hotel.slug} hotel={hotel} />
        ))}
      </div>
    </div>
  );
}

function HotelResult({ hotel }: { hotel: ClubHotel }) {
  return (
    <article className="h-result">
      <div className="h-cover" style={{ background: hotel.tone }}>
        <div className="h-cover-fade" />
        <div className="h-cover-copy">
          <h3 className="h-serif text-[1.2rem] font-semibold leading-tight">{hotel.name}</h3>
          <p className="mt-0.5 text-sm text-white/80">{hotel.city}</p>
        </div>
      </div>
      <Link href={`/maquette/club/hotel/${hotel.slug}`} className="block">
        <div className="flex items-end justify-between gap-3 px-4 py-3">
          <p className="text-lg font-medium h-ink">
            {euros(hotel.total)} TTC
            <span className="mt-0.5 block text-sm font-normal h-muted">{euros(perNight(hotel))} / nuit</span>
          </p>
          <span className="mb-0.5 rounded-full border border-[#C5A880] px-3 py-1.5 text-sm font-semibold text-[#8c7352]">Voir l’hôtel</span>
        </div>
        <div className="px-4 pb-4">
          <HotelBenefits lines={hotel.benefits} layout="icons" title="Vos avantages" />
        </div>
      </Link>
    </article>
  );
}

function HotelScreen({ hotel }: { hotel: ClubHotel }) {
  const [rooms, setRooms] = useState(1);
  const [cap, setCap] = useState(false);
  return (
    <div className="space-y-5">
      <div className="h-cover overflow-hidden rounded-xl" style={{ background: hotel.tone }}>
        <div className="h-cover-fade" />
        <div className="h-cover-copy">
          <p className="text-sm text-white/80">{hotel.city}</p>
          <h1 className="h-serif text-[1.35rem] font-semibold">{hotel.name}</h1>
        </div>
      </div>
      <p className="text-sm h-muted">{hotel.address} · Arrivée {hotel.checkIn} · Départ {hotel.checkOut}</p>
      <p className="text-2xl font-semibold">{euros(hotel.total)} TTC</p>
      <p className="text-sm h-muted">Séjour de {hotel.nights} nuits · prix TTC, en euros, sans majoration.</p>
      <HotelBenefits lines={hotel.benefits} />
      <div>
        <p className="h-section">Chambres</p>
        <ul className="mt-3 space-y-3">
          {hotel.rooms.map((room) => (
            <li key={room.id} className="h-recap">
              <p className="font-semibold">{room.name}</p>
              <p className="mt-1 text-sm h-muted">{room.area} · {room.bed} · {room.view}</p>
              <p className="mt-2 text-sm">À partir de {euros(Math.min(...room.rates.map((rate) => rate.total)))} TTC</p>
            </li>
          ))}
        </ul>
      </div>
      <div className="h-recap flex items-center justify-between">
        <span>Chambres</span>
        <span className="flex items-center gap-3">
          <button type="button" className="h-11 w-11 rounded-full border border-[#e7e1d6]" aria-label="Retirer une chambre" onClick={() => { setRooms((value) => Math.max(1, value - 1)); setCap(false); }}>–</button>
          <span>{rooms}</span>
          <button type="button" className="h-11 w-11 rounded-full border border-[#e7e1d6]" aria-label="Ajouter une chambre" onClick={() => { if (rooms >= 5) setCap(true); else setRooms((value) => value + 1); }}>+</button>
        </span>
      </div>
      {cap ? (
        <p className="text-sm">
          Cinq chambres au maximum.{" "}
          <Link href="/maquette/club/groupe" className="font-semibold text-[#8c7352]">Demande de devis groupe</Link>
        </p>
      ) : (
        <p className="text-sm h-muted">Jusqu’à 5 chambres. Au-delà, un devis groupe.</p>
      )}
      <ClubButton href={`/maquette/club/tarif/${hotel.slug}`}>Voir les tarifs</ClubButton>
    </div>
  );
}

function RateScreen({ hotel }: { hotel: ClubHotel }) {
  const [rateId, setRateId] = useState("");
  const [ack, setAck] = useState(false);
  const picked = hotel.rooms.flatMap((room) => room.rates.map((rate) => ({ room, rate }))).find((item) => item.rate.id === rateId);
  const blocked = !picked || (picked.rate.free === false && !ack);
  const router = useRouter();
  return (
    <div className="space-y-4 pb-8">
      <p className="text-sm h-muted">{hotel.city}</p>
      <h1 className="h-serif text-[1.3rem] font-semibold">{hotel.name}</h1>
      <div className="space-y-3" role="radiogroup" aria-label="Tarifs">
        {hotel.rooms.flatMap((room) =>
          room.rates.map((rate) => (
            <GoldChoice
              key={rate.id}
              selected={rateId === rate.id}
              title={`${room.name} · ${rate.title}`}
              body={rate.board}
              onPick={() => {
                setRateId(rate.id);
                setAck(false);
              }}
            >
              <span className={`mt-2 inline-block rounded-full px-2.5 py-1 text-[12px] font-semibold ${rate.free ? "bg-[#f4efe6] text-[#8c7352]" : "bg-[#0B192C] text-white"}`}>
                {rate.badge}
              </span>
              <span className="mt-2 block text-lg font-semibold">{euros(rate.total)} TTC</span>
            </GoldChoice>
          ))
        )}
      </div>
      {picked && !picked.rate.free ? (
        <div className="rounded-2xl border bg-[#f4efe6] px-4 py-3" style={{ borderColor: "#C5A880" }}>
          <p className="text-sm font-semibold">Tarif non remboursable</p>
          <p className="mt-1 text-sm leading-relaxed">{picked.rate.conditions}</p>
          <label className="mt-3 flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1" checked={ack} onChange={(event) => setAck(event.target.checked)} />
            <span>J’ai compris que ce tarif n’est pas remboursable</span>
          </label>
        </div>
      ) : null}
      {picked?.rate.free ? <p className="text-sm h-muted">{picked.rate.conditions}</p> : null}
      <HotelBenefits lines={hotel.benefits} />
      <Dock signedIn>
        <ClubButton
          disabled={blocked}
          onClick={() => {
            if (!picked) return;
            router.push(`/maquette/club/voyageur/${hotel.slug}?tarif=${picked.rate.id}`);
          }}
        >
          Suivant
        </ClubButton>
      </Dock>
    </div>
  );
}

function GroupScreen({ hotel }: { hotel: ClubHotel }) {
  return (
    <div className="space-y-4">
      <h1 className="h-serif text-[1.5rem] font-semibold">Devis groupe</h1>
      <p className="text-[15px] leading-relaxed">
        Au-delà de cinq chambres, {hotel.name} se réserve avec l’agence. Le message est préparé. Rien ne part tant que vous n’ouvrez pas WhatsApp.
      </p>
      <a href={groupQuote(hotel)} className="h-btn flex h-12 w-full items-center justify-center text-sm font-semibold">
        Demander un devis groupe
      </a>
    </div>
  );
}

function GuestScreen({ hotel }: { hotel: ClubHotel }) {
  const [who, setWho] = useState("");
  const [free, setFree] = useState("");
  const [requests, setRequests] = useState("");
  const name = who === "libre" ? free.trim() : who;
  const ready = name.length > 2;
  const router = useRouter();
  const rateId = useSearchParams().get("tarif") || "";
  const options = [
    { id: `${CLUB_MEMBER.firstName} ${CLUB_MEMBER.lastName}`, title: "Pour moi", body: `${CLUB_MEMBER.firstName} ${CLUB_MEMBER.lastName}` },
    { id: CLUB_MEMBER.relative, title: "Un proche enregistré", body: CLUB_MEMBER.relative },
    { id: "libre", title: "Une autre personne", body: "Nom libre" },
  ];
  return (
    <div className="space-y-4">
      <h1 className="h-serif text-[1.4rem] font-semibold">Pour qui est ce séjour ?</h1>
      <div className="space-y-3" role="radiogroup" aria-label="Voyageur">
        {options.map((option) => (
          <GoldChoice key={option.id} selected={who === option.id} title={option.title} body={option.body} onPick={() => setWho(option.id)} />
        ))}
      </div>
      {who === "libre" ? (
        <ClubField label="Prénom et nom" value={free} onChange={(event) => setFree(event.target.value)} autoComplete="off" />
      ) : null}
      <label className="block text-sm">
        Demandes spéciales
        <textarea
          value={requests}
          onChange={(event) => setRequests(event.target.value)}
          className="h-field mt-1 min-h-24 w-full px-3 py-2 text-[15px] outline-none"
          placeholder="Arrivée tardive, lit bébé…"
        />
      </label>
      <p className="text-sm h-muted">{hotel.name}. La demande est transmise à l’hôtel, sans garantie.</p>
      <Dock signedIn>
        <ClubButton
          disabled={!ready}
          onClick={() => {
            const query = new URLSearchParams({ hotel: hotel.slug, tarif: rateId, voyageur: name });
            if (requests.trim()) query.set("demandes", requests.trim());
            router.push(`/maquette/club/paiement?${query.toString()}`);
          }}
        >
          Suivant
        </ClubButton>
      </Dock>
    </div>
  );
}

function PayScreen() {
  const params = useSearchParams();
  const hotel = clubHotel(params.get("hotel")) || CLUB_HOTELS[0];
  const { room, rate } = rateOf(hotel, params.get("tarif") || "");
  const guest = params.get("voyageur") || CLUB_STAY.guest;
  const requests = params.get("demandes");
  const choice = { hotel, rate, roomName: room.name, guest, requests };
  const [number, setNumber] = useState("");
  const ready = number.replace(/\s/g, "").length >= 12;
  return (
    <form className="space-y-4" onSubmit={(event) => event.preventDefault()}>
      <h1 className="h-serif text-[1.4rem] font-semibold">Paiement</h1>
      <article className="h-recap space-y-1">
        <p className="font-semibold">{choice.hotel.name}</p>
        <p className="text-sm h-muted">{choice.roomName} · {choice.rate.title}</p>
        <p className="text-sm h-muted">{choice.guest}</p>
        {choice.requests ? <p className="text-sm">{choice.requests}</p> : null}
        <p className="pt-2 text-2xl font-semibold">{euros(choice.rate.total)} TTC</p>
      </article>
      <p className="text-[15px] leading-relaxed">
        La carte règle la réservation auprès de Little Emperors, dans l’application. L’hôtel prélève selon les conditions du tarif. L’agence n’encaisse pas ce séjour. Formulaire d’exemple : rien n’est envoyé.
      </p>
      <ClubField label="Titulaire" defaultValue={CLUB_MEMBER.firstName + " " + CLUB_MEMBER.lastName} autoComplete="off" />
      <ClubField label="Numéro de carte" value={number} onChange={(event) => setNumber(event.target.value)} placeholder="0000 0000 0000 4242" autoComplete="off" />
      <div className="grid grid-cols-2 gap-3">
        <ClubField label="Expiration" placeholder="12/28" autoComplete="off" />
        <ClubField label="Cryptogramme" placeholder="000" autoComplete="off" />
      </div>
      <p className="text-sm leading-relaxed">
        Autres cas :{" "}
        <Link href="/maquette/club/paiement/prix" className="font-semibold text-[#8c7352]">prix modifié</Link>
        {" · "}
        <Link href="/maquette/club/paiement/complet" className="font-semibold text-[#8c7352]">plus de chambre</Link>
        {" · "}
        <Link href="/maquette/club/paiement/carte" className="font-semibold text-[#8c7352]">carte expirée</Link>
        {" · "}
        <Link href="/maquette/club/paiement/cotisation" className="font-semibold text-[#8c7352]">cotisation</Link>
      </p>
      <Dock signedIn>
        <ClubButton href={ready ? "/maquette/club/confirmation" : undefined} disabled={!ready}>
          Payer {euros(choice.rate.total)}
        </ClubButton>
      </Dock>
    </form>
  );
}

function PriceScreen() {
  const [ok, setOk] = useState(false);
  return (
    <div className="space-y-4">
      <h1 className="h-serif text-[1.4rem] font-semibold">Le prix a changé</h1>
      <article className="h-recap space-y-2">
        <p className="text-sm h-muted line-through">{euros(1240)} TTC</p>
        <p className="text-2xl font-semibold">{euros(1310)} TTC</p>
        <p className="text-sm">Le tarif n’est plus celui de la recherche. Confirmez le nouveau prix pour continuer.</p>
      </article>
      {ok ? (
        <ClubButton href="/maquette/club/paiement">Continuer vers le paiement</ClubButton>
      ) : (
        <ClubButton onClick={() => setOk(true)}>Confirmer {euros(1310)}</ClubButton>
      )}
    </div>
  );
}

function SoldOutScreen() {
  const others = CLUB_HOTELS.filter((hotel) => hotel.slug !== "riad-lina");
  return (
    <div className="space-y-4">
      <h1 className="h-serif text-[1.4rem] font-semibold">Cette chambre n’est plus disponible</h1>
      <p className="text-[15px] leading-relaxed">Le tarif vient d’être pris. Voici des hôtels proches, aux mêmes dates.</p>
      {others.map((hotel) => (
        <HotelResult key={hotel.slug} hotel={hotel} />
      ))}
    </div>
  );
}

function ExpiredScreen() {
  return (
    <div className="space-y-4">
      <h1 className="h-serif text-[1.4rem] font-semibold">Carte de garantie expirée</h1>
      <p className="text-[15px] leading-relaxed">
        La carte {CLUB_MEMBER.card} n’est plus valable. La réservation est bloquée jusqu’à sa mise à jour.
      </p>
      <ClubButton href="/maquette/club/garantie">Mettre à jour la carte</ClubButton>
    </div>
  );
}

function DuesScreen() {
  return (
    <div className="space-y-4">
      <h1 className="h-serif text-[1.4rem] font-semibold">Cotisation à régler</h1>
      <p className="text-[15px] leading-relaxed">
        Les six mois offerts sont passés. La réservation ne peut pas être finalisée tant que la cotisation n’est pas payée.
      </p>
      <p className="text-2xl font-semibold">{CLUB_FEE_EXAMPLE.label}</p>
      <p className="text-sm h-muted">{CLUB_FEE_EXAMPLE.reason} Montant d’exemple, {CLUB_FEE_EXAMPLE.period}.</p>
      <ClubButton href="/maquette/club/cotisation/paiement">Payer la cotisation</ClubButton>
    </div>
  );
}

function ConfirmScreen() {
  return (
    <div className="space-y-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8c7352]">Confirmé</p>
      <h1 className="h-serif text-[1.6rem] font-semibold">Votre séjour est dans l’application</h1>
      <article className="h-recap space-y-2">
        <p className="font-semibold">{CLUB_STAY.hotel.name}</p>
        <p className="text-sm h-muted">{CLUB_STAY.when} · {CLUB_STAY.room}</p>
        <p className="text-sm">Confirmation {CLUB_STAY.confirmation}</p>
        <p className="text-2xl font-semibold">{euros(CLUB_STAY.total)} TTC</p>
      </article>
      <p className="text-sm h-muted">Visible tout de suite. L’e-mail et le WhatsApp ci-dessous sont des aperçus : rien n’est envoyé.</p>
      <ClubButton href="/maquette/club/confirmation/email">Aperçu de l’e-mail</ClubButton>
      <ClubButton href="/maquette/club/confirmation/whatsapp">Aperçu du WhatsApp</ClubButton>
      <ClubButton href="/maquette/club/sejours">Mes séjours</ClubButton>
    </div>
  );
}

function EmailScreen() {
  return (
    <article className="h-recap space-y-3 text-[15px]">
      <p className="text-xs uppercase tracking-[0.14em] text-[#8c7352]">Aperçu · non envoyé</p>
      <p className="text-sm h-muted">De Travel BA · à {CLUB_MEMBER.email}</p>
      <h1 className="h-serif text-[1.25rem] font-semibold">Votre séjour à Marrakech est confirmé</h1>
      <p>Bonjour {CLUB_MEMBER.firstName},</p>
      <p>
        {CLUB_STAY.hotel.name}, {CLUB_STAY.when}. {CLUB_STAY.room}, {CLUB_STAY.rate}. {euros(CLUB_STAY.total)} TTC.
        Confirmation {CLUB_STAY.confirmation}.
      </p>
      <p>Le séjour est déjà dans votre application.</p>
      <Link href="/maquette/club/rappel" className="block font-semibold text-[#8c7352]">Voir le rappel de la veille</Link>
    </article>
  );
}

function Bubble({ mine, children }: { mine?: boolean; children: ReactNode }) {
  return (
    <p className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${mine ? "ml-auto bg-[#0B192C] text-white" : "bg-white text-[#1a1a1a]"}`}>
      {children}
    </p>
  );
}

function WhatsappScreen() {
  return (
    <div className="space-y-3">
      <p className="text-xs uppercase tracking-[0.14em] text-[#8c7352]">Aperçu WhatsApp · non envoyé</p>
      <Bubble>
        Bonjour {CLUB_MEMBER.firstName}. Votre séjour à l’{CLUB_STAY.hotel.name}, {CLUB_STAY.when}, est confirmé ({CLUB_STAY.confirmation}). Il est dans votre application.
      </Bubble>
      <Link href="/maquette/club/rappel" className="block text-sm font-semibold text-[#8c7352]">Rappel la veille</Link>
    </div>
  );
}

function ReminderScreen() {
  return (
    <div className="space-y-3">
      <p className="text-xs uppercase tracking-[0.14em] text-[#8c7352]">Aperçu · la veille · non envoyé</p>
      <Bubble>
        Bonjour {CLUB_MEMBER.firstName}. Demain, votre arrivée à {CLUB_STAY.hotel.city}, {CLUB_STAY.hotel.name}. Check-in à {CLUB_STAY.hotel.checkIn}. Nous restons joignables sur ce fil.
      </Bubble>
    </div>
  );
}

function StaysScreen() {
  return (
    <div className="space-y-4">
      <h1 className="h-serif text-[1.5rem] font-semibold">Mes séjours</h1>
      <Link href="/maquette/club/sejours/riad-lina" className="h-recap block">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8c7352]">Confirmé</p>
        <p className="mt-1 font-semibold">{CLUB_STAY.hotel.name}</p>
        <p className="text-sm h-muted">{CLUB_STAY.when} · {CLUB_STAY.hotel.city}</p>
      </Link>
    </div>
  );
}

function StayScreen() {
  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8c7352]">Confirmé · {CLUB_STAY.confirmation}</p>
      <h1 className="h-serif text-[1.5rem] font-semibold">{CLUB_STAY.hotel.name}</h1>
      <p className="text-sm h-muted">{CLUB_STAY.when} · {CLUB_STAY.room} · {CLUB_STAY.guest}</p>
      <p className="text-2xl font-semibold">{euros(CLUB_STAY.total)} TTC</p>
      <HotelBenefits lines={[...CLUB_STAY.hotel.benefits]} />
      <article className="h-recap text-sm leading-relaxed">
        <p className="font-semibold">Annulation</p>
        <p className="mt-1">{CLUB_STAY.hotel.rooms[0].rates[0].conditions}</p>
      </article>
      <p className="text-sm leading-relaxed">
        Pour modifier le séjour, annulez-le puis réservez à nouveau. Aucun frais d’agence à l’annulation : le remboursement part automatiquement lorsque le tarif le permet.
      </p>
      <ClubButton href="/maquette/club/sejours/riad-lina/annuler">Annuler</ClubButton>
    </div>
  );
}

function CancelScreen() {
  const [done, setDone] = useState(false);
  if (done) {
    return (
      <div className="space-y-4">
        <h1 className="h-serif text-[1.5rem] font-semibold">Séjour annulé</h1>
        <p className="text-[15px] leading-relaxed">
          Vous avez annulé seule. Aucun frais d’agence. Le remboursement part automatiquement, selon le tarif. Dans cette maquette, rien n’est débité ni remboursé.
        </p>
        <ClubButton href="/maquette/club/sejours">Retour aux séjours</ClubButton>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <h1 className="h-serif text-[1.5rem] font-semibold">Annuler ce séjour</h1>
      <p className="text-[15px] leading-relaxed">
        {CLUB_STAY.hotel.name}, {CLUB_STAY.when}. Vous annulez seule, sans frais d’agence. Le remboursement est automatique.
      </p>
      <ClubButton onClick={() => setDone(true)}>Confirmer l’annulation</ClubButton>
    </div>
  );
}

function FeeNote() {
  return (
    <p className="text-sm leading-relaxed h-muted">
      Offerte pendant 6 mois, puis {CLUB_FEE_EXAMPLE.label} {CLUB_FEE_EXAMPLE.period}. {CLUB_FEE_EXAMPLE.reason} Montant d’exemple.
    </p>
  );
}

function FeeScreen() {
  return (
    <div className="space-y-4">
      <h1 className="h-serif text-[1.5rem] font-semibold">Cotisation</h1>
      <p className="text-[15px] leading-relaxed">Vous la payez vous-même, après les six mois offerts. Ici, elle est encore offerte jusqu’au 15 mai 2027.</p>
      <p className="text-3xl font-semibold">{CLUB_FEE_EXAMPLE.label}</p>
      <FeeNote />
      <ClubButton href="/maquette/club/cotisation/paiement">Payer la cotisation</ClubButton>
      <Link href="/maquette/club/parrainage" className="block text-center text-sm font-semibold text-[#8c7352]">Parrainage</Link>
    </div>
  );
}

function FeePayScreen() {
  const [done, setDone] = useState(false);
  if (done) {
    return (
      <div className="space-y-4">
        <h1 className="h-serif text-[1.5rem] font-semibold">Cotisation réglée</h1>
        <p>Dans la maquette seulement. Aucun paiement n’a été lancé. Vous pouvez à nouveau réserver.</p>
        <ClubButton href="/maquette/club/paiement">Reprendre la réservation</ClubButton>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <h1 className="h-serif text-[1.5rem] font-semibold">Payer {CLUB_FEE_EXAMPLE.label}</h1>
      <FeeNote />
      <ClubField label="Carte" placeholder="0000 0000 0000 4242" autoComplete="off" />
      <ClubButton onClick={() => setDone(true)}>Payer {CLUB_FEE_EXAMPLE.label}</ClubButton>
    </div>
  );
}

function ReferralScreen() {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-4">
      <h1 className="h-serif text-[1.5rem] font-semibold">Parrainage</h1>
      <p className="text-3xl font-semibold tracking-wide">{CLUB_MEMBER.code}</p>
      <p className="text-[15px] leading-relaxed">
        Filleuls illimités. Dès qu’un filleul s’inscrit, votre prochaine cotisation est offerte.
      </p>
      <button
        type="button"
        className="h-btn h-12 w-full text-sm font-semibold"
        onClick={() => {
          void navigator.clipboard?.writeText(CLUB_MEMBER.code).catch(() => undefined);
          setCopied(true);
        }}
      >
        {copied ? "Code copié" : "Copier le code"}
      </button>
      <article className="h-recap">
        <p className="text-sm h-muted">Filleul d’exemple</p>
        <p className="font-semibold">{CLUB_MEMBER.filleul}</p>
        <p className="text-sm">Inscrit. Cotisation offerte.</p>
      </article>
    </div>
  );
}

function ConciergeScreen() {
  const [ok, setOk] = useState(false);
  return (
    <div className="space-y-3">
      <h1 className="h-serif text-[1.4rem] font-semibold">Concierge</h1>
      <p className="text-sm h-muted">Votre conseiller sur WhatsApp. Aperçu, rien n’est envoyé.</p>
      <Bubble>Bonjour {CLUB_MEMBER.firstName}. Je peux vous proposer la Suite Jardin au {CLUB_STAY.hotel.name}, du 12 au 15 mars, {euros(1680)} TTC, petit-déjeuner inclus.</Bubble>
      <article className="h-recap space-y-2">
        <p className="font-semibold">Suite Jardin · {euros(1680)} TTC</p>
        <p className="text-sm h-muted">Annulation gratuite jusqu’au 1 mars 2027.</p>
        {ok ? (
          <p className="text-sm font-semibold">Proposition acceptée. Passez au paiement pour la confirmer.</p>
        ) : (
          <ClubButton onClick={() => setOk(true)}>Valider la proposition</ClubButton>
        )}
      </article>
      {ok ? <ClubButton href="/maquette/club/paiement">Passer au paiement</ClubButton> : null}
    </div>
  );
}

function AccountScreen() {
  return (
    <div className="space-y-4">
      <h1 className="h-serif text-[1.5rem] font-semibold">Mon compte</h1>
      <article className="h-recap space-y-1 text-sm">
        <p className="font-semibold">{CLUB_MEMBER.firstName} {CLUB_MEMBER.lastName}</p>
        <p>{CLUB_MEMBER.email}</p>
        <p>{CLUB_MEMBER.phone} · vérifié</p>
        <p>Carte de garantie {CLUB_MEMBER.card}</p>
        <p>Proche : {CLUB_MEMBER.relative}</p>
      </article>
      <Link href="/maquette/club/cotisation" className="block text-sm font-semibold text-[#8c7352]">Cotisation</Link>
      <Link href="/maquette/club/parrainage" className="block text-sm font-semibold text-[#8c7352]">Parrainage</Link>
      <Link href="/maquette/club/concierge" className="block text-sm font-semibold text-[#8c7352]">Concierge</Link>
      <ClubButton href="/maquette/club/compte/supprimer">Supprimer mon compte</ClubButton>
    </div>
  );
}

function DeleteScreen() {
  const [value, setValue] = useState("");
  const [done, setDone] = useState(false);
  const expected = `${CLUB_MEMBER.firstName} ${CLUB_MEMBER.lastName}`;
  if (done) {
    return (
      <div className="space-y-4">
        <h1 className="h-serif text-[1.5rem] font-semibold">Compte supprimé</h1>
        <p>Dans la maquette seulement. Aucune fiche n’a été effacée.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <h1 className="h-serif text-[1.5rem] font-semibold">Supprimer le compte</h1>
      <p className="text-[15px] leading-relaxed">Vous le faites vous-même. Saisissez {expected} pour confirmer.</p>
      <ClubField label="Nom complet" value={value} onChange={(event) => setValue(event.target.value)} autoComplete="off" />
      <ClubButton disabled={value.trim() !== expected} onClick={() => setDone(true)}>
        Supprimer mon compte
      </ClubButton>
    </div>
  );
}
