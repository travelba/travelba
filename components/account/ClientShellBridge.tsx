"use client";

import { useEffect } from "react";

const ALLOWED = /^https:\/\/([a-z0-9-]+\.)?travelba\.fr(\/|$)/i;

/** Le lien magique et l’espace s’ouvrent dans la coque, pas dans Safari. */
export function ClientShellBridge() {
  useEffect(() => {
    let cancel = () => {};
    let alive = true;
    (async () => {
      const cap = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
      if (!cap?.isNativePlatform?.()) return;
      const { App } = await import("@capacitor/app");
      if (!alive) return;
      const handle = await App.addListener("appUrlOpen", (event) => {
        const url = event.url;
        if (!url || !ALLOWED.test(url)) return;
        const next = new URL(url);
        if (next.pathname === "/admin" || next.pathname.startsWith("/admin/")) {
          window.location.assign("https://travelba.fr/mon-compte");
          return;
        }
        window.location.assign(url);
      });
      cancel = () => {
        void handle.remove();
      };
    })();
    return () => {
      alive = false;
      cancel();
    };
  }, []);
  return null;
}
