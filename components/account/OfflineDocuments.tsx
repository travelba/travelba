"use client";

import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { isNativeAppBridge } from "@/lib/native/detect";
import { offlineDocumentIds, subscribeOfflineDocuments, syncOfflineDocuments } from "@/lib/native/offline-docs";

const OfflineContext = createContext(false);

export function OfflineDocuments({ userId, children }: { userId: string; children: ReactNode }) {
  useEffect(() => {
    if (!userId || !isNativeAppBridge()) return;
    void syncOfflineDocuments();
  }, [userId]);
  if (!isNativeAppBridge()) return children;
  return <OfflineContext.Provider value={true}>{children}</OfflineContext.Provider>;
}

export function useOfflineDocument(id: string) {
  const active = useContext(OfflineContext);
  const ids = useSyncExternalStore(subscribeOfflineDocuments, offlineDocumentIds, offlineDocumentIds);
  return active && ids.has(id);
}
