"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { BusyBar } from "@/components/crm/BusyBar";
import { SignupWizard } from "@/components/inscription/SignupWizard";

type Status = {
  firstName: string;
  status: string;
  emailVerified: boolean;
  smsPending: boolean;
  complement: string | null;
  prefill: { firstName: string; lastName: string; email: string; phone: string; birthDate: string } | null;
} | null;

export function SignupStatusPanel({ status }: { status: Status }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState("");

  async function sendCode() {
    setLoading(true);
    setError(null);
    const response = await fetch("/api/inscription/sms", { method: "POST" });
    const json = (await response.json().catch(() => ({}))) as { error?: string };
    setLoading(false);
    if (!response.ok) {
      setError(json.error || "Le SMS n’a pas pu partir.");
      return;
    }
    setInfo("Le code a été envoyé.");
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const response = await fetch("/api/inscription/sms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const json = (await response.json().catch(() => ({}))) as { error?: string };
    setLoading(false);
    if (!response.ok) {
      setError(json.error || "Ce code n’est pas le bon.");
      return;
    }
    router.push("/inscription/attente");
    router.refresh();
  }

  if (!status) {
    return (
      <div className="invite-letter">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#8A7349]">Cercle privé</p>
        <h1 className="mt-2 font-display text-3xl font-extrabold text-[#0B192C]">Demande en attente</h1>
        <p className="mt-3 text-sm leading-relaxed text-[#0B192C]">
          Confirmez l’adresse reçue par e-mail pour suivre la demande. Tant que l’agence n’a pas validé, l’espace reste fermé.
        </p>
      </div>
    );
  }

  if (status.status === "a_completer" && status.prefill) {
    return <SignupWizard prefill={{ ...status.prefill, resume: true }} />;
  }

  const title =
    status.status === "validee"
      ? "Demande acceptée"
      : status.status === "refusee"
        ? "Demande non retenue"
        : status.status === "a_completer"
          ? "Un complément est demandé"
          : status.smsPending
            ? "Confirmez votre téléphone"
            : !status.emailVerified
              ? "Vérifiez votre e-mail"
              : "Demande en attente";

  return (
    <div className="invite-letter space-y-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#8A7349]">Cercle privé</p>
      <h1 className="font-display text-3xl font-extrabold text-[#0B192C]">{title}</h1>
      <p className="text-sm leading-relaxed text-[#0B192C]">
        {status.status === "validee"
          ? `${status.firstName}, l’agence a validé la demande. L’accès arrive par e-mail, et par WhatsApp si le message part.`
          : status.status === "refusee"
            ? "L’agence ne peut pas ouvrir l’accès pour le moment."
            : status.status === "a_completer"
              ? status.complement || "L’agence a besoin d’une précision. Confirmez les coordonnées de l’invitation."
              : status.smsPending
                ? "L’adresse est confirmée. Le code SMS termine la demande. Rien n’est ouvert avant la validation."
                : !status.emailVerified
                  ? "Un message confirme l’adresse. Ensuite, l’agence relit la demande."
                  : `${status.firstName}, la demande est en attente. Vous n’avez pas encore accès à vos séjours.`}
      </p>
      {status.smsPending ? (
        <form onSubmit={confirm} className="space-y-3 pt-2">
          <button type="button" onClick={() => void sendCode()} className="text-sm font-semibold underline" disabled={loading}>
            Recevoir le code
          </button>
          <label className="block text-sm font-semibold text-[#0B192C]">
            Code
            <input
              className="mt-1 w-full rounded-xl border border-[var(--border)] px-3.5 py-3"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              required
            />
          </label>
          <button type="submit" disabled={loading} className="w-full rounded-full bg-[#0B192C] px-4 py-3 text-sm font-bold text-[#C5A880]">
            Confirmer le téléphone
          </button>
        </form>
      ) : null}
      {error ? <p className="text-sm text-[var(--admin-red)]">{error}</p> : null}
      {info ? <p className="text-sm text-[var(--admin-navy)]">{info}</p> : null}
      <BusyBar active={loading} label="Vérification…" />
    </div>
  );
}
