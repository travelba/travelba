"use client";

import { useState } from "react";
import { BusyBar } from "@/components/crm/BusyBar";

type Dossier = {
  id: string;
  reference: string;
  title: string;
  dates: string;
  commission: boolean;
};

type Payer = {
  key: string;
  label: string;
  dossiers: Dossier[];
};

type Facture = {
  id: string;
  number: string;
  totalLabel: string;
  paidLabel: string;
  balanceLabel: string;
  removed: boolean;
  fichier: string;
  dossiers: { id: string; reference: string }[];
  numeroMb3m: string | null;
  erreurMb3m: string | null;
};

type Preview = {
  payeur: string;
  sections: {
    reference: string;
    destination: string;
    dates: string;
    voyageurs: string[];
    commission: boolean;
    lignes: { libelle: string; montant: number }[];
    sous_total: number;
    paye: number;
    reste: number;
  }[];
  total: number;
  paye: number;
  reste: number;
  compte?: { libelle: string; montant: number }[];
  message: string;
};

function euros(amount: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(amount);
}

export function GroupedInvoicePanel({ customerId }: { customerId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [payers, setPayers] = useState<Payer[]>([]);
  const [factures, setFactures] = useState<Facture[]>([]);
  const [payerKey, setPayerKey] = useState("");
  const [checked, setChecked] = useState<string[]>([]);
  const [factureId, setFactureId] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/clients/${customerId}/facture-groupee`);
      const json = (await res.json().catch(() => null)) as {
        error?: string;
        payeurs?: Payer[];
        factures?: Facture[];
        avertissement?: string | null;
      } | null;
      if (!res.ok) {
        setError(json?.error || "La sélection n’a pas pu être lue.");
        return;
      }
      if (json?.avertissement) setError(json.avertissement);
      const next = json?.payeurs || [];
      setPayers(next);
      setFactures(json?.factures || []);
      setPayerKey((current) => current || next[0]?.key || "");
    } catch {
      setError("La sélection n’a pas pu être lue.");
    } finally {
      setLoading(false);
    }
  }

  function show() {
    setOpen(true);
    setNote("");
    setPreview(null);
    setFactureId("");
    setChecked([]);
    void load();
  }

  const payer = payers.find((row) => row.key === payerKey) || payers[0] || null;

  function toggle(id: string) {
    setFactureId("");
    setPreview(null);
    setChecked((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  }

  function choosePayer(key: string) {
    setPayerKey(key);
    setChecked([]);
    setPreview(null);
    setFactureId("");
  }

  async function run(action: "apercu" | "generer" | "retirer" | "restaurer" | "mb3m", extra?: { facture_id?: string; dossier_ids?: string[] }) {
    setBusy(action);
    setError("");
    setNote("");
    try {
      const res = await fetch(`/api/admin/clients/${customerId}/facture-groupee`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          dossier_ids: extra?.dossier_ids || checked,
          facture_id: extra?.facture_id || factureId || undefined,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | (Preview & {
            error?: string;
            numero?: string;
            fichier?: string;
            numero_mb3m?: string | null;
            erreur_mb3m?: string | null;
            avertissement_mb3m?: string | null;
          })
        | null;
      if (!res.ok) {
        setError(json?.error || "La facture groupée n’a pas abouti.");
        return;
      }
      if (action === "apercu") {
        setPreview(json as Preview);
        return;
      }
      setPreview(null);
      const mb3m = json?.numero_mb3m ? ` Pièce MB3M n° ${json.numero_mb3m}.` : "";
      const hint = json?.avertissement_mb3m ? ` ${json.avertissement_mb3m}` : "";
      if (json?.erreur_mb3m) setError(json.erreur_mb3m);
      setNote(
        action === "retirer"
          ? `Pro forma ${json?.numero || ""} retirée. Le fichier reste, on peut la restaurer.`
          : action === "restaurer"
            ? `Pro forma ${json?.numero || ""} restaurée. Elle reste masquée au client.`
            : action === "mb3m"
              ? `Pro forma ${json?.numero || ""} : pièce MB3M${json?.numero_mb3m ? ` n° ${json.numero_mb3m}` : ""}. Le PDF n’a pas été refait.${hint}`
              : `Pro forma ${json?.numero || ""} enregistrée sur les dossiers, masquée.${mb3m}${hint} Rien n’a été envoyé.`
      );
      await load();
    } catch {
      setError("La facture groupée n’a pas abouti.");
    } finally {
      setBusy("");
    }
  }

  function reuse(row: Facture) {
    const ids = row.dossiers.map((dossier) => dossier.id);
    const owner = payers.find((group) => group.dossiers.some((dossier) => ids.includes(dossier.id)));
    if (owner) setPayerKey(owner.key);
    setChecked(ids);
    setFactureId(row.id);
    setPreview(null);
    setNote(`Mise à jour de ${row.number}. Les dossiers cochés remplacent la sélection.`);
  }

  return (
    <>
      <button type="button" onClick={show} className="admin-af-btn-accent inline-flex rounded-full px-5 py-2.5 text-sm">
        Facture groupée
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0B192C]/40 p-4 sm:items-center" role="presentation" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="facture-groupee-titre"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--admin-gold-dark)]">Pro forma</p>
                <h2 id="facture-groupee-titre" className="mt-1 font-display text-2xl font-bold text-[var(--admin-navy)]">
                  Facture groupée
                </h2>
              </div>
              <button type="button" className="text-sm text-muted" onClick={() => setOpen(false)}>
                Fermer
              </button>
            </div>
            <p className="mt-2 text-sm text-muted">
              Une section par dossier, pour un même payeur. Le PDF est déposé sur chaque dossier, masqué. Une pièce pro forma MB3M
              est créée au nom du payeur. Rien n’est envoyé, rien n’est imprimé.
            </p>
            <BusyBar
              active={loading || Boolean(busy)}
              label={busy === "mb3m" ? "MB3M…" : busy === "generer" ? "Préparation…" : "Lecture…"}
            />
            {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
            {note ? <p className="mt-3 text-sm text-[var(--admin-navy)]">{note}</p> : null}
            {payers.length > 1 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {payers.map((row) => (
                  <button
                    key={row.key}
                    type="button"
                    onClick={() => choosePayer(row.key)}
                    className={`rounded-full px-3 py-1.5 text-sm ${
                      (payer?.key || "") === row.key
                        ? "bg-[var(--admin-navy)] text-white"
                        : "border border-[var(--border)] text-[var(--admin-navy)]"
                    }`}
                  >
                    {row.label}
                  </button>
                ))}
              </div>
            ) : payer ? (
              <p className="mt-4 text-sm font-semibold text-[var(--admin-navy)]">{payer.label}</p>
            ) : null}
            {payer?.dossiers.length ? (
              <ul className="mt-3 divide-y divide-[var(--border)]">
                {payer.dossiers.map((dossier) => (
                  <li key={dossier.id} className="flex items-start gap-3 py-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={checked.includes(dossier.id)}
                      onChange={() => toggle(dossier.id)}
                      aria-label={dossier.reference}
                    />
                    <span className="min-w-0 text-sm text-[var(--admin-navy)]">
                      <span className="font-semibold">{dossier.reference}</span>
                      <span className="text-muted"> · {dossier.title}</span>
                      {dossier.dates ? <span className="block text-xs text-muted">{dossier.dates}</span> : null}
                      {dossier.commission ? (
                        <span className="mt-1 inline-flex rounded-full bg-[var(--admin-gold)]/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--admin-navy)]">
                          Commission
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : loading ? null : (
              <p className="mt-4 text-sm text-muted">Aucun dossier ouvert sur cette fiche.</p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={checked.length < 2 || Boolean(busy)}
                onClick={() => void run("apercu")}
                className="rounded-full border border-[var(--admin-navy)] px-4 py-2 text-sm font-semibold text-[var(--admin-navy)] disabled:opacity-40"
              >
                Aperçu
              </button>
              <button
                type="button"
                disabled={checked.length < 2 || Boolean(busy)}
                onClick={() => void run("generer")}
                className="rounded-full bg-[var(--admin-navy)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                {factureId ? "Mettre à jour la pro forma" : "Générer la pro forma"}
              </button>
            </div>
            {preview ? (
              <div className="mt-4 rounded-2xl bg-[#faf9f6] p-4 text-sm text-[var(--admin-navy)]">
                <p className="font-semibold">Facturé à {preview.payeur}</p>
                <ul className="mt-3 space-y-3">
                  {preview.sections.map((section) => (
                    <li key={section.reference}>
                      <p className="font-semibold">
                        {section.reference}
                        {section.destination ? ` · ${section.destination}` : ""}
                      </p>
                      <p className="text-xs text-muted">
                        {[section.dates, section.voyageurs.join(", ")].filter(Boolean).join(" · ")}
                        {section.commission ? " · Commission" : ""}
                      </p>
                      <ul className="mt-1">
                        {section.lignes.map((line) => (
                          <li key={`${section.reference}-${line.libelle}`} className="flex justify-between gap-3">
                            <span>{line.libelle}</span>
                            <span>{euros(line.montant)}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-1 text-xs text-muted">
                        Sous-total {euros(section.sous_total)} · Déjà reçu {euros(section.paye)} · Reste {euros(section.reste)}
                      </p>
                    </li>
                  ))}
                </ul>
                {preview.compte?.length ? (
                  <ul className="mt-3 text-xs text-muted">
                    {preview.compte.map((row) => (
                      <li key={`${row.libelle}-${row.montant}`} className="flex justify-between gap-3">
                        <span>Compte · {row.libelle}</span>
                        <span>{euros(row.montant)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p className="mt-3 font-semibold">
                  Total {euros(preview.total)} · Payé {euros(preview.paye)} · Reste à payer {euros(preview.reste)}
                </p>
                <p className="mt-1 text-xs text-muted">{preview.message}</p>
              </div>
            ) : null}
            {factures.length ? (
              <div className="mt-5 border-t border-[var(--border)] pt-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--admin-gold-dark)]">Déjà préparées</p>
                <ul className="mt-2 space-y-3">
                  {factures.map((row) => (
                    <li key={row.id} className="text-sm text-[var(--admin-navy)]">
                      <p className="font-semibold">
                        {row.number}
                        {row.removed ? " · retirée" : ""}
                      </p>
                      <p className="text-xs text-muted">
                        {row.dossiers.map((dossier) => dossier.reference).join(", ")} · {row.totalLabel} · reste {row.balanceLabel}
                      </p>
                      {row.numeroMb3m ? <p className="text-xs font-semibold">Pièce MB3M n° {row.numeroMb3m}</p> : null}
                      {row.erreurMb3m ? <p className="text-xs text-red-700">{row.erreurMb3m}</p> : null}
                      <div className="mt-1 flex flex-wrap gap-2">
                        <a href={row.fichier} className="text-xs font-semibold underline" target="_blank" rel="noreferrer">
                          Voir le PDF
                        </a>
                        {row.removed ? null : (
                          <button
                            type="button"
                            className="text-xs font-semibold underline"
                            disabled={Boolean(busy)}
                            onClick={() => void run("mb3m", { facture_id: row.id })}
                          >
                            {row.numeroMb3m ? "Mettre à jour dans MB3M" : "Créer dans MB3M"}
                          </button>
                        )}
                        {row.removed ? (
                          <button type="button" className="text-xs font-semibold underline" onClick={() => void run("restaurer", { facture_id: row.id })}>
                            Restaurer
                          </button>
                        ) : (
                          <>
                            <button type="button" className="text-xs font-semibold underline" onClick={() => reuse(row)}>
                              Mettre à jour
                            </button>
                            <button type="button" className="text-xs font-semibold underline" onClick={() => void run("retirer", { facture_id: row.id })}>
                              Retirer
                            </button>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
