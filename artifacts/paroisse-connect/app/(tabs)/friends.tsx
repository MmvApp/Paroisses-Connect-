import React, { useEffect, useState, useCallback } from "react";
import {
  Alert,
  View,
  Text,
  FlatList,
  RefreshControl,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import {
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  orderBy,
  limit,
  setDoc,
} from "firebase/firestore";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { Avatar } from "@/components/ui/Avatar";
import { PhotoViewerModal } from "@/components/ui/PhotoViewerModal";
import { Card } from "@/components/ui/Card";
import { GuestScreen } from "@/components/ui/GuestScreen";
import { sendPushToUsers } from "@/lib/pushNotifications";
import { conversationId, ensureConversation } from "@/lib/conversations";

interface FriendRequest {
  id: string;
  fromUid: string;
  fromName: string;
  fromPhotoURL?: string | null;
  toUid: string;
  toName: string;
  status: "pending" | "accepted" | "declined";
  createdAt: unknown;
}

interface Friendship {
  id: string;
  uids: string[];
  uid1: string;
  uid2: string;
  name1: string;
  name2: string;
  createdAt: unknown;
}

interface UserResult {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string | null;
}

export default function FriendsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, profile, userDirectory } = useAuth();

  const [activeTab, setActiveTab] = useState<"friends" | "requests">("friends");
  const [friends, setFriends] = useState<Friendship[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [pendingActions, setPendingActions] = useState<Record<string, boolean>>({});
  const [sentRequests, setSentRequests] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [viewingPhoto, setViewingPhoto] = useState<{ url: string; name: string } | null>(null);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 700);
  }, []);

  // Real-time listener for friendships
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(collection(db, "friendships"), where("uids", "array-contains", user.uid)),
      (snap) => {
        setFriends(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Friendship)));
      }
    );
    return unsub;
  }, [user]);

  // Real-time listener for incoming friend requests
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(
        collection(db, "friendRequests"),
        where("toUid", "==", user.uid),
        where("status", "==", "pending")
      ),
      (snap) => {
        setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() } as FriendRequest)));
      }
    );
    return unsub;
  }, [user]);

  // Track sent requests to avoid duplicates
  useEffect(() => {
    if (!user) return;
    getDocs(
      query(
        collection(db, "friendRequests"),
        where("fromUid", "==", user.uid),
        where("status", "==", "pending")
      )
    ).then((snap) => {
      setSentRequests(new Set(snap.docs.map((d) => d.data().toUid as string)));
    });
  }, [user]);

  const handleSearch = useCallback(async () => {
    const term = searchQuery.trim();
    if (!term || !user) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const snap = await getDocs(
        query(
          collection(db, "users"),
          where("displayName", ">=", term),
          where("displayName", "<=", term + "\uf8ff"),
          limit(15)
        )
      );
      const results = snap.docs
        .map((d) => ({ uid: d.id, ...d.data() } as UserResult))
        .filter((u) => u.uid !== user.uid);
      setSearchResults(results);
    } finally {
      setSearching(false);
    }
  }, [searchQuery, user]);

  useEffect(() => {
    const t = setTimeout(handleSearch, 350);
    return () => clearTimeout(t);
  }, [handleSearch]);

  const isFriend = useCallback(
    (uid: string) => friends.some((f) => f.uids.includes(uid)),
    [friends]
  );

  const sendRequest = async (target: UserResult) => {
    if (!user || !profile) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPendingActions((p) => ({ ...p, [target.uid]: true }));
    try {
      await addDoc(collection(db, "friendRequests"), {
        fromUid: user.uid,
        fromName: profile.displayName,
        fromPhotoURL: profile.photoURL ?? null,
        toUid: target.uid,
        toName: target.displayName,
        status: "pending",
        createdAt: serverTimestamp(),
      });
      // Notification push à la personne ciblée (fire-and-forget)
      void sendPushToUsers(
        [target.uid],
        "Nouvelle demande d'amis 👋",
        `${profile.displayName} vous a envoyé une demande d'amis`,
        { screen: "/(tabs)/friends", friendUid: user.uid },
        "messages"
      );
      setSentRequests((s) => new Set([...s, target.uid]));
    } finally {
      setPendingActions((p) => ({ ...p, [target.uid]: false }));
    }
  };

  const acceptRequest = async (req: FriendRequest) => {
    if (!user || !profile) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPendingActions((p) => ({ ...p, [req.id]: true }));
    try {
      await updateDoc(doc(db, "friendRequests", req.id), { status: "accepted" });
      const fid = conversationId(user.uid, req.fromUid);
      await setDoc(doc(db, "friendships", fid), {
        uids: [user.uid, req.fromUid].sort(),
        uid1: user.uid,
        uid2: req.fromUid,
        name1: profile.displayName,
        name2: req.fromName,
        createdAt: serverTimestamp(),
      });
    } finally {
      setPendingActions((p) => ({ ...p, [req.id]: false }));
    }
  };

  const declineRequest = async (req: FriendRequest) => {
    setPendingActions((p) => ({ ...p, [req.id]: true }));
    try {
      await updateDoc(doc(db, "friendRequests", req.id), { status: "declined" });
    } finally {
      setPendingActions((p) => ({ ...p, [req.id]: false }));
    }
  };

  const openDM = async (friendUid: string, friendName: string) => {
    if (!user || !profile) return;
    try {
      const cid = await ensureConversation({
        currentUid: user.uid,
        currentName: profile.displayName,
        currentPhotoURL: profile.photoURL,
        targetUid: friendUid,
        targetName: friendName,
      });
      router.push(`/dm/${cid}`);
    } catch {
      Alert.alert("Erreur", "Impossible d'ouvrir la conversation. Réessayez.");
    }
  };

  const getFriendInfo = (f: Friendship) => {
    if (!user) return { uid: "", name: "" };
    const isUid1 = f.uid1 === user.uid;
    const uid = isUid1 ? f.uid2 : f.uid1;
    const storedName = isUid1 ? f.name2 : f.name1;
    return { uid, name: userDirectory[uid]?.displayName ?? storedName };
  };

  if (!user) {
    return (
      <GuestScreen
        icon="users"
        title="Connexion requise"
        message="Connectez-vous pour accéder à votre réseau de paroissiens."
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Segment control */}
      <View style={[styles.segmentWrap, { marginHorizontal: 16, marginTop: 12 }]}>
        <View style={[styles.segment, { backgroundColor: colors.secondary, borderRadius: 12 }]}>
          {(["friends", "requests"] as const).map((tab) => {
            const active = activeTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                style={[
                  styles.segmentBtn,
                  active && { backgroundColor: colors.card, borderRadius: 10 },
                ]}
                onPress={() => setActiveTab(tab)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.segmentLabel,
                    {
                      color: active ? colors.primary : colors.mutedForeground,
                      fontFamily: active ? "Inter_600SemiBold" : "Inter_400Regular",
                    },
                  ]}
                >
                  {tab === "friends" ? "Mes amis" : `Demandes${requests.length > 0 ? ` (${requests.length})` : ""}`}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Search bar */}
      <View
        style={[
          styles.searchBar,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            marginHorizontal: 16,
            marginTop: 10,
          },
        ]}
      >
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          style={[
            styles.searchInput,
            { color: colors.foreground, fontFamily: "Inter_400Regular" },
          ]}
          placeholder="Rechercher un membre…"
          placeholderTextColor={colors.mutedForeground}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="search"
        />
        {searching && <ActivityIndicator size="small" color={colors.mutedForeground} />}
        {searchQuery !== "" && !searching && (
          <TouchableOpacity onPress={() => { setSearchQuery(""); setSearchResults([]); }}>
            <Feather name="x" size={14} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
      </View>

      {/* Search results overlay */}
      {searchQuery !== "" && (
        <View style={{ marginHorizontal: 16, marginTop: 4 }}>
          {searchResults.length === 0 && !searching ? (
            <Text style={[styles.emptySearch, { color: colors.mutedForeground }]}>
              Aucun membre trouvé
            </Text>
          ) : (
            searchResults.map((u) => {
              const already = isFriend(u.uid);
              const sent = sentRequests.has(u.uid);
              const busy = pendingActions[u.uid];
              return (
                <Card key={u.uid} style={styles.resultCard}>
                  <View style={styles.resultRow}>
                    <Avatar
                      name={u.displayName}
                      size={38}
                      photoURL={u.photoURL}
                      onPress={u.photoURL ? () => setViewingPhoto({ url: u.photoURL!, name: u.displayName }) : undefined}
                    />
                    <Text style={[styles.resultName, { color: colors.foreground }]}>
                      {u.displayName}
                    </Text>
                    {already ? (
                      <View style={[styles.tagBadge, { backgroundColor: colors.secondary }]}>
                        <Text style={[styles.tagText, { color: colors.mutedForeground }]}>
                          Ami
                        </Text>
                      </View>
                    ) : sent ? (
                      <View style={[styles.tagBadge, { backgroundColor: colors.secondary }]}>
                        <Text style={[styles.tagText, { color: colors.mutedForeground }]}>
                          Envoyée
                        </Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={[styles.addBtn, { backgroundColor: colors.primary }]}
                        onPress={() => sendRequest(u)}
                        disabled={!!busy}
                        activeOpacity={0.85}
                      >
                        {busy ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Feather name="user-plus" size={14} color="#fff" />
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                </Card>
              );
            })
          )}
        </View>
      )}

      {/* Tab content */}
      {activeTab === "friends" ? (
        <FlatList
          data={friends}
          keyExtractor={(f) => f.id}
          contentContainerStyle={{
            padding: 16,
            gap: 10,
            paddingBottom: insets.bottom + 100,
          }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#C9A24A" colors={["#C9A24A"]} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="users" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                Pas encore d'amis
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
                Recherchez des membres pour leur envoyer une demande
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const { uid, name } = getFriendInfo(item);
            const photoURL = userDirectory[uid]?.photoURL ?? null;
            return (
              <Card elevated style={styles.friendCard}>
                <View style={styles.friendRow}>
                  <Avatar name={name} size={44} photoURL={photoURL} />
                  <Text
                    style={[styles.friendName, { color: colors.foreground }]}
                  >
                    {name}
                  </Text>
                  <TouchableOpacity
                    style={[styles.msgBtn, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "44" }]}
                    onPress={() => openDM(uid, name)}
                    activeOpacity={0.8}
                  >
                    <Feather name="message-circle" size={16} color={colors.primary} />
                    <Text style={[styles.msgBtnText, { color: colors.primary }]}>
                      Message
                    </Text>
                  </TouchableOpacity>
                </View>
              </Card>
            );
          }}
        />
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{
            padding: 16,
            gap: 10,
            paddingBottom: insets.bottom + 100,
          }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#C9A24A" colors={["#C9A24A"]} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="inbox" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                Aucune demande
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
                Les demandes d'amitié reçues apparaîtront ici
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const busy = pendingActions[item.id];
            const requester = userDirectory[item.fromUid];
            const requesterName = requester?.displayName ?? item.fromName;
            const requesterPhoto = requester?.photoURL ?? item.fromPhotoURL;
            return (
              <Card elevated style={styles.requestCard}>
                <View style={styles.requestRow}>
                  <Avatar
                    name={requesterName}
                    size={44}
                    photoURL={requesterPhoto}
                    onPress={requesterPhoto ? () => setViewingPhoto({ url: requesterPhoto, name: requesterName }) : undefined}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.requestName, { color: colors.foreground }]}>
                      {requesterName}
                    </Text>
                    <Text style={[styles.requestSub, { color: colors.mutedForeground }]}>
                      Demande d'amitié
                    </Text>
                  </View>
                </View>
                <View style={styles.requestActions}>
                  <TouchableOpacity
                    style={[styles.declineBtn, { borderColor: colors.border }]}
                    onPress={() => declineRequest(item)}
                    disabled={!!busy}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.declineBtnText, { color: colors.mutedForeground }]}>
                      Refuser
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.acceptBtn, { backgroundColor: colors.primary }]}
                    onPress={() => acceptRequest(item)}
                    disabled={!!busy}
                    activeOpacity={0.85}
                  >
                    {busy ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.acceptBtnText}>Accepter</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </Card>
            );
          }}
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

const styles = StyleSheet.create({
  container: { flex: 1 },
  segmentWrap: {},
  segment: {
    flexDirection: "row",
    padding: 4,
  },
  segmentBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
  },
  segmentLabel: { fontSize: 13 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14 },
  emptySearch: { fontSize: 13, fontFamily: "Inter_400Regular", padding: 8 },
  resultCard: { padding: 10, marginBottom: 4 },
  resultRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  resultName: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
  tagBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  tagText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  addBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  friendCard: { padding: 14 },
  friendRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  friendName: { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold" },
  msgBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  msgBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  requestCard: { padding: 14, gap: 12 },
  requestRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  requestName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  requestSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  requestActions: { flexDirection: "row", gap: 10 },
  declineBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  declineBtnText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  acceptBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 10,
  },
  acceptBtnText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  emptyState: { alignItems: "center", paddingTop: 60, gap: 10 },
  emptyTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    maxWidth: 260,
    lineHeight: 20,
  },
});
