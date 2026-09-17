import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  FlatList,
} from "react-native";
import { ConfirmSheet } from "@/components/ConfirmSheet";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  addDoc,
  arrayUnion,
  writeBatch,
  serverTimestamp,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { useParishPermissions } from "@/hooks/useParishPermissions";
import { saveNotification } from "@/lib/pushNotifications";

// ─── Palette ──────────────────────────────────────────────────────────────────
const DARK   = "#111111";
const GOLD   = "#C9A24A";
const CREAM  = "#FFF8EC";
const BORDER = "#EADFCB";
const MUTED  = "#666666";
const GREEN  = "#16A34A";
const RED    = "#DC2626";
const ORANGE = "#D97706";

// ─── Types ────────────────────────────────────────────────────────────────────
type ClaimStatus = "pending" | "approved" | "rejected";

interface Claim {
  id: string;
  claimantUid: string;
  claimantName: string;
  email: string;
  phone: string;
  fonction: string;
  diocese: string;
  departement: string;
  message: string;
  parishId: string;
  parishName: string;
  requestedRole?: "priest" | "admin" | "member" | "moderator" | string;
  idCardUrl: string;
  missionLetterUrl: string;
  photoUrl?: string | null;
  status: ClaimStatus;
  createdAt: { seconds: number } | null;
  reviewedAt?: { seconds: number } | null;
  reviewedBy?: string | null;
}

