import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  Alert,
  Image,
  LayoutAnimation,
  UIManager,
  Linking,
} from "react-native";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { ConfirmSheet } from "@/components/ConfirmSheet";
import { CompactFilterChip, CompactFilterRow } from "@/components/ui/CompactFilterRow";
import { useI18n } from "@/context/I18nContext";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  increment,
  setDoc,
  getDoc,
  addDoc,
  query,
  orderBy,
  where,
  serverTimestamp,
} from "firebase/firestore";
import * as ImagePicker from "expo-image-picker";
import { Image as ExpoImage } from "expo-image";
import { uploadToSupabase } from "@/lib/uploadToSupabase";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { db } from "@/lib/firebase";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useTabScrollToTop } from "@/hooks/useTabScrollToTop";
import { GuestBanner } from "@/components/ui/GuestBanner";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { Card } from "@/components/ui/Card";
import { TimePickerField } from "@/components/ui/TimePickerField";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MassEntry {
  _key: string;
  day: string;
  time: string;
  type: string;
  lieu?: string;
}

interface Parish {
  id: string;
  name: string;
  city: string;
  postalCode: string;
  description: string;
  memberCount: number;
  priestUid?: string;
  priestName?: string;
  isClaimed?: boolean;
  claimStatus?: "pending" | "verified";
  massSchedule?: Omit<MassEntry, "_key">[];
  massSchedulesText?: string;
  confessionSchedules?: string;
  adorationSchedules?: string;
  permanenceSchedules?: string;
  coverPhotoURL?: string | null;
  parishAdmins?: string[];
  // Champs enrichis (import Cambrai)
  diocese?: string;
  department?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  churchName?: string;
  clochers?: string[];
}

type ClaimStep = "form" | "docs" | "submitted";

const REPORT_REASONS = [
  "Ce n'est pas le vrai prêtre de cette paroisse",
  "Les informations de contact sont incorrectes",
  "Cette paroisse a un autre responsable",
  "Usurpation d'identité",
  "Autre raison",
];

/** Normalise un texte : minuscules + suppression des diacritiques.
 *  "Hérin" → "herin", "Saint-Éloi" → "saint-eloi"
 *  Permet une recherche insensible aux accents. */
function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

const MASS_DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"] as const;
const DAY_ORDER: Record<string, number> = { Lundi: 0, Mardi: 1, Mercredi: 2, Jeudi: 3, Vendredi: 4, Samedi: 5, Dimanche: 6 };

const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ||
  (process.env.EXPO_PUBLIC_DOMAIN
    ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
    : "");

// ─── Sample data ──────────────────────────────────────────────────────────────

const SAMPLE_PARISHES: Omit<Parish, "id">[] = [
  {
    name: "Saint-Pierre de Montmartre",
    city: "Paris",
    postalCode: "75018",
    description: "La plus ancienne église de Paris, au cœur de Montmartre.",
    memberCount: 0,
  },
  {
    name: "Notre-Dame de la Garde",
    city: "Marseille",
    postalCode: "13006",
    description: "La « Bonne Mère », symbole de Marseille et de sa foi.",
    memberCount: 0,
  },
  {
    name: "Saint-Jean-Baptiste de la Salle",
    city: "Lyon",
    postalCode: "69001",
    description: "Paroisse au cœur du vieux Lyon, riche en histoire.",
    memberCount: 0,
  },
  {
    name: "Sainte-Anne d'Auray",
    city: "Auray",
    postalCode: "56400",
    description: "Grand lieu de pèlerinage marial en Bretagne.",
    memberCount: 0,
  },
  {
    name: "Saint-Nicolas de Port",
    city: "Nancy",
    postalCode: "54210",
    description: "Basilique gothique flamboyant, joyau de Lorraine.",
    memberCount: 0,
  },
  {
    name: "Notre-Dame de Lourdes",
    city: "Lourdes",
    postalCode: "65100",
    description: "Sanctuaire marial mondialement connu, lieu de miracles.",
    memberCount: 0,
  },
  {
    name: "Saint-Étienne-du-Mont",
    city: "Paris",
    postalCode: "75005",
    description: "Paroisse du Quartier latin, reliques de Sainte Geneviève.",
    memberCount: 0,
  },
  {
    name: "Sainte-Marie-Madeleine",
    city: "Bordeaux",
    postalCode: "33000",
    description: "Paroisse du centre historique de Bordeaux.",
    memberCount: 0,
  },
];

async function seedParishes() {
  const snap = await getDocs(collection(db, "parishes"));
  if (!snap.empty) return;
  for (const p of SAMPLE_PARISHES) {
    const ref = doc(collection(db, "parishes"));
    await setDoc(ref, { ...p, createdAt: new Date() });
  }
}

// ─── Claim Modal ──────────────────────────────────────────────────────────────

const FONCTIONS = ["Curé", "Vicaire", "Diacre", "Aumônier", "Administrateur paroissial", "Autre"];

interface ClaimModalProps {
  visible: boolean;
  parish: Parish | null;
  onClose: () => void;
  onSubmitted: () => void;
  currentUserName: string;
}

