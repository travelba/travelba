import { openBytes, sealBytes } from "@/lib/crm/offline-seal";
import { clearVaultKey, readVaultKey, saveVaultKey } from "@/lib/native/device-lock";
import { isNativeAppBridge } from "@/lib/native/detect";

const MAX_BYTES = 12_000_000;

type PackItem = {
  id: string;
  label: string;
  fileName: string;
  mimeType: string | null;
  path: string;
};

type Stored = PackItem & { file: string };

let ids = new Set<string>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function offlineDocumentIds() {
  return ids;
}

export function subscribeOfflineDocuments(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function encode(bytes: Uint8Array) {
  let binary = "";
  const step = 0x8000;
  for (let index = 0; index < bytes.length; index += step) {
    binary += String.fromCharCode(...bytes.subarray(index, index + step));
  }
  return btoa(binary);
}

function decode(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function keyBytes(value: string) {
  const raw = decode(value);
  return raw.byteLength === 32 ? raw : null;
}

async function vaultKey() {
  const existing = await readVaultKey();
  const parsed = existing ? keyBytes(existing) : null;
  if (parsed) return parsed;
  const fresh = crypto.getRandomValues(new Uint8Array(32));
  const saved = await saveVaultKey(encode(fresh));
  return saved ? fresh : null;
}

async function filesystem() {
  const { Directory, Filesystem } = await import("@capacitor/filesystem");
  return { Directory, Filesystem };
}

function folder(userId: string) {
  return `offline/${userId.replace(/[^a-z0-9-]/gi, "")}`;
}

async function readIndex(userId: string, key: Uint8Array): Promise<Stored[]> {
  const { Directory, Filesystem } = await filesystem();
  try {
    const file = await Filesystem.readFile({ path: `${folder(userId)}/index.bin`, directory: Directory.Data });
    const data = typeof file.data === "string" ? decode(file.data) : new Uint8Array(await file.data.arrayBuffer());
    const plain = await openBytes(data, key);
    const parsed = JSON.parse(new TextDecoder().decode(plain)) as Stored[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeIndex(userId: string, key: Uint8Array, rows: Stored[]) {
  const { Directory, Filesystem } = await filesystem();
  const sealed = await sealBytes(new TextEncoder().encode(JSON.stringify(rows)), key);
  await Filesystem.writeFile({
    path: `${folder(userId)}/index.bin`,
    data: encode(sealed),
    directory: Directory.Data,
    recursive: true,
  });
}

/** Télécharge les pièces du séjour et les chiffre dans le bac de l’application. */
export async function syncOfflineDocuments() {
  if (!isNativeAppBridge()) return;
  const response = await fetch("/api/client/offline-pack", { credentials: "same-origin" });
  if (!response.ok) return;
  const body = (await response.json()) as { customerId?: string; documents?: PackItem[] };
  const userId = typeof body.customerId === "string" ? body.customerId : "";
  if (!userId) return;
  const key = await vaultKey();
  if (!key) return;
  const { Directory, Filesystem } = await filesystem();
  const own = folder(userId).split("/")[1] || "";
  try {
    const listing = await Filesystem.readdir({ path: "offline", directory: Directory.Data });
    for (const entry of listing.files) {
      const name = typeof entry === "string" ? entry : entry.name;
      if (name && name !== own) {
        await Filesystem.rmdir({ path: `offline/${name}`, directory: Directory.Data, recursive: true }).catch(() => {});
      }
    }
  } catch {
    /* premier passage */
  }
  const wanted = (body.documents || []).filter((item) => item.id && item.path && !/passeport|passport/i.test(item.label));
  const current = await readIndex(userId, key);
  const keep = new Map(current.map((item) => [item.id, item]));
  const next: Stored[] = [];
  for (const item of wanted) {
    const previous = keep.get(item.id);
    if (previous) {
      next.push({ ...previous, label: item.label, fileName: item.fileName, mimeType: item.mimeType });
      continue;
    }
    const file = await fetch(`/api/files?path=${encodeURIComponent(item.path)}`, { credentials: "same-origin" });
    if (!file.ok) continue;
    const buffer = new Uint8Array(await file.arrayBuffer());
    if (!buffer.byteLength || buffer.byteLength > MAX_BYTES) continue;
    const sealed = await sealBytes(buffer, key);
    const path = `${folder(userId)}/${item.id}.bin`;
    await Filesystem.writeFile({ path, data: encode(sealed), directory: Directory.Data, recursive: true });
    next.push({ ...item, file: path });
  }
  const dropped = current.filter((item) => !next.some((row) => row.id === item.id));
  for (const item of dropped) {
    await Filesystem.deleteFile({ path: item.file, directory: Directory.Data }).catch(() => {});
  }
  await writeIndex(userId, key, next);
  ids = new Set(next.map((item) => item.id));
  emit();
}

export async function offlineObjectUrl(id: string, mimeType: string | null) {
  if (!isNativeAppBridge() || !ids.has(id)) return null;
  const response = await fetch("/api/client/offline-pack", { credentials: "same-origin" }).catch(() => null);
  const userId = response?.ok ? ((await response.json()) as { customerId?: string }).customerId || "" : "";
  if (!userId) return null;
  const key = await vaultKey();
  if (!key) return null;
  const row = (await readIndex(userId, key)).find((item) => item.id === id);
  if (!row) return null;
  const { Directory, Filesystem } = await filesystem();
  const file = await Filesystem.readFile({ path: row.file, directory: Directory.Data });
  const data = typeof file.data === "string" ? decode(file.data) : new Uint8Array(await file.data.arrayBuffer());
  const plain = await openBytes(data, key);
  const blob = new Blob([plain], { type: mimeType || "application/octet-stream" });
  return URL.createObjectURL(blob);
}

/** Déconnexion : plus aucune pièce de ce téléphone. */
export async function clearOfflineDocuments() {
  ids = new Set();
  emit();
  if (!isNativeAppBridge()) return;
  await clearVaultKey();
  const { Directory, Filesystem } = await filesystem();
  await Filesystem.rmdir({ path: "offline", directory: Directory.Data, recursive: true }).catch(() => {});
}
