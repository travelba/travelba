import type { ReactNode } from "react";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { catalogueImageSrc, textBlocks } from "@/lib/crm/public-catalogue";

export function CatalogueShell({
  locale,
  kicker,
  title,
  intro,
  children,
}: {
  locale: string;
  kicker: string;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  const home = locale === "en" ? "Back to the agency" : "Retour à l’accueil";
  return (
    <main className="relative mx-auto min-h-screen max-w-3xl px-5 py-20 sm:px-8">
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        {home}
      </Link>
      <p className="mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-[#C5A880]">{kicker}</p>
      <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-[#0B192C] sm:text-4xl">{title}</h1>
      <p className="mt-4 leading-relaxed text-muted">{intro}</p>
      {children}
    </main>
  );
}

export function CatalogueHero({ src, alt }: { src: string | null | undefined; alt: string }) {
  const image = catalogueImageSrc(src);
  if (!image) return null;
  return (
    <Image
      src={image}
      alt={alt}
      width={1600}
      height={900}
      sizes="(max-width: 768px) 100vw, 768px"
      className="mt-8 aspect-video w-full rounded-2xl object-cover"
    />
  );
}

export function CatalogueBlocks({ value }: { value: unknown }) {
  const blocks = textBlocks(value);
  if (!blocks.length) return null;
  return (
    <div className="mt-10 space-y-8">
      {blocks.map((block) => (
        <section key={`${block.title}-${block.body.slice(0, 24)}`}>
          {block.title ? <h2 className="font-display text-xl font-semibold text-[#0B192C]">{block.title}</h2> : null}
          {block.body ? <p className="mt-2 leading-relaxed text-muted">{block.body}</p> : null}
        </section>
      ))}
    </div>
  );
}

export function CatalogueEmpty({ locale }: { locale: string }) {
  return (
    <p className="mt-10 rounded-2xl border border-border bg-surface/40 px-5 py-4 text-sm text-muted">
      {locale === "en" ? "Nothing is published yet." : "Rien n’est publié pour le moment."}
    </p>
  );
}
