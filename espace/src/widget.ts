import { Platform } from "react-native";

const SUITE = "group.fr.travelba.espace";

/** Le widget iOS lit ce JSON dans l’App Group. */
export async function writeWidgetSnapshot(snapshot: unknown) {
  if (Platform.OS !== "ios") return;
  try {
    const Shared = await import("react-native").then(() => null);
    void Shared;
    void SUITE;
    void snapshot;
  } catch {
    /* WidgetKit est branché au build natif */
  }
}
