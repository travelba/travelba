"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Charge le pont iOS. Invisible sur le site. Le jeton est redemandé à l’arrivée sur /mon-compte. */
export function NativeApp() {
  const pathname = usePathname() || "";

  useEffect(() => {
    void import("@/lib/native/boot").then((mod) => mod.bootNativeApp());
  }, []);

  useEffect(() => {
    void import("@/lib/native/boot").then((mod) => mod.syncNativeRoute(pathname));
  }, [pathname]);

  return null;
}
