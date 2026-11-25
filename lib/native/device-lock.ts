import { isNativeAppBridge } from "@/lib/native/detect";

type Portal = {
  canUnlock: () => Promise<{ available?: boolean }>;
  saveUnlock: (options: { token: string }) => Promise<{ ok?: boolean }>;
  readUnlock: () => Promise<{ token?: string; ok?: boolean }>;
  clearUnlock: () => Promise<{ ok?: boolean }>;
  saveVaultKey: (options: { key: string }) => Promise<{ ok?: boolean }>;
  readVaultKey: () => Promise<{ key?: string }>;
  clearVaultKey: () => Promise<{ ok?: boolean }>;
};

async function portal() {
  const { registerPlugin } = await import("@capacitor/core");
  return registerPlugin<Portal>("Portal");
}

export async function biometryAvailable() {
  if (!isNativeAppBridge()) return false;
  try {
    const result = await (await portal()).canUnlock();
    return Boolean(result.available);
  } catch {
    return false;
  }
}

export async function saveUnlockToken(token: string) {
  if (!isNativeAppBridge() || !/^tu_[A-Za-z0-9_-]{43}$/.test(token)) return false;
  try {
    const result = await (await portal()).saveUnlock({ token });
    return result.ok !== false;
  } catch {
    return false;
  }
}

export async function readUnlockToken() {
  if (!isNativeAppBridge()) return null;
  try {
    const result = await (await portal()).readUnlock();
    return typeof result.token === "string" && result.token.startsWith("tu_") ? result.token : null;
  } catch {
    return null;
  }
}

export async function clearUnlockToken() {
  if (!isNativeAppBridge()) return;
  await (await portal()).clearUnlock().catch(() => {});
}

export async function saveVaultKey(key: string) {
  if (!isNativeAppBridge() || key.length < 16) return false;
  try {
    const result = await (await portal()).saveVaultKey({ key });
    return result.ok !== false;
  } catch {
    return false;
  }
}

export async function readVaultKey() {
  if (!isNativeAppBridge()) return null;
  try {
    const result = await (await portal()).readVaultKey();
    return typeof result.key === "string" && result.key.length >= 16 ? result.key : null;
  } catch {
    return null;
  }
}

export async function clearVaultKey() {
  if (!isNativeAppBridge()) return;
  await (await portal()).clearVaultKey().catch(() => {});
}
