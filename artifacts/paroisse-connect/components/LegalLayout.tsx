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
import { useI18n } from "@/context/I18nContext";

const GOLD   = "#C9A24A";
const DARK   = "#111111";
const BORDER = "#EADFCB";
const MUTED  = "#666666";
const CREAM  = "#FFF8EC";

export interface LegalSection {
  title?: string;
  content: string;
}

interface LegalLayoutProps {
  title: string;
  updatedAt: string;
  sections: LegalSection[];
}

export function LegalLayout({ title, updatedAt, sections }: LegalLayoutProps) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: insets.top + 4, borderBottomColor: BORDER }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={s.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="arrow-left" size={22} color={DARK} />
        </TouchableOpacity>
        <Text style={s.title} numberOfLines={1}>{title}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 48 }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.delay(40).duration(380)} style={s.metaBox}>
          <Feather name="file-text" size={14} color={GOLD} />
          <Text style={s.metaText}>{t("Mise à jour : {date}", { date: t(updatedAt) })}</Text>
        </Animated.View>

        {sections.map((section, i) => (
          <Animated.View key={i} entering={FadeInDown.delay(60 + i * 30).duration(380)} style={s.section}>
            {section.title && (
              <Text style={s.sectionTitle}>{section.title ? t(section.title) : null}</Text>
            )}
            <Text style={s.sectionBody}>{section.content}</Text>
          </Animated.View>
        ))}

        <Text style={s.footer}>© 2026 Paroisse Connect · support@paroisseconnect.fr</Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: "#FFFFFF" },
  header:  {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 1, backgroundColor: "#FFFFFF",
  },
  backBtn: { padding: 6 },
  title:   { flex: 1, textAlign: "center", fontSize: 17, fontFamily: "Inter_700Bold", color: DARK },

  content:       { paddingHorizontal: 20, paddingTop: 20, gap: 0 },
  metaBox:       {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: CREAM, borderRadius: 10, borderWidth: 1, borderColor: BORDER,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 20,
  },
  metaText:      { fontSize: 12, fontFamily: "Inter_400Regular", color: MUTED },

  section:       { marginBottom: 20 },
  sectionTitle:  {
    fontSize: 14, fontFamily: "Inter_700Bold", color: DARK,
    marginBottom: 8, paddingBottom: 6,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  sectionBody:   {
    fontSize: 13, fontFamily: "Inter_400Regular",
    color: "#333333", lineHeight: 22,
  },
  footer:        {
    fontSize: 11, fontFamily: "Inter_400Regular",
    color: MUTED, textAlign: "center",
    marginTop: 16, paddingTop: 16,
    borderTopWidth: 1, borderTopColor: BORDER,
  },
});
