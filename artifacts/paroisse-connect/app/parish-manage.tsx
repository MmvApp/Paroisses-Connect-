import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { ConfirmSheet } from "@/components/ConfirmSheet";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  arrayRemove,
  arrayUnion,
  collection,
  getDocs,
  query,
  updateDoc,
  where,
  doc,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { useParishPermissions, AdminProfile } from "@/hooks/useParishPermissions";
import { ClaimsSummary } from "@/components/ui/ClaimsSummary";

// ─── Palette ──────────────────────────────────────────────────────────────────
const GOLD   = "#C9A24A";
const DARK   = "#111111";
const CREAM  = "#FFF8EC";
const BORDER = "#EADFCB";
const MUTED  = "#666666";
const RED    = "#EF4444";
const GREEN  = "#16A34A";

// ─── Management cards ─────────────────────────────────────────────────────────
const MANAGE_ITEMS = [
  { icon: "clock",       label: "Horaires des messes",  route: "/mass-schedule", desc: "Gérer les célébrations" },
  { icon: "users",       label: "Groupes",              route: "/groups",        desc: "Groupes de la paroisse" },
  { icon: "bell",        label: "Annonces",             route: "/(tabs)/announcements", desc: "Publier des annonces" },
  { icon: "calendar",    label: "Événements",           route: "/(tabs)/events", desc: "Créer des événements" },
  { icon: "heart",       label: "Aide mutuelle",        route: "/mutual-aid",    desc: "Demandes d'aide" },
  { icon: "user-check",  label: "Membres",              route: "/parish-admin",  desc: "Gérer les paroissiens" },
] as const;

