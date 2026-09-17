import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { ConfirmSheet } from "@/components/ConfirmSheet";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import {
  deleteUser,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from "firebase/auth";
import { doc, deleteDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";

const GOLD    = "#C9A24A";
const DARK    = "#111111";
const CREAM   = "#FFF8EC";
const BORDER  = "#EADFCB";
const MUTED   = "#666666";
const DANGER  = "#DC2626";

// ─── Section row ─────────────────────────────────────────────────────────────
interface RowProps {
  icon: string;
  label: string;
  description?: string;
  onPress: () => void;
  danger?: boolean;
  loading?: boolean;
}

function ActionRow({ icon, label, description, onPress, danger, loading }: RowProps) {
  const color = danger ? DANGER : GOLD;
  return (
    <TouchableOpacity style={s.row} onPress={onPress} activeOpacity={0.7}>
      <View style={[s.rowIcon, { backgroundColor: color + "18" }]}>
        {loading
          ? <ActivityIndicator size="small" color={color} />
          : <Feather name={icon as never} size={18} color={color} />}
      </View>
      <View style={s.rowText}>
        <Text style={[s.rowLabel, danger && { color: DANGER }]}>{label}</Text>
        {description ? <Text style={s.rowDesc}>{description}</Text> : null}
      </View>
      {!loading && <Feather name="chevron-right" size={16} color={MUTED} />}
    </TouchableOpacity>
  );
}

// ─── Reauth modal ─────────────────────────────────────────────────────────────
function ReauthModal({
  visible,
  email,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  email: string;
  onCancel: () => void;
  onConfirm: (password: string) => void;
}) {
  const [password, setPassword] = useState("");
  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView
        style={s.modalOverlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={s.modalSheet}>
          <Text style={s.modalTitle}>Confirmer votre identité</Text>
          <Text style={s.modalSub}>
            Pour des raisons de sécurité, saisissez votre mot de passe avant de supprimer votre compte.
          </Text>
          <TextInput
            style={s.modalInput}
            placeholder="Mot de passe"
            placeholderTextColor={MUTED}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={[s.modalBtn, { backgroundColor: DANGER }]}
            onPress={() => { onConfirm(password); setPassword(""); }}
            activeOpacity={0.85}
          >
            <Text style={s.modalBtnText}>Supprimer définitivement</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.modalCancel} onPress={() => { onCancel(); setPassword(""); }}>
            <Text style={s.modalCancelText}>Annuler</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function ConfidentialiteScreen() {
  const insets = useSafeAreaInsets();
  const { user, logOut, resetPassword } = useAuth();
  const [sendingReset, setSendingReset]           = useState(false);
  const [showReauth, setShowReauth]               = useState(false);
  const [deleting, setDeleting]                   = useState(false);
  const [pendingPasswordReset, setPendingReset]   = useState(false);
  const [pendingDeleteAccount, setPendingDelete]  = useState(false);

  // ── Mot de passe ──────────────────────────────────────────────────────────
  const handlePasswordReset = () => {
    if (!user?.email) return;
    setPendingReset(true);
  };

  const doPasswordReset = async () => {
    setPendingReset(false);
    setSendingReset(true);
    try {
      await resetPassword(user!.email!);
      Alert.alert("E-mail envoyé", "Consultez votre boîte mail pour réinitialiser votre mot de passe.");
    } catch {
      Alert.alert("Erreur", "Impossible d'envoyer l'e-mail. Réessayez.");
    } finally {
      setSendingReset(false);
    }
  };

  // ── Supprimer le compte ────────────────────────────────────────────────────
  const handleDeleteAccount = () => {
    setPendingDelete(true);
  };

  const confirmDelete = async (password: string) => {
    if (!user || !user.email) return;
    setShowReauth(false);
    setDeleting(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, password);
      await reauthenticateWithCredential(user, credential);
      await deleteDoc(doc(db, "users", user.uid));
      await deleteUser(user);
      await logOut();
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? "";
      const msg = code.includes("wrong-password") || code.includes("invalid-credential")
        ? "Mot de passe incorrect. Réessayez."
        : "Impossible de supprimer le compte. Réessayez.";
      Alert.alert("Erreur", msg);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 4, borderBottomColor: BORDER }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="arrow-left" size={22} color={DARK} />
        </TouchableOpacity>
        <Text style={s.title}>Confidentialité</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Compte */}
        <Animated.View entering={FadeInDown.delay(40).duration(380)}>
          <Text style={s.sectionTitle}>Mon compte</Text>
          <View style={s.card}>
            <ActionRow
              icon="lock"
              label="Modifier le mot de passe"
              description="Un e-mail de réinitialisation vous sera envoyé"
              onPress={handlePasswordReset}
              loading={sendingReset}
            />
            <View style={s.divider} />
            <ActionRow
              icon="trash-2"
              label="Supprimer mon compte"
              description="Action irréversible — toutes les données seront perdues"
              onPress={handleDeleteAccount}
              danger
              loading={deleting}
            />
          </View>
        </Animated.View>

        {/* Légal */}
        <Animated.View entering={FadeInDown.delay(100).duration(380)}>
          <Text style={s.sectionTitle}>Légal</Text>
          <View style={s.card}>
            <ActionRow
              icon="file-text"
              label="Politique de confidentialité"
              onPress={() => router.push("/politique-confidentialite")}
            />
            <View style={s.divider} />
            <ActionRow
              icon="book-open"
              label="Conditions d'utilisation"
              onPress={() => router.push("/cgu")}
            />
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(160).duration(380)}>
          <View style={s.note}>
            <Feather name="shield" size={14} color={MUTED} style={{ marginTop: 2 }} />
            <Text style={s.noteText}>
              Vos données sont protégées et ne sont jamais partagées avec des tiers sans votre consentement.
            </Text>
          </View>
        </Animated.View>
      </ScrollView>

      <ConfirmSheet
        visible={pendingPasswordReset}
        title="Modifier le mot de passe"
        message={`Un e-mail de réinitialisation sera envoyé à :\n${user?.email ?? ""}`}
        confirmLabel="Envoyer"
        cancelLabel="Annuler"
        icon="mail"
        onConfirm={doPasswordReset}
        onCancel={() => setPendingReset(false)}
      />
      <ConfirmSheet
        visible={pendingDeleteAccount}
        title="Supprimer le compte"
        message="Cette action est irréversible. Toutes vos données seront définitivement supprimées."
        confirmLabel="Continuer"
        confirmColor="#D32F2F"
        cancelLabel="Annuler"
        icon="trash-2"
        onConfirm={() => { setPendingDelete(false); setShowReauth(true); }}
        onCancel={() => setPendingDelete(false)}
      />
      <ReauthModal
        visible={showReauth}
        email={user?.email ?? ""}
        onCancel={() => setShowReauth(false)}
        onConfirm={confirmDelete}
      />
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

  sectionTitle: {
    fontSize: 11, fontFamily: "Inter_600SemiBold",
    color: MUTED, textTransform: "uppercase", letterSpacing: 0.8,
    marginHorizontal: 16, marginTop: 24, marginBottom: 8,
  },
  card: {
    marginHorizontal: 16,
    backgroundColor: "#fff",
    borderRadius: 16, borderWidth: 1, borderColor: BORDER,
    overflow: "hidden",
    shadowColor: BORDER, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5, shadowRadius: 6, elevation: 2,
  },
  row: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  rowIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
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

  // Modal
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  modalSheet: {
    backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40,
  },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: DARK, marginBottom: 8 },
  modalSub:   { fontSize: 14, fontFamily: "Inter_400Regular", color: MUTED, lineHeight: 20, marginBottom: 20 },
  modalInput: {
    borderWidth: 1.5, borderColor: BORDER, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, fontFamily: "Inter_400Regular", color: DARK, marginBottom: 16,
  },
  modalBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center", marginBottom: 12 },
  modalBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
  modalCancel: { alignItems: "center", paddingVertical: 8 },
  modalCancelText: { fontSize: 15, fontFamily: "Inter_500Medium", color: MUTED },
});
