import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useI18n } from "@/context/I18nContext";

const GOLD   = "#C9A24A";
const DARK   = "#111111";
const CREAM  = "#FFF8EC";
const BORDER = "#EADFCB";
const MUTED  = "#666666";

// ─── FAQ data ────────────────────────────────────────────────────────────────
const FAQ = [
  {
    question: "Comment rejoindre une paroisse ?",
    answer:
      "Allez dans l'onglet « Lieux », recherchez votre paroisse et appuyez sur « Rejoindre ». Votre demande sera examinée par un administrateur.",
  },
  {
    question: "Comment modifier mon profil ?",
    answer:
      "Depuis l'onglet « Profil », appuyez sur votre photo pour la changer, ou modifiez vos informations directement depuis l'écran de profil.",
  },
  {
    question: "Comment créer un événement ?",
    answer:
      "Seuls les prêtres et administrateurs peuvent créer des événements. Contactez votre administrateur paroissial si vous souhaitez en ajouter un.",
  },
  {
    question: "Les notifications ne fonctionnent pas",
    answer:
      "Vérifiez que les notifications sont activées dans Profil → Notifications, puis dans les réglages de votre appareil pour l'application Paroisse Connect.",
  },
  {
    question: "Comment supprimer mon compte ?",
    answer:
      "Allez dans Profil → Confidentialité → Supprimer mon compte. Cette action est irréversible.",
  },
];

// ─── FAQ item ─────────────────────────────────────────────────────────────────
function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  return (
    <View>
      <TouchableOpacity
        style={s.faqRow}
        onPress={() => setOpen((o) => !o)}
        activeOpacity={0.7}
      >
        <View style={s.faqIconWrap}>
          <Feather name="help-circle" size={16} color={GOLD} />
        </View>
        <Text style={s.faqQuestion}>{t(question)}</Text>
        <Feather
          name={open ? "chevron-up" : "chevron-down"}
          size={16}
          color={MUTED}
        />
      </TouchableOpacity>
      {open && (
        <View style={s.faqAnswer}>
          <Text style={s.faqAnswerText}>{t(answer)}</Text>
        </View>
      )}
    </View>
  );
}

// ─── Action row ──────────────────────────────────────────────────────────────
function ActionRow({
  icon,
  label,
  description,
  onPress,
}: {
  icon: string;
  label: string;
  description?: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={s.row} onPress={onPress} activeOpacity={0.7}>
      <View style={s.rowIcon}>
        <Feather name={icon as never} size={18} color={GOLD} />
      </View>
      <View style={s.rowText}>
        <Text style={s.rowLabel}>{label}</Text>
        {description ? <Text style={s.rowDesc}>{description}</Text> : null}
      </View>
      <Feather name="chevron-right" size={16} color={MUTED} />
    </TouchableOpacity>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function AideSupportScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();

  const handleContact = () => {
    Linking.openURL("mailto:support@paroisseconnect.fr?subject=Demande%20de%20support").catch(() =>
      Alert.alert("Erreur", "Impossible d'ouvrir l'application e-mail.")
    );
  };

  const handleReport = () => {
    Linking.openURL(
      "mailto:support@paroisseconnect.fr?subject=Signalement%20d%27un%20probl%C3%A8me&body=D%C3%A9crivez%20le%20probl%C3%A8me%20rencontr%C3%A9%20ici."
    ).catch(() => Alert.alert("Erreur", "Impossible d'ouvrir l'application e-mail."));
  };

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
        <Text style={s.title}>{t("Aide & Support")}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <Animated.View entering={FadeInDown.delay(40).duration(380)}>
          <View style={s.hero}>
            <View style={s.heroIcon}>
              <Feather name="life-buoy" size={28} color={GOLD} />
            </View>
            <Text style={s.heroTitle}>Comment pouvons-nous vous aider ?</Text>
            <Text style={s.heroSub}>
              Consultez la FAQ ou contactez notre équipe directement.
            </Text>
          </View>
        </Animated.View>

        {/* FAQ */}
        <Animated.View entering={FadeInDown.delay(100).duration(380)}>
          <Text style={s.sectionTitle}>Questions fréquentes</Text>
          <View style={s.card}>
            {FAQ.map((item, i) => (
              <React.Fragment key={i}>
                <FaqItem question={item.question} answer={item.answer} />
                {i < FAQ.length - 1 && <View style={s.divider} />}
              </React.Fragment>
            ))}
          </View>
        </Animated.View>

        {/* Actions */}
        <Animated.View entering={FadeInDown.delay(160).duration(380)}>
          <Text style={s.sectionTitle}>Nous contacter</Text>
          <View style={s.card}>
            <ActionRow
              icon="mail"
              label="Contacter le support"
              description="support@paroisseconnect.fr"
              onPress={handleContact}
            />
            <View style={s.divider} />
            <ActionRow
              icon="alert-triangle"
              label="Signaler un problème"
              description="Bugs, contenus inappropriés…"
              onPress={handleReport}
            />
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(200).duration(380)}>
          <View style={s.note}>
            <Feather name="clock" size={14} color={MUTED} style={{ marginTop: 2 }} />
            <Text style={s.noteText}>
              Notre équipe répond généralement dans les 24 à 48 heures ouvrées.
            </Text>
          </View>
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

  hero: {
    alignItems: "center", paddingVertical: 28,
    paddingHorizontal: 24, backgroundColor: CREAM,
    marginHorizontal: 16, marginTop: 20,
    borderRadius: 16, borderWidth: 1, borderColor: BORDER,
  },
  heroIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: GOLD + "20",
    alignItems: "center", justifyContent: "center", marginBottom: 14,
  },
  heroTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: DARK, textAlign: "center", marginBottom: 6 },
  heroSub:   { fontSize: 14, fontFamily: "Inter_400Regular", color: MUTED, textAlign: "center", lineHeight: 20 },

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

  // FAQ
  faqRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 14, gap: 10,
  },
  faqIconWrap: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: GOLD + "18",
    alignItems: "center", justifyContent: "center",
  },
  faqQuestion: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium", color: DARK },
  faqAnswer:   { paddingHorizontal: 16, paddingBottom: 14, paddingTop: 0 },
  faqAnswerText: { fontSize: 13, fontFamily: "Inter_400Regular", color: MUTED, lineHeight: 20 },

  // Action rows
  row: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  rowIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: GOLD + "18", alignItems: "center", justifyContent: "center",
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, fontFamily: "Inter_500Medium", color: DARK },
  rowDesc:  { fontSize: 12, fontFamily: "Inter_400Regular", color: MUTED, marginTop: 1 },

  divider: { height: 1, backgroundColor: BORDER, marginLeft: 16 },

  note: {
    flexDirection: "row", gap: 8,
    marginHorizontal: 16, marginTop: 20,
    backgroundColor: CREAM, borderRadius: 12,
    padding: 14, borderWidth: 1, borderColor: BORDER,
  },
  noteText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: MUTED, lineHeight: 18 },
});
