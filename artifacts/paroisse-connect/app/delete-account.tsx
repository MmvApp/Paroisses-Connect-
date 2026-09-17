/**
 * /delete-account — Suppression de compte (route publique)
 *
 * Page accessible sans authentification, requise pour la conformité
 * Google Play et App Store (politique de suppression des données).
 *
 * URL canonique : https://parish-connect-chat--mvira891.replit.app/delete-account
 */

import React from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from "react-native";
import { router } from "expo-router";
import Head from "expo-router/head";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const CANONICAL = "https://parish-connect-chat--mvira891.replit.app/delete-account";
const GOLD      = "#C9A24A";
const DARK      = "#111111";
const MUTED     = "#555555";
const BG        = "#FDFAF4";
const BORDER    = "#E8DFC8";
const CREAM     = "#FFF8EC";
const RED_LIGHT = "#FFF5F5";
const RED_BORDER = "#E53935";

/** Données effacées immédiatement à la suppression */
const DELETED_DATA = [
  "Nom d'affichage, prénom et photo de profil",
  "Adresse e-mail et identifiants d'authentification",
  "Messages envoyés dans les groupes et en messagerie directe",
  "Publications, annonces et intentions de prière",
  "Propositions de covoiturage et inscriptions associées",
  "Appartenance paroissiale et préférences personnelles",
  "Notifications et historique d'activité",
  "Toutes les autres données personnelles liées au compte",
];

/** Données éventuellement conservées après suppression */
const RETAINED_DATA = [
  {
    item: "Journaux de sécurité anonymisés",
    duration: "90 jours maximum",
    reason:
      "Requis pour détecter les abus et protéger les autres utilisateurs. Ces journaux ne permettent pas de vous identifier.",
  },
  {
    item: "Données de facturation (si applicable)",
    duration: "10 ans",
    reason:
      "Obligation légale comptable. Ces données ne sont jamais utilisées à des fins de contact ou de profilage.",
  },
];

