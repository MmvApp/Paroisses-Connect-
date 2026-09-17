import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { db } from "@/lib/firebase";
import { ensureConversation } from "@/lib/conversations";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { Avatar } from "@/components/ui/Avatar";
import { PhotoViewerModal } from "@/components/ui/PhotoViewerModal";
import { GuestScreen } from "@/components/ui/GuestScreen";
import { useTabScrollToTop } from "@/hooks/useTabScrollToTop";

const GOLD = "#C9A24A";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Conversation {
  id: string;
  participants: string[];
  participantNames: Record<string, string>;
  participantPhotos?: Record<string, string | null>;
  lastMessage: string;
  lastMessageAt: { seconds: number } | null;
  lastMessageBy?: string;
  lastReadAt?: Record<string, { seconds: number } | null>;
}

interface GroupConversation {
  id: string;
  name: string;
  icon: string;
  lastMessage: string;
  lastMessageAt: { seconds: number } | null;
  lastMessageBy?: string;
  lastReadAt?: Record<string, { seconds: number } | null>;
}

interface GroupMembershipState {
  id: string;
  groupData: Record<string, unknown>;
  conversationData: Record<string, unknown>;
  isMember: boolean;
  membershipUnsubscribe?: () => void;
  conversationUnsubscribe?: () => void;
}

interface UserResult {
  uid: string;
  displayName: string;
  photoURL?: string | null;
}

type ChatListItem =
  | { kind: "section"; id: string; label: string }
  | { kind: "group"; id: string; conversation: GroupConversation }
  | { kind: "conversation"; id: string; conversation: Conversation }
  | { kind: "user"; id: string; user: UserResult };

// ─── Helpers ──────────────────────────────────────────────────────────────────
function convTime(seconds: number): string {
  const now = new Date();
  const d = new Date(seconds * 1000);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today.getTime() - msgDay.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Hier";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringMap(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => typeof item === "string")
  ) as Record<string, string>;
}

function photoMap(value: unknown): Record<string, string | null> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item === null || typeof item === "string")
  ) as Record<string, string | null>;
}

function timestampSeconds(value: unknown): number | null {
  if (!isRecord(value) || typeof value.seconds !== "number") return null;
  return value.seconds;
}

function timestampMap(value: unknown): Record<string, { seconds: number } | null> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, timestampSeconds(item) === null ? null : { seconds: timestampSeconds(item)! }]),
  );
}

function normalizeConversation(id: string, data: Record<string, unknown>): Conversation | null {
  const participants = Array.isArray(data.participants)
    ? data.participants.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
  if (participants.length === 0) return null;

  const rawLastMessageAt = data.lastMessageAt;
  const lastMessageAt =
    isRecord(rawLastMessageAt) && typeof rawLastMessageAt.seconds === "number"
      ? { seconds: rawLastMessageAt.seconds }
      : null;

  return {
    id,
    participants,
    participantNames: stringMap(data.participantNames),
    participantPhotos: photoMap(data.participantPhotos),
    lastMessage: typeof data.lastMessage === "string" ? data.lastMessage : "",
    lastMessageAt,
    lastMessageBy: typeof data.lastMessageBy === "string" ? data.lastMessageBy : undefined,
    lastReadAt: timestampMap(data.lastReadAt),
  };
}

function normalizeGroupConversation(
  id: string,
  groupData: Record<string, unknown>,
  conversationData: Record<string, unknown>,
): GroupConversation {
  const rawLastMessageAt = conversationData.lastMessageAt;
  const lastMessageAt =
    isRecord(rawLastMessageAt) && typeof rawLastMessageAt.seconds === "number"
      ? { seconds: rawLastMessageAt.seconds }
      : null;

  return {
    id,
    name: typeof groupData.name === "string" && groupData.name.trim() ? groupData.name : "Groupe",
    icon: typeof groupData.icon === "string" && groupData.icon.trim() ? groupData.icon : "users",
    lastMessage: typeof conversationData.lastMessage === "string" ? conversationData.lastMessage : "",
    lastMessageAt,
    lastMessageBy: typeof conversationData.lastMessageBy === "string"
      ? conversationData.lastMessageBy
      : undefined,
    lastReadAt: timestampMap(conversationData.lastReadAt),
  };
}

function isUnread(
  conversation: Pick<GroupConversation, "lastMessageAt" | "lastMessageBy" | "lastReadAt">,
  currentUid: string,
): boolean {
  if (!conversation.lastMessageBy || conversation.lastMessageBy === currentUid) return false;
  const messageSeconds = conversation.lastMessageAt?.seconds;
  if (messageSeconds == null) return false;
  const readSeconds = conversation.lastReadAt?.[currentUid]?.seconds;
  return readSeconds == null || messageSeconds > readSeconds;
}

