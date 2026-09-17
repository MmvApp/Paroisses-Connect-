/**
 * /privacy — Politique de confidentialité (route publique)
 *
 * Cette page est accessible sans authentification.
 * Elle est conçue pour être indexée par les crawlers (Google Play,
 * moteurs de recherche) et ne dépend d'aucun contexte Firebase.
 *
 * URL canonique : https://parish-connect-chat--mvira891.replit.app/privacy
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

const CANONICAL = "https://parish-connect-chat--mvira891.replit.app/privacy";
const GOLD      = "#C9A24A";
const DARK      = "#111111";
const MUTED     = "#555555";
const BG        = "#FDFAF4";
const BORDER    = "#E8DFC8";
const CREAM     = "#FFF8EC";

const SECTIONS = [
  {
    title: "1. Responsable du traitement",
    content:
      "L'équipe Paroisse Connect est responsable du traitement de vos données personnelles au sens du Règlement Général sur la Protection des Données (RGPD – Règlement UE 2016/679).\n\nContact : support@paroisseconnect.fr",
  },
  {
    title: "2. Données collectées",
    content:
      "Lors de votre utilisation de Paroisse Connect, nous collectons les données suivantes :\n\n• Données d'identification : prénom, nom d'affichage, adresse e-mail\n• Photo de profil (facultative)\n• Appartenance paroissiale\n• Contenus publiés : annonces, événements, intentions de prière, messages de groupe\n• Données de messagerie directe\n• Données de covoiturage (facultatif)\n• Données techniques : identifiant Firebase, date de création du compte",
  },
  {
    title: "3. Finalités du traitement",
    content:
      "Vos données sont utilisées pour :\n• créer et gérer votre compte utilisateur ;\n• vous permettre d'accéder aux services de la paroisse ;\n• afficher votre profil aux autres membres de votre paroisse ;\n• envoyer et recevoir des messages au sein des groupes et en direct ;\n• assurer la sécurité et la modération du service.",
  },
  {
    title: "4. Base légale du traitement",
    content:
      "Le traitement de vos données repose sur :\n• votre consentement donné lors de l'inscription (Art. 6(1)(a) RGPD) ;\n• l'exécution du contrat d'utilisation de l'application (Art. 6(1)(b) RGPD) ;\n• l'intérêt légitime de Paroisse Connect à assurer la sécurité et la modération du service (Art. 6(1)(f) RGPD).",
  },
  {
    title: "5. Durée de conservation",
    content:
      "Vos données sont conservées :\n• tant que votre compte est actif ;\n• jusqu'à 3 ans après votre dernière connexion pour les comptes inactifs ;\n• ou jusqu'à la suppression de votre compte à votre demande.\n\nAprès suppression, vos données personnelles sont définitivement effacées de nos systèmes dans un délai de 30 jours.",
  },
  {
    title: "6. Destinataires et sous-traitants",
    content:
      "Vos données peuvent être transmises à nos sous-traitants techniques :\n\n• Google LLC (Firebase) – authentification, base de données, stockage des photos\n\nCe sous-traitant est soumis à des clauses contractuelles types garantissant un niveau de protection adéquat conformément au RGPD.\n\nNous ne vendons jamais vos données à des tiers à des fins commerciales.",
  },
  {
    title: "7. Vos droits",
    content:
      "Conformément au RGPD, vous disposez des droits suivants :\n\n• Droit d'accès : obtenir une copie de vos données\n• Droit de rectification : corriger des données inexactes\n• Droit à l'effacement (« droit à l'oubli ») : supprimer votre compte et vos données\n• Droit à la limitation du traitement\n• Droit à la portabilité : recevoir vos données dans un format structuré\n• Droit d'opposition : vous opposer à certains traitements\n\nPour exercer ces droits : support@paroisseconnect.fr\n\nVous pouvez supprimer votre compte directement depuis Profil → Confidentialité → Supprimer mon compte.",
  },
  {
    title: "8. Sécurité",
    content:
      "Nous mettons en œuvre des mesures techniques et organisationnelles adaptées pour protéger vos données contre tout accès non autorisé, perte ou destruction :\n• chiffrement des données en transit (HTTPS/TLS) ;\n• authentification sécurisée via Firebase Auth ;\n• accès aux données restreint aux personnes habilitées.",
  },
  {
    title: "9. Réclamation",
    content:
      "Si vous estimez que vos droits ne sont pas respectés, vous avez le droit d'introduire une réclamation auprès de la Commission Nationale de l'Informatique et des Libertés (CNIL) :\n\nCNIL — 3 Place de Fontenoy, 75007 Paris\nhttps://www.cnil.fr",
  },
  {
    title: "10. Modifications",
    content:
      "La présente politique de confidentialité peut être mise à jour à tout moment. Toute modification significative vous sera notifiée via l'application.\n\nVersion en vigueur : Juillet 2026\nContact : support@paroisseconnect.fr",
  },
];

export default function PrivacyPolicyScreen() {
  const insets = useSafeAreaInsets();

  return (
    <>
      {/* ── SEO / Head (web only) ─────────────────────────────────────────── */}
      <Head>
        <title>Politique de confidentialité — Paroisse Connect</title>
        <meta
          name="description"
          content="Politique de confidentialité de l'application Paroisse Connect : données collectées, droits des utilisateurs, RGPD, contact DPO."
        />
        <meta name="robots" content="index, follow" />
        <meta name="googlebot" content="index, follow" />
        <link rel="canonical" href={CANONICAL} />
        <meta property="og:title" content="Politique de confidentialité — Paroisse Connect" />
        <meta
          property="og:description"
          content="Consultez la politique de confidentialité de Paroisse Connect : collecte de données, vos droits RGPD, contact et suppression de compte."
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
            <Text style={s.headerTitle}>Politique de confidentialité</Text>
            <Text style={s.headerApp}>Paroisse Connect</Text>
          </View>
          {/* spacer */}
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
          {/* Intro */}
          <View style={s.intro}>
            <Text style={s.introText}>
              La présente politique de confidentialité décrit comment{" "}
              <Text style={s.bold}>Paroisse Connect</Text> collecte, utilise et
              protège vos données personnelles, conformément au Règlement Général
              sur la Protection des Données (RGPD – UE 2016/679).
            </Text>
            <Text style={s.updatedAt}>Dernière mise à jour : Juillet 2026</Text>
          </View>

          {/* Sections */}
          {SECTIONS.map((section, i) => (
            <View key={i} style={s.section}>
              <Text style={s.sectionTitle}>{section.title}</Text>
              <Text style={s.sectionContent}>{section.content}</Text>
            </View>
          ))}

          {/* Footer */}
          <View style={s.footer}>
            <Text style={s.footerText}>
              © 2026 Paroisse Connect — support@paroisseconnect.fr
            </Text>
            {Platform.OS === "web" && (
              <View style={s.footerLinks}>
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

  // Intro block
  intro: {
    backgroundColor: GOLD + "12",
    borderRadius: 12,
    padding: 16,
    marginBottom: 28,
    borderLeftWidth: 3,
    borderLeftColor: GOLD,
  },
  introText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: DARK,
    lineHeight: 22,
  },
  bold: {
    fontFamily: "Inter_600SemiBold",
  },
  updatedAt: {
    marginTop: 10,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: MUTED,
  },

  // Sections
  section: {
    marginBottom: 24,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: DARK,
    marginBottom: 10,
  },
  sectionContent: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#333333",
    lineHeight: 23,
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
    marginTop: 4,
  },
});
