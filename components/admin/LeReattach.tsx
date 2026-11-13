"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BusyBar } from "@/components/crm/BusyBar";

type Preview = {
  deja?: boolean;
  ecrit?: boolean;
  message?: boolean;
  debit_cree?: boolean;
  hotel?: string | null;
  reference?: string;
  voyageurs?: string[];
  de?: { reference?: string | null; client?: string | null };
  vers?: { reference?: string | null; client?: string | null };
  client_coherent?: boolean;
  accepter_client_requis?: boolean;
  cartes?: { titre?: string | null }[];
};

function line(preview: Preview) {
  const from = preview.de?.reference || "le dossier actuel";
  const to = preview.vers?.reference || "le dossier cible";
  const fromClient = preview.de?.client ? ` (${preview.de.client})` : "";
  const toClient = preview.vers?.client ? ` (${preview.vers.client})` : "";
  const hotel = preview.hotel || "Cette réservation";
  return `${hotel}, ${preview.reference || ""}, quitte ${from}${fromClient} pour ${to}${toClient}.`;
}

export function LeReattach({ reference, hotelName }: { reference: string; hotelName: string | null }) {
  const router = useRouter();
  const [target, setTarget] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [accept, setAccept] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function post(confirmer: boolean) {
    setBusy(true);
    setError(null);
    if (!confirmer) {
      setDone(null);
      setPreview(null);
      setAccept(false);
    }
    const response = await fetch("/api/admin/little-emperors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "reattach",
        reference,
        dossier_reference: target.trim(),
        confirmer,
        accepter_client: accept,
      }),
    });
    const json = (await response.json().catch(() => ({}))) as Preview & { error?: string };
    setBusy(false);
    if (!response.ok) {
      setError(json.error || "Rattachement impossible.");
      return;
    }
    if (confirmer && json.ecrit) {
      setPreview(null);
      setDone(`La réservation est rattachée à ${json.vers?.reference || target.trim()}. Aucun message n’est parti.`);
      router.refresh();
      return;
    }
    setPreview(json);
    if (json.deja) setDone(`Cette réservation est déjà sur ${json.vers?.reference || target.trim()}.`);
  }

  const needsAccept = preview?.accepter_client_requis === true && !preview.deja;
  const canMove = Boolean(preview) && !preview?.deja && (!needsAccept || accept);

  return (
    <div className="space-y-2">
      {busy ? <BusyBar label="Rattachement Little Emperors" /> : null}
      <p className="text-sm font-semibold text-[var(--admin-navy)]">Changer de dossier</p>
      <p className="text-sm text-[var(--admin-navy)]">
        {hotelName || "Réservation"} · {reference}
      </p>
      <label className="block text-sm text-[var(--admin-navy)]">
        Dossier cible
        <input
          value={target}
          onChange={(event) => {
            setTarget(event.target.value);
            setPreview(null);
            setDone(null);
            setAccept(false);
          }}
          placeholder="TB-2026-0000"
          aria-label="Référence du dossier cible"
          className="mt-1 w-full rounded-md border border-[#e5e3dc] bg-white px-3 py-2 text-sm"
        />
      </label>
      <button
        type="button"
        disabled={busy || target.trim().length < 3}
        onClick={() => void post(false)}
        className="rounded-md border border-[#e5e3dc] px-3 py-2 text-sm font-semibold disabled:opacity-50"
      >
        Aperçu
      </button>
      {preview && !preview.deja ? (
        <div className="space-y-2 rounded-xl bg-[#f8f4ee] px-3 py-2 text-sm text-[var(--admin-navy)]">
          <p>{line(preview)}</p>
          <p>{preview.cartes?.length ? `La carte hôtel « ${preview.cartes.map((card) => card.titre || "Hôtel").join(", ")} » suit.` : "Aucune carte hôtel ne suit."}</p>
          <p>Aucun message. Aucun débit. Les cartes Pliant restent.</p>
          {needsAccept ? (
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={accept} onChange={(event) => setAccept(event.target.checked)} />
              <span>
                Le dossier cible est au nom de {preview.vers?.client || "un autre client"}. La réservation cite{" "}
                {preview.voyageurs?.length ? preview.voyageurs.join(", ") : "aucun voyageur"}. Je confirme ce dossier.
              </span>
            </label>
          ) : null}
          <button
            type="button"
            disabled={busy || !canMove}
            onClick={() => void post(true)}
            className="rounded-md border border-[var(--admin-navy)] px-3 py-2 text-sm font-semibold disabled:opacity-50"
          >
            Rattacher
          </button>
        </div>
      ) : null}
      {done ? <p className="text-sm text-[var(--admin-navy)]">{done}</p> : null}
      {error ? <p className="text-sm text-[#8a5a2a]">{error}</p> : null}
    </div>
  );
}
