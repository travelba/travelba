import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { colors } from "./theme";

export function Screen({ children }: { children: React.ReactNode }) {
  return <View style={{ flex: 1, backgroundColor: colors.paper, paddingHorizontal: 16, paddingTop: 12 }}>{children}</View>;
}

export function Title({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ fontSize: 26, fontWeight: "800", color: colors.navy, marginBottom: 8 }}>{children}</Text>
  );
}

export function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{
        fontSize: 10,
        fontWeight: "700",
        letterSpacing: 1.4,
        color: colors.goldDark,
        textTransform: "uppercase",
        marginBottom: 4,
      }}
    >
      {children}
    </Text>
  );
}

export function Muted({ children }: { children: React.ReactNode }) {
  return <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 20 }}>{children}</Text>;
}

export function Card({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderColor: colors.line,
        borderWidth: 1,
        borderRadius: 18,
        padding: 16,
        marginBottom: 12,
      }}
    >
      {children}
    </View>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  secure,
  keyboardType,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  secure?: boolean;
  keyboardType?: "email-address" | "default" | "phone-pad";
  autoCapitalize?: "none" | "words";
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.navy, marginBottom: 6 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secure}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        style={{
          borderWidth: 1,
          borderColor: colors.line,
          backgroundColor: "#fff",
          borderRadius: 14,
          paddingHorizontal: 14,
          paddingVertical: 12,
          color: colors.navy,
        }}
      />
    </View>
  );
}

export function Button({
  label,
  onPress,
  busy,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={{
        backgroundColor: colors.navy,
        minHeight: 48,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 20,
      }}
    >
      {busy ? <ActivityIndicator color={colors.gold} /> : <Text style={{ color: "#fff", fontWeight: "700" }}>{label}</Text>}
    </Pressable>
  );
}

export function ErrorText({ children }: { children: string | null }) {
  if (!children) return null;
  return <Text style={{ color: "#8a2b2b", marginBottom: 10 }}>{children}</Text>;
}
