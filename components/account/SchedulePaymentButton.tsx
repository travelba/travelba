"use client";

import { useState } from "react";

export function SchedulePaymentButton({ scheduleId }: { scheduleId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setPending(true);
    setError(null);
    const response = await fetch("/api/client/payments/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schedule_id: scheduleId }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.url) {
      setPending(false);
      setError(data.error || "Paiement indisponible");
      return;
    }
    window.location.assign(data.url);
  }

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={pay}
        disabled={pending}
        className="rounded-full bg-[var(--admin-navy)] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
      >
        {pending ? "Redirection…" : "Payer"}
      </button>
      {error ? <p role="alert" className="mt-1 max-w-48 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
