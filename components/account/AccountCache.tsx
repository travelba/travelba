"use client";

import { createContext, useContext, type ReactNode } from "react";

const AccountCacheContext = createContext("");

export function AccountCacheProvider({ userId, children }: { userId: string; children: ReactNode }) {
  return <AccountCacheContext.Provider value={userId}>{children}</AccountCacheContext.Provider>;
}

export function useAccountCacheUser() {
  return useContext(AccountCacheContext);
}
