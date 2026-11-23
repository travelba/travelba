import type { CapacitorConfig } from "@capacitor/cli";

/**
 * L’application charge l’origine https://travelba.fr.
 * Les cookies de session (SameSite=Lax, HttpOnly) restent ceux du site.
 * capacitor://localhost les casserait.
 */
const config: CapacitorConfig = {
  appId: "fr.travelba.client",
  appName: "TBA",
  webDir: "www",
  server: {
    url: "https://travelba.fr/mon-compte",
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
      launchAutoHide: false,
      backgroundColor: "#0B192C",
      showSpinner: false,
      launchFadeOutDuration: 200,
    },
    PushNotifications: {
      presentationOptions: ["alert", "sound"],
    },
  },
};

export default config;
