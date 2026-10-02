import Constants from "expo-constants";
import { getTokens } from "./session";

export function siteUrl() {
  const extra = Constants.expoConfig?.extra as { siteUrl?: string } | undefined;
  return (process.env.EXPO_PUBLIC_SITE_URL || extra?.siteUrl || "https://travelba.fr").replace(/\/$/, "");
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const tokens = await getTokens();
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (tokens?.access_token) headers.set("Authorization", `Bearer ${tokens.access_token}`);
  const response = await fetch(`${siteUrl()}${path}`, { ...init, headers });
  const json = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(json.error || "Impossible pour le moment.");
  }
  return json;
}

export function fileUrl(path: string | null | undefined) {
  if (!path) return null;
  if (path.startsWith("https://") || path.startsWith("/api/")) return `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  return `${siteUrl()}/api/files?path=${encodeURIComponent(path)}`;
}
