import * as Notifications from "expo-notifications";
import { api } from "./api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerPushDevice() {
  const permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) return null;
  const token = await Notifications.getExpoPushTokenAsync();
  await api("/api/client/devices", {
    method: "POST",
    body: JSON.stringify({ token: token.data, platform: "ios" }),
  });
  return token.data;
}
