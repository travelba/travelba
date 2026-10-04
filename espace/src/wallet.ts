import { Linking } from "react-native";
import { api, siteUrl } from "./api";

export type WalletPass = {
  itemId: string;
  description: string;
  header: string;
  primary: { label: string; value: string };
  secondary: { label: string; value: string }[];
};

export async function loadWalletPass(itemId: string) {
  return api<{ pass: WalletPass; pkpass: boolean }>(`/api/client/espace/passes/${itemId}`);
}

export function walletUrl(itemId: string) {
  return `${siteUrl()}/api/client/espace/passes/${itemId}`;
}

export async function openWalletPass(itemId: string) {
  const url = walletUrl(itemId);
  const can = await Linking.canOpenURL(url);
  if (can) await Linking.openURL(url);
}
