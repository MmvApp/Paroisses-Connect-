import React from "react";
import { Feather } from "@expo/vector-icons";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Card } from "@/components/ui/Card";
import { useColors } from "@/hooks/useColors";
import { LOCALE_LABELS, SUPPORTED_LOCALES, useI18n } from "@/context/I18nContext";

const GOLD = "#C9A24A";

export function LanguagePickerCard() {
  const colors = useColors();
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = React.useState(false);

  const chooseLocale = async (nextLocale: typeof locale) => {
    await setLocale(nextLocale);
    setOpen(false);
  };

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={t("Changer la langue")}
        style={[
          styles.compactButton,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <View style={[styles.icon, { backgroundColor: GOLD + "18" }]}>
          <Feather name="globe" size={17} color={GOLD} />
        </View>
        <Text style={[styles.compactButtonText, { color: colors.foreground }]}>
          {t("Changer la langue")}
        </Text>
        <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
          <Card elevated style={{ ...styles.modalCard, backgroundColor: colors.card }}>
            <View style={styles.modalHeader}>
              <View style={styles.headerText}>
                <Text style={[styles.title, { color: colors.foreground }]}>
                  {t("Changer la langue")}
                </Text>
                <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                  {t("Choisissez la langue de l’interface")}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setOpen(false)}
                accessibilityRole="button"
                accessibilityLabel={t("Fermer")}
                style={styles.closeButton}
              >
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <View style={styles.options}>
              {SUPPORTED_LOCALES.map((option) => (
                <TouchableOpacity
                  key={option}
                  style={[
                    styles.option,
                    {
                      borderColor: locale === option ? GOLD : colors.border,
                      backgroundColor: locale === option ? GOLD + "18" : colors.background,
                    },
                  ]}
                  onPress={() => void chooseLocale(option)}
                  activeOpacity={0.75}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: locale === option }}
                  accessibilityLabel={LOCALE_LABELS[option]}
                >
                  <Text style={[styles.optionText, { color: locale === option ? GOLD : colors.foreground }]}>
                    {LOCALE_LABELS[option]}
                  </Text>
                  {locale === option ? <Feather name="check" size={15} color={GOLD} /> : null}
                </TouchableOpacity>
              ))}
            </View>
          </Card>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  compactButton: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  compactButtonText: { flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerText: { flex: 1 },
  title: { fontSize: 15, fontFamily: "Inter_700Bold" },
  hint: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 3 },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  option: {
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  optionText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  modalRoot: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(17,17,17,0.42)",
  },
  modalCard: { padding: 18, gap: 18, borderRadius: 20 },
  modalHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  closeButton: { padding: 3 },
});