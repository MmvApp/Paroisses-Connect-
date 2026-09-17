import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  collection,
  doc,
  increment,
  onSnapshot,
  query,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { db } from "@/lib/firebase";

interface GroupData {
  id: string;
  name: string;
  description: string;
  parishId: string;
  memberCount: number;
  leader: string;
  leaderUid: string;
  schedule: string;
  icon: string;
}

interface MemberItem {
  id: string;
  userId: string;
  displayName: string;
}

function GroupHeader({
  group,
  onBack,
}: {
  group: GroupData | null;
  onBack: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.header,
        {
          backgroundColor: colors.card,
          borderBottomColor: colors.border,
          paddingTop: insets.top + 8,
        },
      ]}
    >
      <TouchableOpacity
        onPress={onBack}
        style={styles.headerButton}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel="Retour"
      >
        <Feather name="chevron-left" size={26} color={colors.primary} />
      </TouchableOpacity>
      <View style={styles.headerTitle}>
        <Text style={[styles.headerName, { color: colors.foreground }]} numberOfLines={1}>
          {group?.name ?? "Informations du groupe"}
        </Text>
        {group ? (
          <Text style={[styles.headerCount, { color: colors.mutedForeground }]}>
            {group.memberCount} membre{group.memberCount === 1 ? "" : "s"}
          </Text>
        ) : null}
      </View>
      <View style={styles.headerButton} />
    </View>
  );
}

