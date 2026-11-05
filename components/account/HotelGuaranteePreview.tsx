import { BusyBar } from "@/components/crm/BusyBar";
import { Icon } from "@/components/crm/icons";
import {
  GUARANTEE_COPY,
  type GuaranteeFrameState,
  type GuaranteeVariantId,
} from "@/lib/crm/hotel-guarantee";

const STAY = {
  hotel: "Indigo Bordeaux",
  dates: "27–28 novembre 2026",
  guests: ["Benjamin Boukris", "Victoria Boukris"],
  room: "1 nuit",
};

export function HotelGuaranteePreview({
  variant,
  state,
  widgetUrl,
}: {
  variant: GuaranteeVariantId;
  state: GuaranteeFrameState;
  widgetUrl: string;
}) {
  if (variant === "filet") return <Filet state={state} widgetUrl={widgetUrl} />;
  if (variant === "salon") return <Salon state={state} widgetUrl={widgetUrl} />;
  return <Nuit state={state} widgetUrl={widgetUrl} />;
}

function Trust({ tone }: { tone: "light" | "dark" }) {
  const ink = tone === "dark" ? "text-[#f7f4ee]/85" : "text-[var(--h-muted)]";
  const lock = tone === "dark" ? "text-[#C5A880]" : "text-[var(--h-gold)]";
  return (
    <p className={`flex items-start gap-2.5 text-sm leading-relaxed ${ink}`}>
      <Icon name="lock" className={`mt-0.5 h-4 w-4 shrink-0 ${lock}`} />
      <span>{GUARANTEE_COPY.trust}</span>
    </p>
  );
}

function Frame({
  state,
  widgetUrl,
  well,
}: {
  state: GuaranteeFrameState;
  widgetUrl: string;
  well: "cream" | "plain";
}) {
  if (state === "enregistree") {
    return (
      <p className="h-serif text-[1.15rem] leading-snug" data-hotel-card-state="saved">
        {GUARANTEE_COPY.saved}
      </p>
    );
  }
  if (state === "chargement") {
    const onCream = well === "cream";
    return (
      <div className={onCream ? "space-y-4 rounded-2xl bg-[#f7f4ee] p-5 text-[#1a1a1a]" : "space-y-4 py-2"} data-hotel-card-state="loading">
        <p className="text-sm">{GUARANTEE_COPY.loading}</p>
        <BusyBar active tone="ink" label="Formulaire sécurisé" />
        <div className="space-y-3" aria-hidden="true">
          <div className="h-10 rounded-xl bg-black/5" />
          <div className="h-10 rounded-xl bg-black/5" />
          <div className="h-10 w-2/3 rounded-xl bg-black/5" />
        </div>
      </div>
    );
  }
  const shell = well === "cream" ? "rounded-2xl bg-[#f7f4ee] p-1.5" : "";
  return (
    <div className={shell}>
      <iframe
        title={GUARANTEE_COPY.title}
        src={widgetUrl}
        referrerPolicy="no-referrer"
        className="block h-[520px] w-full rounded-xl border-0 bg-white"
      />
    </div>
  );
}

function Confirm({
  ready,
  look,
}: {
  ready: boolean;
  look: "champagne" | "ink" | "navy";
}) {
  const face =
    look === "champagne"
      ? "bg-[#C5A880] text-[#0B192C] disabled:bg-[#C5A880] disabled:text-[#0B192C]"
      : look === "navy"
        ? "h-search-go disabled:bg-[#0B192C] disabled:text-[#f7f4ee]"
        : "h-btn disabled:bg-[#1a1a1a] disabled:text-[#f7f4ee]";
  return (
    <div className="space-y-2">
      <button
        type="button"
        className={`h-press h-12 w-full rounded-xl text-sm font-semibold disabled:opacity-100 ${face}`}
        disabled={!ready}
        aria-disabled={!ready}
      >
        {GUARANTEE_COPY.cta}
      </button>
      {ready ? null : <p className="text-center text-[13px] opacity-70">{GUARANTEE_COPY.wait}</p>}
    </div>
  );
}