function ClaimModal({
  visible,
  parish,
  onClose,
  onSubmitted,
  currentUserName,
}: ClaimModalProps) {
  const colors = useColors();
  const { user } = useAuth();
  const { t: translate } = useI18n();
  const insets = useSafeAreaInsets();

  const [step, setStep]           = useState<ClaimStep>("form");
  const [name, setName]           = useState(currentUserName);
  const [email, setEmail]         = useState("");
  const [phone, setPhone]         = useState("");
  const [fonction, setFonction]   = useState("");
  const [diocese, setDiocese]     = useState("");
  const [departement, setDept]    = useState("");
  const [message, setMessage]     = useState("");

  const [error, setError]         = useState("");

  // Documents
  const [idCardUri, setIdCardUri]     = useState<string | null>(null);
  const [missionUri, setMissionUri]   = useState<string | null>(null);
  const [photoUri, setPhotoUri]       = useState<string | null>(null);
  const [uploading, setUploading]     = useState(false);

  const reset = () => {
    setStep("form");
    setName(currentUserName);
    setEmail(""); setPhone(""); setFonction(""); setDiocese(""); setDept(""); setMessage("");
    setIdCardUri(null); setMissionUri(null); setPhotoUri(null);
    setError("");
  };

  const handleClose = () => { reset(); onClose(); };

  const pickDoc = async (setter: (uri: string) => void, aspectRatio?: [number, number]) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") { Alert.alert("Permission requise", "Autorisez l'accès à la galerie."); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: true,
      aspect: aspectRatio ?? [4, 3],
      quality: 0.85,
    });
    if (!result.canceled && result.assets.length) setter(result.assets[0].uri);
  };

  const uploadFile = async (uri: string, path: string): Promise<string> => {
    const resp = await fetch(uri);
    const blob = await resp.blob();
    return uploadToSupabase(blob, path, { compress: false });
  };

  const goToDocs = () => {
    setError("");
    if (!name.trim())                         { setError("Veuillez saisir votre nom complet."); return; }
    if (!/\S+@\S+\.\S+/.test(email.trim()))  { setError("Adresse e-mail invalide."); return; }
    if (!phone.trim())                         { setError("Numéro de téléphone obligatoire."); return; }
    if (!fonction)                             { setError("Veuillez sélectionner votre fonction."); return; }
    if (!diocese.trim())                       { setError("Diocèse obligatoire."); return; }
    if (!departement.trim())                   { setError("Département obligatoire."); return; }
    if (message.trim().length < 30)            { setError("Décrivez-vous en au moins 30 caractères."); return; }
    setStep("docs");
  };

  const handleSubmit = async () => {
    if (!parish || !user) return;
    if (!idCardUri)  { setError("La carte d'identité est obligatoire."); return; }
    if (!missionUri) { setError("La lettre de mission est obligatoire."); return; }
    setError("");
    setUploading(true);
    try {
      // A claimant can read their own claim. A permission error here means
      // another claimant already owns the legacy parish document; the server
      // remains the authority when the priest claim is reviewed.
      try {
        const existing = await getDoc(doc(db, "parishClaims", parish.id));
        if (existing.exists()) {
          const d = existing.data();
          const existingRole = typeof d.requestedRole === "string" ? d.requestedRole : "priest";
          if (
            existingRole === "priest" &&
            (d.status === "approved" || d.status === "verified") &&
            d.claimantUid !== user.uid
          ) {
            setError("Cette paroisse a déjà un prêtre validé."); return;
          }
        }
      } catch {
        // Non-owner claim documents are intentionally not readable by members.
      }
      // Security: check if user already has an active pending claim for another parish
      const userClaims = await getDocs(query(
        collection(db, "parishClaims"),
        where("claimantUid", "==", user.uid),
        where("status", "==", "pending"),
      ));
      if (userClaims.docs.some((d) => d.id !== parish.id)) {
        setError("Vous avez déjà une demande en cours pour une autre paroisse."); return;
      }

      // Upload documents
      const ts = Date.now();
      const base = `parish-claims/${parish.id}`;
      const requestedRole = fonction === "Administrateur paroissial" ? "admin" : "priest";
      const claimId = requestedRole === "priest"
        ? parish.id
        : `${parish.id}_admin_${user.uid}`;
      const [idCardUrl, missionUrl, photoUrl] = await Promise.all([
        uploadFile(idCardUri, `${base}/id-card-${ts}.jpg`),
        uploadFile(missionUri, `${base}/mission-${ts}.jpg`),
        photoUri ? uploadFile(photoUri, `${base}/photo-${ts}.jpg`) : Promise.resolve<string | null>(null),
      ]);

      await setDoc(doc(db, "parishClaims", claimId), {
        claimantUid: user.uid,
        claimantName: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        fonction,
        diocese: diocese.trim(),
        departement: departement.trim(),
        message: message.trim(),
        parishId: parish.id,
        parishName: parish.name,
        requestedRole,
        idCardUrl,
        missionLetterUrl: missionUrl,
        photoUrl: photoUrl ?? null,
        status: "pending",
        reportCount: 0,
        createdAt: serverTimestamp(),
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStep("submitted");
    } catch {
      setError("Erreur lors de l'envoi. Réessayez.");
    } finally {
      setUploading(false);
    }
  };

  if (!parish) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          style={[styles.modalContainer, { backgroundColor: colors.background }]}
          contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40, paddingHorizontal: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.modalHeader}>
            {step === "docs" ? (
              <TouchableOpacity onPress={() => setStep("form")} style={styles.closeBtn}>
                <Feather name="arrow-left" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 36 }} />
            )}
            <Text style={[styles.modalStepLabel, { color: colors.mutedForeground }]}>
              {step === "form" ? "Étape 1 / 2" : step === "docs" ? "Étape 2 / 2" : ""}
            </Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {/* ── STEP 1 : Form ── */}
          {step === "form" && (
            <>
              <View style={[styles.modalIconBg, { backgroundColor: colors.accent + "22" }]}>
                <Feather name="shield" size={28} color={colors.accent} />
              </View>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Je suis le prêtre</Text>
              <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>
                Paroisse <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>{parish.name}</Text>
              </Text>
              <Text style={[styles.modalDesc, { color: colors.mutedForeground }]}>
                Remplissez ce formulaire. Votre demande sera examinée par un administrateur.
              </Text>

              {error !== "" && (
                <View style={[styles.errorBox, { backgroundColor: colors.destructive + "18", borderColor: colors.destructive + "44" }]}>
                  <Feather name="alert-circle" size={14} color={colors.destructive} />
                  <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
                </View>
              )}

              {/* Fields */}
              {[
                { label: "Nom et prénom", value: name, set: setName, placeholder: "Père Jean Martin", keyboardType: "default" as const, autoCapitalize: "words" as const },
                { label: "E-mail", value: email, set: setEmail, placeholder: "contact@diocese.fr", keyboardType: "email-address" as const, autoCapitalize: "none" as const },
                { label: "Téléphone", value: phone, set: setPhone, placeholder: "+33 6 00 00 00 00", keyboardType: "phone-pad" as const, autoCapitalize: "none" as const },
                { label: "Diocèse", value: diocese, set: setDiocese, placeholder: "Diocèse de Paris", keyboardType: "default" as const, autoCapitalize: "words" as const },
                { label: "Département", value: departement, set: setDept, placeholder: "75 – Paris", keyboardType: "default" as const, autoCapitalize: "none" as const },
              ].map(({ label, value, set, placeholder, keyboardType, autoCapitalize }) => (
                <View key={label} style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
                  <TextInput
                    style={[styles.fieldInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
                    value={value}
                    onChangeText={set}
                    placeholder={placeholder}
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType={keyboardType}
                    autoCapitalize={autoCapitalize}
                    autoCorrect={false}
                  />
                </View>
              ))}

              {/* Fonction chips */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Fonction</Text>
                <CompactFilterRow style={{ marginTop: 4 }}>
                  {FONCTIONS.map((f) => (
                    <CompactFilterChip
                      key={f}
                      label={translate(f)}
                      onPress={() => setFonction(f)}
                      style={[styles.chip, { backgroundColor: fonction === f ? colors.primary : colors.secondary, borderColor: fonction === f ? colors.primary : colors.border }]}
                      textStyle={[styles.chipText, { color: fonction === f ? "#fff" : colors.foreground }]}
                    />
                  ))}
                </CompactFilterRow>
              </View>

              {/* Message */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Message de présentation</Text>
                <TextInput
                  style={[styles.fieldInput, styles.textArea, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
                  value={message}
                  onChangeText={setMessage}
                  placeholder="Présentez-vous et expliquez votre lien avec cette paroisse…"
                  placeholderTextColor={colors.mutedForeground}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
                <Text style={[styles.charCount, { color: colors.mutedForeground }]}>{message.length} car.</Text>
              </View>

              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                onPress={goToDocs}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryBtnText}>Suivant — Joindre les documents</Text>
                <Feather name="chevron-right" size={16} color="#fff" />
              </TouchableOpacity>
            </>
          )}

          {/* ── STEP 2 : Documents ── */}
          {step === "docs" && (
            <>
              <View style={[styles.modalIconBg, { backgroundColor: colors.primary + "18" }]}>
                <Feather name="file-text" size={28} color={colors.primary} />
              </View>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Documents officiels</Text>
              <Text style={[styles.modalDesc, { color: colors.mutedForeground }]}>
                Ces documents seront vérifiés par notre équipe avant validation.
              </Text>

              {error !== "" && (
                <View style={[styles.errorBox, { backgroundColor: colors.destructive + "18", borderColor: colors.destructive + "44" }]}>
                  <Feather name="alert-circle" size={14} color={colors.destructive} />
                  <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
                </View>
              )}

              {/* Document pickers */}
              {[
                { label: "Carte d'identité *", uri: idCardUri, set: setIdCardUri, required: true },
                { label: "Lettre de mission *", uri: missionUri, set: setMissionUri, required: true },
                { label: "Photo (optionnelle)", uri: photoUri, set: setPhotoUri, required: false },
              ].map(({ label, uri, set, required }) => (
                <View key={label} style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
                  <TouchableOpacity
                    style={[styles.docPicker, { borderColor: uri ? colors.primary : colors.border, backgroundColor: colors.card }]}
                    onPress={() => pickDoc(set)}
                    activeOpacity={0.8}
                  >
                    {uri ? (
                      <View style={styles.docPickerDone}>
                        <Feather name="check-circle" size={20} color={colors.primary} />
                        <Text style={[styles.docPickerText, { color: colors.primary }]}>Document sélectionné</Text>
                        <TouchableOpacity onPress={() => set(null)}>
                          <Feather name="x" size={16} color={colors.mutedForeground} />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={styles.docPickerEmpty}>
                        <Feather name="upload" size={20} color={colors.mutedForeground} />
                        <Text style={[styles.docPickerText, { color: colors.mutedForeground }]}>
                          {required ? "Sélectionner une photo" : "Ajouter une photo (optionnel)"}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              ))}

              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary }, uploading && { opacity: 0.7 }]}
                onPress={handleSubmit}
                disabled={uploading}
                activeOpacity={0.85}
              >
                {uploading ? (
                  <>
                    <ActivityIndicator color="#fff" />
                    <Text style={styles.primaryBtnText}>Envoi en cours…</Text>
                  </>
                ) : (
                  <>
                    <Feather name="send" size={16} color="#fff" />
                    <Text style={styles.primaryBtnText}>Envoyer la demande</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}

          {/* ── STEP 3 : Submitted ── */}
          {step === "submitted" && (
            <>
              <View style={[styles.modalIconBg, { backgroundColor: "#16a34a18" }]}>
                <Feather name="check-circle" size={32} color="#16a34a" />
              </View>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Demande envoyée !</Text>
              <Text style={[styles.modalDesc, { color: colors.mutedForeground }]}>
                Votre dossier pour la paroisse{" "}
                <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>{parish.name}</Text>
                {" "}a été transmis à notre équipe. Vous recevrez une notification dès qu'il aura été examiné.
              </Text>
              <View style={[styles.infoBox, { backgroundColor: colors.accent + "15", borderColor: colors.accent + "44" }]}>
                <Feather name="info" size={14} color={colors.accent} />
                <Text style={[styles.infoText, { color: colors.accent }]}>
                  Délai d'examen habituel : 24 à 72 heures ouvrées.
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: "#16a34a" }]}
                onPress={() => { handleClose(); onSubmitted(); }}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryBtnText}>Fermer</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Report Modal ─────────────────────────────────────────────────────────────

interface ReportModalProps {
  visible: boolean;
  parish: Parish | null;
  onClose: () => void;
}

function ReportModal({ visible, parish, onClose }: ReportModalProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();

  const [selected, setSelected] = useState<string | null>(null);
  const [details, setDetails] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const reset = () => {
    setSelected(null);
    setDetails("");
    setLoading(false);
    setSubmitted(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async () => {
    if (!selected || !user || !parish) return;
    setLoading(true);
    try {
      await addDoc(collection(db, "parishReports"), {
        parishId: parish.id,
        parishName: parish.name,
        reporterUid: user.uid,
        reporterName: profile?.displayName ?? "Anonyme",
        reason: selected,
        details: details.trim(),
        createdAt: serverTimestamp(),
      });
      // Increment report count on the claim
      const claimRef = doc(db, "parishClaims", parish.id);
      const claimSnap = await getDoc(claimRef);
      if (claimSnap.exists()) {
        await updateDoc(claimRef, { reportCount: increment(1) });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  };

  if (!parish) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <ScrollView
        style={[styles.modalContainer, { backgroundColor: colors.background }]}
        contentContainerStyle={{
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 40,
          paddingHorizontal: 24,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
            <Feather name="x" size={22} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {!submitted ? (
          <>
            <View style={[styles.modalIconBg, { backgroundColor: colors.destructive + "18" }]}>
              <Feather name="flag" size={26} color={colors.destructive} />
            </View>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              Signaler une revendication
            </Text>
            <Text style={[styles.modalDesc, { color: colors.mutedForeground }]}>
              Pensez-vous que la paroisse{" "}
              <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>
                {parish.name}
              </Text>{" "}
              est revendiquée par la mauvaise personne ?
            </Text>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginBottom: 10 }]}>
              Motif du signalement
            </Text>
            {REPORT_REASONS.map((reason) => (
              <TouchableOpacity
                key={reason}
                style={[
                  styles.reasonRow,
                  {
                    borderColor: selected === reason ? colors.primary : colors.border,
                    backgroundColor: selected === reason ? colors.primary + "0e" : colors.card,
                  },
                ]}
                onPress={() => setSelected(reason)}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.radioOuter,
                    { borderColor: selected === reason ? colors.primary : colors.border },
                  ]}
                >
                  {selected === reason && (
                    <View style={[styles.radioInner, { backgroundColor: colors.primary }]} />
                  )}
                </View>
                <Text style={[styles.reasonText, { color: colors.foreground }]}>{reason}</Text>
              </TouchableOpacity>
            ))}

            <View style={[styles.fieldGroup, { marginTop: 16 }]}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
                Détails supplémentaires (optionnel)
              </Text>
              <TextInput
                style={[
                  styles.fieldInput,
                  styles.textArea,
                  { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card },
                ]}
                value={details}
                onChangeText={setDetails}
                placeholder="Décrivez le problème..."
                placeholderTextColor={colors.mutedForeground}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>

            <TouchableOpacity
              style={[
                styles.primaryBtn,
                { backgroundColor: colors.destructive },
                (!selected || loading) && { opacity: 0.5 },
              ]}
              onPress={handleSubmit}
              disabled={!selected || loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Feather name="flag" size={16} color="#fff" />
                  <Text style={styles.primaryBtnText}>Envoyer le signalement</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={[styles.modalIconBg, { backgroundColor: "#16a34a18" }]}>
              <Feather name="check-circle" size={32} color="#16a34a" />
            </View>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              Signalement envoyé
            </Text>
            <Text style={[styles.modalDesc, { color: colors.mutedForeground }]}>
              Merci pour votre vigilance. Notre équipe examinera ce signalement dans les plus brefs délais.
            </Text>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: "#16a34a" }]}
              onPress={handleClose}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>Fermer</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </Modal>
  );
}

// ─── AddMassModal ─────────────────────────────────────────────────────────────

interface AddMassModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (entry: Omit<MassEntry, "_key">) => void;
  initial: Omit<MassEntry, "_key"> | null;
}

function AddMassModal({ visible, onClose, onSave, initial }: AddMassModalProps) {
  const { t: translate } = useI18n();
  const [day,  setDay]  = useState("Dimanche");
  const [time, setTime] = useState("10:30");
  const [type, setType] = useState("Messe dominicale");
  const [lieu, setLieu] = useState("");

  useEffect(() => {
    if (initial) {
      setDay(initial.day);
      setTime(initial.time);
      setType(initial.type);
      setLieu(initial.lieu ?? "");
    } else {
      setDay("Dimanche");
      setTime("10:30");
      setType("Messe dominicale");
      setLieu("");
    }
  }, [visible, initial]);

  const handleSave = () => {
    if (!time.trim() || !type.trim()) return;
    onSave({ day, time: time.trim(), type: type.trim(), lieu: lieu.trim() || undefined });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        style={ms.overlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={ms.sheet}>
          {/* Header */}
          <View style={ms.header}>
            <Text style={ms.title}>{initial ? "Modifier l'horaire" : "Ajouter un horaire"}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={20} color="#111111" />
            </TouchableOpacity>
          </View>

          {/* Jour */}
          <Text style={ms.label}>Jour</Text>
          <CompactFilterRow style={{ marginBottom: 16 }}>
            {MASS_DAYS.map((d) => (
              <CompactFilterChip
                key={d}
                label={translate(d)}
                onPress={() => setDay(d)}
                style={[ms.chip, { backgroundColor: day === d ? "#C9A24A" : "#FFF8EC" }]}
                textStyle={[ms.chipText, { color: day === d ? "#fff" : "#111111" }]}
              />
            ))}
          </CompactFilterRow>

          {/* Heure */}
          <TimePickerField
            label="Heure"
            value={time}
            onChange={setTime}
            placeholder="10:30"
            accentColor="#C9A24A"
            borderColor="#EADFCB"
            containerStyle={{ marginBottom: 14 }}
          />

          {/* Type */}
          <Text style={ms.label}>Type de messe</Text>
          <TextInput
            style={ms.input}
            value={type}
            onChangeText={setType}
            placeholder="Messe dominicale…"
            placeholderTextColor="#9AA3B0"
          />

          {/* Lieu */}
          <Text style={ms.label}>Lieu (optionnel)</Text>
          <TextInput
            style={ms.input}
            value={lieu}
            onChangeText={setLieu}
            placeholder="Nef principale, chapelle latérale…"
            placeholderTextColor="#9AA3B0"
          />

          <TouchableOpacity style={ms.saveBtn} onPress={handleSave} activeOpacity={0.85}>
            <Text style={ms.saveBtnText}>{initial ? "Enregistrer" : "Ajouter"}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const ms = StyleSheet.create({
  overlay:     { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  sheet:       { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  header:      { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  title:       { fontSize: 17, fontFamily: "Inter_700Bold", color: "#111111" },
  label:       { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#666666", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 },
  chip:        { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginRight: 8 },
  chipText:    { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  input:       { borderWidth: 1.5, borderColor: "#EADFCB", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, fontFamily: "Inter_400Regular", color: "#111111", marginBottom: 14 },
  saveBtn:     { backgroundColor: "#C9A24A", borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  saveBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ParishesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, profile, updateParish } = useAuth();
  const { t: translate } = useI18n();
  const { requireAuth } = useRequireAuth();
  const { parishId: requestedParishId } = useLocalSearchParams<{ parishId?: string }>();

  const [parishes, setParishes] = useState<Parish[]>([]);
  const parishListRef = React.useRef<FlatList<Parish>>(null);
  useTabScrollToTop(parishListRef);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  const [claimParish, setClaimParish] = useState<Parish | null>(null);
  const [reportParish, setReportParish] = useState<Parish | null>(null);

  // ── Cover photo state ──────────────────────────────────────────────────────
  const [uploadingCoverId, setUploadingCoverId] = useState<string | null>(null);

  const uploadCoverToStorage = async (uri: string, parishId: string): Promise<string> => {
    const resp = await fetch(uri);
    const blob = await resp.blob();
    return uploadToSupabase(blob, `parishes/${parishId}/cover-${Date.now()}.jpg`);
  };

  const _pickAndUploadCover = async (parish: Parish, useCamera: boolean) => {
    if (Platform.OS === "web") {
      // Web : input file (caméra non disponible en tant que telle)
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.style.display = "none";
      if (useCamera) input.capture = "environment";
      document.body.appendChild(input);
      input.addEventListener("change", async () => {
        document.body.removeChild(input);
        const file = input.files?.[0];
        if (!file) return;
        setUploadingCoverId(parish.id);
        try {
          // Passe le File directement — évite fetch(blob:URL) qui gèle iOS Safari
          const url = await uploadToSupabase(file, `parishes/${parish.id}/cover-${Date.now()}.jpg`);
          await updateDoc(doc(db, "parishes", parish.id), { coverPhotoURL: url });
          setParishes((prev) =>
            prev.map((p) => p.id === parish.id ? { ...p, coverPhotoURL: url } : p)
          );
        } catch (err) { Alert.alert("Erreur photo", err instanceof Error ? err.message : "Impossible de téléverser la photo de couverture."); }
        finally { setUploadingCoverId(null); }
      });
      input.click();
      return;
    }

    if (useCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission requise", "Autorisez l'accès à la caméra pour prendre une photo.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: "images",
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.85,
      });
      if (result.canceled) return;
      setUploadingCoverId(parish.id);
      try {
        const url = await uploadCoverToStorage(result.assets[0].uri, parish.id);
        await updateDoc(doc(db, "parishes", parish.id), { coverPhotoURL: url });
        setParishes((prev) =>
          prev.map((p) => p.id === parish.id ? { ...p, coverPhotoURL: url } : p)
        );
      } catch (err) { Alert.alert("Erreur photo", err instanceof Error ? err.message : "Impossible de téléverser la photo de couverture."); }
      finally { setUploadingCoverId(null); }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission requise", "Autorisez l'accès à la galerie pour choisir une photo.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "images",
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.85,
      });
      if (result.canceled) return;
      setUploadingCoverId(parish.id);
      try {
        const url = await uploadCoverToStorage(result.assets[0].uri, parish.id);
        await updateDoc(doc(db, "parishes", parish.id), { coverPhotoURL: url });
        setParishes((prev) =>
          prev.map((p) => p.id === parish.id ? { ...p, coverPhotoURL: url } : p)
        );
      } catch (err) { Alert.alert("Erreur photo", err instanceof Error ? err.message : "Impossible de téléverser la photo de couverture."); }
      finally { setUploadingCoverId(null); }
    }
  };

  const handleCoverPhoto = useCallback(async (parish: Parish, deleteMode = false) => {
    if (deleteMode) {
      await updateDoc(doc(db, "parishes", parish.id), { coverPhotoURL: null });
      setParishes((prev) =>
        prev.map((p) => p.id === parish.id ? { ...p, coverPhotoURL: null } : p)
      );
      return;
    }

    if (Platform.OS === "web") {
      await _pickAndUploadCover(parish, false);
    } else {
      Alert.alert(
        "Photo de couverture",
        "Choisissez une source",
        [
          {
            text: "Appareil photo",
            onPress: () => _pickAndUploadCover(parish, true),
          },
          {
            text: "Galerie",
            onPress: () => _pickAndUploadCover(parish, false),
          },
          { text: "Annuler", style: "cancel" },
        ],
      );
    }
  }, []);

  // ── Card expand state (one card at a time) ────────────────────────────────
  const [cardExpandedId, setCardExpandedId] = useState<string | null>(null);

  const toggleCard = useCallback((id: string) => {
    LayoutAnimation.configureNext({
      duration: 280,
      create: { type: "easeInEaseOut", property: "opacity" },
      update: { type: "easeInEaseOut" },
      delete: { type: "easeInEaseOut", property: "opacity" },
    });
    setCardExpandedId(prev => (prev === id ? null : id));
  }, []);

  // ── Mass schedule state ────────────────────────────────────────────────────
  const [expandedId,      setExpandedId]      = useState<string | null>(null);
  const [massModalParishId, setMassModalParishId] = useState<string | null>(null);
  const [massEditIdx,     setMassEditIdx]     = useState<number | null>(null);
  const [savingSchedId,   setSavingSchedId]   = useState<string | null>(null);
  const [successToast,    setSuccessToast]    = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadParishes = useCallback(async () => {
    setLoading(true);
    try {
      await seedParishes();
      const snap = await getDocs(
        query(collection(db, "parishes"), orderBy("name"))
      );
      setParishes(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Parish)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadParishes(); }, [loadParishes]);
  useEffect(() => {
    const targetParishId =
      (typeof requestedParishId === "string" && requestedParishId) ||
      profile?.parishId ||
      profile?.priestParishId;
    if (loading || !targetParishId || parishes.length === 0) return;

    const targetIndex = parishes.findIndex((parish) => parish.id === targetParishId);
    if (targetIndex < 0) return;

    setCardExpandedId(targetParishId);
    requestAnimationFrame(() => {
      parishListRef.current?.scrollToIndex({
        index: targetIndex,
        animated: false,
        viewPosition: 0.08,
      });
    });
  }, [loading, parishes, profile?.parishId, profile?.priestParishId, requestedParishId]);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadParishes().finally(() => setRefreshing(false));
  }, [loadParishes]);

  const filtered = parishes.filter((p) => {
    const q = normalize(search.trim());
    if (!q) return true;
    return (
      normalize(p.name).includes(q) ||
      normalize(p.city).includes(q) ||
      p.postalCode.includes(q) ||
      normalize(p.address ?? "").includes(q) ||
      normalize(p.diocese ?? "").includes(q) ||
      (p.clochers ?? []).some((c) => normalize(c).includes(q))
    );
  });

  const handleJoin = async (parish: Parish) => {
    if (!user) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setJoiningId(parish.id);
    try {
      await updateDoc(doc(db, "users", user.uid), {
        parishId: parish.id,
        parishName: parish.name,
      });
      if (profile?.parishId !== parish.id) {
        await updateDoc(doc(db, "parishes", parish.id), {
          memberCount: increment(1),
        });
      }
      await updateParish(parish.id, parish.name);
      setParishes((prev) =>
        prev.map((p) =>
          p.id === parish.id ? { ...p, memberCount: p.memberCount + 1 } : p
        )
      );
    } finally {
      setJoiningId(null);
    }
  };

  const handleClaimSubmitted = () => {
    setClaimParish(null);
  };

  // ── Mass schedule helpers ──────────────────────────────────────────────────
  const getSchedule = (parish: Parish): MassEntry[] =>
    (parish.massSchedule ?? []).map((m, i) => ({ ...m, _key: String(i) }));

  const sortedSchedule = (entries: MassEntry[]) =>
    [...entries].sort((a, b) => {
      const dayDiff = (DAY_ORDER[a.day] ?? 99) - (DAY_ORDER[b.day] ?? 99);
      return dayDiff !== 0 ? dayDiff : a.time.localeCompare(b.time);
    });

  const persistSchedule = async (parishId: string, entries: MassEntry[]) => {
    setSavingSchedId(parishId);
    try {
      const payload = entries.map(({ day, time, type, lieu }) =>
        lieu ? { day, time, type, lieu } : { day, time, type }
      );
      await updateDoc(doc(db, "parishes", parishId), { massSchedule: payload });
      setParishes((prev) =>
        prev.map((p) => p.id === parishId ? { ...p, massSchedule: payload } : p)
      );
      setSuccessToast(true);
      setTimeout(() => setSuccessToast(false), 2200);
    } catch {
      Alert.alert("Erreur", "Impossible de sauvegarder les horaires.");
    } finally {
      setSavingSchedId(null);
    }
  };

  const handleAddOrEditMass = async (entry: Omit<MassEntry, "_key">) => {
    if (!massModalParishId) return;
    const parish = parishes.find((p) => p.id === massModalParishId);
    if (!parish) return;
    const current = getSchedule(parish);
    let updated: MassEntry[];
    if (massEditIdx !== null) {
      updated = current.map((m, i) => i === massEditIdx ? { ...entry, _key: m._key } : m);
    } else {
      updated = [...current, { ...entry, _key: Date.now().toString() }];
    }
    setMassEditIdx(null);
    await persistSchedule(massModalParishId, updated);
  };

  const [removeMassTarget, setRemoveMassTarget] = useState<{ parishId: string; idx: number } | null>(null);

  const handleRemoveMass = (parishId: string, idx: number) => {
    setRemoveMassTarget({ parishId, idx });
  };

  const doRemoveMass = async () => {
    if (!removeMassTarget) return;
    const { parishId, idx } = removeMassTarget;
    setRemoveMassTarget(null);
    const parish = parishes.find((p) => p.id === parishId);
    if (!parish) return;
    const updated = getSchedule(parish).filter((_, i) => i !== idx);
    await persistSchedule(parishId, updated);
  };

  const renderParish = ({ item }: { item: Parish }) => {
    const isJoined = profile?.parishId === item.id;
    const isJoining = joiningId === item.id;
    const isMyParish = item.priestUid === user?.uid;
    const isClaimed = item.isClaimed && item.claimStatus === "verified";
    const isMyPriestParish = profile?.role === "priest" && item.priestUid === user?.uid;
    const isCardExpanded = cardExpandedId === item.id;

    // Permission admin/prêtre/parishAdmin pour cette carte
    const canEdit = !!user && (
      profile?.role === "admin" || profile?.role === "super_admin" || profile?.role === "priest" ||
      (profile?.parishId === item.id && (item.parishAdmins ?? []).includes(user.uid))
    ) && (profile?.parishId === item.id || profile?.priestParishId === item.id);

    // Clochers qui ont déclenché le match de recherche (ex. "Beuvrages" → Saint-Jean du Mont d'Anzin)
    const q = normalize(search.trim());
    const matchedClochers =
      q &&
      !normalize(item.name).includes(q) &&
      !normalize(item.city).includes(q) &&
      !item.postalCode.includes(q)
        ? (item.clochers ?? []).filter((c) => normalize(c).includes(q))
        : [];

    // ── Helper: a single info row for the expanded section ──────────────────
    const InfoRow = ({
      icon, label, onPress, color,
    }: {
      icon: string; label: string; onPress?: () => void; color?: string;
    }) => (
      <TouchableOpacity
        style={ed.infoRow}
        onPress={onPress}
        activeOpacity={onPress ? 0.7 : 1}
        disabled={!onPress}
      >
        <View style={[ed.infoIconWrap, { backgroundColor: colors.primary + "12" }]}>
          <Feather name={icon as never} size={14} color={color ?? colors.primary} />
        </View>
        <Text
          style={[ed.infoText, { color: onPress ? colors.primary : colors.foreground }]}
          selectable
        >
          {label}
        </Text>
        {onPress && <Feather name="external-link" size={12} color={colors.primary + "88"} />}
      </TouchableOpacity>
    );

    // ── Helper: a schedule block (title + multiline text) ───────────────────
    const ScheduleBlock = ({ icon, title, text }: { icon: string; title: string; text: string }) => (
      <View style={ed.schedBlock}>
        <View style={ed.schedHeader}>
          <Feather name={icon as never} size={13} color="#C9A24A" />
          <Text style={ed.schedTitle}>{title}</Text>
        </View>
        <Text style={[ed.schedText, { color: colors.mutedForeground }]}>{text}</Text>
      </View>
    );

    return (
      <Card elevated style={styles.parishCard}>
        {/* Cover photo banner — tappable to toggle card */}
        <TouchableOpacity
          onPress={() => toggleCard(item.id)}
          activeOpacity={0.92}
          style={cv.bannerWrap}
        >
          {item.coverPhotoURL ? (
            <ExpoImage
              source={{ uri: item.coverPhotoURL }}
              style={cv.bannerImg}
              contentFit="cover"
            />
          ) : (
            <ExpoImage
              source={require("@/assets/images/cover-default.png")}
              style={cv.bannerImg}
              contentFit="cover"
            />
          )}
          {uploadingCoverId === item.id && (
            <View style={cv.bannerOverlay}>
              <ActivityIndicator color="#fff" size="large" />
            </View>
          )}
          {canEdit && uploadingCoverId !== item.id && (
            <View style={cv.bannerActions}>
              <TouchableOpacity
                style={cv.bannerBtn}
                onPress={(e) => { e.stopPropagation?.(); handleCoverPhoto(item); }}
                activeOpacity={0.85}
              >
                <Feather name="camera" size={13} color="#fff" />
                <Text style={cv.bannerBtnText}>
                  {item.coverPhotoURL ? "Modifier" : "Ajouter une photo"}
                </Text>
              </TouchableOpacity>
              {!!item.coverPhotoURL && (
                <TouchableOpacity
                  style={[cv.bannerBtn, cv.bannerBtnDanger]}
                  onPress={(e) => { e.stopPropagation?.(); handleCoverPhoto(item, true); }}
                  activeOpacity={0.85}
                >
                  <Feather name="trash-2" size={13} color="#fff" />
                </TouchableOpacity>
              )}
            </View>
          )}
        </TouchableOpacity>

        {/* Header row — tappable to toggle card */}
        <TouchableOpacity
          onPress={() => toggleCard(item.id)}
          activeOpacity={0.8}
          style={styles.parishHeader}
        >
          <View style={[styles.parishIconBg, { backgroundColor: colors.primary + "18" }]}>
            <Feather name="map-pin" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.parishName, { color: colors.foreground }]}>
              {item.name}
            </Text>
            <Text style={[styles.parishLocation, { color: colors.mutedForeground }]}>
              {item.city} · {item.postalCode}
            </Text>
          </View>
          {isJoined && !isMyPriestParish && (
            <View style={[styles.badge, { backgroundColor: colors.accent + "22", borderColor: colors.accent + "55" }]}>
              <Feather name="check" size={11} color={colors.accent} />
              <Text style={[styles.badgeText, { color: colors.accent }]}>Ma paroisse</Text>
            </View>
          )}
          {isMyPriestParish && (
            <View style={[styles.badge, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "44" }]}>
              <Feather name="shield" size={11} color={colors.primary} />
              <Text style={[styles.badgeText, { color: colors.primary }]}>Mon église</Text>
            </View>
          )}
          <Feather
            name={isCardExpanded ? "chevron-up" : "chevron-down"}
            size={18}
            color={colors.mutedForeground}
            style={{ marginLeft: 4 }}
          />
        </TouchableOpacity>

        {/* Description — 3 lignes max en mode fermé, complète en mode ouvert */}
        <Text
          style={[styles.parishDesc, { color: colors.mutedForeground }]}
          numberOfLines={isCardExpanded ? undefined : 3}
        >
          {item.description}
        </Text>

        {/* Communes correspondant à la recherche (clochers) */}
        {matchedClochers.length > 0 && (
          <View style={[styles.clocherMatchRow, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "30" }]}>
            <Feather name="map-pin" size={11} color={colors.primary} />
            <Text style={[styles.clocherMatchText, { color: colors.primary }]} numberOfLines={1}>
              {matchedClochers.length === 1
                ? `Commune couverte : ${matchedClochers[0]}`
                : `Communes couvertes : ${matchedClochers.join(", ")}`}
            </Text>
          </View>
        )}

        {/* Priest claim badge */}
        {isClaimed && (
          <View style={[styles.priestRow, { backgroundColor: colors.secondary, borderRadius: 8 }]}>
            <Feather name="shield" size={13} color={isMyParish ? colors.primary : colors.mutedForeground} />
            <Text style={[styles.priestText, { color: isMyParish ? colors.primary : colors.mutedForeground }]}>
              {isMyParish
                ? `Géré par vous`
                : `Prêtre : ${item.priestName ?? "Vérifié"}`}
            </Text>
            {!isMyParish && (
              <TouchableOpacity
                style={[styles.reportBtn, { borderColor: colors.destructive + "44" }]}
                onPress={() => requireAuth(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setReportParish(item); })}
                activeOpacity={0.8}
              >
                <Feather name="flag" size={11} color={colors.destructive} />
                <Text style={[styles.reportBtnText, { color: colors.destructive }]}>Signaler</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── Bouton « Voir les informations » — visible seulement en mode fermé ── */}
        {!isCardExpanded && (
          <TouchableOpacity
            style={[ed.seeMoreBtn, { borderColor: colors.primary + "30", backgroundColor: colors.primary + "08" }]}
            onPress={() => toggleCard(item.id)}
            activeOpacity={0.8}
          >
            <Feather name="info" size={13} color={colors.primary} />
            <Text style={[ed.seeMoreText, { color: colors.primary }]}>Voir les informations</Text>
            <Feather name="chevron-down" size={13} color={colors.primary} />
          </TouchableOpacity>
        )}

        {/* ── Section dépliée — contact + horaires complets ── */}
        {isCardExpanded && (
          <View style={[ed.expandedSection, { borderTopColor: colors.border }]}>

            {/* Bloc contact */}
            {(item.address || item.phone || item.email || item.website ||
              (isClaimed && item.priestName && !isMyParish)) && (
              <View style={ed.group}>
                <Text style={[ed.groupTitle, { color: colors.mutedForeground }]}>Contact</Text>
                {item.address  && <InfoRow icon="map-pin" label={item.address} />}
                {item.phone    && (
                  <InfoRow
                    icon="phone"
                    label={item.phone}
                    onPress={() => Linking.openURL(`tel:${item.phone!.replace(/\s/g, "")}`)}
                  />
                )}
                {item.email    && (
                  <InfoRow
                    icon="mail"
                    label={item.email}
                    onPress={() => Linking.openURL(`mailto:${item.email}`)}
                  />
                )}
                {item.website  && (
                  <InfoRow
                    icon="globe"
                    label={item.website.replace(/^https?:\/\//, "")}
                    onPress={() => Linking.openURL(item.website!)}
                  />
                )}
                {isClaimed && item.priestName && !isMyParish && (
                  <InfoRow icon="user" label={item.priestName} />
                )}
              </View>
            )}

            {/* Bloc horaires complémentaires */}
            {(item.massSchedulesText || item.confessionSchedules ||
              item.adorationSchedules || item.permanenceSchedules) && (
              <View style={ed.group}>
                <Text style={[ed.groupTitle, { color: colors.mutedForeground }]}>Horaires</Text>
                {item.massSchedulesText    && (
                  <ScheduleBlock icon="clock"    title="Messes"      text={item.massSchedulesText} />
                )}
                {item.confessionSchedules  && (
                  <ScheduleBlock icon="shield"   title="Confessions" text={item.confessionSchedules} />
                )}
                {item.adorationSchedules   && (
                  <ScheduleBlock icon="sun"      title="Adoration"   text={item.adorationSchedules} />
                )}
                {item.permanenceSchedules  && (
                  <ScheduleBlock icon="calendar" title="Permanences" text={item.permanenceSchedules} />
                )}
              </View>
            )}

            {/* Bloc clochers / églises */}
            {(item.clochers ?? []).length > 0 && (
              <View style={ed.group}>
                <Text style={[ed.groupTitle, { color: colors.mutedForeground }]}>
                  Églises rattachées
                </Text>
                <View style={ed.clocherList}>
                  {item.clochers!.map((c, i) => (
                    <View key={i} style={[ed.clocherChip, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "28" }]}>
                      <Feather name="home" size={10} color={colors.primary} />
                      <Text style={[ed.clocherChipText, { color: colors.primary }]}>{c}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
        )}

        {/* ── Horaires des messes (section existante, toujours visible) ── */}
        {(() => {
          const schedule   = sortedSchedule(getSchedule(item));
          const isExpanded = expandedId === item.id;
          const isSaving   = savingSchedId === item.id;

          return (
            <View style={hs.wrapper}>
              {/* Section header */}
              <TouchableOpacity
                style={hs.toggle}
                onPress={() => setExpandedId(isExpanded ? null : item.id)}
                activeOpacity={0.8}
              >
                <View style={hs.toggleLeft}>
                  <Feather name="clock" size={14} color="#C9A24A" />
                  <Text style={hs.toggleLabel}>Horaires des messes</Text>
                  {schedule.length > 0 && (
                    <View style={hs.countPill}>
                      <Text style={hs.countText}>{schedule.length}</Text>
                    </View>
                  )}
                </View>
                <View style={hs.toggleRight}>
                  {canEdit && (
                    <TouchableOpacity
                      style={hs.addBtn}
                      onPress={() => {
                        setMassModalParishId(item.id);
                        setMassEditIdx(null);
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Feather name="plus" size={13} color="#C9A24A" />
                      <Text style={hs.addBtnText}>Ajouter</Text>
                    </TouchableOpacity>
                  )}
                  <Feather
                    name={isExpanded ? "chevron-up" : "chevron-down"}
                    size={16}
                    color="#666666"
                  />
                </View>
              </TouchableOpacity>

              {/* Expanded schedule list */}
              {isExpanded && (
                <View style={hs.list}>
                  {isSaving && (
                    <View style={hs.savingRow}>
                      <ActivityIndicator size="small" color="#C9A24A" />
                      <Text style={hs.savingText}>Sauvegarde…</Text>
                    </View>
                  )}

                  {schedule.length === 0 ? (
                    <View style={hs.emptyRow}>
                      <Text style={hs.emptyText}>Aucun horaire défini</Text>
                      {canEdit && (
                        <TouchableOpacity
                          onPress={() => { setMassModalParishId(item.id); setMassEditIdx(null); }}
                        >
                          <Text style={hs.emptyAdd}>+ Ajouter</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ) : (
                    schedule.map((entry, idx) => (
                      <View key={entry._key} style={hs.entryRow}>
                        {/* Time bubble */}
                        <View style={hs.timeBubble}>
                          <Text style={hs.timeText}>{entry.time}</Text>
                        </View>

                        {/* Info */}
                        <View style={hs.entryInfo}>
                          <Text style={hs.entryType}>{entry.type}</Text>
                          <Text style={hs.entryMeta}>
                            {entry.day}{entry.lieu ? ` · ${entry.lieu}` : ""}
                          </Text>
                        </View>

                        {/* Edit / delete buttons — prêtre/admin only */}
                        {canEdit && (
                          <View style={hs.entryActions}>
                            <TouchableOpacity
                              onPress={() => { setMassModalParishId(item.id); setMassEditIdx(idx); }}
                              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            >
                              <Feather name="edit-2" size={14} color="#9AA3B0" />
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => handleRemoveMass(item.id, idx)}
                              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            >
                              <Feather name="trash-2" size={14} color="#F87171" />
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    ))
                  )}
                </View>
              )}
            </View>
          );
        })()}

        {/* ── Bouton « Réduire » — visible seulement en mode ouvert ── */}
        {isCardExpanded && (
          <TouchableOpacity
            style={[ed.collapseBtn, { borderColor: colors.border }]}
            onPress={() => toggleCard(item.id)}
            activeOpacity={0.8}
          >
            <Feather name="chevron-up" size={14} color={colors.mutedForeground} />
            <Text style={[ed.collapseText, { color: colors.mutedForeground }]}>Réduire</Text>
          </TouchableOpacity>
        )}

        {/* Footer actions */}
        <View style={styles.parishFooter}>
          <View style={styles.memberCount}>
            <Feather name="users" size={13} color={colors.mutedForeground} />
            <Text style={[styles.memberCountText, { color: colors.mutedForeground }]}>
              {item.memberCount} {item.memberCount === 1 ? "membre" : "membres"}
            </Text>
          </View>

          <View style={styles.footerActions}>
            {/* Priest claim button — only if parish is NOT already claimed verified */}
            {!isClaimed && !isMyPriestParish && (
              <TouchableOpacity
                style={[styles.priestClaimBtn, { borderColor: colors.accent + "66" }]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setClaimParish(item); }}
                activeOpacity={0.8}
              >
                <Feather name="shield" size={12} color={colors.accent} />
                <Text style={[styles.priestClaimText, { color: colors.accent }]}>
                  Je suis le prêtre
                </Text>
              </TouchableOpacity>
            )}

            {/* Join button */}
            {!isJoined && (
              <TouchableOpacity
                style={[styles.joinBtn, { backgroundColor: colors.primary }]}
                onPress={() => handleJoin(item)}
                activeOpacity={0.85}
                disabled={!!joiningId}
              >
                {isJoining ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Feather name="user-plus" size={13} color="#fff" />
                    <Text style={styles.joinBtnText}>Rejoindre</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Card>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {!user && <GuestBanner />}
      {/* Search bar */}
      <View
        style={[
          styles.searchBar,
          { backgroundColor: colors.card, borderColor: colors.border, marginTop: 12, marginHorizontal: 16 },
        ]}
      >
        <Feather name="search" size={18} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
          placeholder="Nom, commune ou code postal…"
          placeholderTextColor={colors.mutedForeground}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {search !== "" && (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Feather name="x" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          ref={parishListRef}
          data={filtered}
          keyExtractor={(p) => p.id}
          renderItem={renderParish}
          contentContainerStyle={{
            padding: 16,
            gap: 12,
            paddingBottom: insets.bottom + 100,
          }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#C9A24A" colors={["#C9A24A"]} />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="map-pin" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Aucune paroisse trouvée
              </Text>
            </View>
          }
        />
      )}

      <ClaimModal
        visible={claimParish !== null}
        parish={claimParish}
        onClose={() => setClaimParish(null)}
        onSubmitted={handleClaimSubmitted}
        currentUserName={profile?.displayName ?? ""}
      />

      <ReportModal
        visible={reportParish !== null}
        parish={reportParish}
        onClose={() => setReportParish(null)}
      />

      {/* Mass schedule modal */}
      <AddMassModal
        visible={massModalParishId !== null}
        onClose={() => { setMassModalParishId(null); setMassEditIdx(null); }}
        onSave={handleAddOrEditMass}
        initial={
          massModalParishId !== null && massEditIdx !== null
            ? (() => {
                const parish = parishes.find((p) => p.id === massModalParishId);
                if (!parish) return null;
                const sched = getSchedule(parish);
                return sched[massEditIdx] ?? null;
              })()
            : null
        }
      />

      <ConfirmSheet
        visible={removeMassTarget !== null}
        title="Supprimer cet horaire ?"
        confirmLabel="Supprimer"
        confirmColor="#D32F2F"
        cancelLabel="Annuler"
        icon="trash-2"
        onConfirm={doRemoveMass}
        onCancel={() => setRemoveMassTarget(null)}
      />
      {/* Success toast */}
      {successToast && (
        <View style={hs.toast} pointerEvents="none">
          <Feather name="check-circle" size={16} color="#16a34a" />
          <Text style={hs.toastText}>Horaires mis à jour</Text>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 12 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    marginBottom: 4,
  },
  searchInput: { flex: 1, fontSize: 15 },
  parishCard: { gap: 10 },
  parishHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  parishIconBg: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  parishName: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  parishLocation: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  badge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 20, borderWidth: 1,
  },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  parishDesc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  clocherMatchRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 8, paddingVertical: 5,
    borderRadius: 8, borderWidth: 1, marginTop: 4,
  },
  clocherMatchText: { flex: 1, fontSize: 11, fontFamily: "Inter_500Medium" },
  priestRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  priestText: { flex: 1, fontSize: 12, fontFamily: "Inter_500Medium" },
  reportBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 12, borderWidth: 1,
  },
  reportBtnText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  parishFooter: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  memberCount: { flexDirection: "row", alignItems: "center", gap: 5 },
  memberCountText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  footerActions: { flexDirection: "row", gap: 8, alignItems: "center" },
  priestClaimBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1.5,
  },
  priestClaimText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  joinBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
  },
  joinBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular" },

  // Modal
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  modalStepLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
  closeBtn: { padding: 8 },
  modalIconBg: {
    width: 64, height: 64, borderRadius: 32,
    alignItems: "center", justifyContent: "center",
    alignSelf: "center", marginBottom: 16,
  },
  modalTitle: {
    fontSize: 22, fontFamily: "Inter_700Bold",
    textAlign: "center", marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 14, fontFamily: "Inter_400Regular",
    textAlign: "center", marginBottom: 8,
  },
  modalDesc: {
    fontSize: 14, fontFamily: "Inter_400Regular",
    textAlign: "center", lineHeight: 21, marginBottom: 20,
  },
  fieldGroup: { marginBottom: 14 },
  fieldLabel: {
    fontSize: 12, fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6,
  },
  fieldInput: {
    borderWidth: 1.5, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, fontFamily: "Inter_400Regular",
  },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  codeInput: {
    borderWidth: 2, borderRadius: 14,
    paddingVertical: 18,
    fontSize: 36, letterSpacing: 16,
    marginBottom: 20, alignSelf: "stretch",
  },
  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 14,
    borderRadius: 12, marginTop: 8,
  },
  primaryBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  linkBtn: { alignItems: "center", marginTop: 14, paddingVertical: 6 },
  linkBtnText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  errorBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    borderWidth: 1, borderRadius: 8,
    padding: 12, marginBottom: 14,
  },
  errorText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  devNote: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    borderWidth: 1, borderRadius: 8,
    padding: 12, marginBottom: 14,
  },
  devNoteText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },

  // Claim form extras
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, marginRight: 8 },
  chipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  charCount: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "right", marginTop: 4 },
  docPicker: { borderWidth: 1.5, borderRadius: 12, padding: 16, borderStyle: "dashed" },
  docPickerDone: { flexDirection: "row", alignItems: "center", gap: 10 },
  docPickerEmpty: { flexDirection: "row", alignItems: "center", gap: 10 },
  docPickerText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  infoBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 14 },
  infoText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },

  // Report modal
  reasonRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderWidth: 1.5, borderRadius: 10,
    padding: 14, marginBottom: 8,
  },
  radioOuter: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, alignItems: "center", justifyContent: "center",
  },
  radioInner: { width: 10, height: 10, borderRadius: 5 },
  reasonText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
});

// ─── Cover photo banner styles ────────────────────────────────────────────────
const cv = StyleSheet.create({
  bannerWrap: {
    borderRadius: 12,
    overflow: "hidden",
    height: 150,
    marginBottom: 10,
    backgroundColor: "#EDE0C8",
  },
  bannerImg: {
    width: "100%",
    height: "100%",
  },
  bannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  bannerActions: {
    position: "absolute",
    bottom: 8,
    right: 8,
    flexDirection: "row",
    gap: 6,
  },
  bannerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  bannerBtnDanger: {
    backgroundColor: "rgba(220,38,38,0.72)",
  },
  bannerBtnText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});

// ─── Horaires des messes styles ───────────────────────────────────────────────
const hs = StyleSheet.create({
  wrapper: {
    borderTopWidth: 1,
    borderTopColor: "#EADFCB",
    marginTop: 4,
    paddingTop: 4,
  },
  toggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  toggleLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  toggleLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#111111" },
  countPill: {
    backgroundColor: "#C9A24A20",
    borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1,
  },
  countText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#C9A24A" },
  toggleRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 3 },
  addBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#C9A24A" },

  list: { gap: 6, paddingBottom: 4 },
  savingRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  savingText: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#666666" },

  emptyRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#9AA3B0" },
  emptyAdd: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#C9A24A" },

  entryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FFF8EC",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  timeBubble: {
    backgroundColor: "#C9A24A",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 50,
    alignItems: "center",
  },
  timeText:   { fontSize: 13, fontFamily: "Inter_700Bold", color: "#fff" },
  entryInfo:  { flex: 1 },
  entryType:  { fontSize: 13, fontFamily: "Inter_500Medium", color: "#111111" },
  entryMeta:  { fontSize: 11, fontFamily: "Inter_400Regular", color: "#666666", marginTop: 1 },
  entryActions: { flexDirection: "row", gap: 10 },

  toast: {
    position: "absolute",
    bottom: 100,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: "#D1FAE5",
  },
  toastText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#16a34a" },
});

// ─── Styles de la section dépliée ─────────────────────────────────────────────
const ed = StyleSheet.create({
  // Bouton « Voir les informations » (carte fermée)
  seeMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 2,
  },
  seeMoreText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },

  // Section dépliée
  expandedSection: {
    borderTopWidth: 1,
    marginTop: 6,
    paddingTop: 12,
    gap: 14,
  },

  // Groupe (Contact, Horaires, Églises)
  group: { gap: 6 },
  groupTitle: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 2,
  },

  // Ligne d'information (adresse, téléphone, etc.)
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  infoIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },

  // Bloc horaire (confession, adoration, permanences)
  schedBlock: {
    gap: 4,
    paddingLeft: 4,
  },
  schedHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  schedTitle: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#C9A24A",
  },
  schedText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
    paddingLeft: 19,
  },

  // Clochers (chips)
  clocherList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  clocherChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  clocherChipText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },

  // Bouton « Réduire » (carte ouverte)
  collapseBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderTopWidth: 1,
    paddingTop: 10,
    marginTop: 4,
  },
  collapseText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
});
