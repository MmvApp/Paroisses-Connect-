import { Redirect, router } from "expo-router";
import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { useAuth } from "@/context/AuthContext";

const GOLD  = "#C9A24A";
const DARK  = "#111111";
const CREAM = "#FFF8EC";

export default function LandingPage() {
  const { user, loading } = useAuth();
  const { width } = useWindowDimensions();
  const wide = width >= 640;

  if (loading) return <LoadingScreen />;
  if (user)    return <Redirect href="/(tabs)" />;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero ── */}
        <View style={styles.hero}>
          <Text style={styles.cross}>✝</Text>
          <Text style={styles.title}>Paroisse Connect</Text>
          <Text style={styles.subtitle}>L'application des paroisses catholiques.</Text>
          <Text style={styles.body}>
            Horaires des messes, annonces, intentions de prière, groupes paroissiaux,
            messagerie entre fidèles et covoiturage — tout ce dont votre paroisse a besoin
            en une seule application, sur le Web, iPhone et Android.
          </Text>

          {/* CTA buttons */}
          <View style={[styles.ctaRow, wide && styles.ctaRowWide]}>
            <TouchableOpacity
              style={styles.btnPrimary}
              onPress={() => router.push("/(auth)/login")}
              accessibilityRole="button"
              accessibilityLabel="Se connecter"
            >
              <Text style={styles.btnPrimaryText}>Se connecter</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.btnSecondary}
              onPress={() => router.push("/(auth)/register")}
              accessibilityRole="button"
              accessibilityLabel="Créer un compte"
            >
              <Text style={styles.btnSecondaryText}>Créer un compte</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={() => router.push("/(tabs)")}
            style={{ marginTop: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Parcourir sans compte"
          >
            <Text style={styles.browseLink}>Parcourir sans compte →</Text>
          </TouchableOpacity>
        </View>

        {/* ── Features ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Fonctionnalités</Text>
          <View style={[styles.featureGrid, wide && styles.featureGridWide]}>
            {FEATURES.map((f) => (
              <View key={f.label} style={[styles.featureCard, wide && styles.featureCardWide]}>
                <Text style={styles.featureEmoji}>{f.emoji}</Text>
                <Text style={styles.featureLabel}>{f.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Why ── */}
        <View style={[styles.section, styles.whySection]}>
          <Text style={styles.sectionTitle}>Pourquoi Paroisse Connect ?</Text>
          {WHY.map((item) => (
            <View key={item} style={styles.whyRow}>
              <Text style={styles.whyCheck}>✓</Text>
              <Text style={styles.whyText}>{item}</Text>
            </View>
          ))}
        </View>

        {/* ── Footer ── */}
        <View style={styles.footer}>
          <View style={styles.footerLinks}>
            {FOOTER_LINKS.map((l) => (
              <TouchableOpacity
                key={l.label}
                onPress={() => router.push(l.href as never)}
                accessibilityRole="link"
              >
                <Text style={styles.footerLink}>{l.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.footerCopy}>© {new Date().getFullYear()} Paroisse Connect</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const FEATURES = [
  { emoji: "📅", label: "Horaires des messes" },
  { emoji: "🙏", label: "Intentions de prière" },
  { emoji: "📢", label: "Annonces paroissiales" },
  { emoji: "👥", label: "Groupes paroissiaux" },
  { emoji: "💬", label: "Messagerie" },
  { emoji: "🚗", label: "Covoiturage" },
  { emoji: "📸", label: "Photos & événements" },
  { emoji: "⛪", label: "Recherche de paroisses" },
];

const WHY = [
  "Une application pensée pour les paroisses.",
  "Facile à utiliser pour tous les âges.",
  "Sécurisée et respectueuse de votre vie privée.",
  "Accessible sur le Web, Android et iPhone.",
  "Rapproche prêtres, bénévoles et fidèles.",
];

const FOOTER_LINKS = [
  { label: "Mentions légales",          href: "/mentions-legales" },
  { label: "Politique de confidentialité", href: "/politique-confidentialite" },
  { label: "CGU",                        href: "/cgu" },
];

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: CREAM },
  scroll: { flexGrow: 1 },

  /* Hero */
  hero: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 48,
    backgroundColor: CREAM,
  },
  cross:    { fontSize: 32, marginBottom: 12, color: GOLD },
  title:    { fontSize: 36, fontFamily: "Inter_700Bold",   color: DARK,  textAlign: "center", letterSpacing: -0.5 },
  subtitle: { fontSize: 18, fontFamily: "Inter_500Medium", color: GOLD,  textAlign: "center", marginTop: 8 },
  body: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: "#555",
    textAlign: "center",
    lineHeight: 24,
    marginTop: 16,
    maxWidth: 520,
  },

  ctaRow:      { flexDirection: "column", gap: 12, marginTop: 32, width: "100%", maxWidth: 360, minWidth: 0 },
  ctaRowWide:  { flexDirection: "row" },
  btnPrimary:  { backgroundColor: GOLD, borderRadius: 12, paddingVertical: 15, paddingHorizontal: 32, alignItems: "center", flex: 1, minWidth: 0 },
  btnPrimaryText: { color: "#FFF", fontFamily: "Inter_600SemiBold", fontSize: 16 },
  btnSecondary: { backgroundColor: "#FFF", borderRadius: 12, paddingVertical: 15, paddingHorizontal: 32, alignItems: "center", flex: 1, minWidth: 0, borderWidth: 1.5, borderColor: GOLD },
  btnSecondaryText: { color: GOLD, fontFamily: "Inter_600SemiBold", fontSize: 16 },

  /* Sections */
  section:      { paddingHorizontal: 24, paddingVertical: 40, backgroundColor: "#FFF" },
  sectionTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: DARK, textAlign: "center", marginBottom: 24 },

  /* Feature grid */
  featureGrid:     { width: "100%", maxWidth: "100%", minWidth: 0, flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "center" },
  featureGridWide: {},
  featureCard:     { backgroundColor: CREAM, borderRadius: 14, padding: 18, alignItems: "center", flexGrow: 1, flexBasis: "45%", minWidth: 0 },
  featureCardWide: { flexGrow: 0, flexBasis: "22%" },
  featureEmoji:    { fontSize: 28, marginBottom: 8 },
  featureLabel:    { fontSize: 13, fontFamily: "Inter_600SemiBold", color: DARK, textAlign: "center" },

  /* Why */
  whySection: { backgroundColor: CREAM },
  whyRow:     { flexDirection: "row", alignItems: "flex-start", marginBottom: 14, maxWidth: 520, alignSelf: "center", width: "100%" },
  whyCheck:   { color: GOLD, fontSize: 18, fontFamily: "Inter_700Bold", marginRight: 12, marginTop: 1 },
  whyText:    { fontSize: 15, fontFamily: "Inter_400Regular", color: DARK, flex: 1, lineHeight: 22 },

  /* Footer */
  footer: { backgroundColor: DARK, paddingVertical: 32, paddingHorizontal: 24, alignItems: "center" },
  footerLinks: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 20, marginBottom: 16 },
  footerLink:  { color: "#AAA", fontFamily: "Inter_400Regular", fontSize: 13, textDecorationLine: "underline" },
  footerCopy:  { color: "#555", fontFamily: "Inter_400Regular", fontSize: 12 },

  browseLink: { color: "#999", fontFamily: "Inter_400Regular", fontSize: 14, textDecorationLine: "underline", textAlign: "center" },
});
