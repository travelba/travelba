export type NativeBridge = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
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

/** Application TBA sur iPhone. Un Capacitor Android, s’il existe un jour, reste sur Google Agenda. */
export function isIosNativeApp() {
  const cap = nativeBridge();
  if (!cap?.isNativePlatform?.()) return false;
  const platform = cap.getPlatform?.();
  return !platform || platform === "ios";
}