export default function DeleteAccountScreen() {
  const insets = useSafeAreaInsets();

  return (
    <>
      {/* ── SEO / Head (web only) ─────────────────────────────────────────── */}
      <Head>
        <title>Supprimer mon compte — Paroisse Connect</title>
        <meta
          name="description"
          content="Comment supprimer votre compte Paroisse Connect et toutes vos données personnelles depuis l'application ou en contactant le support."
        />
        <meta name="robots" content="index, follow" />
        <meta name="googlebot" content="index, follow" />
        <link rel="canonical" href={CANONICAL} />
        <meta property="og:title" content="Supprimer mon compte — Paroisse Connect" />
        <meta
          property="og:description"
          content="Supprimez votre compte Paroisse Connect et toutes vos données depuis l'application ou par e-mail."
        />
        <meta property="og:url" content={CANONICAL} />
        <meta property="og:type" content="article" />
      </Head>

      <View style={[s.root, { paddingTop: insets.top }]}>
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View style={s.header}>
          {Platform.OS !== "web" ? (
            <TouchableOpacity
              onPress={() => router.back()}
              style={s.backBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Feather name="arrow-left" size={22} color={DARK} />
            </TouchableOpacity>
          ) : (
            <View style={s.logoMark}>
              <Text style={s.logoText}>✝</Text>
            </View>
          )}
          <View style={s.headerCenter}>
            <Text style={s.headerTitle}>Supprimer mon compte</Text>
            <Text style={s.headerApp}>Paroisse Connect</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        {/* ── Content ────────────────────────────────────────────────────── */}
        <ScrollView
          style={s.scroll}
          contentContainerStyle={[
            s.scrollContent,
            { paddingBottom: insets.bottom + 48 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Warning intro */}
          <View style={s.warningBox}>
            <View style={s.warningIconRow}>
              <Feather name="alert-triangle" size={18} color={RED_BORDER} />
              <Text style={s.warningTitle}>Action irréversible</Text>
            </View>
            <Text style={s.warningText}>
              La suppression de votre compte est{" "}
              <Text style={s.bold}>permanente et irréversible</Text>. Une fois
              confirmée, vos données personnelles seront effacées et vous ne
              pourrez plus accéder à votre compte Paroisse Connect.
            </Text>
          </View>

          {/* ── Section 1 : Comment supprimer depuis l'app ───────────────── */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>
              1. Supprimer depuis l'application
            </Text>
            <Text style={s.sectionText}>
              Vous pouvez supprimer votre compte directement depuis
              l'application, sans avoir besoin de contacter le support :
            </Text>

            <View style={s.stepsList}>
              {[
                "Ouvrez l'application Paroisse Connect",
                "Accédez à l'onglet Profil (en bas à droite)",
                'Appuyez sur "Paramètres"',
                'Faites défiler jusqu\'à "Supprimer mon compte"',
                "Confirmez la suppression lorsque demandé",
              ].map((step, i) => (
                <View key={i} style={s.stepRow}>
                  <View style={s.stepBadge}>
                    <Text style={s.stepBadgeText}>{i + 1}</Text>
                  </View>
                  <Text style={s.stepText}>{step}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* ── Section 2 : Alternative par e-mail ───────────────────────── */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>
              2. Demande de suppression par e-mail
            </Text>
            <Text style={s.sectionText}>
              Si vous n'avez plus accès à votre compte ou rencontrez un
              problème, vous pouvez envoyer une demande de suppression par
              e-mail. Votre compte sera supprimé dans un délai de{" "}
              <Text style={s.bold}>30 jours</Text> suivant la réception de votre
              demande.
            </Text>
            <View style={s.emailBox}>
              <Feather name="mail" size={15} color={GOLD} />
              <Text style={s.emailText}>support@paroisseconnect.fr</Text>
            </View>
            <Text style={s.emailNote}>
              Objet suggéré : « Demande de suppression de compte »
            </Text>
          </View>

          {/* ── Section 3 : Données supprimées ───────────────────────────── */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>3. Données définitivement supprimées</Text>
            <Text style={s.sectionText}>
              À la confirmation de la suppression, les données suivantes sont
              effacées{" "}
              <Text style={s.bold}>immédiatement et définitivement</Text> de nos
              systèmes :
            </Text>
            {DELETED_DATA.map((item, i) => (
              <View key={i} style={s.bulletRow}>
                <Feather name="trash-2" size={13} color={RED_BORDER} style={s.bulletIcon} />
                <Text style={s.bulletText}>{item}</Text>
              </View>
            ))}
          </View>

          {/* ── Section 4 : Données conservées ───────────────────────────── */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>4. Données éventuellement conservées</Text>
            <Text style={s.sectionText}>
              Dans certains cas, des données limitées peuvent être conservées
              après la suppression pour des raisons légales ou de sécurité.
              Ces données sont anonymisées et ne permettent pas de vous
              identifier personnellement.
            </Text>
            {RETAINED_DATA.map((d, i) => (
              <View key={i} style={s.retainedCard}>
                <View style={s.retainedHeader}>
                  <Text style={s.retainedItem}>{d.item}</Text>
                  <View style={s.durationBadge}>
                    <Text style={s.durationText}>{d.duration}</Text>
                  </View>
                </View>
                <Text style={s.retainedReason}>{d.reason}</Text>
              </View>
            ))}
          </View>

          {/* ── Section 5 : Délai ─────────────────────────────────────────── */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>5. Délai d'exécution</Text>
            <Text style={s.sectionText}>
              La suppression depuis l'application est{" "}
              <Text style={s.bold}>immédiate</Text> : votre compte est
              désactivé instantanément et vos données personnelles sont
              définitivement effacées de nos systèmes dans un délai maximum de{" "}
              <Text style={s.bold}>30 jours</Text>.
            </Text>
            <Text style={[s.sectionText, { marginTop: 10 }]}>
              Pour les demandes par e-mail, le traitement peut prendre jusqu'à{" "}
              <Text style={s.bold}>30 jours</Text> à compter de la réception de
              votre demande.
            </Text>
          </View>

          {/* ── Section 6 : Droit applicable ─────────────────────────────── */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>6. Vos droits (RGPD)</Text>
            <Text style={s.sectionText}>
              Conformément au Règlement Général sur la Protection des Données
              (RGPD – UE 2016/679), vous disposez d'un{" "}
              <Text style={s.bold}>droit à l'effacement</Text> (« droit à
              l'oubli ») de vos données personnelles. Pour toute question
              relative à vos données ou pour exercer vos droits, contactez-nous
              à{" "}
              <Text style={s.bold}>support@paroisseconnect.fr</Text>.
            </Text>
            <Text style={[s.sectionText, { marginTop: 10 }]}>
              Vous avez également le droit d'introduire une réclamation auprès
              de la CNIL (Commission Nationale de l'Informatique et des
              Libertés) — <Text style={s.bold}>www.cnil.fr</Text>.
            </Text>
          </View>

          {/* Footer */}
          <View style={s.footer}>
            <Text style={s.footerText}>
              © 2026 Paroisse Connect — support@paroisseconnect.fr
            </Text>
            {Platform.OS === "web" && (
              <View style={s.footerLinks}>
                {/* @ts-ignore – raw anchor tag is valid in web-only context */}
                <a
                  href="https://parish-connect-chat--mvira891.replit.app/privacy"
                  style={{ color: GOLD, fontSize: 13, textDecoration: "none", marginRight: 16 }}
                >
                  Politique de confidentialité
                </a>
                {/* @ts-ignore */}
                <a
                  href="https://parish-connect-chat--mvira891.replit.app"
                  style={{ color: GOLD, fontSize: 13, textDecoration: "none" }}
                >
                  ← Retour à l&apos;application
                </a>
              </View>
            )}
          </View>
        </ScrollView>
      </View>
    </>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: CREAM,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  backBtn: {
    padding: 6,
    minWidth: 36,
  },
  logoMark: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: GOLD + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: {
    fontSize: 18,
    color: GOLD,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: DARK,
  },
  headerApp: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: MUTED,
    marginTop: 1,
  },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    maxWidth: 760,
    width: "100%",
    minWidth: 0,
    ...(Platform.OS === "web"
      ? { alignSelf: "center" as const, paddingHorizontal: 32 }
      : {}),
  },

  // Warning box
  warningBox: {
    backgroundColor: RED_LIGHT,
    borderRadius: 12,
    padding: 16,
    marginBottom: 28,
    borderLeftWidth: 3,
    borderLeftColor: RED_BORDER,
  },
  warningIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  warningTitle: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: RED_BORDER,
  },
  warningText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#7B1A1A",
    lineHeight: 22,
  },

  // Sections
  section: {
    marginBottom: 28,
    paddingBottom: 28,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: DARK,
    marginBottom: 12,
  },
  sectionText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#333333",
    lineHeight: 23,
    marginBottom: 14,
  },
  bold: {
    fontFamily: "Inter_600SemiBold",
  },

  // Steps list
  stepsList: {
    gap: 10,
    marginTop: 4,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: GOLD,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 1,
  },
  stepBadgeText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#333333",
    lineHeight: 22,
  },

  // Email box
  emailBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: GOLD + "12",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 6,
    alignSelf: "flex-start" as const,
  },
  emailText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: DARK,
  },
  emailNote: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: MUTED,
    marginTop: 4,
  },

  // Deleted data bullets
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 10,
  },
  bulletIcon: {
    marginTop: 3,
    flexShrink: 0,
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#333333",
    lineHeight: 22,
  },

  // Retained data cards
  retainedCard: {
    backgroundColor: GOLD + "0D",
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: GOLD + "30",
  },
  retainedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 6,
  },
  retainedItem: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: DARK,
    flex: 1,
  },
  durationBadge: {
    backgroundColor: GOLD + "25",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  durationText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#7A5C1A",
  },
  retainedReason: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: MUTED,
    lineHeight: 20,
  },

  // Footer
  footer: {
    marginTop: 16,
    paddingTop: 20,
    alignItems: "center",
    gap: 10,
  },
  footerText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: MUTED,
    textAlign: "center",
  },
  footerLinks: {
    flexDirection: "row",
    marginTop: 4,
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 4,
  },
});
