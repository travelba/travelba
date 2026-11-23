"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { BusyBar } from "@/components/crm/BusyBar";

export function SignupInviteForm({
  preset,
  autoValidate,
  countMode,
  admin,
}: {
  preset?: { id: string; firstName: string; lastName: string; phone: string; email: string } | null;
  autoValidate: boolean;
  countMode: "envoi" | "validee";
  admin: boolean;
}) {
  const router = useRouter();
  const [firstName, setFirstName] = useState(preset?.firstName || "");
  const [lastName, setLastName] = useState(preset?.lastName || "");
  const [phone, setPhone] = useState(preset?.phone || "");
  const [email, setEmail] = useState(preset?.email || "");
  const [send, setSend] = useState(true);
  const [enabled, setEnabled] = useState(autoValidate);
  const [mode, setMode] = useState(countMode);
  const [result, setResult] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [share, setShare] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function create(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const response = await fetch("/api/admin/inscriptions/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName,
        lastName,
        phone,
        email,
        customerId: preset?.id,
        send,
      }),
    });
    const json = (await response.json().catch(() => ({}))) as { error?: string; lien?: string; partage?: string; envoye?: boolean; canal?: string };
    setLoading(false);
    if (!response.ok) {
      setError(json.error || "L’invitation n’a pas été créée.");
      return;
    }
    setLink(json.lien || null);
    setShare(json.partage || null);
    setResult(json.envoye ? "Le modèle WhatsApp est parti." : "Lien prêt à partager. Aucun envoi automatique.");
    router.refresh();
  }

  async function saveMode(next: "envoi" | "validee") {
    const previous = mode;
    setMode(next);
    setLoading(true);
    const response = await fetch("/api/admin/inscriptions/reglage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ referralCountMode: next }),
    });
    setLoading(false);
    if (!response.ok) {
      setMode(previous);
      setError("Le décompte n’a pas été enregistré.");
    }
  }

  async function saveSetting(next: boolean) {
    setEnabled(next);
    setLoading(true);
    const response = await fetch("/api/admin/inscriptions/reglage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: next }),
    });
    setLoading(false);
    if (!response.ok) {
      setEnabled(!next);
      setError("Le réglage n’a pas été enregistré.");
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-[var(--border)] p-4">
      <h2 className="font-semibold text-[var(--admin-navy)]">Invitation WhatsApp</h2>
      <p className="text-sm text-muted">
        Lien personnel, signé, à usage unique, valable 14 jours. Avec les identifiants Meta, l’envoi utilise le modèle approuvé. Sinon, le lien wa.me reste à partager à la main.
      </p>
      <form onSubmit={create} className="grid gap-3 sm:grid-cols-2">
        <input className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm" placeholder="Prénom" value={firstName} onChange={(event) => setFirstName(event.target.value)} required />
        <input className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm" placeholder="Nom" value={lastName} onChange={(event) => setLastName(event.target.value)} required />
        <input className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm" placeholder="Téléphone" value={phone} onChange={(event) => setPhone(event.target.value)} required />
        <input className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm" placeholder="E-mail, facultatif" value={email} onChange={(event) => setEmail(event.target.value)} />
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={send} onChange={(event) => setSend(event.target.checked)} />
          Envoyer par WhatsApp Business. Sans identifiants Meta, le lien wa.me est préparé.
        </label>
        <button type="submit" disabled={loading} className="rounded-full bg-[var(--admin-navy)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60 sm:col-span-2">
          Créer l’invitation
        </button>
      </form>
      {link ? (
        <p className="break-all text-sm">
          Lien : <a className="underline" href={link}>{link}</a>
        </p>
      ) : null}
      {share ? (
        <p className="text-sm">
          <a className="font-semibold underline" href={share} target="_blank" rel="noreferrer">
            Ouvrir le message WhatsApp
          </a>
        </p>
      ) : null}
      {result ? <p className="text-sm text-[var(--admin-navy)]">{result}</p> : null}
      {admin ? (
        <div className="space-y-3 border-t border-[var(--border)] pt-4 text-sm">
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={enabled} onChange={(event) => void saveSetting(event.target.checked)} />
            <span>Valider automatiquement les demandes invitées par l’admin, seulement s’il n’y a pas de fiche ambiguë.</span>
          </label>
          <fieldset className="space-y-1">
            <legend className="font-semibold text-[var(--admin-navy)]">Plafond de parrainage</legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="decompte"
                checked={mode === "envoi"}
                onChange={() => void saveMode("envoi")}
              />
              Décompter dès l’envoi
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="decompte"
                checked={mode === "validee"}
                onChange={() => void saveMode("validee")}
              />
              Décompter seulement les invitations validées
            </label>
          </fieldset>
        </div>
      ) : null}
      {error ? <p className="text-sm font-semibold text-[var(--admin-red)]">{error}</p> : null}
      <BusyBar active={loading} label="Enregistrement…" />
    </div>
  );
}
