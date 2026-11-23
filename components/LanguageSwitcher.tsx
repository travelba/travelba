"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { useTransition } from "react";

export function LanguageSwitcher() {
  const locale = useLocale();
  const tCommon = useTranslations("Common");
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function switchTo(next: string) {
    if (next === locale) return;
    startTransition(() => {
      router.replace(pathname, { locale: next });
    });
  }

  return (
    <div
      className="flex items-center"
      role="group"
      aria-label={tCommon("language")}
    >
      {routing.locales.map((loc) => {
        const active = loc === locale;
        return (
          <button
            key={loc}
            type="button"
            onClick={() => switchTo(loc)}
            disabled={isPending}
            className={`inline-flex min-h-11 min-w-11 items-center justify-center text-[11px] font-medium uppercase tracking-[0.16em] transition-colors ${
              active
                ? "text-[#1A1714] shadow-[inset_0_-1px_0_0_#5C4824]"
                : "text-[#6A645C] hover:text-[#1A1714]"
            }`}
            aria-current={active ? "true" : undefined}
          >
            {loc}
          </button>
        );
      })}
    </div>
  );
}
