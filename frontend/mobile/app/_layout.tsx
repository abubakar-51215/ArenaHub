import { Archivo_600SemiBold, Archivo_700Bold } from "@expo-google-fonts/archivo";
import {
  InterTight_400Regular,
  InterTight_500Medium,
  InterTight_600SemiBold,
  InterTight_700Bold,
} from "@expo-google-fonts/inter-tight";
import { DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import * as Notifications from "expo-notifications";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import { useEffect } from "react";
import "react-native-reanimated";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { Colors, Font } from "@/constants/theme";
import { ToastHost } from "@/components/ui/toast";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { usePushRegistration } from "@/hooks/usePushRegistration";
import { fetchMe } from "@/services/auth";
import { queryClient } from "@/lib/query-client";
import { useAuthStore } from "@/store/auth";

export const unstable_settings = {
  anchor: "(tabs)",
};

SplashScreen.preventAutoHideAsync();

const NavigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: Colors.light.tint,
    background: Colors.light.background,
    card: Colors.light.card,
    text: Colors.light.text,
    border: Colors.light.border,
    notification: Colors.light.destructive,
  },
  // Covers any screen/header React Navigation renders text for directly
  // (e.g. the default header title on `modal` and `health`, the only two
  // screens left with headerShown: true) — components/ui/text.tsx can't
  // reach those, since the library renders them itself. fontWeight is
  // 'normal' throughout: these are named static-weight font files, not a
  // variable family, so the weight has to come from which face is picked,
  // not from the fontWeight the library would otherwise set alongside it
  // (components/ui/text.tsx "React Native does not honour fontWeight...").
  fonts: {
    regular: { fontFamily: Font.body, fontWeight: "normal" as const },
    medium: { fontFamily: Font.bodyMedium, fontWeight: "normal" as const },
    bold: { fontFamily: Font.bodyBold, fontWeight: "normal" as const },
    heavy: { fontFamily: Font.bodyBold, fontWeight: "normal" as const },
  },
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
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const colorScheme = useColorScheme();
  const sessionReady = hydrated && (!accessToken || !!user);
  usePushRegistration(sessionReady && !!accessToken);

  const currentUserQuery = useQuery({
    queryKey: ["current-user"],
    queryFn: fetchMe,
    enabled: hydrated && !!accessToken && !user,
    staleTime: Infinity,
    retry: false,
  });

  useEffect(() => {
    if (currentUserQuery.data) {
      setUser(currentUserQuery.data);
    }
  }, [currentUserQuery.data, setUser]);

  useEffect(() => {
    if (currentUserQuery.isError && accessToken) {
      useAuthStore.getState().clear();
    }
  }, [accessToken, currentUserQuery.isError]);

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

  if (!sessionReady) {
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
      <Stack.Protected guard={!!accessToken && !!user}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="admin" options={{ headerShown: false }} />
        <Stack.Screen name="filters" options={{ headerShown: false }} />
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
        <Stack.Screen name="booking/payment" options={{ headerShown: false }} />
        <Stack.Screen name="booking/bank/[groupId]" options={{ headerShown: false }} />
        <Stack.Screen name="booking/awaiting/[groupId]" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="booking/failed/[groupId]" options={{ headerShown: false }} />
        <Stack.Screen name="booking/slot-lost" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="booking/confirmed/[groupId]" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen
          name="arena/[id]/reviews"
          options={{ headerShown: false }}
        />
        <Stack.Screen name="notifications" options={{ headerShown: false }} />
        <Stack.Screen name="profile/edit" options={{ headerShown: false }} />
        <Stack.Screen
          name="booking/reschedule/[bookingId]"
          options={{ headerShown: false }}
        />
        <Stack.Screen name="play/[matchId]" options={{ headerShown: false }} />
        <Stack.Screen name="play/create" options={{ headerShown: false }} />
        <Stack.Screen
          name="profile/change-password"
          options={{ headerShown: false }}
        />
        <Stack.Screen name="profile/liked" options={{ headerShown: false }} />
        <Stack.Screen name="profile/payments" options={{ headerShown: false }} />
        <Stack.Screen name="profile/settings" options={{ headerShown: false }} />
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
  const [fontsLoaded, fontError] = useFonts({
    Archivo_600SemiBold,
    Archivo_700Bold,
    InterTight_400Regular,
    InterTight_500Medium,
    InterTight_600SemiBold,
    InterTight_700Bold,
  });
  const fontsSettled = fontsLoaded || !!fontError;

  useEffect(() => {
    if (fontsSettled) SplashScreen.hideAsync();
  }, [fontsSettled]);

  // A font failure falls through to system fonts rather than blocking the app.
  if (!fontsSettled) return null;

  return (
    <KeyboardProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider value={NavigationTheme}>
          <RootNavigator />
          <ToastHost />
          <StatusBar style="dark" />
        </ThemeProvider>
      </QueryClientProvider>
    </KeyboardProvider>
  );
}
