import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { Avatar } from "@/components/ui/Avatar";
import { PhotoViewerModal } from "@/components/ui/PhotoViewerModal";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { db } from "@/lib/firebase";
import { ensureGroupConversation } from "@/lib/groupConversations";

const INPUT_BAR_H = 64;
const KB_THRESHOLD = 120;

interface GroupData {
  name: string;
  description: string;
  parishId: string;
  memberCount: number;
  leader?: string;
  leaderUid?: string;
  icon?: string;
}

interface GroupMessage {
  id: string;
  text: string;
  authorId: string;
  authorName: string;
  createdAt: { seconds: number } | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeMessage(id: string, data: Record<string, unknown>): GroupMessage {
  const createdAt =
    isRecord(data.createdAt) && typeof data.createdAt.seconds === "number"
      ? { seconds: data.createdAt.seconds }
      : null;

  return {
    id,
    text: typeof data.text === "string" ? data.text : "",
    authorId: typeof data.authorId === "string" ? data.authorId : "",
    authorName:
      typeof data.authorName === "string" && data.authorName.trim()
        ? data.authorName
        : "Anonyme",
    createdAt,
  };
}

function formatTime(seconds: number): string {
  return new Date(seconds * 1000).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function useWebKeyboard(): number {
  const [kbHeight, setKbHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;

    const update = () => {
      const viewport = window.visualViewport;
      if (!viewport) return;
      setKbHeight(Math.max(0, window.innerHeight - viewport.offsetTop - viewport.height));
    };

    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    update();

    return () => {
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, []);

  return kbHeight;
}

function GroupMessageBubble({
  message,
  isOwn,
  authorName,
  authorPhoto,
  onAvatarPress,
  onLongPress,
  onDeletePress,
  deleteActionVisible,
  deleting,
}: {
  message: GroupMessage;
  isOwn: boolean;
  authorName: string;
  authorPhoto?: string | null;
  onAvatarPress?: () => void;
  onLongPress?: () => void;
  onDeletePress?: () => void;
  deleteActionVisible?: boolean;
  deleting?: boolean;
}) {
  const colors = useColors();

  return (
    <View style={[styles.messageRow, isOwn && styles.messageRowOwn]}>
      {!isOwn ? (
        <Avatar
          name={authorName}
          size={30}
          photoURL={authorPhoto}
          onPress={onAvatarPress}
        />
      ) : null}
      <View style={styles.messageColumn}>
        <Text
          style={[
            styles.authorName,
            { color: colors.mutedForeground, textAlign: isOwn ? "right" : "left" },
          ]}
          numberOfLines={1}
        >
          {authorName}
        </Text>
        <Pressable
          onLongPress={isOwn ? onLongPress : undefined}
          delayLongPress={550}
          disabled={!isOwn || deleting}
          style={[
            styles.bubble,
            {
              backgroundColor: isOwn ? colors.primary : colors.card,
              borderBottomRightRadius: isOwn ? 4 : 18,
              borderBottomLeftRadius: isOwn ? 18 : 4,
              borderColor: colors.border,
              borderWidth: isOwn ? 0 : 1,
              opacity: deleting ? 0.55 : 1,
            },
          ]}
        >
          <Text style={[styles.messageText, { color: isOwn ? "#fff" : colors.foreground }]}>
            {message.text}
          </Text>
        </Pressable>
        <Text
          style={[
            styles.messageTime,
            { color: colors.mutedForeground, textAlign: isOwn ? "right" : "left" },
          ]}
        >
          {message.createdAt ? formatTime(message.createdAt.seconds) : ""}
        </Text>
        {deleteActionVisible && isOwn && !deleting && (
          <TouchableOpacity
            style={[styles.deleteAction, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={onDeletePress}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Supprimer le message"
          >
            <Feather name="trash-2" size={14} color="#D32F2F" />
            <Text style={styles.deleteActionText}>Supprimer le message</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export default function GroupChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, profile, userDirectory } = useAuth();
  const params = useLocalSearchParams<{
    groupId?: string | string[];
    returnTo?: string | string[];
  }>();
  const rawGroupId = params.groupId;
  const groupId = Array.isArray(rawGroupId) ? rawGroupId[0] : rawGroupId;
  const rawReturnTo = params.returnTo;
  const returnTo = Array.isArray(rawReturnTo) ? rawReturnTo[0] : rawReturnTo;
  const previousRoute = returnTo === "group-info" && groupId
    ? `/group-info/${groupId}`
    : "/groups";

  const [group, setGroup] = useState<GroupData | null>(null);
  const [isMember, setIsMember] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [text, setText] = useState("");
  const [conversationReady, setConversationReady] = useState(false);
  const [sending, setSending] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [viewingPhoto, setViewingPhoto] = useState<{ url: string; name: string } | null>(null);
  const inputRef = useRef<TextInput>(null);

  const isWeb = Platform.OS === "web";
  const webKeyboardHeight = useWebKeyboard();
  const keyboardOpen = isWeb && webKeyboardHeight > KB_THRESHOLD;

  useEffect(() => {
    if (!groupId || !user?.uid) return;
    return onSnapshot(
      doc(db, "groups", groupId),
      (snapshot) => {
        if (!snapshot.exists()) {
          setGroup(null);
          return;
        }
        const data = snapshot.data();
        setGroup({
          name: typeof data.name === "string" ? data.name : "Groupe",
          description: typeof data.description === "string" ? data.description : "",
          parishId: typeof data.parishId === "string" ? data.parishId : "",
          memberCount: typeof data.memberCount === "number" ? data.memberCount : 0,
          leader: typeof data.leader === "string" ? data.leader : "",
          leaderUid: typeof data.leaderUid === "string" ? data.leaderUid : "",
          icon: typeof data.icon === "string" ? data.icon : "users",
        });
      },
      (error) => console.error("[GroupChat] group listener error:", error.code, error.message),
    );
  }, [groupId, user?.uid]);

  useEffect(() => {
    if (!groupId || !user?.uid) {
      setIsMember(null);
      return;
    }
    return onSnapshot(
      doc(db, "groupMembers", `${groupId}_${user.uid}`),
      (snapshot) => setIsMember(snapshot.exists()),
      (error) => {
        console.error("[GroupChat] membership listener error:", error.code, error.message);
        setIsMember(false);
      },
    );
  }, [groupId, user?.uid]);

  useEffect(() => {
    if (!groupId || !group || !isMember) {
      setConversationReady(false);
      return;
    }

    let active = true;
    void ensureGroupConversation({
      groupId,
      parishId: group.parishId,
      groupName: group.name,
    })
      .then(() => {
        if (active) setConversationReady(true);
      })
      .catch((error) => {
        console.error("[GroupChat] conversation setup error:", error);
        if (active) {
          setConversationReady(false);
          Alert.alert("Accès impossible", "Impossible d’ouvrir la conversation de ce groupe.");
        }
      });

    return () => {
      active = false;
    };
  }, [groupId, group, isMember]);

  useEffect(() => {
    if (!groupId || !conversationReady || !isMember) return;
    return onSnapshot(
      query(
        collection(db, "groupConversations", groupId, "messages"),
        orderBy("createdAt", "desc"),
        limit(100),
      ),
      (snapshot) => setMessages(snapshot.docs.map((item) => normalizeMessage(item.id, item.data()))),
      (error) => {
        console.error("[GroupChat] messages listener error:", error.code, error.message);
        if (error.code === "permission-denied") {
          setConversationReady(false);
          Alert.alert("Accès refusé", "Vous n’êtes plus membre de ce groupe.");
        }
      },
    );
  }, [conversationReady, groupId, isMember]);

  useEffect(() => {
    if (!groupId || !conversationReady || !user?.uid || !isMember) return;
    void updateDoc(doc(db, "groupConversations", groupId), {
      [`lastReadAt.${user.uid}`]: serverTimestamp(),
    }).catch((error) => {
      console.warn("[GroupChat] unable to mark conversation as read:", error);
    });
  }, [conversationReady, groupId, isMember, user?.uid]);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || !user || !profile || !group || !groupId || !conversationReady || sending) return;

    setSending(true);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    try {
      await addDoc(collection(db, "groupConversations", groupId, "messages"), {
        groupId,
        parishId: group.parishId,
        text: trimmed,
        authorId: user.uid,
        authorName: profile.displayName ?? user.displayName ?? "Anonyme",
        createdAt: serverTimestamp(),
      });
      setText("");
      await updateDoc(doc(db, "groupConversations", groupId), {
        name: group.name,
        lastMessage: trimmed,
        lastMessageAt: serverTimestamp(),
        lastMessageBy: user.uid,
      });
    } catch (error) {
      console.error("[GroupChat] send error:", error);
      Alert.alert("Échec de l’envoi", "Le message n’a pas pu être envoyé. Réessayez.");
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [conversationReady, group, groupId, profile, sending, text, user]);

  const refreshGroupPreview = useCallback(async () => {
    if (!groupId) return;

    const latestSnapshot = await getDocs(
      query(
        collection(db, "groupConversations", groupId, "messages"),
        orderBy("createdAt", "desc"),
        limit(1),
      ),
    );
    const latestData = latestSnapshot.docs[0]?.data();

    await updateDoc(doc(db, "groupConversations", groupId), {
      lastMessage: typeof latestData?.text === "string" ? latestData.text : "",
      lastMessageAt: latestData?.createdAt ?? null,
      lastMessageBy: typeof latestData?.authorId === "string" ? latestData.authorId : null,
    });
  }, [groupId]);

  const deleteMessage = useCallback(async (messageId: string) => {
    if (!user?.uid || !groupId || deletingMessageId) return;

    const message = messages.find((item) => item.id === messageId);
    if (!message || message.authorId !== user.uid) return;

    const wasLatestMessage = messages[0]?.id === messageId;
    setDeletingMessageId(messageId);
    setSelectedMessageId(null);
    try {
      await deleteDoc(doc(db, "groupConversations", groupId, "messages", messageId));
      setMessages((currentMessages) => currentMessages.filter((item) => item.id !== messageId));
      if (wasLatestMessage) {
        await refreshGroupPreview();
      }
    } catch (error) {
      console.error("[GroupChat] delete message error:", error);
      Alert.alert("Suppression impossible", "Le message n’a pas pu être supprimé. Réessayez.");
    } finally {
      setDeletingMessageId(null);
    }
  }, [deletingMessageId, groupId, messages, refreshGroupPreview, user?.uid]);

  const confirmDeleteMessage = useCallback((messageId: string) => {
    const message = messages.find((item) => item.id === messageId);
    if (!user?.uid || !message || message.authorId !== user.uid || deletingMessageId) return;

    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm("Ce message sera supprimé pour tous les membres du groupe.")) {
        void deleteMessage(messageId);
      }
      return;
    }

    Alert.alert(
      "Supprimer le message ?",
      "Ce message sera supprimé pour tous les membres du groupe.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: () => void deleteMessage(messageId),
        },
      ],
    );
  }, [deleteMessage, deletingMessageId, messages, user?.uid]);

  const offerDeleteMessage = useCallback((message: GroupMessage) => {
    if (!user?.uid || message.authorId !== user.uid || deletingMessageId) return;
    setSelectedMessageId(message.id);
  }, [deletingMessageId, user?.uid]);

  const authorFor = (message: GroupMessage) => ({
    name: userDirectory[message.authorId]?.displayName ?? message.authorName,
    photo: userDirectory[message.authorId]?.photoURL ?? null,
  });

  const groupHeader = (
    <View
      style={[
        styles.groupHeader,
        {
          backgroundColor: colors.card,
          borderBottomColor: colors.border,
          paddingTop: insets.top + 8,
        },
      ]}
    >
      <TouchableOpacity
        onPress={() => router.replace(previousRoute as never)}
        style={styles.headerBackButton}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel={returnTo === "group-info" ? "Retour aux informations du groupe" : "Retour à la liste des groupes"}
      >
        <Feather name="chevron-left" size={26} color={colors.primary} />
      </TouchableOpacity>
      {group ? (
        <TouchableOpacity
          style={styles.groupHeaderTitle}
          onPress={() => router.push(`/group-info/${groupId}`)}
          activeOpacity={0.72}
          accessibilityLabel={`Informations du groupe ${group.name}`}
        >
          <Text style={[styles.groupHeaderName, { color: colors.foreground }]} numberOfLines={1}>
            {group.name}
          </Text>
          <Text style={[styles.groupHeaderCount, { color: colors.mutedForeground }]}>
            {group.memberCount} membre{group.memberCount === 1 ? "" : "s"}
          </Text>
        </TouchableOpacity>
      ) : (
        <Text style={[styles.groupHeaderName, { color: colors.foreground }]}>Groupe</Text>
      )}
      <Feather name={(group?.icon ?? "users") as never} size={21} color={colors.primary} />
    </View>
  );

  const renderInputBar = (extraStyle?: object) => (
    <View
      style={[
        styles.inputBar,
        { backgroundColor: colors.card, borderTopColor: colors.border },
        extraStyle,
      ]}
    >
      <TextInput
        ref={inputRef}
        style={[
          styles.input,
          {
            backgroundColor: colors.background,
            color: colors.foreground,
            borderColor: colors.border,
            borderRadius: colors.radius,
            fontFamily: "Inter_400Regular",
          },
        ]}
        placeholder="Message au groupe…"
        placeholderTextColor={colors.mutedForeground}
        value={text}
        onChangeText={setText}
        multiline
        maxLength={500}
        returnKeyType="default"
        onSubmitEditing={Platform.OS === "web" ? handleSend : undefined}
      />
      <TouchableOpacity
        style={[
          styles.sendButton,
          {
            backgroundColor: text.trim() ? colors.primary : colors.secondary,
            borderRadius: colors.radius,
          },
        ]}
        onPress={handleSend}
        activeOpacity={0.8}
        disabled={!text.trim() || sending}
      >
        <Feather name="send" size={20} color={text.trim() ? "#fff" : colors.mutedForeground} />
      </TouchableOpacity>
    </View>
  );

  const emptyState = (
    <View style={styles.empty}>
      <Feather name="users" size={44} color={colors.mutedForeground} />
      <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
        Commencez la conversation du groupe !
      </Text>
    </View>
  );

  const accessState =
    !user ? "Connexion requise" :
    !group ? "Groupe introuvable" :
    isMember === false ? "Vous n’êtes plus membre de ce groupe." :
    null;

  if (accessState) {
    return (
      <>
        {groupHeader}
        <View style={[styles.state, { backgroundColor: colors.background }]}>
          <Feather name={accessState === "Connexion requise" ? "lock" : "users"} size={44} color={colors.mutedForeground} />
          <Text style={[styles.stateTitle, { color: colors.foreground }]}>{accessState}</Text>
          <TouchableOpacity onPress={() => router.back()} style={[styles.stateButton, { backgroundColor: colors.primary }]}>
            <Text style={[styles.stateButtonText, { color: colors.primaryForeground }]}>Retour aux messages</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  if (!conversationReady) {
    return (
      <>
        {groupHeader}
        <View style={[styles.state, { backgroundColor: colors.background }]}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={[styles.stateTitle, { color: colors.foreground }]}>Ouverture de la conversation…</Text>
        </View>
      </>
    );
  }

  const inputBottom = keyboardOpen ? webKeyboardHeight : 0;
  const listPaddingTop = INPUT_BAR_H + inputBottom + 8;
  const fixedBarStyle = isWeb
    ? ({
        position: "fixed",
        bottom: inputBottom,
        left: 0,
        right: 0,
        zIndex: 200,
      } as object)
    : undefined;

  const list = (
    <FlatList
      data={messages}
      keyExtractor={(message) => message.id}
      inverted
      renderItem={({ item }) => {
        const author = authorFor(item);
        return (
          <GroupMessageBubble
            message={item}
            isOwn={item.authorId === user?.uid}
            authorName={author.name}
            authorPhoto={author.photo}
            onAvatarPress={
              author.photo
                ? () => setViewingPhoto({ url: author.photo!, name: author.name })
                : undefined
            }
            onLongPress={() => offerDeleteMessage(item)}
            onDeletePress={() => confirmDeleteMessage(item.id)}
            deleteActionVisible={selectedMessageId === item.id}
            deleting={deletingMessageId === item.id}
          />
        );
      }}
      contentContainerStyle={{
        paddingHorizontal: 12,
        paddingTop: isWeb ? listPaddingTop : 8,
        paddingBottom: 8,
      }}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      ListEmptyComponent={emptyState}
    />
  );

  return (
    <>
      {isWeb ? (
        <View style={[styles.container, { backgroundColor: colors.background, overflow: "hidden" }]}>
          {groupHeader}
          {list}
          {renderInputBar({ ...fixedBarStyle, paddingBottom: Math.max(insets.bottom, 10) })}
        </View>
      ) : (
        <KeyboardAvoidingView
          style={[styles.container, { backgroundColor: colors.background }]}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          {groupHeader}
          {list}
          {renderInputBar({ paddingBottom: insets.bottom > 0 ? insets.bottom : 10 })}
        </KeyboardAvoidingView>
      )}
      <PhotoViewerModal
        visible={!!viewingPhoto}
        photoURL={viewingPhoto?.url}
        name={viewingPhoto?.name}
        onClose={() => setViewingPhoto(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, minWidth: 0 },
  messageRow: { flexDirection: "row", alignItems: "flex-end", marginBottom: 10, gap: 8, minWidth: 0 },
  messageRowOwn: { flexDirection: "row-reverse" },
  messageColumn: { maxWidth: "82%", minWidth: 0 },
  authorName: { fontSize: 11, fontFamily: "Inter_600SemiBold", marginBottom: 3, paddingHorizontal: 2 },
  bubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, minWidth: 0 },
  messageText: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22 },
  messageTime: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 3, paddingHorizontal: 2 },
  inputBar: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, gap: 10 },
  input: { flex: 1, minWidth: 0, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 10, maxHeight: 120, fontSize: 15, minHeight: 44 },
  sendButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  empty: { alignItems: "center", marginTop: 80, gap: 12, transform: [{ scaleY: -1 }] },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular" },
  deleteAction: {
    alignSelf: "flex-end",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  deleteActionText: { color: "#D32F2F", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  state: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 32 },
  stateTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  stateButton: { borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12 },
  stateButtonText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 66,
    paddingHorizontal: 14,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  headerBackButton: { width: 36, height: 42, alignItems: "center", justifyContent: "center" },
  groupHeaderTitle: { flex: 1, alignItems: "center", justifyContent: "center", minWidth: 0 },
  groupHeaderName: { fontSize: 16, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  groupHeaderCount: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2, textAlign: "center" },
});