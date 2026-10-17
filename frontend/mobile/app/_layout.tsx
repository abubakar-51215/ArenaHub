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
import * as Linking from "expo-linking";
import { router, Stack, type Href } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { Pressable, Text as RNText, View } from "react-native";
import { useEffect, useRef, useState } from "react";
import "react-native-reanimated";

import { FONTS_MAX_MS, SPLASH_MAX_MS, STARTUP_CALL_TIMEOUT_MS } from "@/constants/brand";
import { Colors, Font } from "@/constants/theme";
import { AnimatedSplash } from "@/components/brand/animated-splash";
import { NetworkShell } from "@/components/ui/network-banner";
import { startNetworkWatcher } from "@/lib/network";
import { initSentry } from "@/lib/sentry";
import { ToastHost } from "@/components/ui/toast";
import { usePushNavigation } from "@/hooks/usePushNavigation";
import { usePushRegistration } from "@/hooks/usePushRegistration";
import { ApiError } from "@/lib/api";
import { linkFitsRole, pathFromUrl, rememberLink, takePendingLink } from "@/lib/deeplink";
import { setupForegroundNotifications } from "@/lib/push";
import { startupLog } from "@/lib/startup-log";
import { fetchMe } from "@/services/auth";
import { queryClient } from "@/lib/query-client";
import { useAuthStore } from "@/store/auth";
import { useStartup } from "@/store/startup";

/**
 * What a player sees if a screen fails while it draws (an unexpected reply from the server, say): a calm page with
 * "Try again" instead of a blank or red screen. In development the real error is still printed to the console.
 */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  if (__DEV__) console.warn("Screen error:", error);
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: Colors.light.paper }}>
      <RNText style={{ fontSize: 20, fontWeight: "700", color: Colors.light.text, textAlign: "center" }} accessibilityRole="header">
        Something went wrong
      </RNText>
      <RNText style={{ fontSize: 14, lineHeight: 20, color: Colors.light.muted, textAlign: "center", marginTop: 8 }}>
        Please try again. If it keeps happening, close the app and open it again.
      </RNText>
      <Pressable
        onPress={retry}
        accessibilityRole="button"
        accessibilityLabel="Try again"
        style={{ minHeight: 46, minWidth: 160, marginTop: 20, borderRadius: 14, backgroundColor: Colors.light.ink, alignItems: "center", justifyContent: "center" }}>
        <RNText style={{ fontSize: 14, fontWeight: "700", color: "#FFFFFF" }}>Try again</RNText>
      </Pressable>
    </View>
  );
}

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

