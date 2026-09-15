"use client";

import { useEffect, useState } from "react";

type Props = {
  sessionId: string;
  widgetBaseUrl: string;
  onSuccess: () => void;
  onError: (message: string) => void;
};

export function CreditCardWidget({
  sessionId,
  widgetBaseUrl,
  onSuccess,
  onError,
}: Props) {
  const [status, setStatus] = useState<"idle" | "ok" | "error">("idle");

  useEffect(() => {
    const allowedOrigins = new Set([
      widgetBaseUrl,
      "https://api-staging.littleemperors.com",
      "https://api.littleemperors.com",
    ]);

    function handleMessage(event: MessageEvent) {
      if (!allowedOrigins.has(event.origin)) return;
      const data = event.data as {
        success?: boolean;
        errorMessage?: string;
      };
      if (!data || typeof data !== "object") return;

      if (data.success) {
        setStatus("ok");
        onSuccess();
      } else if (data.errorMessage) {
        setStatus("error");
        onError(data.errorMessage);
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [widgetBaseUrl, onSuccess, onError]);

  return (
    <div className="space-y-2">
      <iframe
        title="Little Emperors credit card"
        src={`${widgetBaseUrl}/widgets/credit-card?session_id=${encodeURIComponent(sessionId)}`}
        className="h-[450px] w-full rounded-lg border border-border bg-white"
      />
      {status === "ok" ? (
        <p className="text-sm text-accent-2">Carte validée</p>
      ) : null}
    </div>
  );
}
