import React, { useCallback, useEffect, useRef, useState } from "react";
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
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  increment,
  onSnapshot,
  query,
  serverTimestamp,
  runTransaction,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { useColors } from "@/hooks/useColors";
import { Card } from "@/components/ui/Card";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { PublicationPhotoPicker } from "@/components/ui/PublicationPhotoPicker";
import { PublicationMedia } from "@/components/ui/PublicationMedia";
import { normalizePublicationImageUrls, uploadPublicationImages } from "@/lib/publicationMedia";

// ─── Palette ──────────────────────────────────────────────────────────────────
const GOLD   = "#C9A24A";
const DARK   = "#111111";
const CREAM  = "#FFF8EC";
const BORDER = "#EADFCB";
const MUTED  = "#666666";
const RED    = "#EF4444";
const GREEN  = "#16A34A";

// ─── Types ────────────────────────────────────────────────────────────────────
interface GroupItem {
  id: string;
  parishId: string;
  name: string;
  description: string;
  icon: string;
  memberCount: number;
  leader: string;
  leaderUid?: string;
  schedule: string;
  createdAt?: unknown;
  createdBy?: string;
  imageUrls?: string[];
  imageUrl?: string | null;
}

interface MemberItem {
  id: string;
  userId: string;
  displayName: string;
  joinedAt?: unknown;
}

type GroupFormData = {
  name: string;
  description: string;
  icon: string;
  leader: string;
  leaderUid: string;
  schedule: string;
  imageUris: string[];
  existingImageUrls: string[];
};

// ─── Seed data ────────────────────────────────────────────────────────────────
const DEFAULT_GROUPS: Omit<GroupItem, "id" | "parishId">[] = [
  {
    name: "Catéchèse",
    description: "Préparation aux sacrements pour les enfants et les adultes. Parcours de découverte de la foi, accompagnement des familles et des catéchumènes tout au long de l'année liturgique.",
    icon: "book-open", memberCount: 0,
    leader: "Marie-Claire Dupont", leaderUid: "",
    schedule: "Chaque samedi matin, de 9h à 11h",
  },
  {
    name: "Caritas Paroissiale",
    description: "Aide aux personnes dans le besoin de notre communauté. Distribution alimentaire, visites à domicile, soutien administratif et accompagnement des plus fragiles.",
    icon: "heart", memberCount: 0,
    leader: "Jean-Paul Martin", leaderUid: "",
    schedule: "Premier samedi du mois + permanences hebdomadaires",
  },
  {
    name: "Chorale",
    description: "Chants liturgiques pour les célébrations dominicales et les grandes fêtes. Ouvert à toutes les voix, débutants bienvenus.",
    icon: "music", memberCount: 0,
    leader: "Sœur Bénédicte", leaderUid: "",
    schedule: "Répétitions le vendredi soir à 20h30",
  },
  {
    name: "Jeunes Adultes",
    description: "Rassemblement et parcours spirituel pour les 18–35 ans. Temps de prière, soirées conviviales, service et réflexion sur la foi.",
    icon: "users", memberCount: 0,
    leader: "Thomas Leclerc", leaderUid: "",
    schedule: "Chaque dimanche soir à 19h",
  },
  {
    name: "Conseil Pastoral",
    description: "Gouvernance et animation de la vie paroissiale. Le conseil accompagne le curé dans les décisions pastorales et la vision à long terme de la paroisse.",
    icon: "shield", memberCount: 0,
    leader: "Père Antoine", leaderUid: "",
    schedule: "Une fois par mois, date communiquée en amont",
  },
  {
    name: "Missions",
    description: "Soutien aux missions et actions humanitaires. Collectes, sensibilisation, partenariats avec des missions en France et à l'étranger.",
    icon: "globe", memberCount: 0,
    leader: "Isabelle Renard", leaderUid: "",
    schedule: "Réunions trimestrielles + actions ponctuelles",
  },
];

const JOIN_TIMEOUT_MS = 15000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error("join-timeout")), timeoutMs);
    }),
  ]);
}

function getJoinErrorMessage(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";

  if (error instanceof Error && error.message === "join-timeout") {
    return "La connexion à Firestore n’a pas répondu. Vérifiez votre connexion puis réessayez.";
  }
  if (code === "permission-denied") {
    return "Firestore a refusé l’adhésion. Vérifiez que votre session est toujours active, puis réessayez.";
  }
  if (code === "unavailable" || code === "deadline-exceeded") {
    return "Le service est temporairement indisponible. Vérifiez votre connexion puis réessayez.";
  }
  return "Votre adhésion n’a pas pu être enregistrée. Vérifiez votre connexion puis réessayez.";
}

const GROUP_ICONS = [
  "book-open", "heart", "music", "users", "shield", "globe",
  "star", "award", "flag", "activity", "sun", "zap",
] as const;

// ─── Permission helpers ───────────────────────────────────────────────────────
function usePermissions() {
  const { user, profile, userDirectory } = useAuth();
  const isGlobalAdmin = profile?.role === "admin" || profile?.role === "super_admin";
  const userParishId  = profile?.parishId ?? profile?.priestParishId ?? null;
  const isPrivilegedInParish = (parishId: string) =>
    isGlobalAdmin ||
    ((profile?.role === "priest" || profile?.role === "admin") && userParishId === parishId);

  const canManageGroup = (g: GroupItem) =>
    isGlobalAdmin ||
    isPrivilegedInParish(g.parishId) ||
    (!!user?.uid && g.leaderUid === user.uid);

  const canEditGroup  = canManageGroup;
  const canDeleteGroup = (g: GroupItem) =>
    isGlobalAdmin || isPrivilegedInParish(g.parishId);
  const canAssignResponsible = (g: GroupItem) =>
    profile?.role === "super_admin"
    || (
      (profile?.role === "priest" || profile?.role === "admin")
      && userParishId === g.parishId
    );

  const canCreateGroups = isGlobalAdmin ||
    ((profile?.role === "priest" || profile?.role === "admin") && !!userParishId);

  return {
    isGlobalAdmin,
    userParishId,
    canManageGroup,
    canEditGroup,
    canDeleteGroup,
    canAssignResponsible,
    canCreateGroups,
  };
}

