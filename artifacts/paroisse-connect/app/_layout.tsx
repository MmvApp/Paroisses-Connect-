import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, usePathname } from "expo-router";
import Head from "expo-router/head";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { responsiveRootStyle } from "@/components/ui/responsive";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { I18nProvider } from "@/context/I18nContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";

SplashScreen.preventAutoHideAsync();

const SEO_TITLE       = "Paroisse Connect – Application des paroisses catholiques";
const SEO_DESCRIPTION = "Paroisse Connect est l'application des paroisses catholiques en France. Horaires des messes, annonces, intentions de prière, groupes, événements, covoiturage et vie paroissiale.";
const SEO_CANONICAL   = "https://parish-connect-chat--mvira891.replit.app";
const SEO_OG_IMAGE    = `${SEO_CANONICAL}/og-image.png`;
const EXPO_PREVIEW_HOST_SUFFIX = ".expo.picard.replit.dev";
const WEB_INTERACTION_STABILITY_CSS = `
  html,
  body,
  #root,
  #root > div,
  #root > div > div {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    overflow-x: hidden;
  }

  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  html,
  body,
  #root,
  #root > div,
  #root > div > div {
    -webkit-text-size-adjust: 100%;
    text-size-adjust: 100%;
    touch-action: manipulation;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  @media screen and (pointer: coarse) {
    input,
    textarea,
    select {
      font-size: 16px !important;
    }
  }
`;
const SEO_SCHEMA = JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      "@id": `${SEO_CANONICAL}/#webapp`,
      name: "Paroisse Connect",
      url: SEO_CANONICAL,
      description: SEO_DESCRIPTION,
      applicationCategory: "SocialNetworkingApplication",
      operatingSystem: "iOS, Android, Web",
      inLanguage: "fr-FR",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
      audience: {
        "@type": "Audience",
        audienceType: "Catholiques en France",
        geographicArea: { "@type": "Country", name: "France" },
      },
      featureList: [
        "Horaires des messes",
        "Annonces paroissiales",
        "Intentions de prière",
        "Événements paroissiaux",
        "Covoiturage",
        "Messagerie entre paroissiens",
        "Groupes paroissiaux",
      ],
    },
    {
      "@type": "Organization",
      "@id": `${SEO_CANONICAL}/#organization`,
      name: "Paroisse Connect",
      url: SEO_CANONICAL,
      description: SEO_DESCRIPTION,
    },
  ],
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30_000,
    },
  },
});

const SYS = Platform.select({ ios: "System", android: "Roboto", default: "sans-serif" });
const appRootStyle = responsiveRootStyle;

function AuthErrorScreen({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <View style={err.container}>
      <Text style={err.icon}>⚠️</Text>
      <Text style={err.title}>Connexion impossible</Text>
      <Text style={err.message}>{error}</Text>
      <TouchableOpacity style={err.btn} onPress={onRetry} activeOpacity={0.85}>
        <Text style={err.btnText}>Réessayer</Text>
      </TouchableOpacity>
    </View>
  );
}

const err = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFF8EC",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 14,
  },
  icon:    { fontSize: 48 },
  title:   { fontSize: 20, fontWeight: "700", color: "#111111", fontFamily: SYS, textAlign: "center" },
  message: { fontSize: 14, color: "#666666", fontFamily: SYS, textAlign: "center", lineHeight: 20 },
  btn: {
    marginTop: 8,
    backgroundColor: "#C9A24A",
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  btnText: { fontSize: 15, fontWeight: "700", color: "#111111", fontFamily: SYS },
});

// Routes accessibles sans authentification (crawlers, liens publics)
const PUBLIC_ROUTES = ["/privacy", "/delete-account", "/reset-password"];

/**
 * Détermine si le chemin courant est une route publique.
 * usePathname() peut retourner null au premier rendu (avant que le router
 * expo-router soit initialisé). Sur web, on se rabat sur window.location.pathname
 * pour que le bypass soit actif dès le premier render et éviter le flash du
 * LoadingScreen sur les routes publiques.
 */
function useIsPublicRoute(): boolean {
  const routerPathname = usePathname();
  const windowPathname =
    Platform.OS === "web" && typeof window !== "undefined"
      ? window.location.pathname
      : null;
  // Prend le premier pathname disponible
  const pathname = routerPathname ?? windowPathname ?? "";
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.endsWith(route)
  );
}

