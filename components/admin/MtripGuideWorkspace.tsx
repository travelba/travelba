"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  WIZARD_STEPS,
  wizardStepFromGuide,
  type AgencyMtripGuide,
  type MtripGuidePassenger,
  type QuoteLine,
  type WizardStepId,
} from "@/lib/mtrip/guide-types";
import { PassportPassengerPanel } from "@/components/admin/PassportPassengerPanel";
import { QuoteLinesEditor } from "@/components/admin/QuoteLinesEditor";
import { VoyageFilesPanel } from "@/components/admin/VoyageFilesPanel";
import { buildPublicQuoteUrl, buildShortExpenseUrl } from "@/lib/agency/quote-link";
import {
  multiFileProgressPct,
  xhrFormUpload,
} from "@/lib/agency/xhr-upload";

type Props = {
  initialGuide: AgencyMtripGuide;
};

type SaveState = "idle" | "saving" | "saved" | "error";

export function MtripGuideWorkspace({ initialGuide }: Props) {
  const router = useRouter();
  const [guide, setGuide] = useState(initialGuide);
  const [passengers, setPassengers] = useState<MtripGuidePassenger[]>(
    initialGuide.passengers || []
  );
  const [step, setStep] = useState<WizardStepId>(() =>
    wizardStepFromGuide(initialGuide)
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [progressPct, setProgressPct] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [passSave, setPassSave] = useState<SaveState>("idle");
  const [quoteSave, setQuoteSave] = useState<SaveState>("idle");
  const [focusDocumentId, setFocusDocumentId] = useState<string | null>(null);
  const [waPreview, setWaPreview] = useState<string | null>(null);
  const [waBusiness, setWaBusiness] = useState<{
    configured: boolean;
    display_formatted?: string;
    hint?: string;
  } | null>(null);
  const [quoteCopied, setQuoteCopied] = useState(false);
  const [doneFlash, setDoneFlash] = useState(false);

  const passportApi = useRef<{
    importPassports: (files: FileList | File[] | null) => Promise<void>;
  } | null>(null);
  const passTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const passBoot = useRef(true);

  const lead =
    passengers.find((p) => p.role === "lead_traveler") || passengers[0];
  const leadContactOk = Boolean(lead?.email?.trim() && lead?.phone?.trim());
  const hasPax = passengers.some(
    (p) => p.first_name.trim() && p.last_name.trim()
  );
  const hasBookings =
    (guide.documents || []).length > 0 || (guide.quote_lines || []).length > 0;
  const reviewIssue = useMemo(() => {
    const leads = passengers.filter((p) => p.role === "lead_traveler");
    if (!guide.start_date || !guide.end_date) return "Dates de voyage à confirmer";
    if (leads.length !== 1) return "Désignez exactement un voyageur principal";
    const pending = passengers.find(
      (p) =>
        !p.first_name.trim() ||
        !p.last_name.trim() ||
        p.import_status === "review" ||
        Boolean(p.import_warnings?.length)
    );
    if (pending) return "Validez les identités et alertes d’import passeport";
    return null;
  }, [guide.end_date, guide.start_date, passengers]);
  const quoteTotal = (guide.quote_lines || []).reduce(
    (s, l) => s + (typeof l.amount === "number" ? l.amount : 0),
    0
  );

  const stepIndex = WIZARD_STEPS.findIndex((s) => s.id === step);

  const ctaBlockReason = useMemo(() => {
    if (step === "passports" && !hasPax) return "Importez au moins un passeport";
    if (step === "contact" && !leadContactOk)
      return "Email + téléphone du principal requis";
    if (step === "bookings" && !hasBookings)
      return "Ajoutez une résa ou une ligne devis";
    if (step === "send") {
      if (!hasPax) return "Aucun passager";
      if (!leadContactOk) return "Contact incomplet";
      if (!hasBookings) return "Devis / résa manquant";
      if (reviewIssue) return reviewIssue;
    }
    return null;
  }, [step, hasPax, leadContactOk, hasBookings, reviewIssue]);

  useEffect(() => {
    if (passBoot.current) {
      passBoot.current = false;
      return;
    }
    if (!hasPax) return;
    if (passTimer.current) clearTimeout(passTimer.current);
    passTimer.current = setTimeout(() => {
      // Debounced invocation intentionally references the latest function body.
      // eslint-disable-next-line react-hooks/immutability
      void autosavePassengers();
    }, 500);
    return () => {
      if (passTimer.current) clearTimeout(passTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passengers]);

  useEffect(() => {
    if (step !== "send") return;
    void fetch("/api/admin/whatsapp/status")
      .then((r) => r.json())
      .then((d) => {
        if (d && typeof d.configured === "boolean") {
          setWaBusiness({
            configured: d.configured,
            display_formatted: d.display_formatted,
            hint: d.hint,
          });
        }
      })
      .catch(() => null);
  }, [step]);

  async function autosavePassengers() {
    if (!passengers.every((p) => p.first_name.trim() && p.last_name.trim())) {
      return;
    }
    setPassSave("saving");
    try {
      const res = await fetch(`/api/admin/mtrip/guides/${guide.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          passengers: passengers.map((p) => ({
            ...p,
            email: p.email || null,
            phone: p.phone || null,
            role: p.role || "traveler",
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPassSave("error");
        return;
      }
      setGuide(data.guide);
      setPassSave("saved");
      window.setTimeout(() => setPassSave("idle"), 1500);
    } catch {
      setPassSave("error");
    }
  }

  function onQuoteChange(payload: {
    quote_lines: QuoteLine[];
    title: string;
    start_date: string | null;
    end_date: string | null;
  }) {
    if (quoteTimer.current) clearTimeout(quoteTimer.current);
    setQuoteSave("saving");
    quoteTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/mtrip/guides/${guide.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          setQuoteSave("error");
          return;
        }
        setGuide(data.guide);
        setQuoteSave("saved");
        window.setTimeout(() => setQuoteSave("idle"), 1500);
      } catch {
        setQuoteSave("error");
      }
    }, 450);
  }

  async function onBookingUpload(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files);
    setBusy("upload");
    setError(null);
    setProgressPct(2);

    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      const isImage =
        file.type.startsWith("image/") ||
        /\.(png|jpe?g|webp)$/i.test(file.name);

      const report = (fraction: number) => {
        const pct = multiFileProgressPct(i, list.length, fraction);
        setProgressPct(pct);
        setProgressLabel(
          fraction < 0.93
            ? `Envoi ${i + 1}/${list.length} — ${file.name}`
            : `${isImage ? "OCR" : "Analyse PDF"} ${i + 1}/${list.length} — ${file.name}`
        );
      };

      report(0.02);
      const form = new FormData();
      form.append("files", file);

      try {
        const { ok, json: data } = await xhrFormUpload({
          url: `/api/admin/mtrip/guides/${guide.id}/documents`,
          formData: form,
          onUploadProgress: report,
        });
        if (!ok) {
          setError(data?.error || `Upload impossible — ${file.name}`);
          setBusy(null);
          setProgressLabel(null);
          setProgressPct(null);
          return;
        }
        setGuide(data.guide as AgencyMtripGuide);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : `Upload impossible — ${file.name}`
        );
        setBusy(null);
        setProgressLabel(null);
        setProgressPct(null);
        return;
      }
    }

    setBusy(null);
    setProgressLabel(null);
    setProgressPct(100);
    window.setTimeout(() => setProgressPct(null), 400);
  }

  async function onPassportDrop(files: FileList | null) {
    if (!files?.length) return;
    await passportApi.current?.importPassports(files);
  }

  async function publishMtrip() {
    setBusy("publish");
    setError(null);
    setProgressLabel("Publication mTrip…");
    setProgressPct(8);
    const tick = window.setInterval(() => {
      setProgressPct((p) => {
        if (p == null || p >= 92) return p;
        return Math.min(92, p + 3);
      });
    }, 400);
    const res = await fetch(`/api/admin/mtrip/guides/${guide.id}/publish`, {
      method: "POST",
    });
    const data = await res.json();
    window.clearInterval(tick);
    setBusy(null);
    setProgressLabel(null);
    setProgressPct(res.ok ? 100 : null);
    if (res.ok) window.setTimeout(() => setProgressPct(null), 500);
    if (!res.ok) {
      setError(data.error || "Publication mTrip impossible");
      return;
    }
    setGuide(data.guide);
  }

  async function sendWhatsAppOptIn() {
    setBusy("optin");
    setError(null);
    setProgressLabel("Envoi opt-in Concierge…");
    setProgressPct(15);
    const res = await fetch(
      `/api/admin/mtrip/guides/${guide.id}/whatsapp/optin`,
      { method: "POST" }
    );
    const data = await res.json();
    setBusy(null);
    setProgressLabel(null);
    setProgressPct(res.ok ? 100 : null);
    if (res.ok) window.setTimeout(() => setProgressPct(null), 400);
    if (!res.ok) {
      setError(data.error || "Envoi opt-in impossible");
      return;
    }
    setGuide(data.guide);
    setWaPreview(data.message || null);
  }

  async function sendWhatsApp() {
    setBusy("send");
    setError(null);
    setProgressLabel("Envoi WhatsApp Business…");
    setProgressPct(15);
    const res = await fetch(`/api/admin/mtrip/guides/${guide.id}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publish: false }),
    });
    const data = await res.json();
    setBusy(null);
    setProgressLabel(null);
    setProgressPct(res.ok ? 100 : null);
    if (res.ok) window.setTimeout(() => setProgressPct(null), 400);
    if (!res.ok) {
      setError(data.error || "Envoi WhatsApp impossible");
      return;
    }
    setGuide(data.guide);
    setWaPreview(data.message || null);
    setDoneFlash(true);
  }

  function goNext() {
    if (ctaBlockReason) return;
    const next = WIZARD_STEPS[stepIndex + 1];
    if (next) setStep(next.id);
  }

  function goBack() {
    const prev = WIZARD_STEPS[stepIndex - 1];
    if (prev) setStep(prev.id);
  }

  const isPublished =
    guide.status === "published" &&
    Boolean(guide.mtrip_identifier) &&
    Object.keys(guide.app_links || {}).length > 0;
  const hasOptInSend = (guide.sends || []).some((s) => s.kind === "optin");
  const hasDossierSend = (guide.sends || []).some(
    (s) => s.kind === "dossier" || (!s.kind && s.channel !== "email")
  );

  const primaryLabel =
    step === "send"
      ? isPublished
        ? busy === "send"
          ? "Envoi…"
          : "Envoyer WhatsApp"
        : busy === "publish"
          ? "Publication…"
          : "Publier mTrip"
      : "Continuer";

  const quotePublicUrl = guide.quote_token
    ? buildPublicQuoteUrl(guide.quote_token)
    : null;
  const expenseShortUrl = guide.short_code
    ? buildShortExpenseUrl(guide.short_code)
    : quotePublicUrl;
  async function copyQuoteLink() {
    const url =
      expenseShortUrl ||
      quotePublicUrl ||
      (guide.quote_token && typeof window !== "undefined"
        ? `${window.location.origin}/devis/${guide.quote_token}`
        : null);
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setQuoteCopied(true);
      setTimeout(() => setQuoteCopied(false), 2000);
    } catch {
      setError("Impossible de copier le lien devis");
    }
  }

  async function deleteVoyage() {
    const ok = window.confirm(
      `Supprimer « ${guide.title} » du dashboard${
        guide.mtrip_identifier ? " et de mTrip" : ""
      } ?`
    );
    if (!ok) return;
    setBusy("delete");
    setError(null);
    const res = await fetch(`/api/admin/mtrip/guides/${guide.id}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setError(data.error || "Suppression impossible");
      return;
    }
    router.push("/admin");
    router.refresh();
  }

  return (
    <div className="relative pb-28">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/admin/mtrip"
            className="text-sm text-muted transition hover:text-foreground"
          >
            ← Voyages mTrip
          </Link>
          <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-[var(--admin-navy)]">
            {guide.title}
          </h1>
          {(guide.start_date || lead || quoteTotal > 0) && (
            <p className="mt-1 text-sm text-muted">
              {[
                guide.start_date && guide.end_date
                  ? `${guide.start_date} → ${guide.end_date}`
                  : null,
                lead ? `${lead.first_name} ${lead.last_name}` : null,
                quoteTotal > 0
                  ? quoteTotal.toLocaleString("fr-FR", {
                      style: "currency",
                      currency: "EUR",
                    })
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-3">
          <div className="flex items-center gap-1.5">
            {WIZARD_STEPS.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStep(s.id)}
                className={`flex h-9 min-w-9 items-center justify-center rounded-full px-3 text-xs font-medium transition ${
                  i === stepIndex
                    ? "bg-accent text-white"
                    : i < stepIndex
                      ? "bg-accent/15 text-accent"
                      : "bg-[var(--admin-sky)] text-muted"
                }`}
              >
                <span className="sm:hidden">{s.short}</span>
                <span className="hidden sm:inline">
                  {s.short}. {s.label}
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void deleteVoyage()}
            disabled={busy === "delete"}
            className="text-xs text-muted transition hover:text-[var(--admin-red)] disabled:opacity-40"
          >
            {busy === "delete" ? "Suppression…" : "Supprimer le voyage"}
          </button>
        </div>
      </div>

      {(progressLabel || busy || progressPct != null) && (
        <div className="mb-6 overflow-hidden rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-sm font-medium">
                  {progressLabel || "Traitement…"}
                </p>
                {progressPct != null && (
                  <span className="shrink-0 font-mono text-lg font-semibold tabular-nums text-accent">
                    {progressPct}%
                  </span>
                )}
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--admin-sky)]">
                <div
                  className={`h-full rounded-full bg-accent transition-all duration-200 ${
                    progressPct == null ? "w-2/3 animate-pulse" : ""
                  }`}
                  style={
                    progressPct != null
                      ? { width: `${Math.max(progressPct, 2)}%` }
                      : undefined
                  }
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {error && <p className="mb-4 text-sm text-[var(--admin-red)]">{error}</p>}
      {!error && typeof guide.last_error === "string" && guide.last_error && (
        <p className="mb-4 text-sm text-[var(--admin-red)]">
          Dernière erreur : {guide.last_error}
        </p>
      )}

      {step === "passports" && (
        <section className="space-y-5">
          <div>
            <h2 className="font-display text-2xl tracking-tight">
              Passeports
            </h2>
          </div>
          <DropZone
            label="Déposer passeports (PDF ou photo)"
            hint="JPG · PNG · PDF scanné · PDF multi-passeports OK"
            accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,.pdf,.jpg,.jpeg,.png,.heic"
            disabled={Boolean(busy)}
            progressPct={busy === "passport" ? progressPct : null}
            onFiles={(f) => void onPassportDrop(f)}
          />
          <PassportPassengerPanel
            passengers={passengers}
            onPassengersChange={setPassengers}
            guideId={guide.id}
            requireLeadContact={false}
            compact
            hideDropzone
            importApiRef={passportApi}
            onGuideSynced={(g) => setGuide(g as AgencyMtripGuide)}
            onImportingChange={(ing, label, pct) => {
              setBusy(ing ? "passport" : null);
              setProgressLabel(label || null);
              setProgressPct(ing ? (pct ?? 0) : null);
            }}
          />
          <VoyageFilesPanel
            guideId={guide.id}
            files={guide.passport_files || []}
            title="Passeports enregistrés"
            focusFileId={
              (guide.passport_files || []).some((f) => f.id === focusDocumentId)
                ? focusDocumentId
                : null
            }
            onFocusConsumed={() => setFocusDocumentId(null)}
            onDeleted={(g) => {
              const next = g as AgencyMtripGuide;
              setGuide(next);
              if (next.passengers) setPassengers(next.passengers);
            }}
          />
          {passSave !== "idle" && (
            <p className="text-xs text-muted">
              {passSave === "saving" && "Sauvegarde…"}
              {passSave === "saved" && (
                <span className="text-emerald-400">✓ Contact sauvé</span>
              )}
            </p>
          )}
        </section>
      )}

      {step === "contact" && (
        <section className="space-y-5">
          <div>
            <h2 className="font-display text-2xl tracking-tight">
              Contact principal
            </h2>
            <p className="mt-1 text-sm text-muted">
              WhatsApp + email du lead. Sauvegarde automatique.
              {passSave === "saved" && (
                <span className="ml-2 text-emerald-400">✓</span>
              )}
            </p>
          </div>
          {!passengers.length ? (
            <p className="text-sm text-muted">
              Importez d’abord un passeport (étape 1).
            </p>
          ) : (
            <PassportPassengerPanel
              passengers={passengers}
              onPassengersChange={setPassengers}
              guideId={guide.id}
              requireLeadContact
              contactOnly
              compact
              hideDropzone
              onGuideSynced={(g) => setGuide(g as AgencyMtripGuide)}
            />
          )}
        </section>
      )}

      {step === "bookings" && (
        <section className="space-y-5">
          <div>
            <h2 className="font-display text-2xl tracking-tight">
              Réservations & devis
            </h2>
            <p className="mt-1 text-sm text-muted">
              Import pour gagner du temps — le client suit les dépenses via son
              lien devis.
            </p>
            {guide.quote_token && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void copyQuoteLink()}
                  className="rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-[var(--admin-navy)] hover:border-accent/40"
                >
                  {quoteCopied ? "Lien copié" : "Copier le lien devis client"}
                </button>
                <a
                  href={`/devis/${guide.quote_token}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-[var(--admin-navy)] hover:border-accent/40"
                >
                  Aperçu client
                </a>
              </div>
            )}
          </div>
          <DropZone
            label="Déposer confirmations PDF"
            hint="Vols · hôtels · vouchers · PDF ou capture"
            accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,.pdf,.jpg,.jpeg,.png,.heic"
            disabled={Boolean(busy)}
            progressPct={busy === "upload" ? progressPct : null}
            onFiles={(f) => void onBookingUpload(f)}
          />
          <p className="-mt-3 text-center text-[11px] text-muted">
            PDF ou capture d’écran (PNG/JPG) — sauvegarde automatique dans le
            dossier
          </p>
          <VoyageFilesPanel
            guideId={guide.id}
            files={guide.documents || []}
            title="Confirmations enregistrées"
            focusFileId={
              (guide.documents || []).some((f) => f.id === focusDocumentId)
                ? focusDocumentId
                : null
            }
            onFocusConsumed={() => setFocusDocumentId(null)}
            onDeleted={(g) => setGuide(g as AgencyMtripGuide)}
          />
          <QuoteLinesEditor
            lines={guide.quote_lines || []}
            tripTitle={guide.title}
            startDate={guide.start_date}
            endDate={guide.end_date}
            onChange={onQuoteChange}
            saveState={quoteSave}
            onOpenDocument={(docId) => setFocusDocumentId(docId)}
          />
        </section>
      )}

      {step === "send" && (
        <section className="space-y-6">
          <div>
            <h2 className="font-display text-2xl tracking-tight">
              Publication & envoi
            </h2>
            <p className="mt-1 text-sm text-muted">
              Publier mTrip, puis WhatsApp en deux temps : opt-in Concierge,
              ensuite dossier voyage.
            </p>
            {isPublished && guide.short_code && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                <span>Liens courts :</span>
                <a
                  href={`/d/${guide.short_code}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-[var(--admin-navy)] hover:underline"
                >
                  /d/{guide.short_code}
                </a>
                <span>·</span>
                <a
                  href={`/v/${guide.short_code}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-[var(--admin-navy)] hover:underline"
                >
                  /v/{guide.short_code}
                </a>
              </div>
            )}
            {guide.quote_token && !guide.short_code && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void copyQuoteLink()}
                  className="rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-[var(--admin-navy)] hover:border-accent/40"
                >
                  {quoteCopied ? "Lien copié" : "Copier lien devis"}
                </button>
                <span className="max-w-full truncate text-[11px] text-muted">
                  /devis/{guide.quote_token.slice(0, 8)}…
                </span>
              </div>
            )}
            {isPublished && guide.short_code && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => void copyQuoteLink()}
                  className="rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-[var(--admin-navy)] hover:border-accent/40"
                >
                  {quoteCopied ? "Lien copié" : "Copier lien dépenses"}
                </button>
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="admin-af-card rounded-2xl p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                1 · Application voyageur
              </p>
              <h3 className="mt-1 font-display text-lg font-bold text-[var(--admin-navy)]">
                Créer / publier mTrip
              </h3>
              <p className="mt-2 text-xs text-muted">
                Pousse le voyage (vols, hôtels, liens app) vers mTrip. Aucun
                message client n’est envoyé.
              </p>
              <p className="mt-3 text-xs font-medium">
                {isPublished ? (
                  <span className="text-emerald-700">
                    Publié
                    {guide.mtrip_identifier
                      ? ` · ${guide.mtrip_identifier}`
                      : ""}
                  </span>
                ) : (
                  <span className="text-amber-700">Pas encore publié</span>
                )}
              </p>
              <button
                type="button"
                disabled={Boolean(busy) || Boolean(ctaBlockReason)}
                onClick={() => void publishMtrip()}
                className="admin-af-btn mt-4 w-full rounded-full px-4 py-2.5 text-sm disabled:opacity-40"
              >
                {busy === "publish"
                  ? "Publication…"
                  : isPublished
                    ? "Republier mTrip"
                    : "Publier mTrip"}
              </button>
            </div>

            <div className="admin-af-card rounded-2xl p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                2 · WhatsApp Business
              </p>
              <h3 className="mt-1 font-display text-lg font-bold text-[var(--admin-navy)]">
                Plan Concierge
              </h3>
              <p className="mt-2 text-xs text-muted">
                1) Opt-in (« Veux-tu recevoir ton dossier ? » + Oui / Non) — puis
                2) envoi du dossier (devis + app) après accord client.
              </p>
              {waBusiness && (
                <p
                  className={`mt-3 text-xs ${
                    waBusiness.configured ? "text-emerald-700" : "text-[var(--admin-red)]"
                  }`}
                >
                  {waBusiness.configured
                    ? `Twilio WhatsApp · ${waBusiness.display_formatted || "TBA"}`
                    : waBusiness.hint}
                </p>
              )}
              {hasOptInSend && (
                <p className="mt-2 text-xs text-emerald-700">
                  Opt-in déjà envoyé
                </p>
              )}
              {hasDossierSend && (
                <p className="mt-1 text-xs text-emerald-700">
                  Dossier déjà envoyé
                </p>
              )}
              <div className="mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  disabled={Boolean(busy) || Boolean(ctaBlockReason)}
                  onClick={() => void sendWhatsAppOptIn()}
                  className="w-full rounded-full border border-emerald-600 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-40"
                >
                  {busy === "optin"
                    ? "Envoi opt-in…"
                    : "1 · Envoyer opt-in Concierge"}
                </button>
                <button
                  type="button"
                  disabled={Boolean(busy) || Boolean(ctaBlockReason) || !isPublished}
                  onClick={() => void sendWhatsApp()}
                  className="w-full rounded-full bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40"
                >
                  {busy === "send"
                    ? "Envoi…"
                    : "2 · Envoyer le dossier voyage"}
                </button>
              </div>
            </div>
          </div>

          <div
            className={`rounded-2xl border p-5 transition ${
              doneFlash
                ? "border-emerald-500/40 bg-emerald-500/10"
                : "border-border/70 bg-white"
            }`}
          >
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted">Client</dt>
                <dd className="mt-1 font-medium">
                  {lead
                    ? `${lead.first_name} ${lead.last_name}`
                    : "—"}
                </dd>
                <dd className="text-xs text-muted">{lead?.phone || ""}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Dates</dt>
                <dd className="mt-1 font-medium">
                  {guide.start_date && guide.end_date
                    ? `${guide.start_date} → ${guide.end_date}`
                    : "À confirmer"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Total devis</dt>
                <dd className="mt-1 text-xl font-semibold tracking-tight">
                  {quoteTotal.toLocaleString("fr-FR", {
                    style: "currency",
                    currency: "EUR",
                  })}
                </dd>
              </div>
            </dl>
          </div>

          {waPreview && (
            <pre className="whitespace-pre-wrap rounded-2xl border border-border/60 bg-background/50 p-4 text-xs leading-relaxed text-muted">
              {waPreview}
            </pre>
          )}
        </section>
      )}

      {/* Sticky CTA */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={goBack}
            disabled={stepIndex === 0 || Boolean(busy)}
            className="rounded-full px-4 py-2.5 text-sm font-medium text-muted transition hover:bg-[var(--admin-sky)] hover:text-foreground disabled:opacity-30"
          >
            Retour
          </button>
          <div className="flex flex-1 flex-col items-end gap-1 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
            {ctaBlockReason && (
              <p className="text-xs text-amber-700">{ctaBlockReason}</p>
            )}
            {step === "send" ? (
              <>
                <button
                  type="button"
                  disabled={Boolean(ctaBlockReason) || Boolean(busy)}
                  onClick={() => void publishMtrip()}
                  className="rounded-full border border-[var(--admin-navy)] px-5 py-2.5 text-sm font-semibold text-[var(--admin-navy)] transition hover:bg-[var(--admin-sky)] disabled:opacity-40"
                >
                  {busy === "publish"
                    ? "Publication…"
                    : isPublished
                      ? "Republier mTrip"
                      : "Publier mTrip"}
                </button>
                <button
                  type="button"
                  disabled={Boolean(ctaBlockReason) || Boolean(busy)}
                  onClick={() => void sendWhatsAppOptIn()}
                  className="rounded-full border border-emerald-600 px-5 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-40"
                >
                  {busy === "optin" ? "Opt-in…" : "Opt-in Concierge"}
                </button>
                <button
                  type="button"
                  disabled={Boolean(ctaBlockReason) || Boolean(busy) || !isPublished}
                  onClick={() => void sendWhatsApp()}
                  className="rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40"
                >
                  {busy === "send" ? "Envoi…" : "Envoyer dossier"}
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={Boolean(ctaBlockReason) || Boolean(busy)}
                onClick={goNext}
                className="admin-af-btn rounded-full px-6 py-3 text-sm font-semibold disabled:opacity-40"
              >
                {primaryLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DropZone({
  label,
  hint,
  accept,
  disabled,
  onFiles,
  progressPct = null,
}: {
  label: string;
  hint: string;
  accept: string;
  disabled?: boolean;
  onFiles: (files: FileList | null) => void;
  progressPct?: number | null;
}) {
  const [over, setOver] = useState(false);
  const showPct = disabled && progressPct != null;
  return (
    <label
      onDragEnter={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) onFiles(e.dataTransfer.files);
      }}
      className={`relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-6 py-12 text-center transition ${
        over || disabled
          ? "border-accent/60 bg-accent/5"
          : "admin-af-card hover:border-accent/40"
      } ${disabled && !showPct ? "pointer-events-none opacity-60" : ""} ${
        showPct ? "pointer-events-none" : ""
      }`}
    >
      {showPct ? (
        <div className="w-full max-w-sm space-y-3 px-2">
          <p className="font-mono text-4xl font-semibold tabular-nums text-accent">
            {progressPct}%
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--admin-sky)]">
            <div
              className="h-full rounded-full bg-accent transition-all duration-200"
              style={{ width: `${Math.max(progressPct ?? 0, 2)}%` }}
            />
          </div>
          <span className="text-xs text-muted">Chargement en cours…</span>
        </div>
      ) : (
        <>
          <span className="text-base font-medium">{label}</span>
          <span className="text-xs text-muted">{hint}</span>
        </>
      )}
      <input
        type="file"
        accept={accept}
        multiple
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </label>
  );
}
