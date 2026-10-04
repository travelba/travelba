export const DEVICE_PLATFORMS = ["ios"] as const;
export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number];

export function normalizeExpoPushToken(value: unknown) {
  const token = typeof value === "string" ? value.trim() : "";
  if (!token) return null;
  if (token.startsWith("ExponentPushToken[") && token.endsWith("]")) return token;
  if (/^[A-Za-z0-9_-]{20,400}$/.test(token)) return token;
  return null;
}

export function devicePlatform(value: unknown): DevicePlatform | null {
  return value === "ios" ? "ios" : null;
}

export type EspaceDeviceInput = {
  token: string;
  platform: DevicePlatform;
};

export function espaceDeviceFromBody(body: Record<string, unknown> | null): EspaceDeviceInput | { error: string } {
  const token = normalizeExpoPushToken(body?.token);
  const platform = devicePlatform(body?.platform);
  if (!token) return { error: "Jeton de notification invalide." };
  if (!platform) return { error: "Cette application est iPhone seulement." };
  return { token, platform };
}

export function expoPushMessages(
  tokens: string[],
  payload: { title: string; body: string; data: Record<string, string> }
) {
  return tokens.map((to) => ({
    to,
    title: payload.title,
    body: payload.body,
    data: payload.data,
    sound: "default" as const,
    channelId: "sejour",
  }));
}
