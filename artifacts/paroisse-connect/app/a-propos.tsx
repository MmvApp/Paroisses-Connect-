import React from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";

const GOLD   = "#C9A24A";
const DARK   = "#111111";
const CREAM  = "#FFF8EC";
const BORDER = "#EADFCB";
const MUTED  = "#666666";

const APP_VERSION = "1.0.0";
const BUILD       = "2026.07";

const LEGAL_ITEMS = [
  {
    icon: "file-text",
    label: "Mentions légales",
    route: "/mentions-legales",
  },
  {
    icon: "book-open",
    label: "Conditions d'utilisation",
    route: "/cgu",
  },
  {
    icon: "shield",
    label: "Politique de confidentialité",
    route: "/politique-confidentialite",
  },
];

const CREDITS = [
  { label: "Framework", value: "Expo / React Native" },
  { label: "Base de données", value: "Firebase Firestore" },
  { label: "Authentification", value: "Firebase Auth" },
  { label: "Stockage", value: "Firebase Storage" },
  { label: "Icônes", value: "Feather Icons" },
];

function LinkRow({ icon, label, route }: { icon: string; label: string; route: string }) {
  return (
    <TouchableOpacity style={s.row} onPress={() => router.push(route as never)} activeOpacity={0.7}>
      <View style={s.rowIcon}>
        <Feather name={icon as never} size={18} color={GOLD} />
      </View>
      <Text style={s.rowLabel}>{label}</Text>
      <Feather name="chevron-right" size={15} color={MUTED} />
    </TouchableOpacity>
  );
}

export default function AProposScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 4, borderBottomColor: BORDER }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={s.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="arrow-left" size={22} color={DARK} />
        </TouchableOpacity>
        <Text style={s.title}>À propos</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Logo & version */}
        <Animated.View entering={FadeInDown.delay(40).duration(380)}>
          <View style={s.hero}>
            {/* Logo placeholder — croix dorée stylisée */}
            <View style={s.logoWrap}>
              <View style={s.crossH} />
              <View style={s.crossV} />
              <View style={s.logoRing} />
            </View>

            <Text style={s.appName}>Paroisse Connect</Text>
            <Text style={s.appVersion}>Version {APP_VERSION} · Build {BUILD}</Text>

            <View style={s.dividerLine} />

            <Text style={s.appDesc}>
              Paroisse Connect est l'application officielle de votre paroisse. Elle vous permet de rester
              connecté à votre communauté, de suivre les actualités, les événements, de participer aux
              intentions de prière et de covoiturer vers les célébrations.
            </Text>
          </View>
        </Animated.View>

        {/* Mentions légales */}
        <Animated.View entering={FadeInDown.delay(100).duration(380)}>
          <Text style={s.sectionTitle}>Mentions légales</Text>
          <View style={s.card}>
            {LEGAL_ITEMS.map((item, i) => (
              <React.Fragment key={item.label}>
                <LinkRow icon={item.icon} label={item.label} route={item.route} />
                {i < LEGAL_ITEMS.length - 1 && <View style={s.divider} />}
              </React.Fragment>
            ))}
          </View>
        </Animated.View>

        {/* Crédits techniques */}
        <Animated.View entering={FadeInDown.delay(160).duration(380)}>
          <Text style={s.sectionTitle}>Technologies</Text>
          <View style={s.card}>
            {CREDITS.map((c, i) => (
              <React.Fragment key={c.label}>
                <View style={s.creditRow}>
                  <Text style={s.creditLabel}>{c.label}</Text>
                  <Text style={s.creditValue}>{c.value}</Text>
                </View>
                {i < CREDITS.length - 1 && <View style={s.divider} />}
              </React.Fragment>
            ))}
          </View>
        </Animated.View>

        {/* Copyright */}
        <Animated.View entering={FadeInDown.delay(220).duration(380)}>
          <Text style={s.copyright}>
            © 2026 Paroisse Connect{"\n"}Fait avec ♥ pour les communautés paroissiales
          </Text>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 1, backgroundColor: "#fff",
  },
  backBtn: { padding: 6 },
  title: { flex: 1, textAlign: "center", fontSize: 17, fontFamily: "Inter_700Bold", color: DARK },

  // Hero
  hero: {
    alignItems: "center",
    paddingVertical: 32, paddingHorizontal: 24,
    backgroundColor: CREAM,
    marginHorizontal: 16, marginTop: 20,
    borderRadius: 20, borderWidth: 1, borderColor: BORDER,
  },
  logoWrap: {
    width: 80, height: 80,
    alignItems: "center", justifyContent: "center",
    marginBottom: 16,
  },
  logoRing: {
    position: "absolute",
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 2, borderColor: GOLD + "55",
  },
  crossH: {
    position: "absolute",
    width: 44, height: 10, borderRadius: 5,
    backgroundColor: GOLD,
  },
  crossV: {
    position: "absolute",
    width: 10, height: 52, borderRadius: 5,
    backgroundColor: GOLD,
  },
  appName:    { fontSize: 22, fontFamily: "Inter_700Bold", color: DARK, marginBottom: 4 },
  appVersion: { fontSize: 13, fontFamily: "Inter_400Regular", color: MUTED, marginBottom: 16 },
  dividerLine: { width: "80%", height: 1, backgroundColor: BORDER, marginBottom: 16 },
  appDesc: {
    fontSize: 14, fontFamily: "Inter_400Regular", color: MUTED,
    textAlign: "center", lineHeight: 22,
  },

  sectionTitle: {
    fontSize: 11, fontFamily: "Inter_600SemiBold",
    color: MUTED, textTransform: "uppercase", letterSpacing: 0.8,
    marginHorizontal: 16, marginTop: 24, marginBottom: 8,
  },
  card: {
    marginHorizontal: 16, backgroundColor: "#fff",
    borderRadius: 16, borderWidth: 1, borderColor: BORDER,
    overflow: "hidden",
    shadowColor: BORDER, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5, shadowRadius: 6, elevation: 2,
  },

  // Link rows
  row: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  rowIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: GOLD + "18", alignItems: "center", justifyContent: "center",
  },
  rowLabel: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium", color: DARK },

  // Credit rows
  creditRow: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 13,
  },
  creditLabel: { fontSize: 14, fontFamily: "Inter_400Regular", color: MUTED },
  creditValue: { fontSize: 14, fontFamily: "Inter_500Medium", color: DARK },

  divider: { height: 1, backgroundColor: BORDER, marginLeft: 16 },

  copyright: {
    textAlign: "center",
    fontSize: 12, fontFamily: "Inter_400Regular",
    color: MUTED, lineHeight: 20,
    marginTop: 28, marginBottom: 8,
    paddingHorizontal: 24,
  },
});
