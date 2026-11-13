"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/crm/icons";
import { useIsClient } from "@/lib/crm/use-is-client";

export type DossierChoice = {
  id: string;
  reference: string | null;
  client: string | null;
  titre: string | null;
  destination: string | null;
  dates: string | null;
};

type Preview = {
  deja?: boolean;
  ecrit?: boolean;
  accepter_client_requis?: boolean;
  resume?: string[];
  vers?: { reference?: string | null; client?: string | null };
};

export function MoveToDossier({
  bookingId,
  kind,
  carteId,
  reference,
  titre,
  buttonClassName,
}: {
  bookingId: string;
  kind: "etape" | "reservation";
  carteId?: string;
  reference?: string;
  titre: string;
  buttonClassName: string;
}) {
  const router = useRouter();
  const mounted = useIsClient();
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [choices, setChoices] = useState<DossierChoice[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<DossierChoice | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [accept, setAccept] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focus = window.setTimeout(() => inputRef.current?.focus(), 20);
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.clearTimeout(focus);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open || picked) return;
    const needle = query.trim();
    if (needle.length < 2) return;
    const timer = window.setTimeout(() => {
      setSearching(true);
      const url = `/api/admin/dossiers/recherche?q=${encodeURIComponent(needle)}&sauf=${encodeURIComponent(bookingId)}`;
      void fetch(url)
        .then(async (res) => {
          const json = await res.json().catch(() => ({}));
          if (!res.ok) {
            setError(typeof json.error === "string" ? json.error : "Recherche impossible.");
            setChoices([]);
            return;
          }
          setError(null);
          setChoices(Array.isArray(json.dossiers) ? (json.dossiers as DossierChoice[]) : []);
        })
        .catch(() => setError("Connexion interrompue. Réessayez."))
        .finally(() => setSearching(false));
    }, 280);
    return () => window.clearTimeout(timer);
  }, [open, query, picked, bookingId]);

  function close() {
    setOpen(false);
    setQuery("");
    setChoices([]);
    setPicked(null);
    setPreview(null);
    setAccept(false);
    setError(null);
  }

  async function ask(confirmer: boolean, choice: DossierChoice, accepted: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/deplacer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          carte_id: carteId,
          reference,
          dossier_id: choice.id,
          confirmer,
          accepter_client: accepted,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "Déplacement impossible.");
        return null;
      }
      return json as Preview;
    } catch {
      setError("Connexion interrompue. Réessayez.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function choose(choice: DossierChoice) {
    setPicked(choice);
    setAccept(false);
    const result = await ask(false, choice, false);
    if (result) setPreview(result);
  }

  async function confirm() {
    if (!picked) return;
    const result = await ask(true, picked, accept);
    if (!result?.ecrit && !result?.deja) return;
    close();
    router.refresh();
  }

  const needsAccept = preview?.accepter_client_requis === true && !preview.deja;

  return (
    <>
      <button type="button" className={buttonClassName} onClick={() => setOpen(true)}>
        Déplacer vers un autre dossier
      </button>
      {open && mounted
        ? createPortal(
            <div className="admin-portal fixed inset-0 z-50 flex items-end justify-center bg-[#0b192c]/55 p-3 sm:items-center">
              <section
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-[#e8e4dc] bg-white text-[#1a1c1a] shadow-2xl"
              >
                <div className="flex items-start justify-between gap-3 border-b border-[#e8e4dc] bg-[#faf9f6] px-5 py-4">
                  <div>
                    <p id={titleId} className="font-display text-lg font-bold text-[#0b192c]">
                      Déplacer vers un autre dossier
                    </p>
                    <p className="mt-0.5 text-sm text-[#44474c]">{titre}</p>
                  </div>
                  <button
                    type="button"
                    onClick={close}
                    className="admin-tap inline-flex h-11 w-11 items-center justify-center rounded-full text-[#0b192c] hover:bg-[#f3f1ea]"
                    aria-label="Fermer"
                  >
                    <Icon name="close" className="h-5 w-5" />
                  </button>
                </div>
                <div className="space-y-4 overflow-y-auto px-5 py-4">
                  {preview ? (
                    <>
                      <ul className="space-y-2 text-sm text-[#0b192c]">
                        {(preview.resume || []).map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                      {needsAccept ? (
                        <label className="flex items-start gap-2 rounded-2xl bg-[#f5ece0] px-4 py-3 text-sm text-[#0b192c]">
                          <input type="checkbox" checked={accept} onChange={(event) => setAccept(event.target.checked)} />
                          <span>Le client de ce dossier ne correspond pas aux voyageurs. Je confirme quand même.</span>
                        </label>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <label className="flex flex-col gap-1.5 text-sm font-semibold text-[#0b192c]">
                        <span>Dossier</span>
                        <input
                          ref={inputRef}
                          value={query}
                          onChange={(event) => {
                            setQuery(event.target.value);
                            setChoices([]);
                            setPicked(null);
                            setPreview(null);
                          }}
                          placeholder="Nom du client, voyageur ou destination"
                          aria-label="Rechercher un dossier"
                          className="rounded-xl border border-[#e8e4dc] bg-[#f3f1ea] px-3 py-2.5 text-sm font-normal text-[#0b192c] outline-none"
                          autoComplete="off"
                        />
                      </label>
                      {searching ? <p className="text-sm text-[#44474c]">Recherche…</p> : null}
                      {!searching && query.trim().length >= 2 && choices.length === 0 ? (
                        <p className="text-sm text-[#44474c]">Aucun dossier ouvert.</p>
                      ) : null}
                      <ul className="space-y-1">
                        {choices.map((choice) => {
                          const headline = [choice.client, choice.reference].filter(Boolean).join(" · ");
                          const detail = [choice.titre, choice.destination, choice.dates].filter(Boolean).join(" · ");
                          return (
                            <li key={choice.id}>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void choose(choice)}
                                className="admin-tap w-full rounded-2xl px-3 py-2 text-left hover:bg-[#f3f1ea] disabled:opacity-50"
                              >
                                <span className="block text-sm font-semibold text-[#0b192c]">{headline || "Dossier"}</span>
                                {detail ? <span className="block text-sm text-[#44474c]">{detail}</span> : null}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}
                  {error ? <p className="text-sm text-[var(--admin-red)]">{error}</p> : null}
                </div>
                <div className="flex flex-wrap justify-end gap-2 border-t border-[#e8e4dc] px-5 py-4">
                  <button type="button" onClick={preview ? () => { setPreview(null); setPicked(null); setAccept(false); } : close} className="rounded-full border border-[#e8e4dc] px-4 py-2 text-sm font-semibold">
                    {preview ? "Retour" : "Annuler"}
                  </button>
                  {preview && !preview.deja ? (
                    <button
                      type="button"
                      disabled={busy || (needsAccept && !accept)}
                      onClick={() => void confirm()}
                      className="rounded-full bg-[#0b192c] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      {busy ? "Déplacement…" : "Déplacer"}
                    </button>
                  ) : null}
                </div>
              </section>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
