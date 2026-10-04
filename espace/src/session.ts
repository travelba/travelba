import * as SecureStore from "expo-secure-store";
import * as LocalAuthentication from "expo-local-authentication";
import { siteUrl } from "./api";

const ACCESS = "tb.espace.access";
const REFRESH = "tb.espace.refresh";
const UNLOCKED = "tb.espace.unlocked";

export type StoredTokens = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

export async function getTokens(): Promise<StoredTokens | null> {
  const access_token = await SecureStore.getItemAsync(ACCESS);
  const refresh_token = await SecureStore.getItemAsync(REFRESH);
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token, expires_in: 3600 };
}

export async function saveTokens(session: StoredTokens) {
  await SecureStore.setItemAsync(ACCESS, session.access_token);
  await SecureStore.setItemAsync(REFRESH, session.refresh_token);
}

export async function clearTokens() {
  await SecureStore.deleteItemAsync(ACCESS);
  await SecureStore.deleteItemAsync(REFRESH);
  await SecureStore.deleteItemAsync(UNLOCKED);
}

export async function unlockWithFaceId() {
  const enrolled = await LocalAuthentication.hasHardwareAsync();
  const types = await LocalAuthentication.isEnrolledAsync();
  if (!enrolled || !types) return true;
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: "Ouvrir votre espace TBA",
    disableDeviceFallback: false,
  });
  if (result.success) await SecureStore.setItemAsync(UNLOCKED, "1");
  return result.success;
}

export async function signInWithPassword(email: string, password: string) {
  const response = await fetch(`${siteUrl()}/api/client/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json = await response.json();
  if (!response.ok || !json.session) throw new Error(json.error || "Identifiants incorrects.");
  await saveTokens(json.session);
  return json;
}

export async function refreshSession() {
  const tokens = await getTokens();
  if (!tokens) return null;
  const response = await fetch(`${siteUrl()}/api/client/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ refresh_token: tokens.refresh_token }),
  });
  const json = await response.json();
  if (!response.ok || !json.session) {
    await clearTokens();
    return null;
  }
  await saveTokens(json.session);
  return json;
}

export async function openMagicLink(input: { token_hash?: string | null; code?: string | null; type?: string | null }) {
  const response = await fetch(`${siteUrl()}/api/client/session/magic`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(input),
  });
  const json = await response.json();
  if (!response.ok || !json.session) throw new Error(json.error || "Lien invalide.");
  await saveTokens(json.session);
  return json;
}

export async function openEntryCode(code: string) {
  const response = await fetch(`${siteUrl()}/api/client/session/entry`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ code }),
  });
  const json = await response.json();
  if (!response.ok || !json.session) throw new Error(json.error || "Lien invalide.");
  await saveTokens(json.session);
  return json;
}
