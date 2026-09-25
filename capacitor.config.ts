import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "fr.travelba.espace",
  appName: "Travelba",
  webDir: "client-shell",
  server: {
    url: "https://travelba.fr/mon-compte",
    allowNavigation: ["travelba.fr", "*.travelba.fr"],
    cleartext: false,
  },
  appendUserAgent: "TravelbaEspace",
  ios: {
    contentInset: "automatic",
    backgroundColor: "#0B192C",
    preferredContentMode: "mobile",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: "#0B192C",
      showSpinner: false,
    },
  },
};

export default config;
