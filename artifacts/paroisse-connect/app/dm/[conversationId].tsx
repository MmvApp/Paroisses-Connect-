import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  View,
  Text,
  FlatList,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Pressable,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import {
  collection,
  deleteDoc,
  getDocs,
  query,
  orderBy,
  limit,
  onSnapshot,
  addDoc,
  serverTimestamp,
  doc,
  updateDoc,
} from "firebase/firestore";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, Stack, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { Avatar } from "@/components/ui/Avatar";
import { PhotoViewerModal } from "@/components/ui/PhotoViewerModal";
import { sendPushToUsers } from "@/lib/pushNotifications";

// ─── Constants ────────────────────────────────────────────────────────────────
/** Input bar height: paddingTop(10) + minInput(44) + paddingBottom(10) */
const INPUT_BAR_H = 64;
/** Minimum pixels delta to treat as "keyboard open" (ignores browser chrome resize) */
const KB_THRESHOLD = 120;

// ─── visualViewport keyboard hook (web only) ──────────────────────────────────
function useWebKeyboard() {
  const [kbHeight, setKbHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;

    const update = () => {
      const vv = window.visualViewport;
      if (!vv) return;
      const h = Math.max(0, window.innerHeight - vv.offsetTop - vv.height);
      setKbHeight(h);
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

// ─── Types ────────────────────────────────────────────────────────────────────
interface Message {
  id: string;
  text: string;
  authorId: string;
  authorName: string;
  createdAt: { seconds: number } | null;
}

interface ConvData {
  participantNames?: Record<string, string>;
  participantPhotos?: Record<string, string | null>;
  participants?: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}

function mapValue(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function normalizeMessage(id: string, data: Record<string, unknown>): Message {
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

function formatTime(seconds: number) {
  return new Date(seconds * 1000).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── MessageBubble ────────────────────────────────────────────────────────────
function MessageBubble({
  msg, isOwn, otherPhoto, onAvatarPress, onLongPress, onDeletePress, deleteActionVisible, deleting,
}: {
  msg: Message;
  isOwn: boolean;
  otherPhoto?: string | null;
  onAvatarPress?: () => void;
  onLongPress?: () => void;
  onDeletePress?: () => void;
  deleteActionVisible?: boolean;
  deleting?: boolean;
}) {
  const colors = useColors();
  return (
    <View style={[st.bubbleRow, isOwn && st.bubbleRowOwn]}>
      {!isOwn && (
        <Avatar name={msg.authorName} size={30} photoURL={otherPhoto} onPress={onAvatarPress} />
      )}
      <View style={{ maxWidth: "75%" }}>
        <Pressable
          onLongPress={isOwn ? onLongPress : undefined}
          delayLongPress={550}
          disabled={!isOwn || deleting}
          style={[
            st.bubble,
            {
              backgroundColor: isOwn ? colors.primary : colors.card,
              borderRadius: 18,
              borderBottomRightRadius: isOwn ? 4 : 18,
              borderBottomLeftRadius: isOwn ? 18 : 4,
              borderColor: colors.border,
              borderWidth: isOwn ? 0 : 1,
              opacity: deleting ? 0.55 : 1,
            },
          ]}
        >
          <Text style={[st.bubbleText, { color: isOwn ? "#fff" : colors.foreground }]}>
            {msg.text}
          </Text>
        </Pressable>
        <Text
          style={[
            st.bubbleTime,
            { color: colors.mutedForeground, textAlign: isOwn ? "right" : "left" },
          ]}
        >
          {msg.createdAt ? formatTime(msg.createdAt.seconds) : ""}
        </Text>
        {deleteActionVisible && isOwn && !deleting && (
          <TouchableOpacity
            style={[st.deleteAction, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={onDeletePress}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Supprimer le message"
          >
            <Feather name="trash-2" size={14} color="#D32F2F" />
            <Text style={st.deleteActionText}>Supprimer le message</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ─── ConversationScreen ───────────────────────────────────────────────────────
export default function ConversationScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, profile, userDirectory } = useAuth();
  const params = useLocalSearchParams<{ conversationId?: string | string[] }>();
  const rawConversationId = params.conversationId;
  const conversationId = Array.isArray(rawConversationId) ? rawConversationId[0] : rawConversationId;

  const [messages, setMessages] = useState<Message[]>([]);
  const [convData, setConvData] = useState<ConvData>({});
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [viewingPhoto, setViewingPhoto] = useState<{ url: string; name: string } | null>(null);
  const inputRef = useRef<TextInput>(null);

  const isWeb = Platform.OS === "web";
  const webKbH = useWebKeyboard();
  const kbOpen = isWeb && webKbH > KB_THRESHOLD;

  // ── Derive other participant info ──────────────────────────────────────────
  const participants = stringArray(convData.participants);
  const otherUid = participants.find((p) => p !== user?.uid) ?? "";
  const liveOtherProfile = userDirectory[otherUid];
  const rawOtherName = mapValue(convData.participantNames, otherUid);
  const otherName =
    liveOtherProfile?.displayName
      ?? (typeof rawOtherName === "string" && rawOtherName.trim()
      ? rawOtherName
      : "Message privé");
  const rawOtherPhoto = mapValue(convData.participantPhotos, otherUid);
  const otherPhoto =
    liveOtherProfile?.photoURL
      ?? (typeof rawOtherPhoto === "string" && rawOtherPhoto.trim()
      ? rawOtherPhoto
      : null);
  const openPhotoViewer = otherPhoto
    ? () => setViewingPhoto({ url: otherPhoto, name: otherName })
    : undefined;

  // ── Listen to conversation doc (names, photos) ─────────────────────────────
  useEffect(() => {
    if (!conversationId) return;
    const unsub = onSnapshot(
      doc(db, "conversations", conversationId),
      (snap) => { if (snap.exists()) setConvData(snap.data() as ConvData); },
      (err) => console.error("[DM] conv doc listener error:", err.code, err.message)
    );
    return unsub;
  }, [conversationId]);

  // Mark the conversation as read for this user. The timestamp is stored per
  // participant so another participant's unread state is never changed.
  useEffect(() => {
    if (!conversationId || !user?.uid) return;
    void updateDoc(doc(db, "conversations", conversationId), {
      [`lastReadAt.${user.uid}`]: serverTimestamp(),
    }).catch((err) => {
      console.warn("[DM] unable to mark conversation as read:", err);
    });
  }, [conversationId, user?.uid]);

  // ── Listen to messages ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!conversationId) return;
    const unsub = onSnapshot(
      query(
        collection(db, "conversations", conversationId, "messages"),
        orderBy("createdAt", "desc"),
        limit(100)
      ),
      (snap) => {
        console.log("[DM] messages snapshot:", snap.docs.length, "docs");
        setMessages(snap.docs.map((d) => normalizeMessage(d.id, d.data())));
      },
      (err) => {
        console.error("[DM] messages listener error:", err.code, err.message);
        if (err.code === "permission-denied") {
          Alert.alert(
            "Accès refusé",
            "Impossible de lire les messages. Les règles Firestore doivent être mises à jour. Contactez l'administrateur.",
            [{ text: "OK" }]
          );
        }
      }
    );
    return unsub;
  }, [conversationId]);

  const refreshConversationPreview = useCallback(async () => {
    if (!conversationId) return;

    const latestSnapshot = await getDocs(
      query(
        collection(db, "conversations", conversationId, "messages"),
        orderBy("createdAt", "desc"),
        limit(1),
      ),
    );
    const latestData = latestSnapshot.docs[0]?.data();

    await updateDoc(doc(db, "conversations", conversationId), {
      lastMessage: typeof latestData?.text === "string" ? latestData.text : "",
      lastMessageAt: latestData?.createdAt ?? null,
      lastMessageBy: typeof latestData?.authorId === "string" ? latestData.authorId : null,
    });
  }, [conversationId]);

  const deleteMessage = useCallback(async (messageId: string) => {
    if (!user?.uid || !conversationId || deletingMessageId) return;

    const message = messages.find((item) => item.id === messageId);
    if (!message || message.authorId !== user.uid) return;

    const wasLatestMessage = messages[0]?.id === messageId;
    setDeletingMessageId(messageId);
    setSelectedMessageId(null);
    try {
      await deleteDoc(doc(db, "conversations", conversationId, "messages", messageId));
      setMessages((currentMessages) => currentMessages.filter((item) => item.id !== messageId));
      if (wasLatestMessage) {
        await refreshConversationPreview();
      }
    } catch (error) {
      console.error("[DM] delete message error:", error);
      Alert.alert("Suppression impossible", "Le message n’a pas pu être supprimé. Réessayez.");
    } finally {
      setDeletingMessageId(null);
    }
  }, [conversationId, deletingMessageId, messages, refreshConversationPreview, user?.uid]);

  const confirmDeleteMessage = useCallback((messageId: string) => {
    const message = messages.find((item) => item.id === messageId);
    if (!user?.uid || !message || message.authorId !== user.uid || deletingMessageId) return;

    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm("Ce message sera supprimé pour tous les participants.")) {
        void deleteMessage(messageId);
      }
      return;
    }

    Alert.alert(
      "Supprimer le message ?",
      "Ce message sera supprimé pour tous les participants.",
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

  const offerDeleteMessage = useCallback((message: Message) => {
    if (!user?.uid || message.authorId !== user.uid || deletingMessageId) return;
    setSelectedMessageId(message.id);
  }, [deletingMessageId, user?.uid]);

  // ── Send ──────────────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || !user || sending || !conversationId) return;
    setSending(true);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    try {
      const msgPath = `conversations/${conversationId}/messages`;
      console.log("[DM] Envoi vers", msgPath, "| auteur:", user.uid);
      const ref = await addDoc(
        collection(db, "conversations", conversationId, "messages"),
        {
          text: trimmed,
          authorId: user.uid,
          authorName: profile?.displayName ?? "Anonyme",
          createdAt: serverTimestamp(),
        }
      );
      console.log("[DM] Message enregistré, id:", ref.id);
      // ← vide le champ SEULEMENT après confirmation de l'écriture
      setText("");
      await updateDoc(doc(db, "conversations", conversationId), {
        lastMessage: trimmed,
        lastMessageAt: serverTimestamp(),
        lastMessageBy: user.uid,
        ...(profile?.photoURL
          ? { [`participantPhotos.${user.uid}`]: profile.photoURL }
          : {}),
      });
      // Notification push à l'autre participant (fire-and-forget)
      if (otherUid) {
        void sendPushToUsers(
          [otherUid],
          profile?.displayName ?? "Nouveau message",
          trimmed.length > 100 ? trimmed.substring(0, 100) + "…" : trimmed,
          { screen: `/dm/${conversationId}` },
          "messages"
        );
      }
    } catch (err) {
      console.error("[DM] Erreur envoi:", err);
      Alert.alert(
        "Échec de l'envoi",
        `Le message n'a pas pu être envoyé.\n\n${String(err)}`,
        [{ text: "OK" }]
      );
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [text, user, profile, sending, conversationId]);

  // ── Shared input bar ───────────────────────────────────────────────────────
  const renderInputBar = (extraStyle?: object) => (
    <View
      style={[
        st.inputBar,
        {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
        },
        extraStyle,
      ]}
    >
      <TextInput
        ref={inputRef}
        style={[
          st.input,
          {
            backgroundColor: colors.background,
            color: colors.foreground,
            borderColor: colors.border,
            borderRadius: colors.radius,
            fontFamily: "Inter_400Regular",
          },
        ]}
        placeholder="Message privé…"
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
          st.sendBtn,
          {
            backgroundColor: text.trim() ? colors.primary : colors.secondary,
            borderRadius: colors.radius,
          },
        ]}
        onPress={handleSend}
        activeOpacity={0.8}
        disabled={!text.trim() || sending}
      >
        <Feather
          name="send"
          size={20}
          color={text.trim() ? "#fff" : colors.mutedForeground}
        />
      </TouchableOpacity>
    </View>
  );

  const EmptyState = (
    <View style={st.empty}>
      <Feather name="message-circle" size={44} color={colors.mutedForeground} />
      <Text style={[st.emptyText, { color: colors.mutedForeground }]}>
        Commencez la conversation !
      </Text>
    </View>
  );

  // ── Stack screen options (header with back button + other person's name) ───
  const ScreenOptions = (
    <Stack.Screen
      options={{
        title: otherName,
        headerLeft: () => (
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 4 }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="chevron-left" size={26} color={colors.primary} />
            {Platform.OS !== "ios" && (
              <Text style={{ color: colors.primary, fontFamily: "Inter_500Medium", fontSize: 15 }}>
                Retour
              </Text>
            )}
          </TouchableOpacity>
        ),
        headerRight: () => (
          <Avatar
            name={otherName}
            size={34}
            photoURL={otherPhoto}
            onPress={openPhotoViewer}
          />
        ),
      }}
    />
  );

  // ══════════════════════════════════════════════════════════════════════════
  // WEB layout — fixed input bar + spacer paddingTop on inverted FlatList
  // ══════════════════════════════════════════════════════════════════════════
  if (isWeb) {
    // No tab bar on dm screen — bottom offset = keyboard height (or 0)
    const inputBottom = kbOpen ? webKbH : 0;
    // With inverted FlatList: paddingTop = visual bottom spacer
    const listPaddingTop = INPUT_BAR_H + inputBottom + 8;

    const fixedBarStyle = {
      position: "fixed",
      bottom: inputBottom,
      left: 0,
      right: 0,
      zIndex: 200,
    } as object;

    return (
      <>
        {ScreenOptions}
        <View style={[st.container, { backgroundColor: colors.background, overflow: "hidden" }]}>
          <FlatList
            data={messages}
            keyExtractor={(m) => m.id}
            inverted
            renderItem={({ item }) => (
              <MessageBubble
                msg={{
                  ...item,
                  authorName: userDirectory[item.authorId]?.displayName ?? item.authorName,
                }}
                isOwn={item.authorId === user?.uid}
                otherPhoto={otherPhoto}
                onAvatarPress={openPhotoViewer}
                onLongPress={() => offerDeleteMessage(item)}
                onDeletePress={() => confirmDeleteMessage(item.id)}
                deleteActionVisible={selectedMessageId === item.id}
                deleting={deletingMessageId === item.id}
              />
            )}
            contentContainerStyle={{
              paddingHorizontal: 12,
              paddingTop: listPaddingTop,
              paddingBottom: 8,
            }}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={EmptyState}
          />
          {renderInputBar({
            ...fixedBarStyle,
            paddingBottom: Math.max(insets.bottom, 10),
          })}
        </View>
        <PhotoViewerModal
          visible={!!viewingPhoto}
          photoURL={viewingPhoto?.url}
          name={viewingPhoto?.name}
          onClose={() => setViewingPhoto(null)}
        />
      </>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // NATIVE (iOS / Android)
  // KeyboardAvoidingView shrinks the container when keyboard opens,
  // so the input bar naturally stays above the keyboard.
  // The FlatList (inverted) fills remaining space, newest msg at bottom.
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <>
      {ScreenOptions}
      <KeyboardAvoidingView
        style={[st.container, { backgroundColor: colors.background }]}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        <FlatList
          data={messages}
          keyExtractor={(m) => m.id}
          inverted
          renderItem={({ item }) => (
            <MessageBubble
              msg={{
                ...item,
                authorName: userDirectory[item.authorId]?.displayName ?? item.authorName,
              }}
              isOwn={item.authorId === user?.uid}
              otherPhoto={otherPhoto}
              onAvatarPress={openPhotoViewer}
              onLongPress={() => offerDeleteMessage(item)}
              onDeletePress={() => confirmDeleteMessage(item.id)}
              deleteActionVisible={selectedMessageId === item.id}
              deleting={deletingMessageId === item.id}
            />
          )}
          contentContainerStyle={{
            paddingHorizontal: 12,
            // With inverted FlatList, paddingTop = visual bottom (below newest msg)
            paddingTop: 8,
            paddingBottom: 8,
          }}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={EmptyState}
        />
        {renderInputBar({ paddingBottom: insets.bottom > 0 ? insets.bottom : 10 })}
      </KeyboardAvoidingView>
      <PhotoViewerModal
        visible={!!viewingPhoto}
        photoURL={viewingPhoto?.url}
        name={viewingPhoto?.name}
        onClose={() => setViewingPhoto(null)}
      />
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  container: { flex: 1 },

  bubbleRow: { flexDirection: "row", alignItems: "flex-end", marginBottom: 8, gap: 8 },
  bubbleRowOwn: { flexDirection: "row-reverse" },
  bubble: { paddingHorizontal: 14, paddingVertical: 10 },
  bubbleText: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22 },
  bubbleTime: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 3,
    paddingHorizontal: 2,
  },

  empty: {
    alignItems: "center",
    marginTop: 80,
    gap: 12,
    transform: [{ scaleY: -1 }],
  },
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

  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  input: {
    flex: 1,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxHeight: 120,
    fontSize: 15,
    minHeight: 44,
  },
  sendBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
});
