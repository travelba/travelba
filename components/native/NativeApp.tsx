"use client";

import { useEffect } from "react";

/** Charge le pont iOS après le premier affichage. Invisible sur le site. */
export function NativeApp() {
  useEffect(() => {
    void import("@/lib/native/boot").then((mod) => mod.bootNativeApp());
  }, []);
  return null;
}