function Nuit({ state, widgetUrl }: { state: GuaranteeFrameState; widgetUrl: string }) {
  return (
    <div
      className="hotel-theme mx-auto min-h-screen w-full max-w-[480px]"
      style={{ background: "#0B192C", color: "#f7f4ee" }}
      data-guarantee="nuit"
    >
      <header className="grid h-14 grid-cols-[2.75rem_1fr_2.75rem] items-center">
        <span className="grid h-11 w-11 place-items-center" style={{ color: "#C5A880" }} aria-hidden="true">
          <Icon name="chevron_left" className="h-5 w-5" />
        </span>
        <p className="h-serif text-center text-[17px]">{GUARANTEE_COPY.step}</p>
        <span />
      </header>
      <div className="space-y-6 px-5 pb-10 pt-2">
        <div className="space-y-2">
          <p className="text-[13px] font-semibold" style={{ color: "#C5A880" }}>{GUARANTEE_COPY.kicker}</p>
          <h1 className="h-serif text-[1.7rem] leading-[1.15]">{GUARANTEE_COPY.title}</h1>
        </div>
        <Trust tone="dark" />
        <Frame state={state} widgetUrl={widgetUrl} well="cream" />
        <Confirm ready={state === "enregistree"} look="champagne" />
      </div>
    </div>
  );
}

function Filet({ state, widgetUrl }: { state: GuaranteeFrameState; widgetUrl: string }) {
  return (
    <div className="hotel-theme mx-auto min-h-screen w-full max-w-[480px] bg-[#f4efe6]" data-guarantee="filet">
      <header className="grid h-14 grid-cols-[2.75rem_1fr_2.75rem] items-center bg-[#f4efe6]">
        <span className="grid h-11 w-11 place-items-center" aria-hidden="true">
          <Icon name="chevron_left" className="h-5 w-5" />
        </span>
        <p className="h-serif text-center text-[17px] h-ink">{GUARANTEE_COPY.step}</p>
        <span />
      </header>
      <div className="px-4 pb-10 pt-2">
        <article className="h-recap overflow-hidden p-0">
          <div className="h-[3px] bg-[#C5A880]" />
          <div className="space-y-5 px-5 py-6">
            <div className="space-y-2">
              <p className="text-[13px] font-semibold h-gold">{GUARANTEE_COPY.kicker}</p>
              <h1 className="h-serif text-[1.55rem] leading-tight h-ink">{GUARANTEE_COPY.title}</h1>
            </div>
            <Trust tone="light" />
            <Frame state={state} widgetUrl={widgetUrl} well="plain" />
            <Confirm ready={state === "enregistree"} look="ink" />
          </div>
        </article>
      </div>
    </div>
  );
}

function Salon({ state, widgetUrl }: { state: GuaranteeFrameState; widgetUrl: string }) {
  return (
    <div className="hotel-theme min-h-screen bg-[#f4efe6]" data-guarantee="salon">
      <div className="mx-auto w-full max-w-[480px] lg:max-w-[980px]">
        <header className="grid h-14 grid-cols-[2.75rem_1fr_2.75rem] items-center">
          <span className="grid h-11 w-11 place-items-center" aria-hidden="true">
            <Icon name="chevron_left" className="h-5 w-5" />
          </span>
          <p className="h-serif text-center text-[17px] h-ink">{GUARANTEE_COPY.step}</p>
          <span />
        </header>
        <div className="space-y-4 px-4 pb-8 lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start lg:gap-6 lg:space-y-0 lg:px-6">
          <aside className="space-y-4 rounded-2xl bg-[#0B192C] px-5 py-6 text-[#f7f4ee]">
            <p className="text-[13px] font-semibold text-[#C5A880]">Séjour</p>
            <h2 className="h-serif text-[1.65rem] leading-tight">{STAY.hotel}</h2>
            <p className="text-sm text-[#f7f4ee]/75">{STAY.dates}</p>
            <p className="text-sm text-[#f7f4ee]/75">{STAY.room}</p>
            <ul className="space-y-1 border-t border-[#C5A880]/35 pt-4 text-sm">
              {STAY.guests.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
            <p className="text-sm leading-relaxed text-[#f7f4ee]/75">{GUARANTEE_COPY.payNote}</p>
          </aside>
          <article className="h-recap overflow-hidden p-0">
            <div className="h-[3px] bg-[#C5A880]" />
            <div className="space-y-5 px-5 py-6">
              <div className="space-y-2">
                <p className="text-[13px] font-semibold h-gold">{GUARANTEE_COPY.pay}</p>
                <h1 className="h-serif text-[1.45rem] leading-tight h-ink">{GUARANTEE_COPY.title}</h1>
              </div>
              <Trust tone="light" />
              <Frame state={state} widgetUrl={widgetUrl} well="plain" />
            </div>
          </article>
        </div>
        <div className="h-dock px-4 py-4 lg:px-6">
          <Confirm ready={state === "enregistree"} look="navy" />
        </div>
      </div>
    </div>
  );
}
