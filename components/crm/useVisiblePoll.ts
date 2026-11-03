"use client";

import { useEffect, useRef } from "react";
import { pollRunsWhileVisible } from "@/lib/crm/page-poll";

/** Relance `tick` à intervalle fixe, seulement tant que l’onglet est visible. */
export function useVisiblePoll(tick: () => void, intervalMs: number, enabled = true) {
  const saved = useRef(tick);
  useEffect(() => {
    saved.current = tick;
  }, [tick]);

  useEffect(() => {
    if (!enabled) return;
    let timer: number | null = null;

    const stop = () => {
      if (timer != null) window.clearInterval(timer);
      timer = null;
    };
    const start = () => {
      stop();
      if (!pollRunsWhileVisible(document.visibilityState)) return;
      timer = window.setInterval(() => {
        if (!pollRunsWhileVisible(document.visibilityState)) return;
        saved.current();
      }, intervalMs);
    };
    const onVisible = () => {
      if (!pollRunsWhileVisible(document.visibilityState)) {
        stop();
        return;
      }
      saved.current();
      start();
    };

    if (pollRunsWhileVisible(document.visibilityState)) start();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, intervalMs]);
}