// ─── ConvRow ──────────────────────────────────────────────────────────────────
function ConvRow({
  conv, currentUid, userDirectory, onAvatarPress,
}: {
  conv: Conversation;
  currentUid: string;
  userDirectory: Record<string, { displayName: string; photoURL?: string | null }>;
  onAvatarPress?: (url: string | null, name: string) => void;
}) {
  const colors = useColors();
  const otherUid = (Array.isArray(conv.participants) ? conv.participants : []).find((p) => p !== currentUid) ?? "";
  const liveProfile = userDirectory[otherUid];
  const otherName = liveProfile?.displayName ?? conv.participantNames?.[otherUid] ?? "Inconnu";
  const otherPhoto = liveProfile?.photoURL ?? conv.participantPhotos?.[otherUid] ?? null;
  const unread = isUnread(conv, currentUid);

  return (
    <View
      style={[s.convRow, { borderBottomColor: colors.border }]}
    >
      <Avatar
        name={otherName}
        size={52}
        photoURL={otherPhoto}
        onPress={() => onAvatarPress?.(otherPhoto, otherName)}
      />
      <TouchableOpacity
        style={s.convPressArea}
        onPress={() => router.push(`/dm/${conv.id}`)}
        activeOpacity={0.72}
      >
        <View style={s.convBody}>
          <View style={s.convTop}>
            <Text style={[s.convName, { color: colors.foreground }]} numberOfLines={1}>
              {otherName}
            </Text>
            <View style={s.convTimeWrap}>
              {conv.lastMessageAt && (
                <Text style={[s.convTime, { color: unread ? colors.primary : colors.mutedForeground }]}>
                  {convTime(conv.lastMessageAt.seconds)}
                </Text>
              )}
              {unread && <View style={[s.unreadDot, { backgroundColor: colors.primary }]} />}
            </View>
          </View>
          <Text
            style={[s.convPreview, { color: unread ? colors.foreground : colors.mutedForeground, fontFamily: unread ? "Inter_600SemiBold" : "Inter_400Regular" }]}
            numberOfLines={1}
          >
            {conv.lastMessage || "Conversation démarrée"}
          </Text>
        </View>
        <Feather name="chevron-right" size={16} color={colors.mutedForeground} style={{ opacity: 0.5 }} />
      </TouchableOpacity>
    </View>
  );
}

function GroupConvRow({
  conversation,
  currentUid,
}: {
  conversation: GroupConversation;
  currentUid: string;
}) {
  const colors = useColors();
  const unread = isUnread(conversation, currentUid);

  return (
    <TouchableOpacity
      style={[s.groupConvRow, { borderBottomColor: colors.border }]}
      onPress={() => router.push(`/group-chat/${conversation.id}`)}
      activeOpacity={0.72}
    >
      <View style={[s.groupIcon, { backgroundColor: colors.primary + "18" }]}>
        <Feather name={conversation.icon as never} size={22} color={colors.primary} />
      </View>
      <View style={s.convPressArea}>
        <View style={s.convBody}>
          <View style={s.convTop}>
            <Text style={[s.convName, { color: colors.foreground }]} numberOfLines={1}>
              {conversation.name}
            </Text>
            <View style={s.convTimeWrap}>
              {conversation.lastMessageAt ? (
                <Text style={[s.convTime, { color: unread ? colors.primary : colors.mutedForeground }]}>
                  {convTime(conversation.lastMessageAt.seconds)}
                </Text>
              ) : null}
              {unread ? <View style={[s.unreadDot, { backgroundColor: colors.primary }]} /> : null}
            </View>
          </View>
          <Text
            style={[
              s.convPreview,
              {
                color: unread ? colors.foreground : colors.mutedForeground,
                fontFamily: unread ? "Inter_600SemiBold" : "Inter_400Regular",
              },
            ]}
            numberOfLines={1}
          >
            {conversation.lastMessage || "Conversation du groupe"}
          </Text>
        </View>
        <Feather name="chevron-right" size={16} color={colors.mutedForeground} style={{ opacity: 0.5 }} />
      </View>
    </TouchableOpacity>
  );
}