function useRedirectExpoPreviewToPublicWeb(): boolean {
  const isPreviewRoot =
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    window.location.hostname.endsWith(EXPO_PREVIEW_HOST_SUFFIX) &&
    (window.location.pathname === "/" || window.location.pathname === "");

  useEffect(() => {
    if (isPreviewRoot && typeof window !== "undefined") {
      window.location.replace(SEO_CANONICAL);
    }
  }, [isPreviewRoot]);

  return isPreviewRoot;
}

function RootLayoutNav() {
  const { loading, authError, retryAuth } = useAuth();
  const isPublic = useIsPublicRoute();
  const isRedirectingPreview = useRedirectExpoPreviewToPublicWeb();

  usePushNotifications();

  if (isRedirectingPreview) {
    return <LoadingScreen />;
  }

  // Les routes publiques ne doivent jamais être bloquées par le loading Firebase
  if (!isPublic && loading) {
    return <LoadingScreen />;
  }

  if (!isPublic && authError) {
    return <AuthErrorScreen error={authError} onRetry={retryAuth} />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: responsiveRootStyle,
      }}
    >
      <Stack.Screen name="index"  options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="groups"      options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="group-chat/[groupId]" options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="group-info/[groupId]" options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="mutual-aid"  options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="profile/[uid]" options={{ headerShown: false, presentation: "card" }} />

      <Stack.Screen name="more"        options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="super-admin"               options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="mentions-legales"           options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="cgu"                        options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="politique-confidentialite"  options={{ headerShown: false, presentation: "card" }} />

      {/* Routes publiques — pas d'auth requise */}
      <Stack.Screen name="privacy"         options={{ headerShown: false }} />
      <Stack.Screen name="delete-account"  options={{ headerShown: false }} />
      <Stack.Screen name="reset-password"  options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return <LoadingScreen />;
  }

  return (
    <>
      <Head>
        {Platform.OS === "web" ? (
          <>
            <meta
              name="viewport"
              content="width=device-width, initial-scale=1, viewport-fit=cover"
            />
            <style dangerouslySetInnerHTML={{ __html: WEB_INTERACTION_STABILITY_CSS }} />
          </>
        ) : null}

        {/* ── Fondamentaux ── */}
        <title>{SEO_TITLE}</title>
        <meta name="description" content={SEO_DESCRIPTION} />
        <meta name="google-site-verification" content="g9W2pNz0ASFGeTOa-nsvTEZhIw-dOG0G84rEvECUeSE" />
        <meta name="robots" content="index, follow" />
        <meta name="googlebot" content="index, follow" />
        <meta name="application-name" content="Paroisse Connect" />
        <meta name="author" content="Paroisse Connect" />
        <meta httpEquiv="content-language" content="fr" />
        <link rel="canonical" href={SEO_CANONICAL} />

        {/* ── Open Graph ── */}
        <meta property="og:type"        content="website" />
        <meta property="og:url"         content={SEO_CANONICAL} />
        <meta property="og:title"       content={SEO_TITLE} />
        <meta property="og:description" content={SEO_DESCRIPTION} />
        <meta property="og:image"       content={SEO_OG_IMAGE} />
        <meta property="og:image:alt"   content="Paroisse Connect – Application des paroisses catholiques" />
        <meta property="og:locale"      content="fr_FR" />
        <meta property="og:site_name"   content="Paroisse Connect" />

        {/* ── Twitter Card ── */}
        <meta name="twitter:card"        content="summary_large_image" />
        <meta name="twitter:title"       content={SEO_TITLE} />
        <meta name="twitter:description" content={SEO_DESCRIPTION} />
        <meta name="twitter:image"       content={SEO_OG_IMAGE} />
        <meta name="twitter:image:alt"   content="Paroisse Connect" />

        {/* ── Mobile / PWA ── */}
        <meta name="theme-color" content="#C9A24A" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Paroisse Connect" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />

        {/* ── Schema.org JSON-LD ── */}
        <script type="application/ld+json">{SEO_SCHEMA}</script>
      </Head>

      <SafeAreaProvider>
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <GestureHandlerRootView style={appRootStyle}>
              <KeyboardProvider>
                <I18nProvider>
                  <AuthProvider>
                    <RootLayoutNav />
                  </AuthProvider>
                </I18nProvider>
              </KeyboardProvider>
            </GestureHandlerRootView>
          </QueryClientProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </>
  );
}
