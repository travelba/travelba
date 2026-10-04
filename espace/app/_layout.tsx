import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { colors } from "../src/theme";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerTintColor: colors.navy,
          headerStyle: { backgroundColor: colors.paper },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.paper },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="connexion" options={{ title: "Connexion" }} />
        <Stack.Screen name="bienvenue" options={{ title: "Bienvenue" }} />
        <Stack.Screen name="mot-de-passe" options={{ title: "Mot de passe" }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="reservation/[reference]" options={{ title: "Séjour" }} />
        <Stack.Screen name="profil/pieces" options={{ title: "Pièces" }} />
        <Stack.Screen name="profil/voyageurs" options={{ title: "Voyageurs" }} />
        <Stack.Screen name="profil/facturation" options={{ title: "Facturation" }} />
      </Stack>
    </>
  );
}
