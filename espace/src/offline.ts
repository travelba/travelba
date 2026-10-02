import * as FileSystem from "expo-file-system";

function fileFor(key: string) {
  return `${FileSystem.documentDirectory}espace-${key}.json`;
}

export async function writeCache(key: string, value: unknown) {
  try {
    await FileSystem.writeAsStringAsync(fileFor(key), JSON.stringify(value));
  } catch {
    /* hors-ligne : on garde la dernière copie */
  }
}

export async function readCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await FileSystem.readAsStringAsync(fileFor(key));
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