// ─── Add admin modal ──────────────────────────────────────────────────────────
function AddAdminModal({
  visible, onClose, onAdd, existing,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (profile: AdminProfile) => Promise<void>;
  existing: string[];
}) {
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleAdd = async () => {
    if (!email.trim()) { setError("Saisissez un e-mail."); return; }
    setSaving(true);
    setError("");
    try {
      const q = query(collection(db, "users"), where("email", "==", email.trim().toLowerCase()));
      const snap = await getDocs(q);
      if (snap.empty) { setError("Aucun utilisateur trouvé avec cet e-mail."); return; }
      const userData = snap.docs[0].data();
      const uid = snap.docs[0].id;
      if (existing.includes(uid)) { setError("Cet utilisateur est déjà admin."); return; }
      await onAdd({ uid, displayName: userData.displayName ?? "Utilisateur", email: userData.email ?? email.trim() });
      setEmail("");
      onClose();
    } catch { setError("Erreur lors de la recherche. Réessayez."); }
    finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={am.overlay} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={am.sheet}>
          <View style={am.header}>
            <Text style={am.title}>Nommer un admin paroissial</Text>
            <TouchableOpacity onPress={onClose}><Feather name="x" size={20} color={DARK} /></TouchableOpacity>
          </View>
          <Text style={am.hint}>
            Saisissez l'adresse e-mail du compte Paroisse Connect de la personne à nommer comme administratrice de votre paroisse.
          </Text>
          <Text style={am.label}>Adresse e-mail</Text>
          <TextInput
            style={[am.input, error ? { borderColor: RED } : null]}
            value={email}
            onChangeText={(t) => { setEmail(t); setError(""); }}
            placeholder="prenom.nom@email.fr"
            placeholderTextColor="#9AA3B0"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {error ? <Text style={am.error}>{error}</Text> : null}
          <TouchableOpacity
            style={[am.btn, { backgroundColor: GOLD, opacity: saving ? 0.7 : 1 }]}
            onPress={handleAdd} disabled={saving} activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator size="small" color={DARK} />
              : <Text style={am.btnText}>Nommer comme admin</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ParishManageScreen() {
  const insets  = useSafeAreaInsets();
  const { profile } = useAuth();
  const {
    userParishId, canManage, canManageAdmins,
    isSuperAdmin, isPriest, isParishAdmin,
    canViewClaims, canReviewClaims, claimsDelegatedToAdmins,
    parishAdmins, parishAdminProfiles, loading,
  } = useParishPermissions();

  const [showAddAdmin, setShowAddAdmin]             = useState(false);
  const [removingUid,  setRemovingUid]              = useState<string | null>(null);
  const [removeAdminTarget, setRemoveAdminTarget]   = useState<AdminProfile | null>(null);
  const [savingClaimDelegation, setSavingClaimDelegation] = useState(false);

  const roleLabel = isSuperAdmin ? "Super administrateur"
    : isPriest    ? "Prêtre responsable"
    : isParishAdmin ? "Administrateur paroissial"
    : "";

  // ── Guard ────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={GOLD} />
      </View>
    );
  }

  if (!userParishId || !canManage) {
    return (
      <View style={[s.root, { backgroundColor: "#FFFFFF" }]}>
        <View style={[s.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Feather name="arrow-left" size={22} color={DARK} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Gestion de ma paroisse</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={s.emptyWrap}>
          <Feather name="lock" size={32} color={BORDER} />
          <Text style={s.emptyTitle}>Accès restreint</Text>
          <Text style={s.emptySub}>Cette page est réservée au prêtre responsable et aux admins paroissiaux.</Text>
        </View>
      </View>
    );
  }

  // ── Add parish admin ─────────────────────────────────────────────────────────
  const handleAddAdmin = async (adminProfile: AdminProfile) => {
    if (!userParishId) return;
    const batch = writeBatch(db);
    batch.update(doc(db, "parishes", userParishId), {
      parishAdmins: arrayUnion(adminProfile.uid),
      parishAdminProfiles: arrayUnion(adminProfile),
    });
    batch.update(doc(db, "users", adminProfile.uid), {
      role: "admin",
      parishId: userParishId,
      parishName: profile?.parishName ?? null,
    });
    await batch.commit();
  };

  // ── Remove parish admin ──────────────────────────────────────────────────────
  const handleRemoveAdmin = (admin: AdminProfile) => {
    setRemoveAdminTarget(admin);
  };

  const doRemoveAdmin = async () => {
    if (!removeAdminTarget) return;
    setRemovingUid(removeAdminTarget.uid);
    setRemoveAdminTarget(null);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "parishes", userParishId!), {
        parishAdmins: arrayRemove(removeAdminTarget.uid),
        parishAdminProfiles: arrayRemove(removeAdminTarget),
      });
      batch.update(doc(db, "users", removeAdminTarget.uid), { role: "member" });
      await batch.commit();
    } catch { Alert.alert("Erreur", "Impossible de retirer cet admin."); }
    finally { setRemovingUid(null); }
  };

  return (
    <View style={[s.root, { backgroundColor: "#F8F8F5" }]}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: "#FFFFFF", borderBottomColor: BORDER, paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="arrow-left" size={22} color={DARK} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Gestion de ma paroisse</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Role banner */}
        <View style={[s.roleBanner, { backgroundColor: GOLD + "18", borderColor: GOLD + "44" }]}>
          <View style={[s.roleIconWrap, { backgroundColor: GOLD + "30" }]}>
            <Feather name={isPriest ? "star" : isSuperAdmin ? "shield" : "user-check"} size={18} color={GOLD} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.roleTitle}>{profile?.parishName ?? "Ma paroisse"}</Text>
            <Text style={s.roleLabel}>{roleLabel}</Text>
          </View>
        </View>

        {/* ── Management cards ── */}
        <Text style={s.sectionLabel}>Actions de gestion</Text>
        <View style={s.grid}>
          {MANAGE_ITEMS.map((item) => (
            <TouchableOpacity
              key={item.label}
              style={[s.card, { backgroundColor: "#FFFFFF", borderColor: BORDER }]}
              onPress={() => router.push(item.route as never)}
              activeOpacity={0.82}
            >
              <View style={[s.cardIcon, { backgroundColor: GOLD + "18" }]}>
                <Feather name={item.icon as never} size={20} color={GOLD} />
              </View>
              <Text style={s.cardLabel}>{item.label}</Text>
              <Text style={s.cardDesc}>{item.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {canViewClaims && userParishId && (
          <View style={s.claimsSection}>
            <Text style={s.sectionLabel}>Demandes / Revendications</Text>
            <ClaimsSummary parishId={userParishId} canReview={canReviewClaims} />
            {canManageAdmins && (
              <TouchableOpacity
                style={[s.delegationRow, { borderColor: BORDER, backgroundColor: "#FFFFFF" }]}
                disabled={savingClaimDelegation}
                onPress={async () => {
                  setSavingClaimDelegation(true);
                  try {
                    await updateDoc(doc(db, "parishes", userParishId), {
                      claimsDelegatedToAdmins: !claimsDelegatedToAdmins,
                    });
                  } catch {
                    Alert.alert("Erreur", "Impossible de modifier cette autorisation.");
                  } finally {
                    setSavingClaimDelegation(false);
                  }
                }}
                activeOpacity={0.8}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.delegationTitle}>Autoriser les admins à valider les demandes simples</Text>
                  <Text style={s.delegationHint}>
                    Un admin paroissial autorisé peut accepter ou refuser une demande d’administrateur, jamais une demande de prêtre.
                  </Text>
                </View>
                {savingClaimDelegation
                  ? <ActivityIndicator size="small" color={GOLD} />
                  : <Feather name={claimsDelegatedToAdmins ? "check-circle" : "circle"} size={22} color={claimsDelegatedToAdmins ? GREEN : BORDER} />}
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── Parish admin management (priest + super admin only) ── */}
        {canManageAdmins && (
          <View style={s.adminSection}>
            <View style={s.adminSectionHead}>
              <Text style={s.sectionLabel}>Admins paroissiaux</Text>
              <TouchableOpacity
                style={[s.addAdminBtn, { backgroundColor: GOLD }]}
                onPress={() => setShowAddAdmin(true)}
                activeOpacity={0.85}
              >
                <Feather name="user-plus" size={14} color={DARK} />
                <Text style={s.addAdminBtnText}>Nommer</Text>
              </TouchableOpacity>
            </View>

            <Text style={s.adminHint}>
              Les admins paroissiaux peuvent gérer les annonces, événements, groupes, horaires et membres de votre paroisse.
            </Text>

            {parishAdminProfiles.length === 0 ? (
              <View style={[s.emptyAdmins, { borderColor: BORDER }]}>
                <Feather name="users" size={22} color={BORDER} />
                <Text style={s.emptyAdminsText}>Aucun admin paroissial nommé</Text>
              </View>
            ) : (
              parishAdminProfiles.map((admin) => (
                <View key={admin.uid} style={[s.adminRow, { borderColor: BORDER, backgroundColor: "#FFFFFF" }]}>
                  <View style={[s.adminAvatar, { backgroundColor: GOLD + "22" }]}>
                    <Text style={s.adminAvatarText}>{(admin.displayName || "?")[0].toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.adminName}>{admin.displayName}</Text>
                    <Text style={s.adminEmail}>{admin.email}</Text>
                  </View>
                  {removingUid === admin.uid
                    ? <ActivityIndicator size="small" color={RED} />
                    : (
                      <TouchableOpacity
                        onPress={() => handleRemoveAdmin(admin)}
                        style={s.removeBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Feather name="user-x" size={16} color={RED} />
                      </TouchableOpacity>
                    )}
                </View>
              ))
            )}
          </View>
        )}

        {/* ── Permissions reminder ── */}
        <View style={[s.permBox, { backgroundColor: CREAM, borderColor: BORDER }]}>
          <Feather name="info" size={14} color={GOLD} style={{ marginTop: 1 }} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={s.permTitle}>Vos droits de gestion</Text>
            {[
              "Modifier les informations de la paroisse",
              "Gérer les horaires des messes",
              "Créer et modérer les annonces",
              "Créer et modérer les événements",
              "Gérer les groupes paroissiaux",
              "Modérer les demandes d'aide mutuelle",
              "Gérer les membres et leurs rôles",
            ].map((perm) => (
              <View key={perm} style={s.permRow}>
                <Feather name="check" size={12} color={GREEN} />
                <Text style={s.permText}>{perm}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <AddAdminModal
        visible={showAddAdmin}
        onClose={() => setShowAddAdmin(false)}
        onAdd={handleAddAdmin}
        existing={parishAdmins}
      />
      <ConfirmSheet
        visible={removeAdminTarget !== null}
        title="Retirer l'administrateur"
        message={removeAdminTarget ? `Retirer ${removeAdminTarget.displayName} des admins paroissiaux ?` : ""}
        confirmLabel="Retirer"
        confirmColor="#D32F2F"
        cancelLabel="Annuler"
        icon="user-minus"
        onConfirm={doRemoveAdmin}
        onCancel={() => setRemoveAdminTarget(null)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:            { flex: 1 },
  header:          { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1 },
  backBtn:         { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  headerTitle:     { fontSize: 17, fontFamily: "Inter_600SemiBold", color: DARK },
  scroll:          { padding: 16, gap: 16 },
  roleBanner:      { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, padding: 14, borderWidth: 1 },
  roleIconWrap:    { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  roleTitle:       { fontSize: 15, fontFamily: "Inter_700Bold", color: DARK },
  roleLabel:       { fontSize: 12, fontFamily: "Inter_500Medium", color: GOLD },
  sectionLabel:    { fontSize: 11, fontFamily: "Inter_600SemiBold", color: MUTED, textTransform: "uppercase", letterSpacing: 0.8 },
  grid:            { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  card:            { width: "47%", borderRadius: 14, padding: 14, gap: 8, borderWidth: 1, alignItems: "flex-start" },
  cardIcon:        { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cardLabel:       { fontSize: 13, fontFamily: "Inter_700Bold", color: DARK },
  cardDesc:        { fontSize: 11, fontFamily: "Inter_400Regular", color: MUTED },
  claimsSection:   { gap: 10 },
  delegationRow:   { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, padding: 14, borderWidth: 1 },
  delegationTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: DARK },
  delegationHint:  { fontSize: 11, fontFamily: "Inter_400Regular", color: MUTED, lineHeight: 16, marginTop: 4 },
  adminSection:    { gap: 12 },
  adminSectionHead:{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  addAdminBtn:     { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  addAdminBtnText: { fontSize: 12, fontFamily: "Inter_700Bold", color: DARK },
  adminHint:       { fontSize: 12, fontFamily: "Inter_400Regular", color: MUTED, lineHeight: 18, marginTop: -4 },
  emptyAdmins:     { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, padding: 16, borderWidth: 1, borderStyle: "dashed" },
  emptyAdminsText: { fontSize: 13, fontFamily: "Inter_400Regular", color: MUTED },
  adminRow:        { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 12, padding: 12, borderWidth: 1 },
  adminAvatar:     { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  adminAvatarText: { fontSize: 17, fontFamily: "Inter_700Bold", color: GOLD },
  adminName:       { fontSize: 14, fontFamily: "Inter_600SemiBold", color: DARK },
  adminEmail:      { fontSize: 11, fontFamily: "Inter_400Regular", color: MUTED },
  removeBtn:       { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  permBox:         { flexDirection: "row", gap: 10, borderRadius: 14, padding: 14, borderWidth: 1 },
  permTitle:       { fontSize: 12, fontFamily: "Inter_600SemiBold", color: DARK, marginBottom: 4 },
  permRow:         { flexDirection: "row", alignItems: "center", gap: 6 },
  permText:        { fontSize: 11, fontFamily: "Inter_400Regular", color: MUTED },
  emptyWrap:       { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 12 },
  emptyTitle:      { fontSize: 18, fontFamily: "Inter_700Bold", color: DARK },
  emptySub:        { fontSize: 13, fontFamily: "Inter_400Regular", color: MUTED, textAlign: "center", lineHeight: 20 },
});

const am = StyleSheet.create({
  overlay:  { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  sheet:    { backgroundColor: "#FFFFFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, gap: 12 },
  header:   { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title:    { fontSize: 17, fontFamily: "Inter_700Bold", color: DARK },
  hint:     { fontSize: 13, fontFamily: "Inter_400Regular", color: MUTED, lineHeight: 20 },
  label:    { fontSize: 11, fontFamily: "Inter_600SemiBold", color: DARK, textTransform: "uppercase", letterSpacing: 0.6 },
  input:    { borderWidth: 1.5, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, fontFamily: "Inter_400Regular", color: DARK, backgroundColor: "#FAFAFA" },
  error:    { fontSize: 11, fontFamily: "Inter_400Regular", color: RED },
  btn:      { borderRadius: 14, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  btnText:  { fontSize: 15, fontFamily: "Inter_700Bold", color: DARK },
});
