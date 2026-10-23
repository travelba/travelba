import Link from "next/link";

const ICONS = {
  home: (
    <>
      <path d="M4 11.2 12 4.2l8 7V20.5H4Z" />
      <path d="M10 20.5v-5.2h4v5.2" />
    </>
  ),
  hotel: (
    <>
      <path d="M4.2 20.5V9.2L12 3.8l7.8 5.4V20.5" />
      <path d="M9.4 20.5v-4.4h5.2V20.5" />
      <path d="M8 11h1.7M14.3 11H16" />
    </>
  ),
  stay: <path d="M6.8 3.2h10.4V20.6L12 17.6 6.8 20.6Z" />,
  ledger: (
    <>
      <path d="M6.8 3.2h8.2L18.8 7v13.6H6.8Z" />
      <path d="M14.8 3.3V7.2h3.9" />
      <path d="M9.4 11.6h6.2M9.4 15h4.2" />
    </>
  ),
  account: (
    <>
      <circle cx="12" cy="8" r="2.8" />
      <path d="M6 19.8c1-3.2 3.1-4.7 6-4.7s5 1.5 6 4.7" />
    </>
  ),
} as const;

/** Silhouette pleine : les ouvertures laissent voir le marine, sans second ton ni dégradé. */
const FILLED = {
  home: (
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M12 3.4 3.4 10.5V21h17.2V10.5L12 3.4zM9.8 21v-6.2h4.4V21H9.8z"
    />
  ),
  hotel: (
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M3.8 21V9.2L12 3.2l8.2 6V21H3.8zM9.2 21v-5.2h5.6V21H9.2zM7.5 10.4h2.1v2.2H7.5V10.4zm6.9 0h2.1v2.2h-2.1V10.4z"
    />
  ),
  stay: <path fill="currentColor" d="M6.4 2.8h11.2V21.2L12 17.4 6.4 21.2V2.8z" />,
  ledger: (
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M6.4 2.8h8.3L19.2 7.2V21.2H6.4V2.8zM14.6 3.2 18.7 7.1H14.6V3.2zM9.2 11.2h6.4v1.25H9.2V11.2zm0 3.4h4.3v1.25H9.2V14.6z"
    />
  ),
  account: (
    <>
      <circle cx="12" cy="7.6" r="3" fill="currentColor" />
      <path fill="currentColor" d="M5.5 20.6c1.05-3.5 3.3-5.1 6.5-5.1s5.45 1.6 6.5 5.1H5.5z" />
    </>
  ),
} as const;

export type NightTabIcon = keyof typeof ICONS;

function Mark({ name, active }: { name: NightTabIcon; active: boolean }) {
  if (active) {
    return (
      <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
        {FILLED[name]}
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICONS[name]}
    </svg>
  );
}

export function AccountNightTabs({
  tabs,
}: {
  tabs: { href: string; label: string; icon: NightTabIcon; active: boolean; transition: string }[];
}) {
  return (
    <nav className="account-tabbar account-tabbar-night md:hidden" style={{ viewTransitionName: "account-tabbar" }} aria-label="Navigation compte">
      <div className="mx-auto flex h-14 w-full max-w-[480px] items-stretch">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            transitionTypes={[tab.transition]}
            aria-current={tab.active ? "page" : undefined}
            className="account-press relative flex min-h-[44px] min-w-0 flex-1 flex-col items-center justify-center gap-[3px] px-0"
          >
            {tab.active ? <span aria-hidden className="absolute top-0 h-[3px] w-9 bg-[#f2d48a]" /> : null}
            <Mark name={tab.icon} active={tab.active} />
            <span
              className="account-tab-label block w-full text-center text-[10px] font-semibold uppercase leading-none"
              style={{
                letterSpacing: tab.label.length > 9 ? "0em" : "0.06em",
                transform: tab.label.length > 11 ? "scaleX(0.84)" : tab.label.length > 9 ? "scaleX(0.94)" : undefined,
              }}
            >
              {tab.label}
            </span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
