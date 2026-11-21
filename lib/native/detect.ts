export type NativeBridge = {
  isNativePlatform?: () => boolean;
  Plugins?: Record<string, { get?: (options: { key: string }) => Promise<{ value?: string | null }> }>;
};

export function nativeBridge(): NativeBridge | null {
  if (typeof window === "undefined") return null;
  const cap = (window as Window & { Capacitor?: NativeBridge }).Capacitor;
  return cap ?? null;
}

/** Vrai seulement dans l’application iOS. Safari et le site restent silencieux. */
export function isNativeAppBridge() {
  return Boolean(nativeBridge()?.isNativePlatform?.());
}