function RootNavigator() {
  const hydrated = useAuthStore((s) => s.hydrated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  // What the app waits for before it leaves the splash: the saved sign-in is read from the phone (hydrated), and, when
  // one is saved, it is checked with the server (GET /users/me, 8 s limit). If the server cannot be reached the app goes
  // on to Log in (the saved sign-in stays in storage). Whatever is still unfinished after SPLASH_MAX_MS is given up on.
  useEffect(() => startNetworkWatcher(), []);
  useEffect(() => {
    void initSentry(); // error tracking, a no-op unless EXPO_PUBLIC_SENTRY_DSN is set
  }, []);

  // a link opened before the account is loaded (signed out, or a saved sign-in still being checked) is kept: it opens
  // after Log in, or after "Try again" when the server could not be reached at start (lib/deeplink.ts)
  useEffect(() => {
    const keep = (url: string | null) => {
      const { accessToken: token, user: who } = useAuthStore.getState();
      if (!token || !who) rememberLink(pathFromUrl(url));
    };
    Linking.getInitialURL().then(keep).catch(() => {});
    const sub = Linking.addEventListener("url", (e) => keep(e.url));
    return () => sub.remove();
  }, []);

  const everReady = useRef(false);
  const currentUserQuery = useQuery({
    queryKey: ["current-user"],
    queryFn: () => fetchMe({ timeoutMs: STARTUP_CALL_TIMEOUT_MS }),
    enabled: hydrated && !!accessToken && !user && !everReady.current,
    staleTime: Infinity,
    retry: false,
  });
  const checkFailed = currentUserQuery.isError;
  const [gaveUp, setGaveUp] = useState(false);
  const sessionReady = hydrated && (!accessToken || !!user || checkFailed);
  // Once the app has been ready it stays ready. Without this, Log in (tokens saved a moment before the account is
  // loaded) put the whole app back to "waiting": the screens were taken away mid sign-in and the splash started again.
  if (sessionReady || gaveUp) everReady.current = true;
  usePushRegistration(sessionReady && !!accessToken && !!user);
  usePushNavigation(sessionReady);

  useEffect(() => {
    if (hydrated) startupLog(`saved sign-in read from the phone (${accessToken ? "one is saved" : "none"})`);
  }, [hydrated]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (hydrated && accessToken && !user && !everReady.current) startupLog(`checking the saved sign-in with the server (GET /users/me, ${STARTUP_CALL_TIMEOUT_MS / 1000} s limit)`);
  }, [hydrated, accessToken, user]);

  // the start-up check failed once (no server); when "Try again" then works, the screen that was open comes back
  const failedOnce = useRef(false);
  if (currentUserQuery.isError) failedOnce.current = true;
  useEffect(() => {
    if (currentUserQuery.data) {
      startupLog("saved sign-in is valid");
      setUser(currentUserQuery.data);
      const link = takePendingLink();
      if (failedOnce.current && link && linkFitsRole(link, currentUserQuery.data.role)) {
        startupLog(`reopening ${link} after Try again`);
        setTimeout(() => router.push(link as Href), 350);
      }
    }
  }, [currentUserQuery.data, setUser]);

  // A saved sign-in the server turns down (401/403) is removed. A server that cannot be reached is not a reason to log
  // the player out: the session stays in storage and Log in offers "Try again".
  useEffect(() => {
    if (!currentUserQuery.isError) return;
    const err = currentUserQuery.error;
    const refused = err instanceof ApiError && (err.status === 401 || err.status === 403);
    startupLog(`saved sign-in could not be checked: ${err instanceof Error ? err.message : "unknown"}${refused ? " (turned down, signed out)" : " (kept)"}`);
    if (refused) useAuthStore.getState().clear();
  }, [currentUserQuery.isError]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const unreachable = checkFailed && !!accessToken && !user;
    useStartup.getState().set({ unreachable: unreachable || (gaveUp && !!accessToken && !user), checking: currentUserQuery.isFetching, retry: () => void currentUserQuery.refetch() });
  }, [checkFailed, gaveUp, accessToken, user, currentUserQuery.isFetching]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setTimeout(() => {
      startupLog(`still not ready after ${SPLASH_MAX_MS / 1000} s: leaving the splash for Log in`);
      setGaveUp(true);
    }, SPLASH_MAX_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (sessionReady) startupLog("session ready");
  }, [sessionReady]);

  // While the session loads the animated splash covers the screen; behind it there is only the page colour.
  const waiting = (!hydrated || !sessionReady) && !gaveUp && !everReady.current;
  const ready = !waiting;
  const needsPhone = !!accessToken && !!user && user.role === 'player' && !user.phone;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.light.background }}>
    <NetworkShell>
    {waiting ? null : (
    <Stack>
      <Stack.Protected guard={!accessToken || !user}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack.Protected>
      {/* the admin screens: only an admin can open them (the screens check the role again) */}
      <Stack.Protected guard={!!accessToken && user?.role === 'admin'}>
        <Stack.Screen name="admin" options={{ headerShown: false }} />
      </Stack.Protected>
      {/* an account made with Google has no phone yet: "One more step" comes first, every time the app opens */}
      <Stack.Protected guard={needsPhone}>
        <Stack.Screen name="one-more-step" options={{ headerShown: false, gestureEnabled: false }} />
      </Stack.Protected>
      {/* the player and owner screens: an admin never sees them */}
      <Stack.Protected guard={!!accessToken && !!user && user.role !== 'admin' && !needsPhone}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
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
        <Stack.Screen name="booking/detail/[groupId]" options={{ headerShown: false }} />
        <Stack.Screen name="booking/move/[groupId]" options={{ headerShown: false }} />
        <Stack.Screen name="play/[matchId]" options={{ headerShown: false }} />
        <Stack.Screen name="play/create" options={{ headerShown: false }} />
        <Stack.Screen
          name="profile/change-password"
          options={{ headerShown: false }}
        />
        <Stack.Screen name="profile/liked" options={{ headerShown: false }} />
        <Stack.Screen name="profile/payments" options={{ headerShown: false }} />
        <Stack.Screen name="profile/report" options={{ headerShown: false }} />
        <Stack.Screen name="profile/settings" options={{ headerShown: false }} />
        <Stack.Screen name="profile/change-email" options={{ headerShown: false }} />
        <Stack.Screen name="profile/change-phone" options={{ headerShown: false }} />
        <Stack.Screen name="profile/reviews" options={{ headerShown: false }} />
        <Stack.Screen name="support/index" options={{ headerShown: false }} />
        <Stack.Screen name="support/new" options={{ headerShown: false }} />
        <Stack.Screen name="support/faq" options={{ headerShown: false }} />
        <Stack.Screen name="support/assistant" options={{ headerShown: false }} />
        <Stack.Screen name="support/[id]" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Screen name="health" options={{ title: "Backend Health" }} />
    </Stack>
    )}
    </NetworkShell>
    <AnimatedSplash ready={ready} />
    </View>
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
  const [fontsGaveUp, setFontsGaveUp] = useState(false);
  const fontsSettled = fontsLoaded || !!fontError || fontsGaveUp;

  useEffect(() => {
    const t = setTimeout(() => {
      if (!fontsLoaded) startupLog(`fonts not loaded after ${FONTS_MAX_MS / 1000} s: using the system fonts`);
      setFontsGaveUp(true);
    }, FONTS_MAX_MS);
    return () => clearTimeout(t);
  }, [fontsLoaded]);

  useEffect(() => {
    if (fontsLoaded) startupLog("fonts loaded");
    else if (fontError) startupLog(`fonts failed (${fontError.message}): using the system fonts`);
  }, [fontsLoaded, fontError]);

  // The native splash is always taken away, whatever else happens (the animated splash also does it on its first frame).
  useEffect(() => {
    const t = setTimeout(() => SplashScreen.hideAsync().catch(() => {}), SPLASH_MAX_MS + 500);
    return () => clearTimeout(t);
  }, []);

  // Foreground push banners: a real build only. In Expo Go this does nothing and loads nothing.
  useEffect(() => {
    setupForegroundNotifications();
  }, []);

  // The native splash (the still dark mark) is hidden by AnimatedSplash once it has drawn its first frame.

  // A font failure or a slow font falls through to system fonts rather than blocking the app.
  if (!fontsSettled) return null;

  return (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider value={NavigationTheme}>
          <RootNavigator />
          <ToastHost />
          <StatusBar style="dark" />
        </ThemeProvider>
      </QueryClientProvider>
  );
}
