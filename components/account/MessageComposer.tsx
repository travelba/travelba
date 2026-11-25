"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { BusyBar } from "@/components/crm/BusyBar";
import { isNativeAppBridge } from "@/lib/native/detect";
import { pickMessagePhoto } from "@/lib/native/camera";

/** Texte et photo. L’application ouvre l’appareil ou la pellicule. Le site ouvre un fichier. */
export function MessageComposer({ sejour }: { sejour?: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [body, setBody] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function choosePhoto() {
    if (isNativeAppBridge()) {
      const file = await pickMessagePhoto();
      if (file) setPhoto(file);
      return;
    }
    input.current?.click();
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    const form = new FormData();
    form.set("body", body);
    if (sejour) form.set("sejour", sejour);
    if (photo) form.set("photo", photo);
    const response = await fetch("/api/client/messages", { method: "POST", body: form, credentials: "same-origin" });
    const json = (await response.json().catch(() => null)) as { error?: string } | null;
    setPending(false);
    if (!response.ok) {
      setError(json?.error || "Le message n’a pas été envoyé.");
      return;
    }
    setBody("");
    setPhoto(null);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  return (
    <form onSubmit={send} className="space-y-2 rounded-2xl border border-[#e5e3dc] bg-white p-3">
      <label className="block text-sm font-semibold text-[var(--admin-navy)]" htmlFor="message-body">
        Votre message
      </label>
      <textarea
        id="message-body"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={3}
        maxLength={4000}
        className="w-full resize-none rounded-xl border border-[#e5e3dc] px-3 py-2 text-sm text-[var(--admin-navy)]"
        placeholder="Écrire à l’agence"
      />
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        aria-hidden
        onChange={(event) => setPhoto(event.target.files?.[0] || null)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void choosePhoto()} className="rounded-full border border-[#e5e3dc] px-3 py-1.5 text-sm font-semibold text-[var(--admin-navy)]">
          Photo
        </button>
        {photo ? (
          <button type="button" onClick={() => setPhoto(null)} className="text-sm text-muted">
            Retirer la photo
          </button>
        ) : null}
        <button
          type="submit"
          disabled={pending || (!body.trim() && !photo)}
          className="ml-auto rounded-full bg-[var(--admin-navy)] px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          Envoyer
        </button>
      </div>
      {pending ? <BusyBar label="Envoi" /> : null}
      {error ? <p className="text-sm text-accent">{error}</p> : null}
    </form>
  );
}
