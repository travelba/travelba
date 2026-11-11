"use client";

import { useSyncExternalStore } from "react";
import { isAppleWalletDevice } from "@/lib/crm/apple-device";

/** Fichier officiel Apple, locale FR, non modifié. */
const BADGE_SRC = "/badges/FR_Add_to_Apple_Wallet_RGB_102921.svg";

function subscribe() {
  return () => {};
}

function appleNow() {
  return isAppleWalletDevice(navigator.userAgent, {
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
  });
}

/**
 * Badge officiel, taille du fichier Apple (35 × 113 px), sans agrandissement.
 * L’espace libre autour est 0,1× la hauteur. Réservé aux appareils Apple.
 */
export function AddToAppleWallet({ href }: { href: string }) {
  const show = useSyncExternalStore(subscribe, appleNow, () => false);
  if (!show) return null;
  return (
    <a href={href} className="inline-flex shrink-0 p-1">
      {/* eslint-disable-next-line @next/next/no-img-element -- badge officiel Apple, servi tel quel */}
      <img src={BADGE_SRC} alt="Ajouter à l'app Cartes Apple" className="h-[35px] w-auto" />
    </a>
  );
}
