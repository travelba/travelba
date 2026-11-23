"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BusyBar } from "@/components/crm/BusyBar";

type Status = {
  firstName: string;
  status: string;
  emailVerified: boolean;
  smsPending: boolean;
  complement: string | null;
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
      <>
        <h1 className="font-display text-3xl font-extrabold text-[var(--admin-navy)]">Demande en attente</h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--admin-navy)]">
          Confirmez l’adresse reçue par e-mail pour suivre la demande. Tant que l’agence n’a pas validé, l’espace reste fermé.
        </p>
      </>
    );
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
    <div className="space-y-3">
      <h1 className="font-display text-3xl font-extrabold text-[var(--admin-navy)]">{title}</h1>
      <p className="text-sm leading-relaxed text-[var(--admin-navy)]">
        {status.status === "validee"
          ? `${status.firstName}, l’agence a validé la demande. L’accès arrive par e-mail, et par WhatsApp si le message part.`
          : status.status === "refusee"
            ? "L’agence ne peut pas ouvrir l’accès pour le moment."
            : status.status === "a_completer"
              ? status.complement || "L’agence a besoin d’une précision."
              : status.smsPending
                ? "L’adresse est confirmée. Le code SMS termine la demande. Rien n’est ouvert avant la validation."
                : !status.emailVerified
                  ? "Un message confirme l’adresse. Ensuite, l’agence relit la demande."
                  : `${status.firstName}, la demande est en attente. Vous n’avez pas encore accès à vos séjours.`}
      </p>
      {status.status === "a_completer" ? (
        <Link href="/inscription" className="inline-flex rounded-full bg-[var(--admin-navy)] px-4 py-3 text-sm font-bold text-white">
          Mettre à jour ma demande
        </Link>
      ) : null}
      {status.smsPending ? (
        <form onSubmit={confirm} className="space-y-3 pt-2">
          <button type="button" onClick={() => void sendCode()} className="text-sm font-semibold underline" disabled={loading}>
            Recevoir le code
          </button>
          <label className="block text-sm font-semibold text-[var(--admin-navy)]">
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
          <button type="submit" disabled={loading} className="w-full rounded-full bg-[var(--admin-navy)] px-4 py-3 text-sm font-bold text-white">
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