const STATUS_CONFIG: Record<ClaimStatus, { label: string; color: string; icon: string }> = {
  pending:  { label: "En attente", color: ORANGE, icon: "clock" },
  approved: { label: "Approuvée",  color: GREEN,  icon: "check-circle" },
  rejected: { label: "Refusée",    color: RED,    icon: "x-circle" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(ts: { seconds: number } | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts.seconds * 1000).toLocaleDateString("fr-FR", {
    day: "2-digit", month: "long", year: "numeric",
  });
}

function requestedRoleFor(claim: Claim): string {
  return claim.requestedRole?.trim() || "priest";
}

function requestedRoleLabel(claim: Claim): string {
  const role = requestedRoleFor(claim);
  if (role === "priest") return "Prêtre responsable";
  if (role === "admin") return "Administrateur paroissial";
  if (role === "moderator") return "Modérateur";
  if (role === "member") return "Membre";
  return role;
}

// ─── Document Viewer Modal ────────────────────────────────────────────────────
function DocumentModal({
  claim,
  visible,
  onClose,
}: {
  claim: Claim | null;
  visible: boolean;
  onClose: () => void;
}) {
  if (!claim) return null;
  const docs = [
    { label: "Carte d'identité", url: claim.idCardUrl },
    { label: "Lettre de mission", url: claim.missionLetterUrl },
    ...(claim.photoUrl ? [{ label: "Photo", url: claim.photoUrl }] : []),
  ];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={dm.container}>
        <View style={dm.header}>
          <Text style={dm.title}>Documents — {claim.claimantName}</Text>
          <TouchableOpacity onPress={onClose} style={dm.closeBtn}>
            <Feather name="x" size={22} color={DARK} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }}>
          {docs.map(({ label, url }) => (
            <View key={label}>
              <Text style={dm.docLabel}>{label}</Text>
              {url ? (
                <Image
                  source={url}
                  style={dm.docImage}
                  contentFit="contain"
                  placeholder={{ uri: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==" }}
                />
              ) : (
                <View style={dm.docMissing}>
                  <Feather name="file-text" size={24} color="#9AA3B0" />
                  <Text style={dm.docMissingText}>Document non fourni</Text>
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const dm = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1, borderBottomColor: "#F0EDE8" },
  title: { fontSize: 16, fontFamily: "Inter_700Bold", color: DARK, flex: 1, marginRight: 12 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: CREAM, alignItems: "center", justifyContent: "center" },
  docLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#7A7A8A", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 },
  docImage: { width: "100%", height: 240, borderRadius: 12, backgroundColor: CREAM },
  docMissing: { height: 100, borderRadius: 12, backgroundColor: CREAM, alignItems: "center", justifyContent: "center", gap: 8 },
  docMissingText: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#9AA3B0" },
});

// ─── Claim Card ───────────────────────────────────────────────────────────────
function ClaimCard({
  claim,
  onApprove,
  onReject,
  onViewDocs,
  approving,
  rejecting,
  canAct,
}: {
  claim: Claim;
  onApprove?: () => void;
  onReject?: () => void;
  onViewDocs: () => void;
  approving: boolean;
  rejecting: boolean;
  canAct: boolean;
}) {
  const cfg = STATUS_CONFIG[claim.status];

  return (
    <Animated.View entering={FadeInDown.duration(350)} style={cc.card}>
      {/* ── Header ── */}
      <View style={cc.cardHeader}>
        <View style={cc.avatarWrap}>
          <Text style={cc.avatarText}>
            {claim.claimantName.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={cc.claimantName}>{claim.claimantName}</Text>
          <Text style={cc.parishName}>{claim.parishName}</Text>
        </View>
        <View style={[cc.statusBadge, { backgroundColor: cfg.color + "18" }]}>
          <Feather name={cfg.icon as never} size={12} color={cfg.color} />
          <Text style={[cc.statusText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>

      {/* ── Details grid ── */}
      <View style={cc.detailsGrid}>
        {[
          { icon: "briefcase", label: "Fonction",   value: claim.fonction     },
          { icon: "shield",    label: "Rôle demandé", value: requestedRoleLabel(claim) },
          { icon: "map",       label: "Diocèse",    value: claim.diocese      },
          { icon: "map-pin",   label: "Département",value: claim.departement  },
          { icon: "mail",      label: "Email",      value: claim.email        },
          { icon: "phone",     label: "Téléphone",  value: claim.phone        },
          { icon: "calendar",  label: "Date",       value: formatDate(claim.createdAt) },
        ].map(({ icon, label, value }) => (
          <View key={label} style={cc.detailRow}>
            <Feather name={icon as never} size={13} color={GOLD} />
            <View style={{ flex: 1 }}>
              <Text style={cc.detailLabel}>{label}</Text>
              <Text style={cc.detailValue}>{value}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* ── Message ── */}
      {claim.message ? (
        <View style={cc.messageBox}>
          <Text style={cc.messageLabel}>Message de présentation</Text>
          <Text style={cc.messageText}>{claim.message}</Text>
        </View>
      ) : null}

      {/* ── Actions ── */}
      <View style={cc.actions}>
        <TouchableOpacity style={cc.docsBtn} onPress={onViewDocs} activeOpacity={0.8}>
          <Feather name="file-text" size={14} color={DARK} />
          <Text style={cc.docsBtnText}>Voir les documents</Text>
        </TouchableOpacity>

        {claim.status === "pending" && canAct && (
          <View style={cc.reviewActions}>
            <TouchableOpacity
              style={[cc.rejectBtn, rejecting && { opacity: 0.6 }]}
              onPress={onReject}
              disabled={approving || rejecting}
              activeOpacity={0.85}
            >
              {rejecting ? <ActivityIndicator size="small" color={RED} /> : (
                <>
                  <Feather name="x" size={14} color={RED} />
                  <Text style={cc.rejectBtnText}>Refuser</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[cc.approveBtn, approving && { opacity: 0.6 }]}
              onPress={onApprove}
              disabled={approving || rejecting}
              activeOpacity={0.85}
            >
              {approving ? <ActivityIndicator size="small" color="#fff" /> : (
                <>
                  <Feather name="check" size={14} color="#fff" />
                  <Text style={cc.approveBtnText}>Approuver</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
        {claim.status === "pending" && !canAct && (
          <Text style={cc.readOnlyText}>
            Cette demande est visible, mais sa validation est réservée au prêtre responsable ou au Super Admin.
          </Text>
        )}
      </View>

      {/* ── Reviewed info ── */}
      {claim.status !== "pending" && claim.reviewedAt && (
        <Text style={cc.reviewedText}>
          {claim.status === "approved" ? "Approuvée" : "Refusée"} le {formatDate(claim.reviewedAt)}
          {claim.reviewedBy ? ` par ${claim.reviewedBy}` : ""}
        </Text>
      )}
    </Animated.View>
  );
}

const cc = StyleSheet.create({
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 16, marginBottom: 14, shadowColor: BORDER, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.5, shadowRadius: 8, elevation: 2, borderWidth: 1, borderColor: BORDER },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  avatarWrap: { width: 46, height: 46, borderRadius: 23, backgroundColor: GOLD + "22", alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 16, fontFamily: "Inter_700Bold", color: GOLD },
  claimantName: { fontSize: 15, fontFamily: "Inter_700Bold", color: DARK },
  parishName: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#7A7A8A", marginTop: 1 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16 },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  detailsGrid: { gap: 8, marginBottom: 12 },
  detailRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  detailLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#9AA3B0", textTransform: "uppercase", letterSpacing: 0.6 },
  detailValue: { fontSize: 13, fontFamily: "Inter_500Medium", color: DARK, marginTop: 1 },
  messageBox: { backgroundColor: CREAM, borderRadius: 10, padding: 12, marginBottom: 12 },
  messageLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#9AA3B0", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 },
  messageText: { fontSize: 13, fontFamily: "Inter_400Regular", color: DARK, lineHeight: 19 },
  actions: { gap: 10 },
  docsBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderWidth: 1.5, borderColor: "#E5E0D8", borderRadius: 12, paddingVertical: 10 },
  docsBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: DARK },
  reviewActions: { flexDirection: "row", gap: 10 },
  rejectBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1.5, borderColor: RED + "55", borderRadius: 12, paddingVertical: 10 },
  rejectBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: RED },
  approveBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: GREEN, borderRadius: 12, paddingVertical: 10 },
  approveBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" },
  reviewedText: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#9AA3B0", textAlign: "center", marginTop: 8 },
  readOnlyText: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#9AA3B0", lineHeight: 17, textAlign: "center" },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
type FilterTab = "pending" | "approved" | "rejected";

export default function AdminClaimsScreen() {
  const insets = useSafeAreaInsets();
  const { profile, user } = useAuth();
  const {
    userParishId,
    isSuperAdmin,
    isPriest,
    isParishAdmin,
    canViewClaims,
    canReviewClaims,
    claimsDelegatedToAdmins,
  } = useParishPermissions();

  const [claims, setClaims]         = useState<Claim[]>([]);
  const [loading, setLoading]       = useState(true);
  const [filter, setFilter]         = useState<FilterTab>("pending");
  const [docClaim, setDocClaim]     = useState<Claim | null>(null);
  const [actionId, setActionId]     = useState<string | null>(null);
  const [actionType, setActionType] = useState<"approve" | "reject" | null>(null);
  const [pendingApprove, setPendingApprove] = useState<Claim | null>(null);
  const [pendingReject,  setPendingReject]  = useState<Claim | null>(null);

  const loadClaims = useCallback(async () => {
    setLoading(true);
    try {
      const claimsQuery = isSuperAdmin
        ? query(collection(db, "parishClaims"))
        : userParishId
          ? query(collection(db, "parishClaims"), where("parishId", "==", userParishId))
          : null;

      if (!claimsQuery) {
        setClaims([]);
        return;
      }

      const snap = await getDocs(claimsQuery);
      const loaded = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Claim));
      loaded.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
      setClaims(loaded);
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin, userParishId]);

  useEffect(() => { loadClaims(); }, [loadClaims]);

  // ── Write admin log ──
  const writeLog = async (action: string, claim: Claim) => {
    await addDoc(collection(db, "adminLogs"), {
      action,
      adminUid: user?.uid,
      adminName: profile?.displayName ?? "Admin",
      claimantUid: claim.claimantUid,
      claimantName: claim.claimantName,
      parishId: claim.parishId,
      parishName: claim.parishName,
      createdAt: serverTimestamp(),
    });
  };

  // ── Write notification ──
  // Fire-and-forget : les erreurs de notification ne bloquent pas le flux principal.
  const writeNotif = (claim: Claim, approved: boolean): void => {
    const roleLabel = requestedRoleLabel(claim);
    void saveNotification(claim.claimantUid, {
      title: approved ? "Demande acceptée 🎉" : "Demande refusée",
      body: approved
        ? `Votre demande de ${roleLabel.toLowerCase()} a été acceptée pour la paroisse "${claim.parishName}".`
        : `Votre demande pour la paroisse "${claim.parishName}" n'a pas été acceptée. Vous pouvez soumettre une nouvelle demande.`,
      type: "announcements",
      data: { screen: "/(tabs)/parishes" },
    });
  };

  // ── Approve ──
  const handleApprove = (claim: Claim) => { setPendingApprove(claim); };

  const canActOnClaim = useCallback((claim: Claim): boolean => {
    if (claim.status !== "pending" || !canReviewClaims) return false;
    if (isSuperAdmin) return true;
    if (claim.parishId !== userParishId) return false;
    const requestedRole = requestedRoleFor(claim);
    if (isPriest) return true;
    return isParishAdmin && claimsDelegatedToAdmins && requestedRole !== "priest";
  }, [
    canReviewClaims,
    claimsDelegatedToAdmins,
    isParishAdmin,
    isPriest,
    isSuperAdmin,
    userParishId,
  ]);

  const doApprove = async () => {
    const claim = pendingApprove;
    if (!claim) return;
    if (!canActOnClaim(claim)) {
      setPendingApprove(null);
      Alert.alert("Action non autorisée", "Cette demande doit être validée par le prêtre responsable ou le Super Admin.");
      return;
    }
    setPendingApprove(null);
    setActionId(claim.id); setActionType("approve");
    try {
      const requestedRole = requestedRoleFor(claim);
      const claimantProfile = {
        role: requestedRole,
        parishId: claim.parishId,
        parishName: claim.parishName,
      };
      const batch = writeBatch(db);
      const claimantUpdate = requestedRole === "priest"
        ? {
            ...claimantProfile,
            priestParishId: claim.parishId,
            priestParishName: claim.parishName,
          }
        : claimantProfile;

      batch.update(doc(db, "users", claim.claimantUid), claimantUpdate);
      batch.update(doc(db, "parishClaims", claim.id), {
          status: "approved",
          reviewedAt: serverTimestamp(),
          reviewedBy: profile?.displayName ?? "Admin",
          reviewedByUid: user?.uid ?? null,
      });

      if (requestedRole === "priest") {
        batch.update(doc(db, "parishes", claim.parishId), {
            priestUid: claim.claimantUid,
            priestName: claim.claimantName,
            isClaimed: true,
            claimStatus: "approved",
        });
      } else if (requestedRole === "admin") {
        batch.update(doc(db, "parishes", claim.parishId), {
            parishAdmins: arrayUnion(claim.claimantUid),
            parishAdminProfiles: arrayUnion({
              uid: claim.claimantUid,
              displayName: claim.claimantName,
              email: claim.email,
            }),
        });
      }

      await batch.commit();
      await writeLog("approve_claim", claim);
      writeNotif(claim, true);
      setClaims((prev) => prev.map((c) =>
        c.id === claim.id
          ? { ...c, status: "approved", reviewedAt: { seconds: Date.now() / 1000 }, reviewedBy: profile?.displayName ?? "Admin" }
          : c
      ));
    } catch {
      Alert.alert("Erreur", "Impossible d'approuver la demande. Vérifiez les droits du valideur.");
    } finally {
      setActionId(null); setActionType(null);
    }
  };

  // ── Reject ──
  const handleReject = (claim: Claim) => { setPendingReject(claim); };

  const doReject = async () => {
    const claim = pendingReject;
    if (!claim) return;
    if (!canActOnClaim(claim)) {
      setPendingReject(null);
      Alert.alert("Action non autorisée", "Cette demande doit être refusée par un valideur autorisé.");
      return;
    }
    setPendingReject(null);
    setActionId(claim.id); setActionType("reject");
    try {
      await updateDoc(doc(db, "parishClaims", claim.id), {
        status: "rejected",
        reviewedAt: serverTimestamp(),
        reviewedBy: profile?.displayName ?? "Admin",
      });
      await writeLog("reject_claim", claim);
      writeNotif(claim, false);
      setClaims((prev) => prev.map((c) =>
        c.id === claim.id
          ? { ...c, status: "rejected", reviewedAt: { seconds: Date.now() / 1000 }, reviewedBy: profile?.displayName ?? "Admin" }
          : c
      ));
    } catch {
      Alert.alert("Erreur", "Impossible de refuser la demande.");
    } finally {
      setActionId(null); setActionType(null);
    }
  };

  const filtered = claims.filter((c) => c.status === filter);

  const tabCounts: Record<FilterTab, number> = {
    pending:  claims.filter((c) => c.status === "pending").length,
    approved: claims.filter((c) => c.status === "approved").length,
    rejected: claims.filter((c) => c.status === "rejected").length,
  };

  if (!canViewClaims) {
    return (
      <View style={[s.root, { justifyContent: "center", alignItems: "center" }]}>
        <Feather name="lock" size={44} color="#D0D5DC" />
        <Text style={s.noAccessText}>Accès réservé aux responsables de paroisse</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: GOLD, fontFamily: "Inter_600SemiBold" }}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[s.root, { backgroundColor: CREAM }]}>
      {/* ── Header ── */}
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Feather name="arrow-left" size={22} color={DARK} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Demandes de revendication</Text>
          <Text style={s.headerSub}>
            {tabCounts.pending} en attente · {isSuperAdmin ? "Toutes les paroisses" : profile?.parishName ?? "Ma paroisse"}
          </Text>
        </View>
        <TouchableOpacity onPress={loadClaims} style={s.refreshBtn}>
          <Feather name="refresh-cw" size={18} color={GOLD} />
        </TouchableOpacity>
      </View>

      {/* ── Filter tabs ── */}
      <View style={s.tabRow}>
        {(["pending", "approved", "rejected"] as FilterTab[]).map((tab) => {
          const active = filter === tab;
          const labels: Record<FilterTab, string> = { pending: "En attente", approved: "Approuvées", rejected: "Refusées" };
          return (
            <TouchableOpacity
              key={tab}
              style={[s.tab, active && s.tabActive]}
              onPress={() => setFilter(tab)}
              activeOpacity={0.8}
            >
              <Text style={[s.tabText, active && s.tabTextActive]}>{labels[tab]}</Text>
              {tabCounts[tab] > 0 && (
                <View style={[s.tabBadge, { backgroundColor: active ? GOLD : "#D0D5DC" }]}>
                  <Text style={[s.tabBadgeText, { color: active ? "#fff" : "#7A7A8A" }]}>{tabCounts[tab]}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Content ── */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={GOLD} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={s.center}>
          <Feather name="inbox" size={42} color="#D0D5DC" />
          <Text style={s.emptyText}>Aucune demande {filter === "pending" ? "en attente" : filter === "approved" ? "approuvée" : "refusée"}</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <ClaimCard
              claim={item}
              onApprove={() => handleApprove(item)}
              onReject={() => handleReject(item)}
              onViewDocs={() => setDocClaim(item)}
              approving={actionId === item.id && actionType === "approve"}
              rejecting={actionId === item.id && actionType === "reject"}
              canAct={canActOnClaim(item)}
            />
          )}
        />
      )}

      {/* ── Document viewer ── */}
      <DocumentModal claim={docClaim} visible={docClaim !== null} onClose={() => setDocClaim(null)} />
      <ConfirmSheet
        visible={pendingApprove !== null}
        title="Approuver la demande"
        message={pendingApprove ? `Accorder le rôle de ${requestedRoleLabel(pendingApprove).toLowerCase()} à ${pendingApprove.claimantName} pour "${pendingApprove.parishName}" ?` : ""}
        confirmLabel="Approuver"
        cancelLabel="Annuler"
        icon="check-circle"
        onConfirm={doApprove}
        onCancel={() => setPendingApprove(null)}
      />
      <ConfirmSheet
        visible={pendingReject !== null}
        title="Refuser la demande"
        message={pendingReject ? `Refuser la demande de ${pendingReject.claimantName} ?` : ""}
        confirmLabel="Refuser"
        confirmColor="#D32F2F"
        cancelLabel="Annuler"
        icon="x-circle"
        onConfirm={doReject}
        onCancel={() => setPendingReject(null)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1 },
  header: { backgroundColor: "#FFFFFF", paddingHorizontal: 16, paddingBottom: 16, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: BORDER },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: DARK },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: MUTED, marginTop: 2 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: CREAM, alignItems: "center", justifyContent: "center" },
  refreshBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: GOLD + "22", alignItems: "center", justifyContent: "center" },
  tabRow: { flexDirection: "row", backgroundColor: "#fff", paddingHorizontal: 16, paddingVertical: 10, gap: 8, borderBottomWidth: 1, borderBottomColor: BORDER },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, borderRadius: 20, backgroundColor: CREAM },
  tabActive: { backgroundColor: GOLD },
  tabText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: MUTED },
  tabTextActive: { color: DARK },
  tabBadge: { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  tabBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#9AA3B0" },
  noAccessText: { fontSize: 16, fontFamily: "Inter_500Medium", color: "#7A7A8A", marginTop: 12 },
});
