import type { CapacitorConfig } from "@capacitor/cli";

/**
 * L’écran local (www/index.html) s’affiche tout de suite, sans réseau.
 * Il ouvre ensuite https://travelba.fr : les cookies de session restent ceux du site.
 * capacitor://localhost ne devient pas l’origine de la session.
 */
const config: CapacitorConfig = {
  appId: "fr.travelba.client",
  appName: "TBA",
  webDir: "www",
  server: {
    cleartext: false,
    allowNavigation: ["travelba.fr", "www.travelba.fr"],
    errorPath: "offline.html",
  },
  ios: {
    contentInset: "never",
    appendUserAgent: "TBA-iOS",
    backgroundColor: "#0B192C",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 0,
      backgroundColor: "#0B192C",
      showSpinner: false,
      launchFadeOutDuration: 120,
    },
    PushNotifications: {
      presentationOptions: ["alert", "sound", "badge"],
    },
  },
};

export default config;
