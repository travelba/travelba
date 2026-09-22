"use client";

import { useEffect } from "react";

/** Aligne `<html lang>` sur la locale de la vitrine sans rendre le layout racine dynamique. */
export function HtmlLang({ locale }: { locale: string }) {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return null;
}