export default function GroupInfoScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, profile, userDirectory } = useAuth();
  const params = useLocalSearchParams<{ groupId?: string | string[] }>();
  const rawGroupId = params.groupId;
  const groupId = Array.isArray(rawGroupId) ? rawGroupId[0] : rawGroupId;

  const [group, setGroup] = useState<GroupData | null>(null);
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [loadingGroup, setLoadingGroup] = useState(true);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [savingLeaderUid, setSavingLeaderUid] = useState<string | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

  useEffect(() => {
    if (!groupId || !user?.uid) {
      setLoadingGroup(false);
      return;
    }

    return onSnapshot(
      doc(db, "groups", groupId),
      (snapshot) => {
        if (!snapshot.exists()) {
          setGroup(null);
          setLoadingGroup(false);
          return;
        }
        const data = snapshot.data();
        setGroup({
          id: snapshot.id,
          name: typeof data.name === "string" ? data.name : "Groupe",
          description: typeof data.description === "string" ? data.description : "",
          parishId: typeof data.parishId === "string" ? data.parishId : "",
          memberCount: typeof data.memberCount === "number" ? data.memberCount : 0,
          leader: typeof data.leader === "string" ? data.leader : "",
          leaderUid: typeof data.leaderUid === "string" ? data.leaderUid : "",
          schedule: typeof data.schedule === "string" ? data.schedule : "",
          icon: typeof data.icon === "string" ? data.icon : "users",
        });
        setLoadingGroup(false);
      },
      (error) => {
        console.error("[GroupInfo] group listener error:", error.code, error.message);
        setLoadingGroup(false);
      },
    );
  }, [groupId, user?.uid]);

  useEffect(() => {
    if (!groupId || !user?.uid) {
      setLoadingMembers(false);
      return;
    }

    const membersQuery = query(
      collection(db, "groupMembers"),
      where("groupId", "==", groupId),
    );
    return onSnapshot(
      membersQuery,
      (snapshot) => {
        setMembers(
          snapshot.docs
            .map((item) => {
              const data = item.data();
              return {
                id: item.id,
                userId: typeof data.userId === "string" ? data.userId : "",
                displayName: typeof data.displayName === "string" ? data.displayName : "Membre",
              };
            })
            .filter((member) => member.userId),
        );
        setLoadingMembers(false);
      },
      (error) => {
        console.error("[GroupInfo] members listener error:", error.code, error.message);
        setLoadingMembers(false);
      },
    );
  }, [groupId, user?.uid]);

  const parishId = profile?.parishId ?? profile?.priestParishId ?? "";
  const canAssignResponsible = useMemo(() => {
    if (!group) return false;
    if (profile?.role === "super_admin") return true;
    return (
      (profile?.role === "priest" || profile?.role === "admin")
      && parishId === group.parishId
    );
  }, [group, parishId, profile?.role]);

  const isResponsible = !!user?.uid && user.uid === group?.leaderUid;
  const canManageMembers = canAssignResponsible || isResponsible;
  const isMember = !!user?.uid && members.some((member) => member.userId === user.uid);

  const memberName = (member: MemberItem) =>
    userDirectory[member.userId]?.displayName ?? member.displayName ?? "Membre";

  const assignResponsible = async (member: MemberItem) => {
    if (!group || !canAssignResponsible) return;
    const name = memberName(member);
    setSavingLeaderUid(member.userId);
    try {
      await updateDoc(doc(db, "groups", group.id), {
        leaderUid: member.userId,
        leader: name,
      });
    } catch (error) {
      console.error("[GroupInfo] assign responsible error:", error);
      Alert.alert("Action impossible", "Le responsable n’a pas pu être enregistré.");
    } finally {
      setSavingLeaderUid(null);
    }
  };

  const clearResponsible = async () => {
    if (!group || !canAssignResponsible) return;
    setSavingLeaderUid(group.leaderUid);
    try {
      await updateDoc(doc(db, "groups", group.id), {
        leaderUid: "",
        leader: "",
      });
    } catch (error) {
      console.error("[GroupInfo] clear responsible error:", error);
      Alert.alert("Action impossible", "La responsabilité n’a pas pu être retirée.");
    } finally {
      setSavingLeaderUid(null);
    }
  };

  const confirmResponsible = (member: MemberItem) => {
    const name = memberName(member);
    Alert.alert(
      "Nommer un responsable",
      `Nommer ${name} responsable du groupe « ${group?.name ?? ""} » ?`,
      [
        { text: "Annuler", style: "cancel" },
        { text: "Nommer", onPress: () => void assignResponsible(member) },
      ],
    );
  };

  const confirmClearResponsible = () => {
    Alert.alert(
      "Retirer le responsable",
      `Retirer la responsabilité de « ${group?.leader ?? "ce membre"} » ?`,
      [
        { text: "Annuler", style: "cancel" },
        { text: "Retirer", style: "destructive", onPress: () => void clearResponsible() },
      ],
    );
  };

  const removeMember = (member: MemberItem) => {
    if (!group || !canManageMembers || member.userId === user?.uid) return;
    Alert.alert(
      "Retirer ce membre",
      `Retirer ${memberName(member)} du groupe ?`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Retirer",
          style: "destructive",
          onPress: async () => {
            setRemovingMemberId(member.id);
            try {
              const batch = writeBatch(db);
              batch.delete(doc(db, "groupMembers", member.id));
              batch.update(doc(db, "groups", group.id), {
                memberCount: increment(-1),
                ...(member.userId === group.leaderUid
                  ? { leaderUid: "", leader: "" }
                  : {}),
              });
              await batch.commit();
            } catch (error) {
              console.error("[GroupInfo] remove member error:", error);
              Alert.alert("Action impossible", "Le membre n’a pas pu être retiré.");
            } finally {
              setRemovingMemberId(null);
            }
          },
        },
      ],
    );
  };

  const backToChat = () => router.back();

  if (loadingGroup) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <GroupHeader group={null} onBack={backToChat} />
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </View>
    );
  }

  if (!group) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <GroupHeader group={null} onBack={backToChat} />
        <View style={styles.center}>
          <Feather name="users" size={40} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Groupe introuvable</Text>
          <TouchableOpacity
            onPress={backToChat}
            style={[styles.primaryButton, { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Retour</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <GroupHeader group={group} onBack={backToChat} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.iconCircle, { backgroundColor: colors.primary + "18" }]}>
            <Feather name={group.icon as never} size={26} color={colors.primary} />
          </View>
          <Text style={[styles.groupName, { color: colors.foreground }]}>{group.name}</Text>
          <Text style={[styles.memberCount, { color: colors.mutedForeground }]}>
            {group.memberCount} membre{group.memberCount === 1 ? "" : "s"}
          </Text>
        </View>

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>À propos</Text>
        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.description, { color: colors.foreground }]}>
            {group.description || "Aucune description pour ce groupe."}
          </Text>
          {group.schedule ? (
            <View style={styles.detailRow}>
              <Feather name="calendar" size={16} color={colors.primary} />
              <Text style={[styles.detailText, { color: colors.foreground }]}>{group.schedule}</Text>
            </View>
          ) : null}
        </View>

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Responsable</Text>
        <View style={[styles.responsibleCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.avatar, { backgroundColor: colors.primary + "18" }]}>
            <Feather name="user-check" size={18} color={colors.primary} />
          </View>
          <View style={styles.responsibleInfo}>
            <Text style={[styles.responsibleName, { color: colors.foreground }]}>
              {group.leaderUid
                ? (userDirectory[group.leaderUid]?.displayName ?? group.leader ?? "Responsable")
                : "Aucun responsable désigné"}
            </Text>
            <Text style={[styles.responsibleHint, { color: colors.mutedForeground }]}>
              {isResponsible ? "Vous êtes le responsable de ce groupe." : "Responsable du groupe"}
            </Text>
          </View>
          {group.leaderUid && canAssignResponsible ? (
            <TouchableOpacity
              onPress={confirmClearResponsible}
              style={[styles.smallAction, { borderColor: colors.border }]}
              disabled={savingLeaderUid !== null}
            >
              <Text style={[styles.smallActionText, { color: colors.mutedForeground }]}>Retirer</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {isMember ? (
          <TouchableOpacity
            style={[styles.messagesButton, { backgroundColor: colors.primary }]}
            onPress={() =>
              router.push({
                pathname: "/group-chat/[groupId]",
                params: { groupId: group.id, returnTo: "group-info" },
              })
            }
            activeOpacity={0.85}
          >
            <Feather name="message-circle" size={17} color={colors.primaryForeground} />
            <Text style={[styles.messagesButtonText, { color: colors.primaryForeground }]}>
              Messages du groupe
            </Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.membersHeading}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginBottom: 0 }]}>
            Membres ({members.length})
          </Text>
          {canManageMembers ? (
            <Text style={[styles.manageHint, { color: colors.primary }]}>Gestion du groupe active</Text>
          ) : null}
        </View>

        {loadingMembers ? (
          <View style={styles.loadingMembers}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : members.length === 0 ? (
          <View style={[styles.emptyMembers, { borderColor: colors.border }]}>
            <Feather name="users" size={28} color={colors.mutedForeground} />
            <Text style={[styles.emptyMembersText, { color: colors.mutedForeground }]}>
              Aucun membre pour l’instant.
            </Text>
          </View>
        ) : (
          <View style={[styles.membersCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {members.map((member, index) => {
              const responsible = member.userId === group.leaderUid;
              const isSaving = savingLeaderUid === member.userId;
              const isRemoving = removingMemberId === member.id;
              return (
                <View
                  key={member.id}
                  style={[
                    styles.memberRow,
                    index < members.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
                  ]}
                >
                  <View style={[styles.avatar, { backgroundColor: colors.primary + "18" }]}>
                    <Text style={[styles.avatarText, { color: colors.primary }]}>
                      {memberName(member).charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.memberInfo}>
                    <Text style={[styles.memberName, { color: colors.foreground }]} numberOfLines={1}>
                      {memberName(member)}
                    </Text>
                    {responsible ? (
                      <View style={[styles.responsibleBadge, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "44" }]}>
                        <Feather name="star" size={10} color={colors.primary} />
                        <Text style={[styles.responsibleBadgeText, { color: colors.primary }]}>Responsable</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.memberActions}>
                    {canAssignResponsible && !responsible ? (
                      <TouchableOpacity
                        onPress={() => confirmResponsible(member)}
                        style={[styles.memberAction, { borderColor: colors.primary + "55" }]}
                        disabled={savingLeaderUid !== null}
                      >
                        {isSaving ? (
                          <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                          <Text style={[styles.memberActionText, { color: colors.primary }]}>Nommer</Text>
                        )}
                      </TouchableOpacity>
                    ) : null}
                    {canManageMembers && member.userId !== user?.uid ? (
                      <TouchableOpacity
                        onPress={() => removeMember(member)}
                        style={[styles.iconAction, { borderColor: colors.border }]}
                        disabled={isRemoving}
                        accessibilityLabel={`Retirer ${memberName(member)}`}
                      >
                        {isRemoving ? (
                          <ActivityIndicator size="small" color={colors.mutedForeground} />
                        ) : (
                          <Feather name="user-x" size={15} color={colors.mutedForeground} />
                        )}
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 66,
    paddingHorizontal: 14,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  headerButton: { width: 36, height: 42, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, alignItems: "center", justifyContent: "center", minWidth: 0 },
  headerName: { fontSize: 16, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  headerCount: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2, textAlign: "center" },
  content: { padding: 16 },
  hero: { alignItems: "center", borderRadius: 16, borderWidth: 1, padding: 22, marginBottom: 22 },
  iconCircle: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  groupName: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  memberCount: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 4 },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8 },
  infoCard: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 20, gap: 16 },
  description: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  detailText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  responsibleCard: { flexDirection: "row", alignItems: "center", borderRadius: 14, borderWidth: 1, padding: 13, gap: 10, marginBottom: 22 },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  avatarText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  responsibleInfo: { flex: 1, minWidth: 0 },
  responsibleName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  responsibleHint: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  smallAction: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 7 },
  smallActionText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  messagesButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, borderRadius: 12, paddingVertical: 14, marginBottom: 22 },
  messagesButtonText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  membersHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  manageHint: { fontSize: 11, fontFamily: "Inter_500Medium" },
  loadingMembers: { alignItems: "center", paddingVertical: 28 },
  emptyMembers: { alignItems: "center", borderWidth: 1, borderRadius: 14, borderStyle: "dashed", padding: 24, gap: 8 },
  emptyMembersText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  membersCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  memberRow: { flexDirection: "row", alignItems: "center", padding: 12, gap: 10, minHeight: 64 },
  memberInfo: { flex: 1, minWidth: 0, gap: 5 },
  memberName: { fontSize: 14, fontFamily: "Inter_500Medium" },
  responsibleBadge: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 4, borderWidth: 1, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3 },
  responsibleBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  memberActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  memberAction: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  memberActionText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  iconAction: { width: 30, height: 30, alignItems: "center", justifyContent: "center", borderWidth: 1, borderRadius: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  primaryButton: { borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12, marginTop: 4 },
  primaryButtonText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});