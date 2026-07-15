import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { QueryClientProvider } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import "react-native-reanimated";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { usePushRegistration } from "@/hooks/usePushRegistration";
import { queryClient } from "@/lib/query-client";
import { useAuthStore } from "@/store/auth";

export const unstable_settings = {
  anchor: "(tabs)",
};

// Show an in-app banner + play a sound when a push arrives while the app is
// in the foreground (the OS handles it automatically in the background).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function RootNavigator() {
  const hydrated = useAuthStore((s) => s.hydrated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const colorScheme = useColorScheme();
  usePushRegistration(hydrated && !!accessToken);

  if (!hydrated) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: Colors[colorScheme ?? "light"].background,
        }}
      >
        <ActivityIndicator color={Colors[colorScheme ?? "light"].tint} />
      </View>
    );
  }

  return (
    <Stack>
      <Stack.Protected guard={!accessToken}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!!accessToken}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="arena/[id]" options={{ headerShown: false }} />
        <Stack.Screen
          name="court/[id]/slots"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="booking/[courtId]"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="payment/[groupId]"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="booking/confirmation/[bookingId]"
          options={{ headerShown: false, gestureEnabled: false }}
        />
        <Stack.Screen
          name="arena/[id]/reviews"
          options={{ headerShown: false }}
        />
        <Stack.Screen name="notifications" options={{ headerShown: false }} />
        <Stack.Screen name="profile/edit" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Screen
        name="modal"
        options={{ presentation: "modal", title: "Modal" }}
      />
      <Stack.Screen name="health" options={{ title: "Backend Health" }} />
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <RootNavigator />
        <StatusBar style="auto" />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
