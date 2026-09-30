"use client";

import { createContext, useContext, type ReactNode } from "react";

const ClientPreviewContext = createContext(false);

/** L’agence voit l’écran client. Les gestes ne partent pas. */
export function ClientPreviewScope({ children }: { children: ReactNode }) {
  return <ClientPreviewContext.Provider value={true}>{children}</ClientPreviewContext.Provider>;
}

export function useClientPreview() {
  return useContext(ClientPreviewContext);
}

export const CLIENT_PREVIEW_NOTE = "Aperçu : seul le client peut faire ce geste.";