// ─── GroupDetailModal ─────────────────────────────────────────────────────────
function GroupDetailModal({
  group, onClose, isMember, onJoin, onLeave,
  canEdit, canDelete, onEdit, onDelete, onManageMembers,
}: {
  group: GroupItem | null;
  onClose: () => void;
  isMember: boolean;
  onJoin: () => Promise<void>;
  onLeave: () => Promise<void>;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onManageMembers: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { userDirectory } = useAuth();
  const [step, setStep]               = useState<"detail" | "joining" | "joined" | "leaving" | "left">("detail");
  const [confirmLeave, setConfirmLeave]   = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    if (group) {
      setStep("detail");
      setJoinError(null);
    }
  }, [group]);

  const handleJoin = async () => {
    setJoinError(null);
    setStep("joining");
    try {
      await withTimeout(onJoin(), JOIN_TIMEOUT_MS);
      setStep("joined");
      setTimeout(() => setStep("detail"), 2200);
    } catch (error) {
      console.error("[Groups] join error:", error);
      setStep("detail");
      const message = getJoinErrorMessage(error);
      setJoinError(message);
      Alert.alert("Impossible de rejoindre le groupe", message);
    }
  };

  const handleLeave = () => setConfirmLeave(true);

  const doLeave = async () => {
    setConfirmLeave(false);
    setStep("leaving");
    try {
      await onLeave();
      setStep("left");
      setTimeout(() => setStep("detail"), 2500);
    } catch {
      setStep("detail");
      Alert.alert("Erreur", "Impossible de quitter le groupe. Réessayez.");
    }
  };

  const handleDelete = () => setConfirmDelete(true);

  const showAdmin = canEdit || canDelete;

  return (
    <Modal visible={group !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
        <View style={[dm.header, { paddingTop: insets.top + 12, borderBottomColor: BORDER }]}>
          <TouchableOpacity onPress={onClose} style={dm.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Feather name="arrow-left" size={22} color={DARK} />
          </TouchableOpacity>
          <Text style={dm.headerTitle} numberOfLines={1}>{group?.name ?? ""}</Text>
          {canEdit ? (
            <TouchableOpacity onPress={onEdit} style={dm.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Feather name="edit-2" size={19} color={GOLD} />
            </TouchableOpacity>
          ) : <View style={{ width: 38 }} />}
        </View>

        {step === "joined" ? (
          <View style={dm.successWrap}>
            <View style={[dm.successIcon, { backgroundColor: GREEN + "18" }]}>
              <Feather name="check-circle" size={36} color={GREEN} />
            </View>
            <Text style={dm.successTitle}>Vous avez rejoint le groupe !</Text>
            <Text style={dm.successSub}>
              Bienvenue dans « {group?.name} ». Vous recevrez les informations et actualités du groupe.
            </Text>
          </View>
        ) : step === "left" ? (
          <View style={dm.successWrap}>
            <View style={[dm.successIcon, { backgroundColor: MUTED + "18" }]}>
              <Feather name="log-out" size={36} color={MUTED} />
            </View>
            <Text style={dm.successTitle}>Vous avez quitté le groupe</Text>
            <Text style={dm.successSub}>
              Vous n'êtes plus membre de « {group?.name} ».
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={[dm.scroll, { paddingBottom: insets.bottom + 32 }]}>
            <View style={[dm.hero, { backgroundColor: CREAM, borderColor: BORDER }]}>
              <View style={[dm.heroIcon, { backgroundColor: GOLD + "22" }]}>
                <Feather name={(group?.icon ?? "users") as never} size={28} color={GOLD} />
              </View>
              <View style={[dm.memberPill, { backgroundColor: GOLD + "18", borderColor: GOLD + "33" }]}>
                <Feather name="user" size={12} color={GOLD} />
                <Text style={[dm.memberPillText, { color: GOLD }]}>{group?.memberCount ?? 0} membres</Text>
              </View>
            </View>

            <View style={dm.metaSection}>
              <MetaRow
                icon="user"
                label="Responsable"
                value={(group?.leaderUid && userDirectory[group.leaderUid]?.displayName) ?? group?.leader ?? "—"}
              />
              <MetaRow icon="calendar" label="Réunions"    value={group?.schedule ?? "—"} />
            </View>

            <Text style={dm.sectionLabel}>À propos</Text>
            <Text style={dm.descText}>{group?.description ?? ""}</Text>

            {isMember ? (
              <>
                <View style={dm.memberBadge}>
                  <Feather name="check-circle" size={15} color={GREEN} />
                  <Text style={[dm.memberBadgeText, { color: GREEN }]}>Vous êtes membre de ce groupe</Text>
                  <TouchableOpacity onPress={handleLeave} disabled={step === "leaving"} style={dm.leaveBtn} activeOpacity={0.8}>
                    {step === "leaving"
                      ? <ActivityIndicator size="small" color={RED} />
                      : <Text style={dm.leaveBtnText}>Quitter</Text>}
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={[dm.joinBtn, { backgroundColor: GOLD }]}
                  onPress={() => {
                    if (!group) return;
                    const groupId = group.id;
                    onClose();
                    setTimeout(() => {
                      router.push({
                        pathname: "/group-chat/[groupId]",
                        params: { groupId, returnTo: "groups" },
                      });
                    }, 0);
                  }}
                  activeOpacity={0.85}
                >
                  <Feather name="message-circle" size={17} color={DARK} />
                  <Text style={dm.joinBtnText}>Messages du groupe</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={[dm.joinBtn, { backgroundColor: GOLD, opacity: step === "joining" ? 0.7 : 1 }]}
                  onPress={handleJoin} disabled={step === "joining"} activeOpacity={0.85}
                >
                  {step === "joining"
                    ? <ActivityIndicator size="small" color={DARK} />
                    : <><Feather name="user-plus" size={17} color={DARK} /><Text style={dm.joinBtnText}>Rejoindre le groupe</Text></>}
                </TouchableOpacity>
                {joinError ? <Text style={dm.joinError}>{joinError}</Text> : null}
              </>
            )}

            {showAdmin && (
              <View style={dm.adminSection}>
                <Text style={dm.adminSectionLabel}>Administration</Text>
                <View style={dm.adminRow}>
                  {canEdit && (
                    <TouchableOpacity style={[dm.adminBtn, { borderColor: BORDER }]} onPress={onManageMembers} activeOpacity={0.8}>
                      <Feather name="users" size={15} color={DARK} />
                      <Text style={dm.adminBtnText}>Membres</Text>
                    </TouchableOpacity>
                  )}
                  {canEdit && (
                    <TouchableOpacity style={[dm.adminBtn, { borderColor: BORDER }]} onPress={onEdit} activeOpacity={0.8}>
                      <Feather name="edit-2" size={15} color={DARK} />
                      <Text style={dm.adminBtnText}>Modifier</Text>
                    </TouchableOpacity>
                  )}
                  {canDelete && (
                    <TouchableOpacity style={[dm.adminBtn, { borderColor: RED + "55", backgroundColor: RED + "08" }]} onPress={handleDelete} activeOpacity={0.8}>
                      <Feather name="trash-2" size={15} color={RED} />
                      <Text style={[dm.adminBtnText, { color: RED }]}>Supprimer</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}
          </ScrollView>
        )}
      <ConfirmSheet
        visible={confirmLeave}
        title="Quitter le groupe"
        message={`Voulez-vous quitter « ${group?.name} » ?`}
        confirmLabel="Quitter"
        confirmColor="#D32F2F"
        cancelLabel="Annuler"
        icon="log-out"
        onConfirm={doLeave}
        onCancel={() => setConfirmLeave(false)}
      />
      <ConfirmSheet
        visible={confirmDelete}
        title="Supprimer le groupe"
        message={`Supprimer définitivement « ${group?.name} » et tous ses membres ?`}
        confirmLabel="Supprimer"
        confirmColor="#D32F2F"
        cancelLabel="Annuler"
        icon="trash-2"
        onConfirm={() => { setConfirmDelete(false); onDelete(); }}
        onCancel={() => setConfirmDelete(false)}
      />
      </View>
    </Modal>
  );
}

function MetaRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={dm.metaRow}>
      <View style={[dm.metaIconWrap, { backgroundColor: GOLD + "18" }]}>
        <Feather name={icon as never} size={14} color={GOLD} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={dm.metaLabel}>{label}</Text>
        <Text style={dm.metaValue}>{value}</Text>
      </View>
    </View>
  );
}

// ─── GroupFormModal ───────────────────────────────────────────────────────────
function GroupFormModal({
  visible, onClose, onSave, initial, saving, canAssignResponsible = true,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (data: GroupFormData) => Promise<void>;
  initial: GroupFormData | null;
  saving: boolean;
  canAssignResponsible?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const EMPTY: GroupFormData = {
    name: "", description: "", icon: "users", leader: "", leaderUid: "", schedule: "",
    imageUris: [], existingImageUrls: [],
  };
  const [form,   setForm]   = useState<GroupFormData>(EMPTY);
  const [errors, setErrors] = useState<Partial<GroupFormData>>({});

  useEffect(() => {
    if (visible) { setForm(initial ?? EMPTY); setErrors({}); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const validate = () => {
    const e: Partial<GroupFormData> = {};
    if (!form.name.trim())        e.name        = "Champ requis";
    if (!form.description.trim()) e.description = "Champ requis";
    if (!form.leader.trim())      e.leader      = "Champ requis";
    if (!form.schedule.trim())    e.schedule    = "Champ requis";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    await onSave(form);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: "#FFFFFF" }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[dm.header, { paddingTop: insets.top + 12, borderBottomColor: BORDER }]}>
          <TouchableOpacity onPress={onClose} style={dm.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Feather name="x" size={22} color={DARK} />
          </TouchableOpacity>
          <Text style={dm.headerTitle}>{initial ? "Modifier le groupe" : "Créer un groupe"}</Text>
          <View style={{ width: 38 }} />
        </View>

        <ScrollView contentContainerStyle={[dm.scroll, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
          {/* Icon picker */}
          <Text style={fm.label}>Icône</Text>
          <View style={fm.iconGrid}>
            {GROUP_ICONS.map((ic) => (
              <TouchableOpacity
                key={ic}
                onPress={() => setForm((f) => ({ ...f, icon: ic }))}
                style={[fm.iconOption, form.icon === ic && { borderColor: GOLD, backgroundColor: GOLD + "18" }]}
                activeOpacity={0.75}
              >
                <Feather name={ic as never} size={20} color={form.icon === ic ? GOLD : MUTED} />
              </TouchableOpacity>
            ))}
          </View>

          <FField label="Nom du groupe *" placeholder="Ex. Jeunes Adultes" value={form.name}
            onChange={(v) => setForm((f) => ({ ...f, name: v }))} error={errors.name} />
          {canAssignResponsible ? (
            <>
              <FField label="Nom du responsable *" placeholder="Prénom et nom" value={form.leader}
                onChange={(v) => setForm((f) => ({ ...f, leader: v }))} error={errors.leader} />
              <FField label="ID utilisateur du responsable" placeholder="Laisser vide si inconnu" value={form.leaderUid}
                onChange={(v) => setForm((f) => ({ ...f, leaderUid: v }))}
                hint="Permet au responsable de gérer le groupe. Visible dans son profil." />
            </>
          ) : (
            <View style={fm.hintBlock}>
              <Text style={fm.label}>Responsable</Text>
              <Text style={fm.hint}>La désignation du responsable est réservée au prêtre, à l’admin paroissial ou au super_admin.</Text>
            </View>
          )}
          <FField label="Réunions / Horaires *" placeholder="Ex. Chaque vendredi à 20h" value={form.schedule}
            onChange={(v) => setForm((f) => ({ ...f, schedule: v }))} error={errors.schedule} />
          <FField label="Description *" placeholder="Décrivez le groupe et ses activités…" value={form.description}
            onChange={(v) => setForm((f) => ({ ...f, description: v }))} error={errors.description} multiline />
          <PublicationPhotoPicker
            localUris={form.imageUris}
            existingUrls={form.existingImageUrls}
            onLocalUrisChange={(imageUris) => setForm((f) => ({ ...f, imageUris }))}
            onExistingUrlsChange={(existingImageUrls) => setForm((f) => ({ ...f, existingImageUrls }))}
            disabled={saving}
          />

          <TouchableOpacity
            style={[dm.joinBtn, { backgroundColor: GOLD, opacity: saving ? 0.7 : 1 }]}
            onPress={handleSave} disabled={saving} activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator size="small" color={DARK} />
              : <Text style={dm.joinBtnText}>{initial ? "Enregistrer les modifications" : "Créer le groupe"}</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function FField({ label, placeholder, value, onChange, error, hint, multiline }: {
  label: string; placeholder: string; value: string;
  onChange: (v: string) => void; error?: string; hint?: string; multiline?: boolean;
}) {
  return (
    <View style={fm.fieldWrap}>
      <Text style={fm.label}>{label}</Text>
      <TextInput
        style={[fm.input, multiline && fm.multiline, error ? { borderColor: RED } : null]}
        placeholder={placeholder} placeholderTextColor="#9AA3B0"
        value={value} onChangeText={onChange}
        multiline={multiline} numberOfLines={multiline ? 4 : 1}
        autoCapitalize="sentences" returnKeyType={multiline ? "default" : "next"}
        autoCorrect={false}
      />
      {error ? <Text style={fm.error}>{error}</Text> : null}
      {hint && !error ? <Text style={fm.hint}>{hint}</Text> : null}
    </View>
  );
}

// ─── MembersModal ─────────────────────────────────────────────────────────────
function MembersModal({ group, visible, onClose }: {
  group: GroupItem | null; visible: boolean; onClose: () => void;
}) {
  const insets  = useSafeAreaInsets();
  const { userDirectory } = useAuth();
  const [members, setMembers]                         = useState<MemberItem[]>([]);
  const [loading, setLoading]                         = useState(false);
  const [removeMemberTarget, setRemoveMemberTarget]   = useState<MemberItem | null>(null);

  useEffect(() => {
    if (!visible || !group) return;
    setLoading(true);
    const q = query(collection(db, "groupMembers"), where("groupId", "==", group.id));
    const unsub = onSnapshot(q, (snap) => {
      setMembers(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MemberItem, "id">) })));
      setLoading(false);
    });
    return unsub;
  }, [visible, group]);

  const removeMember = (m: MemberItem) => setRemoveMemberTarget(m);

  const doRemoveMember = async () => {
    if (!removeMemberTarget) return;
    const target = removeMemberTarget;
    setRemoveMemberTarget(null);
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, "groupMembers", target.id));
      batch.update(doc(db, "groups", group!.id), {
        memberCount: increment(-1),
        ...(target.userId === group?.leaderUid ? { leaderUid: "", leader: "" } : {}),
      });
      await batch.commit();
    } catch (error) {
      console.error("[Groups] remove member error:", error);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
        <View style={[dm.header, { paddingTop: insets.top + 12, borderBottomColor: BORDER }]}>
          <TouchableOpacity onPress={onClose} style={dm.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Feather name="arrow-left" size={22} color={DARK} />
          </TouchableOpacity>
          <Text style={dm.headerTitle}>Membres — {group?.name}</Text>
          <View style={{ width: 38 }} />
        </View>

        {loading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={GOLD} />
          </View>
        ) : members.length === 0 ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 32 }}>
            <Feather name="users" size={32} color={BORDER} />
            <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: MUTED, textAlign: "center" }}>
              Aucun membre pour l'instant
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={[dm.scroll, { paddingBottom: insets.bottom + 24 }]}>
            <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: MUTED, marginBottom: 12 }}>
              {members.length} membre{members.length > 1 ? "s" : ""}
            </Text>
            {members.map((m) => {
              const currentName = userDirectory[m.userId]?.displayName ?? m.displayName;
              return (
                <View key={m.id} style={[mm.row, { borderColor: BORDER }]}>
                  <View style={[mm.avatar, { backgroundColor: GOLD + "22" }]}>
                    <Text style={mm.avatarText}>{(currentName || "?")[0].toUpperCase()}</Text>
                  </View>
                  <View style={mm.memberInfo}>
                    <Text style={mm.name}>{currentName || "Membre"}</Text>
                    {m.userId === group?.leaderUid ? (
                      <View style={[mm.responsibleBadge, { backgroundColor: GOLD + "18", borderColor: GOLD + "44" }]}>
                        <Feather name="star" size={10} color={GOLD} />
                        <Text style={[mm.responsibleBadgeText, { color: GOLD }]}>Responsable</Text>
                      </View>
                    ) : null}
                  </View>
                  <TouchableOpacity onPress={() => removeMember(m)} style={mm.removeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Feather name="user-x" size={16} color={RED} />
                  </TouchableOpacity>
                </View>
              );
            })}
          </ScrollView>
        )}
      <ConfirmSheet
        visible={removeMemberTarget !== null}
        title="Retirer ce membre"
        message={removeMemberTarget ? `Retirer ${removeMemberTarget.displayName} du groupe ?` : ""}
        confirmLabel="Retirer"
        confirmColor="#D32F2F"
        cancelLabel="Annuler"
        icon="user-x"
        onConfirm={doRemoveMember}
        onCancel={() => setRemoveMemberTarget(null)}
      />
      </View>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function GroupsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, profile, userDirectory } = useAuth();
  const {
    userParishId,
    canManageGroup,
    canEditGroup,
    canDeleteGroup,
    canAssignResponsible,
    canCreateGroups,
  } = usePermissions();

  const [groups,        setGroups]        = useState<GroupItem[]>([]);
  const [myMemberships, setMyMemberships] = useState<Set<string>>(new Set());
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<GroupItem | null>(null);
  const [editTarget,    setEditTarget]    = useState<GroupItem | null>(null);
  const [showCreate,    setShowCreate]    = useState(false);
  const [showMembers,   setShowMembers]   = useState(false);
  const [formSaving,    setFormSaving]    = useState(false);
  const membershipStateRef = useRef<{ uid: string; states: Map<string, boolean> }>({
    uid: "",
    states: new Map(),
  });

  // ── Seed for this parish ────────────────────────────────────────────────────
  const seedGroups = useCallback(async (parishId: string) => {
    if (!user?.uid) throw new Error("Utilisateur non authentifié.");
    const batch = writeBatch(db);
    DEFAULT_GROUPS.forEach((g) => {
      const ref = doc(collection(db, "groups"));
      batch.set(ref, {
        ...g,
        parishId,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      });
    });
    await batch.commit();
  }, [user?.uid]);

  // ── Load groups for this parish ─────────────────────────────────────────────
  useEffect(() => {
    if (!userParishId) { setLoadingGroups(false); return; }

    const q = query(collection(db, "groups"), where("parishId", "==", userParishId));
    const unsub = onSnapshot(q, async (snap) => {
      if (snap.empty) {
        await seedGroups(userParishId);
        return;
      }
      const docs: GroupItem[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<GroupItem, "id">) }));
      docs.sort((a, b) => a.name.localeCompare(b.name, "fr"));
      setGroups(docs);
      setLoadingGroups(false);
    });
    return unsub;
  }, [userParishId, seedGroups]);

  // ── Memberships ─────────────────────────────────────────────────────────────
  // Listen to each canonical membership document instead of replacing the
  // whole set from a broad query. This keeps a confirmed membership stable
  // across refreshes and prevents an intermediate/legacy query result from
  // making a member appear to have left.
  useEffect(() => {
    const uid = user?.uid;
    if (!uid) {
      membershipStateRef.current = { uid: "", states: new Map() };
      setMyMemberships(new Set());
      return;
    }

    if (membershipStateRef.current.uid !== uid) {
      membershipStateRef.current = { uid, states: new Map() };
    }

    if (groups.length === 0) {
      if (!loadingGroups) {
        membershipStateRef.current.states.clear();
        setMyMemberships(new Set());
      }
      return;
    }

    let active = true;
    const membershipStates = membershipStateRef.current.states;
    const groupIds = new Set(groups.map((group) => group.id));
    Array.from(membershipStates.keys()).forEach((groupId) => {
      if (!groupIds.has(groupId)) membershipStates.delete(groupId);
    });

    const publishMemberships = () => {
      setMyMemberships(
        new Set(
          Array.from(membershipStates.entries())
            .filter(([, isMember]) => isMember)
            .map(([groupId]) => groupId),
        ),
      );
    };

    const unsubscribers = groups.map((group) => {
      const membershipRef = doc(db, "groupMembers", `${group.id}_${uid}`);
      return onSnapshot(
        membershipRef,
        (snapshot) => {
          if (!active) return;
          membershipStates.set(group.id, snapshot.exists());
          publishMemberships();
        },
        (error) => {
          console.error(
            `[Groups] membership listener error for ${group.id}:`,
            error.code,
            error.message,
          );
          // Do not clear an already confirmed membership on a transient
          // listener error. Firestore rules still control actual access.
        },
      );
    });

    return () => {
      active = false;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [groups, loadingGroups, user?.uid]);

  // ── Join ─────────────────────────────────────────────────────────────────────
  const handleJoin = async () => {
    if (!user || !selectedGroup) throw new Error("not-authenticated");
    const docId = `${selectedGroup.id}_${user.uid}`;
    const memberRef = doc(db, "groupMembers", docId);
    const groupRef = doc(db, "groups", selectedGroup.id);

    const joinedNow = await runTransaction(db, async (transaction) => {
      const [groupSnapshot, existingMembership] = await Promise.all([
        transaction.get(groupRef),
        transaction.get(memberRef),
      ]);

      if (!groupSnapshot.exists()) throw new Error("group-not-found");
      if (existingMembership.exists()) return false;

      const groupData = groupSnapshot.data();
      const currentMemberCount =
        typeof groupData.memberCount === "number" ? groupData.memberCount : 0;

      transaction.set(memberRef, {
        groupId: selectedGroup.id,
        parishId: selectedGroup.parishId,
        userId: user.uid,
        displayName: profile?.displayName ?? user.displayName ?? "Membre",
        joinedAt: serverTimestamp(),
      });
      transaction.update(groupRef, { memberCount: currentMemberCount + 1 });
      return true;
    });

    if (!joinedNow) {
      membershipStateRef.current.states.set(selectedGroup.id, true);
      setMyMemberships((current) => {
        const next = new Set(current);
        next.add(selectedGroup.id);
        return next;
      });
      const groupId = selectedGroup.id;
      setSelectedGroup(null);
      router.push(`/group-chat/${groupId}`);
      return;
    }

    membershipStateRef.current.states.set(selectedGroup.id, true);
    setMyMemberships((current) => {
      const next = new Set(current);
      next.add(selectedGroup.id);
      return next;
    });
    const groupId = selectedGroup.id;
    setSelectedGroup(null);
    router.push(`/group-chat/${groupId}`);
  };

  // ── Leave ────────────────────────────────────────────────────────────────────
  const handleLeave = async () => {
    if (!user || !selectedGroup) throw new Error("Utilisateur ou groupe introuvable.");
    const docId = `${selectedGroup.id}_${user.uid}`;
    const batch = writeBatch(db);
    batch.update(doc(db, "groups", selectedGroup.id), { memberCount: increment(-1) });
    batch.delete(doc(db, "groupMembers", docId));
    await batch.commit();
    membershipStateRef.current.states.set(selectedGroup.id, false);
    setMyMemberships((current) => {
      const next = new Set(current);
      next.delete(selectedGroup.id);
      return next;
    });
  };

  // ── Create ───────────────────────────────────────────────────────────────────
  const handleCreate = async (data: GroupFormData) => {
    if (!userParishId) return;
    setFormSaving(true);
    try {
      await addDoc(collection(db, "groups"), {
        parishId:    userParishId,
        name:        data.name.trim(),
        description: data.description.trim(),
        icon:        data.icon,
        leader:      data.leader.trim(),
        leaderUid:   data.leaderUid.trim(),
        schedule:    data.schedule.trim(),
        memberCount: 0,
        createdAt:   serverTimestamp(),
        createdBy:   user?.uid ?? "",
        imageUrls:   await uploadPublicationImages(data.imageUris, "groups"),
      });
      setShowCreate(false);
    } finally {
      setFormSaving(false);
    }
  };

  // ── Edit ─────────────────────────────────────────────────────────────────────
  const handleEdit = async (data: GroupFormData) => {
    if (!editTarget) return;
    setFormSaving(true);
    try {
      await updateDoc(doc(db, "groups", editTarget.id), {
        name:        data.name.trim(),
        description: data.description.trim(),
        icon:        data.icon,
        leader:      data.leader.trim(),
        leaderUid:   data.leaderUid.trim(),
        schedule:    data.schedule.trim(),
        imageUrls: [
          ...data.existingImageUrls,
          ...(await uploadPublicationImages(data.imageUris, "groups")),
        ].slice(0, 2),
      });
      if (selectedGroup?.id === editTarget.id) {
        setSelectedGroup((g) => g ? {
          ...g,
          name: data.name.trim(),
          description: data.description.trim(),
          icon: data.icon,
          leader: data.leader.trim(),
          leaderUid: data.leaderUid.trim(),
          schedule: data.schedule.trim(),
          imageUrls: [...data.existingImageUrls, ...data.imageUris].slice(0, 2),
        } : g);
      }
      setEditTarget(null);
    } finally {
      setFormSaving(false);
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!selectedGroup) return;
    try {
      const q = query(collection(db, "groupMembers"), where("groupId", "==", selectedGroup.id));
      const snap = await getDocs(q);
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      batch.delete(doc(db, "groups", selectedGroup.id));
      await batch.commit();
      setSelectedGroup(null);
    } catch {
      Alert.alert("Erreur", "Impossible de supprimer le groupe. Réessayez.");
    }
  };

  // ── No parish ────────────────────────────────────────────────────────────────
  if (!loadingGroups && !userParishId) {
    return (
      <View style={[s.root, { backgroundColor: colors.background }]}>
        <View style={[s.header, { backgroundColor: "#FFFFFF", borderBottomColor: BORDER, paddingTop: insets.top + 12 }]}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Feather name="arrow-left" size={22} color={DARK} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: DARK }]}>Groupes</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={s.emptyWrap}>
          <View style={[s.emptyIcon, { backgroundColor: GOLD + "18" }]}>
            <Feather name="map-pin" size={28} color={GOLD} />
          </View>
          <Text style={s.emptyTitle}>Aucune paroisse associée</Text>
          <Text style={s.emptySub}>
            Rejoignez d'abord une paroisse dans l'onglet Lieux pour accéder aux groupes de votre communauté.
          </Text>
          <TouchableOpacity
            style={[s.emptyBtn, { backgroundColor: GOLD }]}
            onPress={() => router.push("/(tabs)")}
            activeOpacity={0.85}
          >
            <Text style={[s.emptyBtnText, { color: DARK }]}>Trouver ma paroisse</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────────────
  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <View style={[s.header, { backgroundColor: "#FFFFFF", borderBottomColor: BORDER, paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="arrow-left" size={22} color={DARK} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: DARK }]}>Groupes</Text>
        {canCreateGroups ? (
          <TouchableOpacity onPress={() => setShowCreate(true)} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Feather name="plus" size={22} color={GOLD} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 38 }} />
        )}
      </View>

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[s.heroBanner, { backgroundColor: CREAM, borderColor: BORDER }]}>
          <View style={[s.heroIcon, { backgroundColor: GOLD + "18" }]}>
            <Feather name="users" size={24} color={GOLD} />
          </View>
          <Text style={[s.heroTitle, { color: DARK }]}>Rejoignez un groupe</Text>
          <Text style={[s.heroSub, { color: colors.mutedForeground }]}>
            {profile?.parishName
              ? `Groupes de ${profile.parishName}`
              : "Trouvez votre place dans la communauté paroissiale."}
          </Text>
        </View>

        {loadingGroups ? (
          <View style={{ alignItems: "center", paddingTop: 40 }}>
            <ActivityIndicator color={GOLD} />
          </View>
        ) : (
          <>
            {groups.map((g) => {
              const isMember = myMemberships.has(g.id);
              const canEdit  = canEditGroup(g);
              return (
                <TouchableOpacity
                  key={g.id}
                  activeOpacity={0.82}
                  style={{ marginBottom: 12 }}
                  onPress={() => setSelectedGroup(g)}
                >
                  <Card elevated style={s.groupCard}>
                    <PublicationMedia imageUrls={normalizePublicationImageUrls(g)} authorName={g.name} />
                    <View style={[s.iconCircle, { backgroundColor: GOLD + "18" }]}>
                      <Feather name={(g.icon as never) ?? "users"} size={20} color={GOLD} />
                    </View>
                    <View style={s.groupInfo}>
                      <View style={s.groupTopRow}>
                        <Text style={[s.groupName, { color: colors.foreground }]}>{g.name}</Text>
                        {isMember && (
                          <View style={[s.memberBadge, { backgroundColor: GREEN + "18", borderColor: GREEN + "33" }]}>
                            <Feather name="check" size={10} color={GREEN} />
                            <Text style={[s.memberBadgeText, { color: GREEN }]}>Membre</Text>
                          </View>
                        )}
                        {canEdit && !isMember && (
                          <View style={[s.memberBadge, { backgroundColor: GOLD + "18", borderColor: GOLD + "44" }]}>
                            <Feather name="settings" size={10} color={GOLD} />
                            <Text style={[s.memberBadgeText, { color: GOLD }]}>Admin</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[s.groupDesc, { color: colors.mutedForeground }]} numberOfLines={2}>{g.description}</Text>
                      <View style={s.memberRow}>
                        <Feather name="user" size={12} color={GOLD} />
                        <Text style={[s.memberCount, { color: GOLD }]}>{g.memberCount} membres</Text>
                      </View>
                    </View>
                    <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
                  </Card>
                </TouchableOpacity>
              );
            })}

            {canCreateGroups && (
              <TouchableOpacity activeOpacity={0.85} onPress={() => setShowCreate(true)} style={{ marginTop: 4 }}>
                <View style={[s.createBanner, { borderColor: GOLD + "55", backgroundColor: GOLD + "10" }]}>
                  <Feather name="plus-circle" size={18} color={GOLD} />
                  <Text style={[s.createBannerText, { color: GOLD }]}>Créer un nouveau groupe</Text>
                </View>
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>

      <GroupDetailModal
        group={selectedGroup}
        onClose={() => setSelectedGroup(null)}
        isMember={selectedGroup ? myMemberships.has(selectedGroup.id) : false}
        onJoin={handleJoin}
        onLeave={handleLeave}
        canEdit={selectedGroup ? canEditGroup(selectedGroup) : false}
        canDelete={selectedGroup ? canDeleteGroup(selectedGroup) : false}
        onEdit={() => { setEditTarget(selectedGroup); setSelectedGroup(null); }}
        onDelete={handleDelete}
        onManageMembers={() => {
          if (!selectedGroup) return;
          setSelectedGroup(null);
          router.push(`/group-info/${selectedGroup.id}`);
        }}
      />

      <GroupFormModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onSave={handleCreate}
        initial={null}
        saving={formSaving}
        canAssignResponsible
      />

      <GroupFormModal
        visible={editTarget !== null}
        onClose={() => setEditTarget(null)}
        onSave={handleEdit}
        initial={editTarget ? {
          name:        editTarget.name,
          description: editTarget.description,
          icon:        editTarget.icon,
          leader:      editTarget.leader,
          leaderUid:   editTarget.leaderUid ?? "",
          schedule:    editTarget.schedule,
          imageUris: [],
          existingImageUrls: normalizePublicationImageUrls(editTarget),
        } : null}
        saving={formSaving}
        canAssignResponsible={editTarget ? canAssignResponsible(editTarget) : true}
      />

      <MembersModal
        group={selectedGroup}
        visible={showMembers}
        onClose={() => setShowMembers(false)}
      />
    </View>
  );
}

// ─── StyleSheets ──────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:             { flex: 1 },
  header:           { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1 },
  backBtn:          { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  headerTitle:      { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  content:          { padding: 16 },
  heroBanner:       { borderRadius: 14, padding: 20, alignItems: "center", marginBottom: 20, gap: 8, borderWidth: 1 },
  heroIcon:         { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  heroTitle:        { fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  heroSub:          { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  groupCard:        { flexDirection: "row", alignItems: "center", gap: 14, padding: 14 },
  iconCircle:       { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  groupInfo:        { flex: 1, gap: 3 },
  groupTopRow:      { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  groupName:        { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  memberBadge:      { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1 },
  memberBadgeText:  { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  groupDesc:        { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  memberRow:        { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  memberCount:      { fontSize: 11, fontFamily: "Inter_500Medium" },
  createBanner:     { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, padding: 14, borderWidth: 1, borderStyle: "dashed" },
  createBannerText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  emptyWrap:        { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 12 },
  emptyIcon:        { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyTitle:       { fontSize: 20, fontFamily: "Inter_700Bold", color: DARK, textAlign: "center" },
  emptySub:         { fontSize: 14, fontFamily: "Inter_400Regular", color: MUTED, textAlign: "center", lineHeight: 22 },
  emptyBtn:         { borderRadius: 14, paddingVertical: 14, paddingHorizontal: 28, marginTop: 8 },
  emptyBtnText:     { fontSize: 15, fontFamily: "Inter_700Bold" },
});

const dm = StyleSheet.create({
  header:          { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, backgroundColor: "#FFFFFF" },
  backBtn:         { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  headerTitle:     { fontSize: 17, fontFamily: "Inter_600SemiBold", color: DARK, flex: 1, textAlign: "center" },
  scroll:          { padding: 20 },
  hero:            { borderRadius: 14, padding: 24, alignItems: "center", marginBottom: 20, gap: 10, borderWidth: 1 },
  heroIcon:        { width: 68, height: 68, borderRadius: 34, alignItems: "center", justifyContent: "center" },
  memberPill:      { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1 },
  memberPillText:  { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  metaSection:     { gap: 0, marginBottom: 20 },
  metaRow:         { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: BORDER + "88" },
  metaIconWrap:    { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  metaLabel:       { fontSize: 10, fontFamily: "Inter_500Medium", color: MUTED, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 2 },
  metaValue:       { fontSize: 14, fontFamily: "Inter_500Medium", color: DARK },
  sectionLabel:    { fontSize: 11, fontFamily: "Inter_600SemiBold", color: MUTED, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 },
  descText:        { fontSize: 14, fontFamily: "Inter_400Regular", color: DARK, lineHeight: 22, marginBottom: 24 },
  joinBtn:         { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 14, paddingVertical: 15 },
  joinBtnText:     { fontSize: 16, fontFamily: "Inter_700Bold", color: DARK },
  joinError:       { fontSize: 13, fontFamily: "Inter_500Medium", color: RED, lineHeight: 19, textAlign: "center", marginTop: 10 },
  memberBadge:     { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: GREEN + "44", backgroundColor: GREEN + "0A" },
  memberBadgeText: { fontSize: 14, fontFamily: "Inter_500Medium", flex: 1 },
  leaveBtn:        { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: RED + "55", backgroundColor: RED + "08" },
  leaveBtnText:    { fontSize: 12, fontFamily: "Inter_600SemiBold", color: RED },
  adminSection:    { marginTop: 24, gap: 10 },
  adminSectionLabel:{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: MUTED, textTransform: "uppercase", letterSpacing: 0.8 },
  adminRow:        { flexDirection: "row", gap: 10 },
  adminBtn:        { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, paddingVertical: 11, borderWidth: 1, backgroundColor: "#FAFAFA" },
  adminBtnText:    { fontSize: 12, fontFamily: "Inter_600SemiBold", color: DARK },
  successWrap:     { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  successIcon:     { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  successTitle:    { fontSize: 22, fontFamily: "Inter_700Bold", color: DARK, textAlign: "center" },
  successSub:      { fontSize: 14, fontFamily: "Inter_400Regular", color: MUTED, textAlign: "center", lineHeight: 22 },
});

const fm = StyleSheet.create({
  fieldWrap: { marginBottom: 16 },
  label:     { fontSize: 12, fontFamily: "Inter_600SemiBold", color: DARK, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.6 },
  input:     { borderWidth: 1.5, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, fontFamily: "Inter_400Regular", color: DARK, backgroundColor: "#FAFAFA" },
  multiline: { height: 96, textAlignVertical: "top", paddingTop: 11 },
  error:     { fontSize: 11, fontFamily: "Inter_400Regular", color: RED, marginTop: 4 },
  hint:      { fontSize: 11, fontFamily: "Inter_400Regular", color: MUTED, marginTop: 4, lineHeight: 16 },
  hintBlock: { marginBottom: 16 },
  iconGrid:  { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 },
  iconOption:{ width: 50, height: 50, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: BORDER, backgroundColor: "#FAFAFA" },
});

const mm = StyleSheet.create({
  row:        { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1 },
  avatar:     { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 16, fontFamily: "Inter_700Bold", color: GOLD },
  name:       { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium", color: DARK },
  removeBtn:  { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  memberInfo: { flex: 1, minWidth: 0, gap: 4 },
  responsibleBadge: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 4, borderWidth: 1, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3 },
  responsibleBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
});
