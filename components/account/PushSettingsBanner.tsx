"use client";

import { useEffect, useState } from "react";
import { shouldShowPushSettingsBanner } from "@/lib/crm/push-permission";
import { isNativeAppBridge } from "@/lib/native/detect";

const DISMISS_KEY = "tba.push.banner";

/** Après un refus iOS : une ligne, plus tard, avec le chemin vers Réglages. Pas une seconde demande. */
export function PushSettingsBanner({ preview = false }: { preview?: boolean }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (preview || !isNativeAppBridge()) return;
    let cancelled = false;
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      /* session privée */
    }
    void import("@/lib/native/push-client").then(async (mod) => {
      const denied = await mod.iosPushDenied();
      if (!cancelled && shouldShowPushSettingsBanner(denied ? "denied" : "granted", false)) setOpen(true);
    });
    return () => {
      cancelled = true;
    };
  }, [preview]);

  if (!open) return null;

  return (
    <p className="mb-3 flex items-center justify-between gap-3 rounded-2xl bg-[#f4efe6] px-3 py-2 text-xs text-[var(--admin-navy)]">
      <span>Les notifications sont coupées sur cet iPhone.</span>
      <span className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          className="font-semibold underline"
          onClick={() => {
            void import("@/lib/native/push-client").then((mod) => mod.openIosNotificationSettings());
          }}
        >
          Réglages
        </button>
        <button
          type="button"
          className="text-[#5c6570]"
          aria-label="Fermer"
          onClick={() => {
            try {
              sessionStorage.setItem(DISMISS_KEY, "1");
            } catch {
              /* session privée */
            }
            setOpen(false);
          }}
        >
          Fermer
        </button>
      </span>
    </p>
  );
}
