import React from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

// ─── Configuration — modifier ici pour changer le lien ou les textes ──────────

const DON_URL = "https://www.onparticipe.fr/c/dOYQnRtN";

const HERO_TITLE   = "Soutenir\nParoisse Connect";
const HERO_SUBTITLE = "Votre soutien nous aide à maintenir et à améliorer l'application pour toutes les paroisses.";

const USAGES = [
  {
    icon: "server",
    title: "Hébergement & serveurs",
    desc: "Paiement des serveurs, bases de données et infrastructure qui font fonctionner l'application 24 h/24.",
  },
  {
    icon: "code",
    title: "Développement",
    desc: "Correction de bugs, nouvelles fonctionnalités, mises à jour de sécurité et améliorations continues.",
  },
  {
    icon: "smartphone",
    title: "Applications mobiles",
    desc: "Publication et maintenance sur l'App Store et Google Play pour iOS et Android.",
  },
  {
    icon: "heart",
    title: "Accessibilité gratuite",
    desc: "Garder Paroisse Connect entièrement gratuit pour toutes les paroisses, quelle que soit leur taille.",
  },
];

const FOOTER_NOTE =
  "Les dons sont traités de façon sécurisée via OnParticipe. Paroisse Connect est un projet indépendant et sans but lucratif.";

// ─── Palette ──────────────────────────────────────────────────────────────────

const GOLD   = "#C9A24A";
const DARK   = "#111111";
const CREAM  = "#FFF8EC";
const BORDER = "#EADFCB";
const RED    = "#E85D3A";

// ─── Component ────────────────────────────────────────────────────────────────

export default function SoutenirScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const handleDon = async () => {
    try {
      const supported = await Linking.canOpenURL(DON_URL);
      if (supported || Platform.OS === "web") {
        await Linking.openURL(DON_URL);
      }
    } catch {
      // silently ignore
    }
  };

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: "#fff", borderBottomColor: BORDER, paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={s.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="arrow-left" size={22} color={DARK} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: DARK }]}>Soutenir</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero card */}
        <View style={[s.heroCard, { backgroundColor: CREAM, borderColor: BORDER }]}>
          <View style={[s.heroIconWrap, { backgroundColor: RED + "15" }]}>
            <Text style={s.heroEmoji}>❤️</Text>
          </View>
          <Text style={[s.heroTitle, { color: DARK }]}>{HERO_TITLE}</Text>
          <Text style={[s.heroSubtitle, { color: "#555" }]}>{HERO_SUBTITLE}</Text>

          {/* CTA button */}
          <TouchableOpacity style={s.donBtn} onPress={handleDon} activeOpacity={0.85}>
            <Feather name="heart" size={17} color="#fff" />
            <Text style={s.donBtnText}>Faire un don</Text>
            <Feather name="external-link" size={14} color="rgba(255,255,255,0.75)" />
          </TouchableOpacity>
        </View>

        {/* À quoi servent les dons */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.mutedForeground }]}>
            À QUOI SERVENT LES DONS ?
          </Text>
          <View style={[s.usageCard, { backgroundColor: colors.card, borderColor: BORDER }]}>
            {USAGES.map((item, idx) => (
              <React.Fragment key={item.icon}>
                <View style={s.usageRow}>
                  <View style={[s.usageIconWrap, { backgroundColor: GOLD + "18" }]}>
                    <Feather name={item.icon as never} size={18} color={GOLD} />
                  </View>
                  <View style={s.usageText}>
                    <Text style={[s.usageTitle, { color: colors.foreground }]}>{item.title}</Text>
                    <Text style={[s.usageDesc, { color: colors.mutedForeground }]}>{item.desc}</Text>
                  </View>
                </View>
                {idx < USAGES.length - 1 && (
                  <View style={[s.divider, { backgroundColor: BORDER }]} />
                )}
              </React.Fragment>
            ))}
          </View>
        </View>

        {/* Secondary CTA */}
        <TouchableOpacity style={[s.secBtn, { borderColor: RED + "66" }]} onPress={handleDon} activeOpacity={0.82}>
          <Feather name="heart" size={15} color={RED} />
          <Text style={[s.secBtnText, { color: RED }]}>Je soutiens Paroisse Connect</Text>
          <Feather name="arrow-right" size={15} color={RED} />
        </TouchableOpacity>

        {/* Footer note */}
        <View style={[s.footerNote, { backgroundColor: CREAM, borderColor: BORDER }]}>
          <Feather name="shield" size={13} color={GOLD} />
          <Text style={[s.footerText, { color: colors.mutedForeground }]}>{FOOTER_NOTE}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:   { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  backBtn:     { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },

  content: { width: "100%", maxWidth: "100%", minWidth: 0, padding: 16, gap: 20 },

  // Hero
  heroCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    gap: 12,
  },
  heroIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  heroEmoji:    { fontSize: 34 },
  heroTitle:    { fontSize: 26, fontFamily: "Inter_700Bold", textAlign: "center", lineHeight: 34, letterSpacing: -0.5 },
  heroSubtitle: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 21 },

  donBtn: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    backgroundColor: RED,
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 32,
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    shadowColor: RED,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 5,
  },
  donBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },

  // Usage list
  section:      { gap: 8 },
  sectionTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.9 },
  usageCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  usageRow: { flexDirection: "row", alignItems: "flex-start", gap: 14, padding: 16 },
  usageIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  usageText:  { flex: 1, minWidth: 0, gap: 3 },
  usageTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  usageDesc:  { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  divider:    { height: 1, marginLeft: 70 },

  // Secondary CTA
  secBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 14,
  },
  secBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },

  // Footer note
  footerNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
  },
  footerText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
});
