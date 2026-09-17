import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { router, Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { useUnreadNotifCount } from "@/hooks/useUnreadNotifCount";
import { NotificationBell } from "@/components/ui/NotificationBell";
import { responsiveRootStyle } from "@/components/ui/responsive";
import { useI18n } from "@/context/I18nContext";

const GOLD = "#C9A24A";
const DARK = "#111111";
const MUTED = "#9AA3B0";

function ReadableTabLabel({
  label,
  color,
  compact = false,
}: {
  label: string;
  color: string;
  compact?: boolean;
}) {
  return (
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.8}
      style={[styles.tabBarLabel, compact && styles.compactTabBarLabel, { color }]}
    >
      {label}
    </Text>
  );
}

// ─── NativeTabLayout (iOS Liquid Glass) ──────────────────────────────────────
function NativeTabLayout() {
  const { t } = useI18n();
  return (
    <View style={responsiveRootStyle}>
      <NativeTabs>
        <NativeTabs.Trigger name="index">
          <Icon sf={{ default: "house", selected: "house.fill" }} />
          <Label>{t("Accueil")}</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="parishes">
          <Icon sf={{ default: "building.columns", selected: "building.columns.fill" }} />
          <Label>{t("Ma paroisse")}</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="chat">
          <Icon sf={{ default: "message", selected: "message.fill" }} />
          <Label>{t("Messages")}</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="friends">
          <Icon sf={{ default: "person.2", selected: "person.2.fill" }} />
          <Label>{t("Amis")}</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="profile" hidden />
      </NativeTabs>
    </View>
  );
}

// ─── ClassicTabLayout (Web + Android + iOS standard) ─────────────────────────
function ClassicTabLayout() {
  const colors = useColors();
  const { t } = useI18n();
  const { user } = useAuth();
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";

  // Badge notifications non-lues sur l'onglet Actu (cloche)
  const unreadCount = useUnreadNotifCount(user?.uid ?? null);

  return (
    <View style={responsiveRootStyle}>
      <Tabs
        screenOptions={{
          sceneStyle: responsiveRootStyle,
          tabBarActiveTintColor: GOLD,
          tabBarInactiveTintColor: MUTED,
          headerShown: true,
          headerStyle: { backgroundColor: "#FFFFFF" },
          headerTintColor: DARK,
          headerTitleStyle: {
            fontFamily: "Inter_600SemiBold",
            fontSize: 17,
            color: DARK,
          },
          headerShadowVisible: false,
          tabBarStyle: {
            position: "absolute",
            backgroundColor: isIOS ? "transparent" : "#FFFFFF",
            borderTopWidth: 1,
            borderTopColor: "#EADFCB",
            elevation: 0,
            height: isWeb ? 92 : 72,
            shadowColor: "#EADFCB",
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.5,
            shadowRadius: 8,
          },
          tabBarItemStyle: {
            flex: 1,
            minWidth: 0,
            paddingHorizontal: 0,
          },
          tabBarBackground: () =>
            isIOS ? (
              <BlurView
                intensity={90}
                tint="light"
                style={StyleSheet.absoluteFill}
              />
            ) : isWeb ? (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: "#FFFFFF" }]} />
            ) : null,
          tabBarLabelStyle: {
            fontFamily: "Inter_600SemiBold",
            fontSize: 15,
            lineHeight: 20,
            textAlign: "center",
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: t("Accueil"),
            headerShown: false,
            tabBarLabel: ({ color }) => <ReadableTabLabel label={t("Accueil")} color={color} />,
            tabBarIcon: ({ color }) =>
              isIOS ? (
                <SymbolView name="house" tintColor={color} size={24} />
              ) : (
                <Feather name="home" size={24} color={color} />
              ),
          }}
        />
        <Tabs.Screen
          name="parishes"
          options={{
            title: t("Ma paroisse"),
            tabBarLabel: ({ color }) => (
              <ReadableTabLabel label={t("Ma paroisse")} color={color} compact />
            ),
            tabBarIcon: ({ color }) =>
              isIOS ? (
                <SymbolView name="building.columns" tintColor={color} size={24} />
              ) : (
                <Feather name="map-pin" size={24} color={color} />
              ),
          }}
        />
        <Tabs.Screen
          name="chat"
          options={{
            title: t("Messages"),
            tabBarLabel: ({ color }) => <ReadableTabLabel label={t("Messages")} color={color} />,
            tabBarIcon: ({ color }) =>
              isIOS ? (
                <SymbolView name="message" tintColor={color} size={24} />
              ) : (
                <Feather name="message-circle" size={24} color={color} />
              ),
          }}
        />
        <Tabs.Screen
          name="friends"
          options={{
            title: t("Amis"),
            tabBarLabel: ({ color }) => <ReadableTabLabel label={t("Amis")} color={color} />,
            tabBarIcon: ({ color }) =>
              isIOS ? (
                <SymbolView name="person.2" tintColor={color} size={24} />
              ) : (
                <Feather name="users" size={24} color={color} />
              ),
          }}
        />
        <Tabs.Screen name="profile" options={{ href: null, title: t("Profil") }} />
        <Tabs.Screen
          name="announcements"
          options={{
            href: null,
            title: t("Actu"),
            headerRight: () => (
              <View style={{ marginRight: 10 }}>
                <NotificationBell count={unreadCount} onPress={() => router.push("/notifications")} />
              </View>
            ),
          }}
        />
        <Tabs.Screen name="prayers" options={{ href: null, title: t("Prières") }} />
        <Tabs.Screen name="events" options={{ href: null, title: t("Agenda") }} />
        <Tabs.Screen name="covoiturage" options={{ href: null, title: t("Covoit'") }} />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBarLabel: {
    maxWidth: "100%",
    flexShrink: 1,
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    lineHeight: 20,
    textAlign: "center",
  },
  compactTabBarLabel: {
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: -0.15,
  },
});

// ─── Default export ───────────────────────────────────────────────────────────
export default function TabLayout() {
  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
