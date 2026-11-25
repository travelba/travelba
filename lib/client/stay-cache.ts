import { mergeShell, type ClientShell } from "@/lib/crm/client-shell";
import { isNativeAppBridge } from "@/lib/native/detect";

const DB = "tba-espace";
const STORE = "snapshot";
const MEMORY = new Map<string, ClientShell>();

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

async function readStored(userId: string): Promise<ClientShell | null> {
  const db = await openDb();
  if (!db) return MEMORY.get(userId) || null;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(userId);
    request.onsuccess = () => resolve((request.result as ClientShell | undefined) || null);
    request.onerror = () => resolve(MEMORY.get(userId) || null);
  });
}

async function writeStored(shell: ClientShell) {
  MEMORY.set(shell.userId, shell);
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(shell, shell.userId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    const request = tx.objectStore(STORE).getAllKeys();
    request.onsuccess = () => {
      for (const key of request.result) {
        if (key !== shell.userId) tx.objectStore(STORE).delete(key);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

async function mirrorNative(shell: ClientShell | null) {
  if (!isNativeAppBridge()) return;
  const { Preferences } = await import("@capacitor/preferences");
  if (!shell) {
    await Preferences.remove({ key: "tba.espace" }).catch(() => {});
    await Preferences.remove({ key: "tba.trip" }).catch(() => {});
    return;
  }
  await Preferences.set({ key: "tba.espace", value: JSON.stringify(shell) }).catch(() => {});
  const trip = shell.stays.find((stay) => stay.upcoming) || shell.stays[0];
  if (!trip) {
    await Preferences.remove({ key: "tba.trip" }).catch(() => {});
    return;
  }
  await Preferences.set({
    key: "tba.trip",
    value: JSON.stringify({ title: trip.title, when: trip.when, href: trip.href }),
  }).catch(() => {});
}

export function peekEspace(userId: string) {
  if (!userId) return null;
  const shell = MEMORY.get(userId);
  return shell && shell.userId === userId ? shell : null;
}

export async function readEspace(userId: string): Promise<ClientShell | null> {
  if (!userId) return null;
  const stored = await readStored(userId);
  if (!stored || stored.userId !== userId) return null;
  return stored;
}

export async function rememberEspace(patch: unknown) {
  const row = patch && typeof patch === "object" ? (patch as { userId?: string }) : null;
  const userId = typeof row?.userId === "string" ? row.userId : "";
  const previous = userId ? await readStored(userId) : null;
  const shell = mergeShell(previous, patch, new Date().toISOString());
  if (!shell) return;
  await writeStored(shell);
  await mirrorNative(shell);
}

async function dropDatabase() {
  MEMORY.clear();
  if (typeof indexedDB === "undefined") return;
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(DB);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

async function dropStaticCache() {
  if (typeof caches === "undefined") return;
  const keys = await caches.keys();
  await Promise.all(keys.filter((key) => key.startsWith("tba-")).map((key) => caches.delete(key)));
}

/** Déconnexion : plus rien de la fiche sur cet appareil. */
export async function clearClientShellCache() {
  await dropDatabase();
  await dropStaticCache();
  await mirrorNative(null);
}
