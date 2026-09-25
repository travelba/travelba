export type PieceShare = {
  url: string;
  title: string;
};

type NativeCapacitor = {
  isNativePlatform?: () => boolean;
};

function nativeCapacitor(): NativeCapacitor | null {
  if (typeof window === "undefined") return null;
  const cap = (window as Window & { Capacitor?: NativeCapacitor }).Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  return cap;
}

/** Partage iOS (feuille système, dont WhatsApp) ou téléchargement web. */
export async function sharePiece(piece: PieceShare): Promise<"shared" | "download"> {
  if (nativeCapacitor()) {
    const { Share } = await import("@capacitor/share");
    await Share.share({
      title: piece.title,
      url: piece.url,
      dialogTitle: "Partager",
    });
    return "shared";
  }
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    await navigator.share({ title: piece.title, url: piece.url });
    return "shared";
  }
  return "download";
}
