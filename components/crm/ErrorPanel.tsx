"use client";

import Link from "next/link";
import { useEffect } from "react";

export type RouteErrorProps = {
  error: Error & { digest?: string };
  reset?: () => void;
  unstable_retry?: () => void;
};

export function ErrorPanel({
  error,
  reset,
  unstable_retry,
  homeHref,
  homeLabel,
}: RouteErrorProps & { homeHref: string; homeLabel: string }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const retry = unstable_retry ?? reset;

  return (
    <div className="mx-auto flex min-h-[50vh] w-full max-w-md flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">Erreur</p>
      <h1 className="font-display text-2xl font-semibold text-[var(--admin-navy)]">
        Une erreur est survenue
      </h1>
      <p className="text-sm text-muted">
        La page n’a pas pu se charger. Réessayez dans un instant ; si le problème persiste,
        contactez l’agence.
      </p>
      {error.digest ? (
        <p className="text-[11px] text-muted">Référence : {error.digest}</p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        {retry ? (
          <button
            type="button"
            onClick={() => retry()}
            className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--admin-navy)] px-5 text-sm font-semibold text-white"
          >
            Réessayer
          </button>
        ) : null}
        <Link
          href={homeHref}
          className="inline-flex h-11 items-center justify-center rounded-full border border-[var(--border)] bg-white px-5 text-sm font-semibold text-[var(--admin-navy)]"
        >
          {homeLabel}
        </Link>
      </div>
    </div>
  );
}

export function NotFoundPanel({ homeHref, homeLabel }: { homeHref: string; homeLabel: string }) {
  return (
    <div className="mx-auto flex min-h-[50vh] w-full max-w-md flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">404</p>
      <h1 className="font-display text-2xl font-semibold text-[var(--admin-navy)]">
        Page introuvable
      </h1>
      <p className="text-sm text-muted">
        Cette page n’existe pas ou n’est plus disponible.
      </p>
      <Link
        href={homeHref}
        className="mt-2 inline-flex h-11 items-center justify-center rounded-full bg-[var(--admin-navy)] px-5 text-sm font-semibold text-white"
      >
        {homeLabel}
      </Link>
    </div>
  );
}
