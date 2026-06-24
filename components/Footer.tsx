import { useTranslations } from "next-intl";
import { MapPin } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { siteConfig, SERVICE_KEYS } from "@/lib/site";

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 2.2c3.2 0 3.6 0 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s0 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58 0-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.7 3.7 0 0 1-1.38-.9 3.7 3.7 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.21 15.58 2.2 15.2 2.2 12s0-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.21 8.8 2.2 12 2.2Zm0 1.8c-3.15 0-3.5 0-4.74.07-.9.04-1.38.19-1.7.32-.43.16-.74.36-1.06.68-.32.32-.52.63-.68 1.06-.13.32-.28.8-.32 1.7C3.4 8.5 3.4 8.85 3.4 12s0 3.5.07 4.74c.04.9.19 1.38.32 1.7.16.43.36.74.68 1.06.32.32.63.52 1.06.68.32.13.8.28 1.7.32 1.24.07 1.59.07 4.74.07s3.5 0 4.74-.07c.9-.04 1.38-.19 1.7-.32.43-.16.74-.36 1.06-.68.32-.32.52-.63.68-1.06.13-.32.28-.8.32-1.7.07-1.24.07-1.59.07-4.74s0-3.5-.07-4.74c-.04-.9-.19-1.38-.32-1.7a2.85 2.85 0 0 0-.68-1.06 2.85 2.85 0 0 0-1.06-.68c-.32-.13-.8-.28-1.7-.32C15.5 4 15.15 4 12 4Zm0 3.06A4.94 4.94 0 1 1 12 16.94 4.94 4.94 0 0 1 12 7.06Zm0 1.8A3.14 3.14 0 1 0 12 15.14 3.14 3.14 0 0 0 12 8.86Zm5.14-3.24a1.15 1.15 0 1 1 0 2.3 1.15 1.15 0 0 1 0-2.3Z" />
    </svg>
  );
}

function LinkedinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.07 2.07 0 1 1 0-4.14 2.07 2.07 0 0 1 0 4.14ZM7.12 20.45H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.22.79 24 1.77 24h20.45c.98 0 1.78-.78 1.78-1.73V1.73C24 .77 23.2 0 22.22 0Z" />
    </svg>
  );
}

export function Footer() {
  const t = useTranslations("Footer");
  const tNav = useTranslations("Nav");
  const tServices = useTranslations("Services");
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border px-5 py-14 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent-2 via-accent to-accent-3 text-sm font-bold text-background">
                T
              </span>
              <span className="text-sm font-semibold tracking-tight">
                Travel Business Agency
              </span>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
              {t("tagline")}
            </p>
            <div className="mt-5 flex gap-3">
              <a
                href={siteConfig.social.instagram}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:text-foreground"
              >
                <InstagramIcon className="h-4 w-4" />
              </a>
              <a
                href={siteConfig.social.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="LinkedIn"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:text-foreground"
              >
                <LinkedinIcon className="h-4 w-4" />
              </a>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold">{t("servicesTitle")}</h4>
            <ul className="mt-4 space-y-2.5 text-sm text-muted">
              {SERVICE_KEYS.map((key) => (
                <li key={key}>
                  <a
                    href="#services"
                    className="transition-colors hover:text-foreground"
                  >
                    {tServices(`${key}.title`)}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold">{t("companyTitle")}</h4>
            <ul className="mt-4 space-y-2.5 text-sm text-muted">
              <li>
                <a href="#why" className="transition-colors hover:text-foreground">
                  {tNav("why")}
                </a>
              </li>
              <li>
                <a
                  href="#process"
                  className="transition-colors hover:text-foreground"
                >
                  {tNav("process")}
                </a>
              </li>
              <li>
                <a
                  href="#testimonials"
                  className="transition-colors hover:text-foreground"
                >
                  {tNav("testimonials")}
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold">{t("contactTitle")}</h4>
            <ul className="mt-4 space-y-2.5 text-sm text-muted">
              <li>
                <a
                  href={`mailto:${siteConfig.contactEmail}`}
                  className="transition-colors hover:text-foreground"
                >
                  {siteConfig.contactEmail}
                </a>
              </li>
              <li>
                <a
                  href={`https://wa.me/${siteConfig.whatsappNumber}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-foreground"
                >
                  {siteConfig.whatsappDisplay}
                </a>
              </li>
              <li className="flex items-start gap-2 pt-1">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-accent-2" />
                <span>
                  {siteConfig.address.line1}
                  <br />
                  {siteConfig.address.postalCode} {siteConfig.address.city}
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-border pt-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {siteConfig.name}. {t("rights")}
          </p>
          <div className="flex items-center gap-4">
            <Link
              href="/legal"
              className="transition-colors hover:text-foreground"
            >
              {t("legalLink")}
            </Link>
            <span className="hidden sm:inline">·</span>
            <p>{t("madeWith")}</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
