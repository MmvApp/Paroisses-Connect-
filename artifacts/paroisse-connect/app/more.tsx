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
import { useColors } from "@/hooks/useColors";
import { Card } from "@/components/ui/Card";
import { useI18n } from "@/context/I18nContext";

const GOLD   = "#C9A24A";
const DARK   = "#111111";
const CREAM  = "#FFF8EC";
const BORDER = "#EADFCB";

interface MoreItem {
  icon: string;
  label: string;
  desc: string;
  comingSoon?: boolean;
  route?: string;
}

const MORE_SECTIONS: { title: string; items: MoreItem[] }[] = [
  {
    title: "Vie spirituelle",
    items: [
      { icon: "book-open",  label: "Lectures du jour",    desc: "Évangile et commentaires quotidiens.",        comingSoon: true },
      { icon: "headphones", label: "Podcasts paroissiaux",desc: "Homélies et enseignements audio.",             comingSoon: true },
      { icon: "video",      label: "Messes en direct",    desc: "Retransmissions live des célébrations.",       comingSoon: true },
    ],
  },
  {
    title: "Communauté",
    items: [
      { icon: "users",      label: "Groupes",             desc: "Rejoindre un groupe paroissial.",              route: "/groups"     },
      { icon: "help-circle",label: "Aide & Entraide",     desc: "Services d'entraide de la paroisse.",          route: "/mutual-aid" },
      { icon: "navigation", label: "Covoiturage",         desc: "Trajets partagés vers les célébrations.",      route: "/(tabs)/covoiturage" },
    ],
  },
  {
    title: "Ressources",
    items: [
      { icon: "map",        label: "Plan de la paroisse", desc: "Locaux, horaires et accès.",                  comingSoon: true },
      { icon: "file-text",  label: "Bulletins paroissiaux",desc: "Archives des bulletins hebdomadaires.",       comingSoon: true },
    ],
  },
  {
    title: "Soutenir le projet",
    items: [
      { icon: "heart",      label: "❤️ Soutenir Paroisse Connect", desc: "Faire un don pour financer l'application.", route: "/soutenir" },
    ],
  },
];

export default function MoreScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();

  const handlePress = (item: MoreItem) => {
    if (item.route) router.push(item.route as never);
  };

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <View style={[s.header, { backgroundColor: "#FFFFFF", borderBottomColor: BORDER, paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="arrow-left" size={22} color={DARK} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: DARK }]}>{t("Plus")}</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {MORE_SECTIONS.map((section) => (
          <View key={section.title} style={s.section}>
            <Text style={[s.sectionTitle, { color: colors.mutedForeground }]}>{t(section.title).toUpperCase()}</Text>
            <Card elevated style={s.sectionCard}>
              {section.items.map((item, idx) => (
                  <React.Fragment key={item.label}>
                  <TouchableOpacity
                    activeOpacity={item.comingSoon ? 0.95 : 0.78}
                    style={s.row}
                    onPress={() => handlePress(item)}
                    disabled={item.comingSoon}
                  >
                    <View style={[s.iconCircle, { backgroundColor: item.comingSoon ? BORDER : GOLD + "18" }]}>
                      <Feather name={item.icon as never} size={18} color={item.comingSoon ? colors.mutedForeground : GOLD} />
                    </View>
                    <View style={s.rowInfo}>
                      <View style={s.rowTop}>
                        <Text style={[s.rowLabel, { color: item.comingSoon ? colors.mutedForeground : colors.foreground }]}>
                           {t(item.label)}
                        </Text>
                        {item.comingSoon && (
                          <View style={[s.soonBadge, { backgroundColor: CREAM, borderColor: BORDER, borderWidth: 1 }]}>
                            <Text style={[s.soonText, { color: GOLD }]}>{t("Bientôt")}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[s.rowDesc, { color: colors.mutedForeground }]} numberOfLines={1}>{t(item.desc)}</Text>
                    </View>
                    {!item.comingSoon && <Feather name="chevron-right" size={16} color={colors.mutedForeground} />}
                  </TouchableOpacity>
                  {idx < section.items.length - 1 && (
                    <View style={[s.divider, { backgroundColor: BORDER }]} />
                  )}
                </React.Fragment>
              ))}
            </Card>
          </View>
        ))}

        <View style={[s.versionNote, { borderColor: BORDER, backgroundColor: CREAM }]}>
          <Feather name="info" size={14} color={GOLD} />
          <Text style={[s.versionText, { color: colors.mutedForeground }]}>{t("Paroisse Connect v1.0 — de nouvelles fonctionnalités arrivent bientôt !")}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root:          { flex: 1 },
  header:        { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1 },
  backBtn:       { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  headerTitle:   { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  content:       { padding: 16, gap: 20 },
  section:       { gap: 8 },
  sectionTitle:  { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.9 },
  sectionCard:   { padding: 0, overflow: "hidden" },
  row:           { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  iconCircle:    { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  rowInfo:       { flex: 1, gap: 2 },
  rowTop:        { flexDirection: "row", alignItems: "center", gap: 8 },
  rowLabel:      { fontSize: 14, fontFamily: "Inter_500Medium" },
  rowDesc:       { fontSize: 12, fontFamily: "Inter_400Regular" },
  soonBadge:     { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1 },
  soonText:      { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  divider:       { height: 1, marginLeft: 64 },
  versionNote:   { flexDirection: "row", alignItems: "flex-start", gap: 8, borderWidth: 1, borderRadius: 10, padding: 12 },
  versionText:   { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 18 },
});
