import Link from "next/link";

const ICONS = {
  home: (
    <>
      <path d="M4 11.2 12 4.5l8 6.7V20H4Z" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  hotel: (
    <>
      <path d="M4.5 20V9.2L12 4.5l7.5 4.7V20" />
      <path d="M9.5 20v-4.2h5V20" />
      <path d="M8.2 11.2h1.6M14.2 11.2h1.6" />
    </>
  ),
  stay: <path d="M7 3.8h10v16.4l-5-2.4-5 2.4Z" />,
  ledger: (
    <>
      <path d="M7 3.5h8.2L19 7.2V20.5H7Z" />
      <path d="M15 3.6V7.4H19" />
      <path d="M10 12h6M10 15.5h4" />
    </>
  ),
  account: (
    <>
      <circle cx="12" cy="8.2" r="2.7" />
      <path d="M6.2 19.2c.9-3 2.9-4.4 5.8-4.4s4.9 1.4 5.8 4.4" />
    </>
  ),
} as const;

export type NightTabIcon = keyof typeof ICONS;

function Mark({ name }: { name: NightTabIcon }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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
            className="account-press relative flex min-h-[44px] min-w-0 flex-1 flex-col items-center justify-center gap-1 px-0"
          >
            {tab.active ? <span aria-hidden className="absolute top-0 h-px w-5 bg-[#c5a880]" /> : null}
            <Mark name={tab.icon} />
            <span
              className="block max-w-full truncate text-center text-[9px] font-semibold uppercase leading-none"
              style={{ letterSpacing: tab.label.length > 11 ? "0.01em" : "0.12em" }}
            >
              {tab.label}
            </span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
