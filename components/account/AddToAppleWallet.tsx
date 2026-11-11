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
 * Badge officiel « Ajouter à l’app Cartes Apple ».
 * Hauteur 40 pt, largeur proportionnelle, marge de 0,1× la hauteur.
 * Réservé aux appareils Apple. Le PDF reste le repli.
 */
export function AddToAppleWallet({ href }: { href: string }) {
  const show = useSyncExternalStore(subscribe, appleNow, () => false);
  if (!show) return null;
  return (
    <a href={href} className="inline-flex" style={{ margin: "4pt" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- badge officiel Apple, servi tel quel */}
      <img src={BADGE_SRC} alt="Ajouter à l'app Cartes Apple" style={{ height: "40pt", width: "auto" }} />
    </a>
  );
}