// ─── ChatScreen (conversation list) ──────────────────────────────────────────
export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, profile, userDirectory } = useAuth();
  const chatListRef = useRef<FlatList<ChatListItem>>(null);
  useTabScrollToTop(chatListRef);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [groupConversations, setGroupConversations] = useState<GroupConversation[]>([]);
  const [search, setSearch] = useState("");
  const [userResults, setUserResults] = useState<UserResult[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [openingUid, setOpeningUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewingPhoto, setViewingPhoto] = useState<{ url: string | null; name: string } | null>(null);

  // ── Firestore: listen to user's conversations ─────────────────────────────
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(
        collection(db, "conversations"),
        where("participants", "array-contains", user.uid)
      ),
      (snap) => {
        // Sort client-side to avoid composite index requirement
        const docs = snap.docs
          .map((d) => normalizeConversation(d.id, d.data()))
          .filter((conversation): conversation is Conversation => conversation !== null)
          .sort((a, b) => {
            const at = a.lastMessageAt?.seconds ?? 0;
            const bt = b.lastMessageAt?.seconds ?? 0;
            return bt - at;
          });
        setConversations(docs);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [user]);

  // ── Firestore: listen to all parish groups and canonical memberships ──────
  // The membership document is the source of truth. Listening to the parish
  // groups first means newly created groups are covered automatically, while
  // listening to groupMembers/{groupId}_{uid} avoids replacing memberships
  // from a broad query that can briefly be stale after a reconnect.
  useEffect(() => {
    const parishId = profile?.parishId ?? profile?.priestParishId;
    if (!user || !parishId) {
      setGroupConversations([]);
      return;
    }

    let active = true;
    const states = new Map<string, GroupMembershipState>();

    const emit = () => {
      if (!active) return;
      setGroupConversations(
        Array.from(states.values())
          .filter((state) => state.isMember)
          .map((state) =>
            normalizeGroupConversation(state.id, state.groupData, state.conversationData),
          )
          .sort((a, b) => {
            const at = a.lastMessageAt?.seconds ?? 0;
            const bt = b.lastMessageAt?.seconds ?? 0;
            return bt - at || a.name.localeCompare(b.name, "fr");
          }),
      );
    };

    const removeState = (groupId: string) => {
      const state = states.get(groupId);
      if (!state) return;
      state.membershipUnsubscribe?.();
      state.conversationUnsubscribe?.();
      states.delete(groupId);
    };

    const unsubscribeGroups = onSnapshot(
      query(collection(db, "groups"), where("parishId", "==", parishId)),
      (snapshot) => {
        const visibleGroupIds = new Set<string>();

        snapshot.docs.forEach((groupSnapshot) => {
          const groupId = groupSnapshot.id;
          visibleGroupIds.add(groupId);
          let state = states.get(groupId);

          if (!state) {
            state = {
              id: groupId,
              groupData: groupSnapshot.data() as Record<string, unknown>,
              conversationData: {},
              isMember: false,
            };
            states.set(groupId, state);

            state.membershipUnsubscribe = onSnapshot(
              doc(db, "groupMembers", `${groupId}_${user.uid}`),
              (membershipSnapshot) => {
                if (!active) return;
                state!.isMember = membershipSnapshot.exists();

                if (state!.isMember && !state!.conversationUnsubscribe) {
                  state!.conversationUnsubscribe = onSnapshot(
                    doc(db, "groupConversations", groupId),
                    (conversationSnapshot) => {
                      if (!active) return;
                      state!.conversationData = conversationSnapshot.exists()
                        ? (conversationSnapshot.data() as Record<string, unknown>)
                        : {};
                      emit();
                    },
                    (error) => {
                      console.error(
                        `[Chat] group conversation listener error for ${groupId}:`,
                        error.code,
                        error.message,
                      );
                    },
                  );
                } else if (!state!.isMember && state!.conversationUnsubscribe) {
                  state!.conversationUnsubscribe();
                  state!.conversationUnsubscribe = undefined;
                  state!.conversationData = {};
                }

                emit();
              },
              (error) => {
                console.error(
                  `[Chat] group membership listener error for ${groupId}:`,
                  error.code,
                  error.message,
                );
              },
            );
          } else {
            state.groupData = groupSnapshot.data() as Record<string, unknown>;
          }
        });

        Array.from(states.keys()).forEach((groupId) => {
          if (!visibleGroupIds.has(groupId)) removeState(groupId);
        });
        emit();
      },
      (error) => {
        console.error("[Chat] groups listener error:", error.code, error.message);
      },
    );

    return () => {
      active = false;
      unsubscribeGroups();
      states.forEach((state) => {
        state.membershipUnsubscribe?.();
        state.conversationUnsubscribe?.();
      });
      states.clear();
    };
  }, [profile?.parishId, profile?.priestParishId, user?.uid]);

  // ── Search users when the combined search field contains a name ───────────
  useEffect(() => {
    const term = search.trim();
    if (!term || !user) {
      setUserResults([]);
      setSearchingUsers(false);
      return;
    }

    let active = true;
    const timer = setTimeout(async () => {
      setSearchingUsers(true);
      try {
        const prefixes = [...new Set([
          term,
          term.charAt(0).toUpperCase() + term.slice(1),
        ])];
        const snapshots = await Promise.all(
          prefixes.map((prefix) =>
            getDocs(
              query(
                collection(db, "users"),
                where("displayName", ">=", prefix),
                where("displayName", "<=", prefix + "\uf8ff"),
                limit(20),
              ),
            ),
          ),
        );
        if (!active) return;
        const byId = new Map<string, UserResult>();
        snapshots.forEach((snapshot) => {
          snapshot.docs.forEach((userSnapshot) => {
            const data = userSnapshot.data();
            const displayName = typeof data.displayName === "string" ? data.displayName : "";
            if (
              userSnapshot.id !== user.uid &&
              displayName.toLowerCase().includes(term.toLowerCase())
            ) {
              byId.set(userSnapshot.id, {
                uid: userSnapshot.id,
                displayName,
                photoURL: typeof data.photoURL === "string" ? data.photoURL : null,
              });
            }
          });
        });
        setUserResults([...byId.values()]);
      } catch (error) {
        console.error("[Chat] user search error:", error);
        if (active) setUserResults([]);
      } finally {
        if (active) setSearchingUsers(false);
      }
    }, 300);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search, user]);

  const filteredConversations = useMemo(() => {
    if (!search.trim()) return conversations;
    const term = search.trim().toLowerCase();
    return conversations.filter((c) => {
      const otherUid = (Array.isArray(c.participants) ? c.participants : []).find((p) => p !== user?.uid) ?? "";
      const name = (userDirectory[otherUid]?.displayName ?? c.participantNames?.[otherUid] ?? "").toLowerCase();
      return name.includes(term);
    });
  }, [conversations, search, user?.uid, userDirectory]);

  const filteredGroupConversations = useMemo(() => {
    if (!search.trim()) return groupConversations;
    const term = search.trim().toLowerCase();
    return groupConversations.filter((conversation) => conversation.name.toLowerCase().includes(term));
  }, [groupConversations, search]);

  const availableUsers = useMemo(
    () => userResults.filter((candidate) =>
      !conversations.some((conversation) => conversation.participants.includes(candidate.uid)),
    ),
    [conversations, userResults],
  );

  const listData = useMemo<ChatListItem[]>(() => {
    if (!search.trim()) {
      const rows: ChatListItem[] = [];
      if (groupConversations.length > 0) {
        rows.push({ kind: "section", id: "group-conversations", label: "Groupes" });
        groupConversations.forEach((conversation) => {
          rows.push({ kind: "group", id: `group-${conversation.id}`, conversation });
        });
      }
      if (conversations.length > 0) {
        rows.push({ kind: "section", id: "private-conversations", label: "Conversations privées" });
        conversations.forEach((conversation) => {
          rows.push({ kind: "conversation", id: conversation.id, conversation });
        });
      }
      return rows;
    }

    const rows: ChatListItem[] = [];
    if (filteredGroupConversations.length > 0) {
      rows.push({ kind: "section", id: "matching-groups", label: "Groupes" });
      filteredGroupConversations.forEach((conversation) => {
        rows.push({ kind: "group", id: `group-${conversation.id}`, conversation });
      });
    }
    if (filteredConversations.length > 0) {
      rows.push({ kind: "section", id: "existing-conversations", label: "Conversations existantes" });
      filteredConversations.forEach((conversation) => {
        rows.push({ kind: "conversation", id: conversation.id, conversation });
      });
    }
    if (availableUsers.length > 0) {
      rows.push({ kind: "section", id: "new-conversations", label: "Démarrer une conversation" });
      availableUsers.forEach((candidate) => {
        rows.push({ kind: "user", id: candidate.uid, user: candidate });
      });
    }
    return rows;
  }, [
    availableUsers,
    conversations,
    filteredConversations,
    filteredGroupConversations,
    groupConversations,
    search,
  ]);

  const openOrStartConversation = useCallback(
    async (target: UserResult) => {
      if (!user || !profile || openingUid) return;
      setOpeningUid(target.uid);
      try {
        const existing = conversations.find((conversation) =>
          conversation.participants.includes(target.uid),
        );
        const conversationId = existing?.id ?? await ensureConversation({
          currentUid: user.uid,
          currentName: profile.displayName ?? user.displayName ?? "Paroissien",
          currentPhotoURL: profile.photoURL ?? null,
          targetUid: target.uid,
          targetName: target.displayName,
          targetPhotoURL: target.photoURL ?? null,
        });
        setSearch("");
        router.push(`/dm/${conversationId}`);
      } catch {
        Alert.alert("Erreur", "Impossible d’ouvrir la conversation. Réessayez.");
      } finally {
        setOpeningUid(null);
      }
    },
    [conversations, openingUid, profile, user],
  );

  if (!user) {
    return (
      <GuestScreen
        icon="message-circle"
        title="Connexion requise"
        message="Connectez-vous pour accéder à la messagerie paroissiale."
      />
    );
  }

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      {/* Search bar */}
      <View style={[s.searchBar, { backgroundColor: colors.card, borderColor: colors.border, margin: 12 }]}>
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          style={[s.searchInput, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
          placeholder="Rechercher un groupe ou démarrer une conversation…"
          placeholderTextColor={colors.mutedForeground}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {search !== "" && Platform.OS !== "ios" && (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Feather name="x" size={14} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={GOLD} size="large" />
        </View>
      ) : (
        <FlatList
          ref={chatListRef}
          data={listData}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            if (item.kind === "section") {
              return (
                <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>
                  {item.label}
                </Text>
              );
            }
            if (item.kind === "conversation") {
              return (
                <ConvRow
                  conv={item.conversation}
                  currentUid={user.uid}
                  userDirectory={userDirectory}
                  onAvatarPress={(url, name) => setViewingPhoto({ url, name })}
                />
              );
            }
            if (item.kind === "group") {
              return (
                <GroupConvRow
                  conversation={item.conversation}
                  currentUid={user.uid}
                />
              );
            }
            return (
              <TouchableOpacity
                style={[s.resultRow, { borderBottomColor: colors.border }]}
                onPress={() => { void openOrStartConversation(item.user); }}
                activeOpacity={0.72}
                disabled={openingUid !== null}
              >
                <Avatar name={item.user.displayName} size={46} photoURL={item.user.photoURL} />
                <View style={s.resultBody}>
                  <Text style={[s.resultName, { color: colors.foreground }]} numberOfLines={1}>
                    {item.user.displayName}
                  </Text>
                  <Text style={[s.resultHint, { color: colors.mutedForeground }]}>
                    Démarrer la conversation
                  </Text>
                </View>
                {openingUid === item.user.uid ? (
                  <ActivityIndicator size="small" color={GOLD} />
                ) : (
                  <Feather name="message-circle" size={17} color={GOLD} />
                )}
              </TouchableOpacity>
            );
          }}
          contentContainerStyle={{
            paddingBottom: insets.bottom + 80,
            flexGrow: 1,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={s.empty}>
              {searchingUsers ? (
                <ActivityIndicator color={GOLD} size="large" />
              ) : (
                <Feather name={search.trim() ? "user-x" : "message-circle"} size={52} color={colors.mutedForeground} />
              )}
              <Text style={[s.emptyTitle, { color: colors.foreground }]}>
                {search.trim() ? "Aucun résultat" : "Aucune conversation"}
              </Text>
              <Text style={[s.emptySub, { color: colors.mutedForeground }]}>
                {search.trim()
                  ? "Essayez un autre nom"
                  : "Recherchez un paroissien pour démarrer une conversation"}
              </Text>
            </View>
          }
        />
      )}

      <PhotoViewerModal
        visible={!!viewingPhoto}
        photoURL={viewingPhoto?.url}
        name={viewingPhoto?.name}
        onClose={() => setViewingPhoto(null)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1 },

  // Conversation row
  convRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  groupConvRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  groupIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  convPressArea: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  convBody: { flex: 1, gap: 3 },
  convTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  convName: { fontSize: 15, fontFamily: "Inter_600SemiBold", flex: 1 },
  convTimeWrap: { flexDirection: "row", alignItems: "center", gap: 6, marginLeft: 8 },
  convTime: { fontSize: 12, fontFamily: "Inter_400Regular", marginLeft: 8 },
  convPreview: { fontSize: 13, fontFamily: "Inter_400Regular" },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },

  // Search bar
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    minHeight: 20,
    padding: 0,
  },

  // States
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", justifyContent: "center", flex: 1, gap: 12, paddingTop: 80, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  sectionLabel: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  resultBody: { flex: 1, gap: 3 },
  resultName: { fontSize: 15, fontFamily: "Inter_500Medium" },
  resultHint: { fontSize: 12, fontFamily: "Inter_400Regular" },
});
