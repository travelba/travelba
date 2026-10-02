import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { colors } from "../src/theme";
import { callbackSecretsFromUrl, entryCodeFromPath, routeAfterLink } from "../src/deep-links";
import { getTokens, openEntryCode, openMagicLink, refreshSession, unlockWithFaceId } from "../src/session";
import { registerPushDevice } from "../src/push";

export default function GateScreen() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      const initial = await Linking.getInitialURL();
      if (initial) {
        const opened = await consumeLink(initial);
        if (opened && !cancelled) {
          router.replace(opened as never);
          return;
        }
      }
      const tokens = await getTokens();
      if (!tokens) {
        if (!cancelled) router.replace("/connexion");
        return;
      }
      const unlocked = await unlockWithFaceId();
      if (!unlocked) {
        if (!cancelled) router.replace("/connexion");
        return;
      }
      const session = await refreshSession();
      if (!session) {
        if (!cancelled) router.replace("/connexion");
        return;
      }
      registerPushDevice().catch(() => undefined);
      const next = routeAfterLink(session.snapshot?.next || "/mon-compte");
      if (!cancelled) router.replace(next as never);
    }
    boot().finally(() => {
      if (!cancelled) setReady(true);
    });
    const sub = Linking.addEventListener("url", (event) => {
      consumeLink(event.url).then((path) => {
        if (path) router.replace(path as never);
      });
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [router]);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper }}>
        <ActivityIndicator color={colors.navy} />
      </View>
    );
  }
  return null;
}

async function consumeLink(url: string) {
  const parsed = callbackSecretsFromUrl(url);
  const entry = entryCodeFromPath(parsed.path);
  try {
    if (entry) {
      const result = await openEntryCode(entry);
      return routeAfterLink(result.snapshot?.next || "/mon-compte");
    }
    if (parsed.token_hash || parsed.code) {
      const result = await openMagicLink({
        token_hash: parsed.token_hash,
        code: parsed.code,
        type: parsed.type,
      });
      return routeAfterLink(result.snapshot?.next || "/mon-compte");
    }
  } catch {
    return "/connexion";
  }
  return null;
}
