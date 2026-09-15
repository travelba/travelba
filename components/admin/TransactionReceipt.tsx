"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function TransactionReceipt({ transactionId, fileName, hasFile }: { transactionId: string; fileName?: string | null; hasFile: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const response = await fetch(`/api/admin/transactions/${transactionId}/receipt`, { method: "POST", body: new FormData(event.currentTarget) });
    const data = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) return setError(data.error || "Upload impossible");
    setOpen(false);
    router.refresh();
  }
  return <div className="mt-1">{hasFile ? <a href={`/api/admin/files/transaction/${transactionId}`} className="text-xs font-semibold underline">{fileName || "Justificatif"}</a> : <button type="button" onClick={() => setOpen((value) => !value)} className="text-xs font-semibold text-[var(--aura-blue)]">+ Justificatif</button>}{open ? <form onSubmit={upload} className="mt-2 flex items-center gap-2"><input name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required className="max-w-44 text-xs" /><button disabled={pending} className="text-xs font-bold">{pending ? "…" : "Envoyer"}</button></form> : null}{error ? <p role="alert" className="text-xs text-red-700">{error}</p> : null}</div>;
}
