import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  ScrollView,
  Share,
  Alert,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
  RefreshControl,
  Switch,
} from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  doc as firestoreDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  Timestamp,
  writeBatch,
  increment,
  arrayUnion,
  arrayRemove,
  limit,
} from "firebase/firestore";
import { uploadToSupabase } from "@/lib/uploadToSupabase";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { useLocalSearchParams } from "expo-router";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/context/I18nContext";
import type { UserProfile } from "@/context/AuthContext";
import { useParishPermissions } from "@/hooks/useParishPermissions";
import { canDeletePublication } from "@/lib/publicationPermissions";
import { Avatar } from "@/components/ui/Avatar";
import { PhotoViewerModal } from "@/components/ui/PhotoViewerModal";
import { PublicationCard } from "@/components/ui/PublicationCard";
import { CompactFilterChip, CompactFilterRow } from "@/components/ui/CompactFilterRow";
import { PublicationPhotoPicker } from "@/components/ui/PublicationPhotoPicker";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { GuestBanner } from "@/components/ui/GuestBanner";
import { ConfirmSheet } from "@/components/ConfirmSheet";
import { sendPushToParish, sendPushToUsers } from "@/lib/pushNotifications";
import { subscribeToParishCollection } from "@/lib/subscribeParishCollection";
import { normalizePublicationImageUrls, uploadPublicationImages } from "@/lib/publicationMedia";
import { EventCard, type ParishEvent } from "./events";

// ─── Palette ──────────────────────────────────────────────────────────────────
const NAVY  = "#C9A24A";
const DARK  = "#111111";
const MUTED = "#666666";
const GOLD  = "#C9A24A";
const CREAM = "#FFF8EC";
const RED   = "#D32F2F";

// ─── Session view-dedup ───────────────────────────────────────────────────────
const viewedInSession = new Set<string>();

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtDateTime(seconds: number) {
  const d = new Date(seconds * 1000);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return "À l'instant";
  if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)} h`;
  if (diff < 604800)
    return `Il y a ${Math.floor(diff / 86400)} j`;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) +
    " · " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function isNew(seconds: number) {
  return Date.now() / 1000 - seconds < 86400; // < 24 h
}

// ─── Types ────────────────────────────────────────────────────────────────────
const CATEGORIES = ["Général", "Messe", "Événement", "Jeunesse", "Solidarité", "Aide"] as const;
type Category = typeof CATEGORIES[number];

interface Announcement {
  id: string;
  title: string;
  content: string;
  authorName: string;
  authorId: string;
  authorPhotoURL?: string | null;
  parishId?: string | null;
  parishName?: string;
  createdAt: { seconds: number } | null;
  category: Category | string;
  imageUrls?: string[];
  imageUrl?: string | null;
  likeCount?: number;
  likedBy?: string[];
  commentCount?: number;
  shareCount?: number;
  viewCount?: number;
  isPinned?: boolean;
  isUrgent?: boolean;
}

type FeedItem =
  | { kind: "announcement"; item: Announcement }
  | { kind: "event"; item: ParishEvent };

interface Comment {
  id: string;
  text: string;
  authorName: string;
  authorId: string;
  authorPhotoURL?: string | null;
  createdAt: { seconds: number } | null;
  updatedAt?: { seconds: number } | null;
}

// ════════════════════════════════════════════════════════════════════════════
//  COMMENT SHEET
// ════════════════════════════════════════════════════════════════════════════
function CommentSheet({
  postId,
  visible,
  onClose,
}: {
  postId: string | null;
  visible: boolean;
  onClose: () => void;
}) {
  const { user, profile, userDirectory } = useAuth();
  const insets = useSafeAreaInsets();
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [menuComment, setMenuComment] = useState<Comment | null>(null);
  const [editingComment, setEditingComment] = useState<Comment | null>(null);
  const [editText, setEditText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Comment | null>(null);

  useEffect(() => {
    if (!postId || !visible) return;
    const unsub = onSnapshot(
      query(collection(db, "announcements", postId, "comments"), orderBy("createdAt", "asc"), limit(100)),
      (snap) => setComments(snap.docs.map((d) => {
        const data = d.data();
        const authorId = typeof data.authorId === "string" ? data.authorId : "";
        const liveAuthor = userDirectory[authorId];
        return {
          id: d.id,
          ...data,
          authorName: liveAuthor?.displayName ?? data.authorName,
          authorPhotoURL: liveAuthor?.photoURL ?? data.authorPhotoURL ?? null,
        } as Comment;
      })),
      (error) => {
        console.error("Unable to read announcement comments", error);
        setComments([]);
      },
    );
    return unsub;
  }, [postId, visible, userDirectory]);

  const handleSend = async () => {
    const body = text.trim();
    if (!body || !postId || !user) return;
    setPosting(true);
    try {
      const commentRef = firestoreDoc(collection(db, "announcements", postId, "comments"));
      const batch = writeBatch(db);
      batch.set(commentRef, {
        text: body,
        authorId: user.uid,
        authorName: profile?.displayName ?? "Anonyme",
        authorPhotoURL: profile?.photoURL ?? null,
        createdAt: serverTimestamp(),
      });
      batch.update(doc(db, "announcements", postId), { commentCount: increment(1) });
      await batch.commit();
      setComments((current) => current.some((comment) => comment.id === commentRef.id)
        ? current
        : [...current, {
          id: commentRef.id,
          text: body,
          authorId: user.uid,
          authorName: profile?.displayName ?? "Anonyme",
          authorPhotoURL: profile?.photoURL ?? null,
          createdAt: Timestamp.now(),
        }]);
      setText("");
      void getDoc(doc(db, "announcements", postId)).then((postSnap) => {
        const authorId = postSnap.data()?.authorId;
        if (typeof authorId !== "string" || authorId === user.uid) return;
        void sendPushToUsers(
          [authorId],
          `${profile?.displayName ?? "Un paroissien"} a commenté votre actualité`,
          body.length > 100 ? `${body.substring(0, 100)}…` : body,
          { screen: "/(tabs)/announcements", announcementId: postId, openComments: true },
          "announcements",
        );
      }).catch(() => {});
    } catch (error) {
      console.error("Unable to create announcement comment", error);
      Alert.alert("Erreur", "Impossible d'envoyer le commentaire.");
    } finally {
      setPosting(false);
    }
  };

  const openEdit = (comment: Comment) => {
    setMenuComment(null);
    setEditingComment(comment);
    setEditText(comment.text);
  };

  const handleSaveEdit = async () => {
    const body = editText.trim();
    if (!body || !postId || !editingComment || !user) return;
    setSavingEdit(true);
    try {
      await updateDoc(
        doc(db, "announcements", postId, "comments", editingComment.id),
        { text: body, updatedAt: serverTimestamp() },
      );
      setComments((current) => current.map((comment) =>
        comment.id === editingComment.id
          ? { ...comment, text: body, updatedAt: Timestamp.now() }
          : comment,
      ));
      setEditingComment(null);
      setEditText("");
    } catch (error) {
      console.error("Unable to edit announcement comment", error);
      Alert.alert("Erreur", "Impossible de modifier le commentaire.");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async () => {
    if (!postId || !confirmDelete) return;
    const comment = confirmDelete;
    setConfirmDelete(null);
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, "announcements", postId, "comments", comment.id));
      batch.update(doc(db, "announcements", postId), {
        commentCount: increment(-1),
      });
      await batch.commit();
      setComments((current) => current.filter((item) => item.id !== comment.id));
    } catch (error) {
      console.error("Unable to delete announcement comment", error);
      Alert.alert("Erreur", "Impossible de supprimer le commentaire.");
    }
  };

  return (
    <>
      <Modal
        visible={menuComment !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuComment(null)}
      >
        <View style={csh.menuOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setMenuComment(null)}
          />
          <View style={csh.menuCard}>
            <Text style={csh.menuTitle}>Commentaire</Text>
            <TouchableOpacity
              style={csh.menuItem}
              onPress={() => menuComment && openEdit(menuComment)}
            >
              <Feather name="edit-2" size={16} color={DARK} />
              <Text style={csh.menuItemText}>Modifier</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={csh.menuItem}
              onPress={() => {
                const comment = menuComment;
                setMenuComment(null);
                if (comment) setConfirmDelete(comment);
              }}
            >
              <Feather name="trash-2" size={16} color={RED} />
              <Text style={[csh.menuItemText, { color: RED }]}>Supprimer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={editingComment !== null}
        transparent
        animationType="fade"
        onRequestClose={() => !savingEdit && setEditingComment(null)}
      >
        <KeyboardAvoidingView
          style={csh.editOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={csh.editCard}>
            <Text style={csh.editTitle}>Modifier le commentaire</Text>
            <TextInput
              style={csh.editInput}
              value={editText}
              onChangeText={setEditText}
              multiline
              maxLength={500}
              autoFocus
              placeholder="Votre commentaire…"
              placeholderTextColor="#9AA3B0"
            />
            <View style={csh.editActions}>
              <TouchableOpacity
                style={[csh.editAction, csh.editCancel]}
                onPress={() => setEditingComment(null)}
                disabled={savingEdit}
              >
                <Text style={csh.editCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  csh.editAction,
                  csh.editSave,
                  (!editText.trim() || savingEdit) && csh.editSaveDisabled,
                ]}
                onPress={handleSaveEdit}
                disabled={!editText.trim() || savingEdit}
              >
                {savingEdit
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={csh.editSaveText}>Enregistrer</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: "#fff" }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={csh.header}>
          <Text style={csh.title}>Commentaires</Text>
          <TouchableOpacity onPress={onClose} style={{ padding: 6 }}>
            <Feather name="x" size={22} color={DARK} />
          </TouchableOpacity>
        </View>

        <FlatList
          data={comments}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
          ListEmptyComponent={
            <View style={csh.empty}>
              <Feather name="message-circle" size={40} color="#D0D5DC" />
              <Text style={csh.emptyText}>Aucun commentaire pour l'instant</Text>
              <Text style={csh.emptyHint}>Soyez le premier à réagir ✨</Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(index * 25).duration(260)} style={csh.row}>
              <Avatar name={item.authorName} size={36} photoURL={item.authorPhotoURL} />
              <View style={csh.bubble}>
                <View style={csh.bubbleHeader}>
                  <Text style={csh.bubbleAuthor}>{item.authorName}</Text>
                  <View style={csh.metaRight}>
                    <Text style={csh.bubbleTime}>{item.createdAt ? fmtDateTime(item.createdAt.seconds) : ""}</Text>
                    {item.updatedAt && <Text style={csh.editedLabel}>Modifié</Text>}
                  </View>
                </View>
                <Text style={csh.bubbleText}>{item.text}</Text>
              </View>
              {item.authorId === user?.uid && (
                <TouchableOpacity
                  onPress={() => setMenuComment(item)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={csh.menuButton}
                  accessibilityLabel="Actions du commentaire"
                >
                  <Feather name="more-vertical" size={17} color="#9AA3B0" />
                </TouchableOpacity>
              )}
            </Animated.View>
          )}
        />

        <View style={[csh.inputRow, { paddingBottom: insets.bottom + 10 }]}>
          <Avatar name={profile?.displayName ?? "?"} size={34} photoURL={profile?.photoURL} />
          <TextInput
            style={csh.input}
            placeholder="Écrire un commentaire…"
            placeholderTextColor="#9AA3B0"
            value={text}
            onChangeText={setText}
            multiline
          />
          <TouchableOpacity
            style={[csh.sendBtn, { backgroundColor: text.trim() ? NAVY : "#DDE2EA" }]}
            onPress={handleSend}
            disabled={!text.trim() || posting}
            activeOpacity={0.8}
          >
            {posting ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="send" size={15} color="#fff" />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
      </Modal>

      <ConfirmSheet
        visible={confirmDelete !== null}
        title="Supprimer ce commentaire ?"
        message="Cette action est définitive."
        confirmLabel="Oui, supprimer"
        confirmColor={RED}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </>
  );
}

const csh = StyleSheet.create({
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: "#F0EDE8",
  },
  title: { fontSize: 17, fontFamily: "Inter_700Bold", color: DARK },
  empty: { alignItems: "center", paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#9AA3B0" },
  emptyHint: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#C0C7D0" },
  row: { flexDirection: "row", gap: 10, marginBottom: 14 },
  bubble: { flex: 1, backgroundColor: CREAM, borderRadius: 14, padding: 12 },
  bubbleHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  metaRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  bubbleAuthor: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: DARK },
  bubbleTime: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#9AA3B0" },
  editedLabel: { fontSize: 10, fontFamily: "Inter_400Regular", color: "#9AA3B0" },
  bubbleText: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#3A4A60", lineHeight: 20 },
  menuButton: { paddingTop: 10, paddingLeft: 1 },
  menuOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.18)" },
  menuCard: {
    margin: 16,
    borderRadius: 14,
    padding: 8,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  menuTitle: { paddingHorizontal: 10, paddingVertical: 8, fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#9AA3B0" },
  menuItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 10, paddingVertical: 12 },
  menuItemText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: DARK },
  editOverlay: { flex: 1, justifyContent: "center", padding: 20, backgroundColor: "rgba(0,0,0,0.35)" },
  editCard: { borderRadius: 18, padding: 18, backgroundColor: "#fff" },
  editTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: DARK, marginBottom: 12 },
  editInput: {
    minHeight: 90,
    maxHeight: 150,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: CREAM,
    color: DARK,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlignVertical: "top",
  },
  editActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 14 },
  editAction: { minWidth: 100, minHeight: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  editCancel: { backgroundColor: "#F3F4F6" },
  editSave: { backgroundColor: NAVY },
  editSaveDisabled: { backgroundColor: "#DDE2EA" },
  editCancelText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: DARK },
  editSaveText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
  inputRow: {
    flexDirection: "row", alignItems: "flex-end", gap: 10,
    paddingHorizontal: 14, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: "#F0EDE8", backgroundColor: "#fff",
  },
  input: {
    flex: 1, minHeight: 40, maxHeight: 90,
    backgroundColor: CREAM, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 9,
    fontSize: 14, fontFamily: "Inter_400Regular", color: DARK,
  },
  sendBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
});

// ════════════════════════════════════════════════════════════════════════════
//  PUBLISH MODAL
// ════════════════════════════════════════════════════════════════════════════
function PublishModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const { canManage: isPrivileged } = useParishPermissions();

  const [title, setTitle]       = useState("");
  const [content, setContent]   = useState("");
  const [category, setCategory] = useState<Category>("Général");
  const [imageUris, setImageUris] = useState<string[]>([]);
  const [isUrgent, setIsUrgent] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [posting, setPosting]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const [titleErr, setTitleErr] = useState("");
  const [contentErr, setContentErr] = useState("");

  const reset = () => {
    setTitle(""); setContent(""); setCategory("Général");
    setImageUris([]); setIsUrgent(false); setIsPinned(false);
    setPosting(false); setUploading(false); setTitleErr(""); setContentErr("");
  };
  const handleClose = () => { reset(); onClose(); };

  const handlePublish = async () => {
    let ok = true;
    if (!title.trim()) { setTitleErr("Le titre est requis."); ok = false; } else setTitleErr("");
    if (!content.trim()) { setContentErr("Le texte est requis."); ok = false; } else setContentErr("");
    if (!ok) return;

    setPosting(true);
    try {
      let imageUrls: string[] = [];
      if (imageUris.length > 0) {
        setUploading(true);
        try {
          imageUrls = await uploadPublicationImages(imageUris, "announcements");
        } catch (err) {
          setUploading(false);
          setPosting(false);
          Alert.alert(
            "Erreur photo",
            err instanceof Error ? err.message : "Impossible de téléverser la photo. Réessayez.",
          );
          return;
        }
        setUploading(false);
      }
      const announcementRef = await addDoc(collection(db, "announcements"), {
        title: title.trim(),
        content: content.trim(),
        category,
        authorId: user?.uid,
        authorName: profile?.displayName ?? "Anonyme",
        authorPhotoURL: profile?.photoURL ?? null,
        parishId: profile?.parishId ?? profile?.priestParishId ?? null,
        parishName: profile?.parishName ?? null,
        createdAt: serverTimestamp(),
        imageUrls,
        imageUrl: imageUrls[0] ?? null,
        likeCount: 0,
        likedBy: [],
        commentCount: 0,
        shareCount: 0,
        viewCount: 0,
        isPinned,
        isUrgent,
      });
      // Notification push aux membres de la paroisse (fire-and-forget)
      if (profile?.parishId) {
        void sendPushToParish(
          profile.parishId,
          `📢 ${title.trim()}`,
          content.trim().length > 100 ? content.trim().substring(0, 100) + "…" : content.trim(),
          { screen: "/(tabs)/announcements", announcementId: announcementRef.id },
          "announcements",
          user?.uid
        );
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      handleClose();
    } catch {
      Alert.alert("Erreur", "Impossible de publier l'actualité.");
      setPosting(false);
    }
  };

  const canPublish = title.trim().length > 0 && content.trim().length > 0 && !posting;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: "#fff" }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        {/* ── Header ── */}
        <View style={[pm.header, { paddingTop: insets.top + 4 }]}>
          <TouchableOpacity onPress={handleClose} style={{ padding: 6, minWidth: 36 }}>
            <Feather name="x" size={22} color={DARK} />
          </TouchableOpacity>
          <Text style={pm.headerTitle}>Nouvelle actualité</Text>
          <TouchableOpacity
            style={[pm.pubBtn, !canPublish && { opacity: 0.45 }]}
            onPress={handlePublish}
            disabled={!canPublish}
            activeOpacity={0.8}
          >
            {posting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={pm.pubBtnText}>{uploading ? "Envoi…" : "Publier"}</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={[pm.body, { paddingBottom: insets.bottom + 48 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Author preview */}
          <View style={pm.authorRow}>
            <Avatar name={profile?.displayName ?? "?"} size={46} photoURL={profile?.photoURL} />
            <View>
              <Text style={pm.authorName}>{profile?.displayName ?? "Anonyme"}</Text>
              <Text style={pm.authorSub}>{profile?.parishName ?? "Paroisse Connect"}</Text>
            </View>
          </View>

          {/* Category chips */}
          <Text style={pm.label}>Catégorie</Text>
          <CompactFilterRow style={{ marginBottom: 18 }}>
            {CATEGORIES.map((cat) => (
              <CompactFilterChip
                key={cat}
                label={cat}
                onPress={() => setCategory(cat)}
                style={[pm.chip, { backgroundColor: category === cat ? NAVY : "#FFF8EC" }]}
                textStyle={[pm.chipText, { color: category === cat ? "#111111" : "#666666" }]}
              />
            ))}
          </CompactFilterRow>

          {/* Title */}
          <Text style={pm.label}>Titre *</Text>
          <TextInput
            style={[pm.titleInput, titleErr ? pm.fieldErr : null]}
            value={title}
            onChangeText={(v) => { setTitle(v); if (v.trim()) setTitleErr(""); }}
            placeholder="Titre de l'actualité…"
            placeholderTextColor="#9AA3B0"
            maxLength={120}
          />
          {titleErr ? <Text style={pm.errText}>{titleErr}</Text> : null}

          {/* Content */}
          <Text style={pm.label}>Texte *</Text>
          <TextInput
            style={[pm.contentInput, contentErr ? pm.fieldErr : null]}
            value={content}
            onChangeText={(v) => { setContent(v); if (v.trim()) setContentErr(""); }}
            placeholder="Rédigez votre actualité ici…"
            placeholderTextColor="#9AA3B0"
            multiline
            textAlignVertical="top"
          />
          {contentErr ? <Text style={pm.errText}>{contentErr}</Text> : null}

          <PublicationPhotoPicker
            localUris={imageUris}
            onLocalUrisChange={setImageUris}
            disabled={posting}
            uploading={uploading}
          />

          {/* Options */}
          <View style={pm.optionsCard}>
            {/* Urgent */}
            <View style={pm.optionRow}>
              <View style={pm.optionLeft}>
                <View style={[pm.optionIcon, { backgroundColor: "#FEE2E2" }]}>
                  <Feather name="alert-triangle" size={16} color={RED} />
                </View>
                <View>
                  <Text style={pm.optionLabel}>Marquer comme Urgent</Text>
                  <Text style={pm.optionHint}>Un badge rouge sera affiché</Text>
                </View>
              </View>
              <Switch
                value={isUrgent}
                onValueChange={setIsUrgent}
                trackColor={{ false: "#E0E0E0", true: RED + "55" }}
                thumbColor={isUrgent ? RED : "#fff"}
              />
            </View>

            {/* Pin (admin / priest only) */}
            {isPrivileged && (
              <View style={[pm.optionRow, { borderTopWidth: 1, borderTopColor: "#F0EDE8" }]}>
                <View style={pm.optionLeft}>
                  <View style={[pm.optionIcon, { backgroundColor: GOLD + "22" }]}>
                    <Feather name="bookmark" size={16} color={GOLD} />
                  </View>
                  <View>
                    <Text style={pm.optionLabel}>Épingler cette actualité</Text>
                    <Text style={pm.optionHint}>Elle apparaîtra en tête du fil</Text>
                  </View>
                </View>
                <Switch
                  value={isPinned}
                  onValueChange={setIsPinned}
                  trackColor={{ false: "#E0E0E0", true: GOLD + "88" }}
                  thumbColor={isPinned ? GOLD : "#fff"}
                />
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const pm = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: "#F0EDE8", backgroundColor: "#fff",
  },
  headerTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: DARK },
  pubBtn: {
    backgroundColor: NAVY, paddingHorizontal: 20, paddingVertical: 8,
    borderRadius: 20, minWidth: 80, alignItems: "center",
  },
  pubBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#111111" },
  body: { paddingHorizontal: 20, paddingTop: 20 },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 22 },
  authorName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: DARK },
  authorSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#7A7A8A", marginTop: 2 },
  label: {
    fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#7A7A8A",
    textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8,
  },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, marginRight: 8 },
  chipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  titleInput: {
    borderWidth: 1.5, borderColor: "#E5E0D8", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 17, fontFamily: "Inter_600SemiBold", color: DARK, marginBottom: 4,
  },
  contentInput: {
    borderWidth: 1.5, borderColor: "#E5E0D8", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, fontFamily: "Inter_400Regular", color: "#3A4A60",
    minHeight: 130, marginBottom: 4, lineHeight: 22,
  },
  fieldErr: { borderColor: "#dc2626" },
  errText: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#dc2626", marginBottom: 8 },
  imgPicker: {
    borderWidth: 2, borderColor: "#E5E0D8", borderStyle: "dashed", borderRadius: 14,
    paddingVertical: 30, alignItems: "center", gap: 8, backgroundColor: "#FAFAFA", marginBottom: 20,
  },
  imgPickerLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#7A7A8A" },
  imgPickerHint: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#9AA3B0" },
  imgWrap: { borderRadius: 14, overflow: "hidden", marginBottom: 20 },
  img: { width: "100%", height: 190 },
  removeImg: {
    position: "absolute", top: 10, right: 10,
    backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 16,
    width: 32, height: 32, alignItems: "center", justifyContent: "center",
  },
  optionsCard: {
    borderWidth: 1.5, borderColor: "#E5E0D8", borderRadius: 14,
    overflow: "hidden", marginBottom: 8,
  },
  optionRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14, paddingVertical: 14,
  },
  optionLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  optionIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  optionLabel: { fontSize: 14, fontFamily: "Inter_500Medium", color: DARK },
  optionHint: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#9AA3B0", marginTop: 1 },
});

// ════════════════════════════════════════════════════════════════════════════
//  POST ACTIONS SHEET  (⋯ menu)
// ════════════════════════════════════════════════════════════════════════════
function PostActionsSheet({
  visible,
  onClose,
  isOwner,
  isPrivileged,
  canDelete,
  isPinned,
  onDelete,
  onEdit,
  onReport,
  onTogglePin,
}: {
  visible: boolean;
  onClose: () => void;
  isOwner: boolean;
  isPrivileged: boolean;
  canDelete: boolean;
  isPinned: boolean;
  onDelete: () => void;
  onEdit: () => void;
  onReport: () => void;
  onTogglePin: () => void;
}) {
  const insets = useSafeAreaInsets();
  const canOwn = isOwner || isPrivileged;

  // Confirmation de suppression inline — pas d'Alert.alert (trop peu fiable
  // sur iOS Safari web et Android webview). L'état se réinitialise à chaque ouverture.
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Réinitialiser quand le sheet se ferme
  React.useEffect(() => {
    if (!visible) setConfirmingDelete(false);
  }, [visible]);

  const handleClose = () => {
    setConfirmingDelete(false);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      presentationStyle="overFullScreen"
      onRequestClose={handleClose}
    >
      <TouchableOpacity style={as.overlay} activeOpacity={1} onPress={handleClose} />
      <View style={[as.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <View style={as.handle} />

        {/* ── Mode confirmation suppression ── */}
        {confirmingDelete ? (
          <>
            <View style={as.confirmHeader}>
              <Feather name="alert-triangle" size={18} color={RED} />
              <Text style={as.confirmTitle}>Voulez-vous vraiment supprimer cette publication ?</Text>
            </View>
            <Text style={as.confirmSub}>Cette action est irréversible.</Text>

            <TouchableOpacity
              style={[as.confirmBtn, { backgroundColor: RED }]}
              onPress={() => { handleClose(); onDelete(); }}
              activeOpacity={0.8}
            >
              <Feather name="trash-2" size={18} color="#fff" />
              <Text style={as.confirmBtnText}>Oui, supprimer définitivement</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[as.confirmBtn, { backgroundColor: "#F3F4F6" }]}
              onPress={() => setConfirmingDelete(false)}
              activeOpacity={0.8}
            >
              <Text style={[as.confirmBtnText, { color: DARK }]}>Annuler</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            {/* ── Actions normales ── */}
            {canOwn && (
              <TouchableOpacity
                style={as.item}
                onPress={() => { handleClose(); setTimeout(onEdit, 250); }}
                activeOpacity={0.75}
              >
                <Feather name="edit-2" size={20} color={DARK} />
                <Text style={as.itemText}>Modifier</Text>
              </TouchableOpacity>
            )}

            {isPrivileged && (
              <TouchableOpacity
                style={as.item}
                onPress={() => { onTogglePin(); handleClose(); }}
                activeOpacity={0.75}
              >
                <Feather name="bookmark" size={20} color={GOLD} />
                <Text style={[as.itemText, { color: GOLD }]}>
                  {isPinned ? "Désépingler" : "Épingler"}
                </Text>
              </TouchableOpacity>
            )}

            {canDelete && (
              <TouchableOpacity
                style={as.item}
                onPress={() => setConfirmingDelete(true)}
                activeOpacity={0.75}
              >
                <Feather name="trash-2" size={20} color={RED} />
                <Text style={[as.itemText, { color: RED }]}>Supprimer</Text>
              </TouchableOpacity>
            )}

            {!isOwner && (
              <TouchableOpacity
                style={as.item}
                onPress={() => { handleClose(); setTimeout(onReport, 250); }}
                activeOpacity={0.75}
              >
                <Feather name="flag" size={20} color="#7A7A8A" />
                <Text style={as.itemText}>Signaler ce post</Text>
              </TouchableOpacity>
            )}

            <View style={as.separator} />
            <TouchableOpacity style={as.cancelItem} onPress={handleClose} activeOpacity={0.75}>
              <Text style={as.cancelText}>Annuler</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </Modal>
  );
}

const as = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    paddingHorizontal: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#DADDE3",
    alignSelf: "center",
    marginBottom: 14,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 15,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  itemText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: DARK,
  },
  separator: { height: 8 },
  cancelItem: { alignItems: "center", paddingVertical: 15 },
  cancelText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#7A7A8A" },

  // Styles confirmation suppression
  confirmHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 8,
    paddingBottom: 4,
    paddingHorizontal: 6,
  },
  confirmTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: RED },
  confirmSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#7A7A8A",
    paddingHorizontal: 6,
    marginBottom: 16,
  },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 10,
  },
  confirmBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});

// ════════════════════════════════════════════════════════════════════════════
//  EDIT ANNOUNCEMENT MODAL
// ════════════════════════════════════════════════════════════════════════════
function EditAnnouncementModal({
  visible,
  onClose,
  announcement,
}: {
  visible: boolean;
  onClose: () => void;
  announcement: Announcement | null;
}) {
  const insets = useSafeAreaInsets();
  const [title, setTitle]       = useState("");
  const [content, setContent]   = useState("");
  const [category, setCategory] = useState<Category>("Général");
  const [existingUrls, setExistingUrls] = useState<string[]>([]);
  const [imageUris, setImageUris] = useState<string[]>([]);
  const [saving, setSaving]     = useState(false);
  const [uploading, setUploading] = useState(false);
  const [titleErr, setTitleErr] = useState("");
  const [contentErr, setContentErr] = useState("");

  // Pre-fill when announcement changes
  useEffect(() => {
    if (announcement) {
      setTitle(announcement.title ?? "");
      setContent(announcement.content ?? "");
      setCategory((announcement.category as Category) ?? "Général");
      setExistingUrls(normalizePublicationImageUrls(announcement));
      setImageUris([]);
      setTitleErr("");
      setContentErr("");
    }
  }, [announcement]);

  const handleSave = async () => {
    let ok = true;
    if (!title.trim()) { setTitleErr("Le titre est requis."); ok = false; } else setTitleErr("");
    if (!content.trim()) { setContentErr("Le texte est requis."); ok = false; } else setContentErr("");
    if (!ok || !announcement) return;
    setSaving(true);
    try {
      setUploading(true);
      const uploadedUrls = imageUris.length > 0
        ? await uploadPublicationImages(imageUris, "announcements")
        : [];
      const imageUrls = [...existingUrls, ...uploadedUrls].slice(0, 2);
      await updateDoc(doc(db, "announcements", announcement.id), {
        title: title.trim(),
        content: content.trim(),
        category,
        imageUrls,
        imageUrl: imageUrls[0] ?? null,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    } catch {
      Alert.alert("Erreur", "Impossible de modifier ce post.");
    } finally {
      setUploading(false);
      setSaving(false);
    }
  };

  const canSave = title.trim().length > 0 && content.trim().length > 0 && !saving;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: "#fff" }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* Header */}
        <View style={[pm.header, { paddingTop: insets.top + 4 }]}>
          <TouchableOpacity onPress={onClose} style={{ padding: 6, minWidth: 36 }}>
            <Feather name="x" size={22} color={DARK} />
          </TouchableOpacity>
          <Text style={pm.headerTitle}>Modifier l'actualité</Text>
          <TouchableOpacity
            style={[pm.pubBtn, !canSave && { opacity: 0.45 }]}
            onPress={handleSave}
            disabled={!canSave || uploading}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={pm.pubBtnText}>Enregistrer</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={[pm.body, { paddingBottom: insets.bottom + 48 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Category chips */}
          <Text style={pm.label}>Catégorie</Text>
          <CompactFilterRow style={{ marginBottom: 18 }}>
            {CATEGORIES.map((cat) => (
              <CompactFilterChip
                key={cat}
                label={cat}
                onPress={() => setCategory(cat)}
                style={[pm.chip, { backgroundColor: category === cat ? NAVY : "#FFF8EC" }]}
                textStyle={[pm.chipText, { color: category === cat ? "#111111" : "#666666" }]}
              />
            ))}
          </CompactFilterRow>

          {/* Title */}
          <Text style={pm.label}>Titre *</Text>
          <TextInput
            style={[pm.titleInput, titleErr ? pm.fieldErr : null]}
            value={title}
            onChangeText={(v) => { setTitle(v); if (v.trim()) setTitleErr(""); }}
            placeholder="Titre de l'actualité…"
            placeholderTextColor="#9AA3B0"
            maxLength={120}
          />
          {titleErr ? <Text style={pm.errText}>{titleErr}</Text> : null}

          {/* Content */}
          <Text style={pm.label}>Texte *</Text>
          <TextInput
            style={[pm.contentInput, contentErr ? pm.fieldErr : null]}
            value={content}
            onChangeText={(v) => { setContent(v); if (v.trim()) setContentErr(""); }}
            placeholder="Rédigez votre actualité ici…"
            placeholderTextColor="#9AA3B0"
            multiline
            textAlignVertical="top"
          />
          {contentErr ? <Text style={pm.errText}>{contentErr}</Text> : null}

          <PublicationPhotoPicker
            localUris={imageUris}
            existingUrls={existingUrls}
            onLocalUrisChange={setImageUris}
            onExistingUrlsChange={setExistingUrls}
            disabled={saving}
            uploading={uploading}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  NEWS CARD  (Facebook-style)
// ════════════════════════════════════════════════════════════════════════════
function NewsCard({
  item,
  index,
  currentUid,
  currentRole,
  currentParishId,
  resolvedParishId,
  isPrivileged,
  onComment,
  onAuthorAvatarPress,
}: {
  item: Announcement;
  index: number;
  currentUid: string | undefined;
  currentRole: UserProfile["role"] | undefined;
  currentParishId: string | null | undefined;
  resolvedParishId: string | null | undefined;
  isPrivileged: boolean;
  onComment: (id: string) => void;
  onAuthorAvatarPress?: (url: string, name: string) => void;
}) {
  const { profile } = useAuth();
  const isOwner = currentUid === item.authorId;
  const canDelete = canDeletePublication(
    { userId: currentUid, role: currentRole, parishId: currentParishId },
    { ...item, parishId: resolvedParishId },
  );
  const liked   = currentUid ? (item.likedBy ?? []).includes(currentUid) : false;

  const [showActions, setShowActions] = useState(false);
  const [showEdit,    setShowEdit]    = useState(false);
  const { requireAuth } = useRequireAuth();

  // ── Derived badges ──
  const showNew    = item.createdAt && isNew(item.createdAt.seconds);
  const showEvent  = item.category === "Événement";
  const showUrgent = !!item.isUrgent;
  const showPinned = !!item.isPinned;

  // ── Stats ──
  const views    = item.viewCount ?? 0;
  const likes    = item.likeCount ?? 0;
  const comments = item.commentCount ?? 0;
  const shares   = item.shareCount ?? 0;
  const hasStats = views + likes + comments + shares > 0;

  const statsText = [
    views    > 0 ? `👁 ${fmtCount(views)} vue${views > 1 ? "s" : ""}` : "",
    likes    > 0 ? `❤️ ${fmtCount(likes)}` : "",
    comments > 0 ? `💬 ${fmtCount(comments)}` : "",
    shares   > 0 ? `↗ ${fmtCount(shares)}` : "",
  ].filter(Boolean).join("  ·  ");

  // ── Handlers ──
  const handleLike = async () => {
    if (!currentUid) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await updateDoc(doc(db, "announcements", item.id), {
      likedBy:   liked ? arrayRemove(currentUid) : arrayUnion(currentUid),
      likeCount: increment(liked ? -1 : 1),
    });
    if (!liked && item.authorId && item.authorId !== currentUid) {
      void sendPushToUsers(
        [item.authorId],
        `${profile?.displayName ?? "Un paroissien"} a aimé votre actualité`,
        item.title,
        { screen: "/(tabs)/announcements", announcementId: item.id },
        "announcements",
      );
    }
  };

  const handleShare = async () => {
    try {
      const result = await Share.share({
        title: item.title,
        message: `${item.title}\n\n${item.content}${item.parishName ? `\n\n— ${item.parishName}` : ""}`,
      });
      if (result.action === Share.sharedAction) {
        await updateDoc(doc(db, "announcements", item.id), { shareCount: increment(1) });
      }
    } catch { /* ignore */ }
  };

  // La confirmation est gérée dans PostActionsSheet (avant fermeture du modal).
  // handleDelete effectue uniquement la suppression Firestore.
  const handleDelete = async () => {
    try {
      await deleteDoc(doc(db, "announcements", item.id));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch {
      Alert.alert("Erreur", "Impossible de supprimer ce post. Réessayez.");
    }
  };

  const handleReport = () => {
    Alert.alert(
      "Signalement envoyé",
      "Merci. Notre équipe examinera ce contenu sous peu.",
      [{ text: "OK" }],
    );
  };

  const handleTogglePin = () => {
    updateDoc(doc(db, "announcements", item.id), { isPinned: !item.isPinned });
  };

  return (
    <>
      <Animated.View entering={FadeInDown.delay(Math.min(index, 5) * 55).duration(360)} style={nc.wrapper}>
        {showPinned && (
          <View style={nc.pinnedBanner}>
            <Feather name="bookmark" size={12} color={GOLD} />
            <Text style={nc.pinnedText}>Épinglée</Text>
          </View>
        )}
        <PublicationCard
          imageUrls={normalizePublicationImageUrls(item)}
          category={item.category || "Général"}
          badges={[
            ...(showUrgent ? [{ label: "URGENT", color: "rgba(211,47,47,0.9)" }] : []),
            ...(showNew ? [{ label: "NOUVEAU", color: "rgba(22,163,74,0.9)" }] : []),
          ]}
          timeLabel={item.createdAt ? fmtDateTime(item.createdAt.seconds) : ""}
          title={item.title}
          body={item.content}
          authorName={item.authorName}
          authorPhotoURL={item.authorPhotoURL}
          onAuthorAvatarPress={item.authorPhotoURL ? () => onAuthorAvatarPress?.(item.authorPhotoURL!, item.authorName) : undefined}
          topRight={
            <TouchableOpacity
              onPress={() => setShowActions(true)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={canDelete ? "Supprimer cette publication" : "Autres actions"}
              style={{
                backgroundColor: canDelete ? "rgba(211,47,47,0.94)" : "rgba(0,0,0,0.35)",
                borderRadius: 16,
                padding: 7,
              }}
            >
              <Feather name={canDelete ? "trash-2" : "more-horizontal"} size={18} color="#fff" />
            </TouchableOpacity>
          }
          style={showPinned ? { borderTopLeftRadius: 0, borderTopRightRadius: 0, borderTopWidth: 0, borderColor: GOLD + "40" } : undefined}
          footer={
            <View>
              {hasStats && (
                <View style={nc.statsRow}>
                  <Text style={nc.statsText}>{statsText}</Text>
                </View>
              )}
              <View style={nc.divider} />
              <View style={nc.actions}>
                <TouchableOpacity style={nc.actionBtn} onPress={() => requireAuth(handleLike)} activeOpacity={0.7}>
                  <Feather name="heart" size={19} color={liked ? "#E53935" : "#6B7280"} />
                  <Text style={[nc.actionLabel, liked && { color: "#E53935", fontFamily: "Inter_600SemiBold" }]}>J'aime</Text>
                </TouchableOpacity>
                <TouchableOpacity style={nc.actionBtn} onPress={() => requireAuth(() => onComment(item.id))} activeOpacity={0.7}>
                  <Feather name="message-circle" size={19} color="#6B7280" />
                  <Text style={nc.actionLabel}>Commenter</Text>
                </TouchableOpacity>
                <TouchableOpacity style={nc.actionBtn} onPress={handleShare} activeOpacity={0.7}>
                  <Feather name="share-2" size={19} color="#6B7280" />
                  <Text style={nc.actionLabel}>Partager</Text>
                </TouchableOpacity>
              </View>
            </View>
          }
        />
      </Animated.View>

      <PostActionsSheet
        visible={showActions}
        onClose={() => setShowActions(false)}
        isOwner={isOwner}
        isPrivileged={isPrivileged}
        canDelete={canDelete}
        isPinned={!!item.isPinned}
        onEdit={() => setShowEdit(true)}
        onDelete={handleDelete}
        onReport={handleReport}
        onTogglePin={handleTogglePin}
      />

      <EditAnnouncementModal
        visible={showEdit}
        onClose={() => setShowEdit(false)}
        announcement={item}
      />
    </>
  );
}

const nc = StyleSheet.create({
  wrapper: { marginBottom: 10 },
  pinnedBanner: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: GOLD + "18", paddingHorizontal: 14, paddingVertical: 6,
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    borderBottomWidth: 0,
  },
  pinnedText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: GOLD },
  card: {
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    backgroundColor: "#fff",
    borderRadius: 16,
    shadowColor: "#EADFCB",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
    overflow: "hidden",
  },
  cardPinned: {
    borderTopLeftRadius: 0, borderTopRightRadius: 0,
    borderWidth: 1.5, borderTopWidth: 0, borderColor: GOLD + "40",
  },

  // Header
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, paddingBottom: 10, minWidth: 0 },
  authorName: { fontSize: 14, fontFamily: "Inter_700Bold", color: DARK, flexShrink: 1 },
  parishRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 1 },
  parishName: { fontSize: 12, fontFamily: "Inter_500Medium", color: GOLD },
  dateText: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#9AA3B0", marginTop: 2 },
  moreBtn: { padding: 6 },

  // Badges
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: 14, marginBottom: 10 },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeText: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },

  // Body
  title: { fontSize: 17, fontFamily: "Inter_700Bold", color: DARK, lineHeight: 24, paddingHorizontal: 14, marginBottom: 8 },
  content: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#374151", lineHeight: 22, paddingHorizontal: 14 },
  readMore: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: GOLD, paddingHorizontal: 14, marginTop: 4 },

  // Image
  imgWrap: { marginTop: 10, width: "100%", maxWidth: "100%", minWidth: 0, height: 220 },
  img: { width: "100%", maxWidth: "100%", height: "100%" },

  // Stats
  statsRow: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4 },
  statsText: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#9AA3B0" },

  // Actions
  divider: { height: 1, backgroundColor: "#F3F4F6", marginHorizontal: 14, marginTop: 8 },
  actions: { flexDirection: "row", justifyContent: "space-around", paddingVertical: 6, paddingHorizontal: 8 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8 },
  actionLabel: { fontSize: 13, fontFamily: "Inter_500Medium", color: "#6B7280" },
});

// ════════════════════════════════════════════════════════════════════════════
//  CATEGORY FILTER BAR
// ════════════════════════════════════════════════════════════════════════════
const FILTER_CATS = ["Tous", ...CATEGORIES] as const;

function FilterBar({ active, onChange }: { active: string; onChange: (c: string) => void }) {
  const { t } = useI18n();
  return (
    <CompactFilterRow style={fb.scroll} contentContainerStyle={fb.bar}>
      {FILTER_CATS.map((cat) => (
        <CompactFilterChip
          key={cat}
          label={t(cat)}
          onPress={() => onChange(cat)}
          style={[fb.chip, { backgroundColor: active === cat ? NAVY : "#FFF8EC" }]}
          textStyle={[fb.chipText, { color: active === cat ? "#111111" : "#666666" }]}
          icon={active === cat && cat !== "Tous" ? <View style={fb.dot} /> : undefined}
        />
      ))}
    </CompactFilterRow>
  );
}

const fb = StyleSheet.create({
  scroll: { backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#F0EDE8" },
  bar: { paddingHorizontal: 14 },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  chipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: GOLD },
});

// ════════════════════════════════════════════════════════════════════════════
//  MAIN SCREEN
// ════════════════════════════════════════════════════════════════════════════
export default function ActualitesScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { user, profile, userDirectory } = useAuth();
  const params = useLocalSearchParams<{ announcementId?: string; openComments?: string }>();
  const { canManage: isPrivileged } = useParishPermissions();

  const [items, setItems]               = useState<Announcement[]>([]);
  const [events, setEvents]             = useState<ParishEvent[]>([]);
  const [activeCategory, setActiveCategory] = useState("Tous");
  const [refreshing, setRefreshing]     = useState(false);
  const [showPublish, setShowPublish]   = useState(false);
  const [commentPostId, setCommentPostId] = useState<string | null>(null);
  const [viewingPhoto, setViewingPhoto] = useState<{ url: string; name: string } | null>(null);
  const [legacyAuthorParishes, setLegacyAuthorParishes] = useState<Record<string, string | null>>({});
  const feedRef = useRef<FlatList<FeedItem>>(null);

  // Firestore listener
  useEffect(() => {
    const currentParishId = profile?.parishId ?? profile?.priestParishId ?? null;
    if (!user || !currentParishId) {
      setItems([]);
      setEvents([]);
      return;
    }

    const unsubscribeAnnouncements = subscribeToParishCollection(
      "announcements",
      currentParishId,
       (docs) => setItems(docs.map((d) => {
         const data = d.data();
         const authorId = typeof data.authorId === "string" ? data.authorId : "";
         const liveAuthor = userDirectory[authorId];
         return {
           id: d.id,
           ...data,
           authorName: liveAuthor?.displayName ?? data.authorName,
           authorPhotoURL: liveAuthor?.photoURL ?? data.authorPhotoURL ?? null,
         } as Announcement;
       })),
      () => setItems([]),
      user.uid,
    );

    const unsubscribeEvents = subscribeToParishCollection(
      "events",
      currentParishId,
      (docs) => setEvents(docs.map((d) => {
        const data = d.data();
        const authorId = typeof data.authorId === "string" ? data.authorId : "";
        const liveAuthor = userDirectory[authorId];
        return {
          id: d.id,
          ...data,
          participants: Array.isArray(data.participants)
            ? data.participants.filter((participant): participant is string => typeof participant === "string")
            : [],
          participantCount: typeof data.participantCount === "number" ? data.participantCount : 0,
          authorName: liveAuthor?.displayName ?? data.authorName,
          authorId,
          parishId: typeof data.parishId === "string" ? data.parishId : null,
        } as ParishEvent;
      })),
      () => setEvents([]),
      user.uid,
    );

    return () => {
      unsubscribeAnnouncements();
      unsubscribeEvents();
    };
  }, [user, profile?.parishId, profile?.priestParishId, userDirectory]);

  // Legacy announcements may not have parishId. Resolve the author's parish
  // only for priests so the client-side action matches Firestore's fallback.
  useEffect(() => {
    if (profile?.role !== "priest") return;
    const authorIds = [...new Set(
      items
        .filter((item) => !item.parishId && item.authorId && !(item.authorId in legacyAuthorParishes))
        .map((item) => item.authorId),
    )];
    if (authorIds.length === 0) return;

    let cancelled = false;
    Promise.all(authorIds.map(async (authorId) => {
      const snapshot = await getDoc(doc(db, "users", authorId));
      const data = snapshot.exists() ? snapshot.data() : null;
      return [authorId, (data?.parishId ?? data?.priestParishId ?? null) as string | null] as const;
    })).then((entries) => {
      if (cancelled) return;
      setLegacyAuthorParishes((current) => ({
        ...current,
        ...Object.fromEntries(entries),
      }));
    }).catch(() => {});

    return () => { cancelled = true; };
  }, [items, profile?.role, legacyAuthorParishes]);

  // Sort: pinned first, then chronological
  const filtered: FeedItem[] = [
    ...items
      .filter((item) => activeCategory === "Tous" || item.category === activeCategory)
      .map((item) => ({ kind: "announcement" as const, item })),
    ...events
      .filter(() => activeCategory === "Tous" || activeCategory === "Événement")
      .map((item) => ({ kind: "event" as const, item })),
  ].sort((a, b) => {
    if (a.item.isPinned && !b.item.isPinned) return -1;
    if (!a.item.isPinned && b.item.isPinned) return 1;
    return (b.item.createdAt?.seconds ?? 0) - (a.item.createdAt?.seconds ?? 0);
  });

  const openedNotification = useRef<string | null>(null);
  useEffect(() => {
    const announcementId = typeof params.announcementId === "string" ? params.announcementId : undefined;
    if (!announcementId) {
      openedNotification.current = null;
      return;
    }
    const key = `${announcementId}:${params.openComments === "true" ? "comments" : "post"}`;
    if (openedNotification.current === key) return;
    const index = filtered.findIndex((entry) =>
      entry.kind === "announcement" && entry.item.id === announcementId
    );
    if (index < 0) return;
    openedNotification.current = key;
    if (params.openComments === "true") {
      setCommentPostId(announcementId);
    } else {
      const timer = setTimeout(() => {
        feedRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.2 });
      }, 120);
      return () => clearTimeout(timer);
    }
  }, [params.announcementId, params.openComments, filtered]);

  // View tracking via viewabilityConfig (stable refs required)
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 });
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ item: FeedItem }> }) => {
      viewableItems.forEach(({ item: entry }) => {
        if (entry.kind !== "announcement") return;
        const item = entry.item;
        if (!viewedInSession.has(item.id)) {
          viewedInSession.add(item.id);
          updateDoc(doc(db, "announcements", item.id), { viewCount: increment(1) }).catch(() => {});
        }
      });
    }
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 700);
  }, []);

  return (
    <View style={ms.root}>
      {!user && <GuestBanner />}
      {/* Filter bar */}
      <Animated.View entering={FadeIn.duration(300)}>
        <FilterBar active={activeCategory} onChange={setActiveCategory} />
      </Animated.View>

      {/* Feed */}
      <FlatList
        ref={feedRef}
        data={filtered}
        keyExtractor={(entry) => `${entry.kind}-${entry.item.id}`}
        renderItem={({ item: entry, index }) =>
          entry.kind === "event" ? (
            <EventCard
              item={entry.item}
              index={index}
              currentUid={user?.uid}
              currentRole={profile?.role}
              currentParishId={profile?.parishId ?? profile?.priestParishId ?? null}
              isPrivileged={false}
              isAuthor={false}
              onEdit={() => {}}
            />
          ) : (
            <NewsCard
              item={entry.item}
              index={index}
              currentUid={user?.uid}
              currentRole={profile?.role}
              currentParishId={profile?.parishId ?? profile?.priestParishId ?? null}
              resolvedParishId={entry.item.parishId ?? legacyAuthorParishes[entry.item.authorId] ?? null}
              isPrivileged={isPrivileged}
              onComment={(id) => setCommentPostId(id)}
              onAuthorAvatarPress={(url, name) => setViewingPhoto({ url, name })}
            />
          )
        }
        contentContainerStyle={{
          paddingTop: 10,
          paddingHorizontal: 12,
          paddingBottom: insets.bottom + 110,
        }}
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged.current}
        viewabilityConfig={viewabilityConfig.current}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD} colors={[GOLD]} />
        }
        ListEmptyComponent={
          <View style={ms.empty}>
            <View style={ms.emptyCircle}>
              <Feather name="file-text" size={42} color="#C5CDD8" />
            </View>
            <Text style={ms.emptyTitle}>
              {activeCategory === "Événement"
                ? t("Aucun événement pour l'instant")
                : t("Aucune actualité pour l'instant")}
            </Text>
            <Text style={ms.emptySub}>
              {activeCategory === "Événement"
                ? t("Les événements de votre paroisse apparaîtront ici.")
                : t("Partagez la vie de votre paroisse\navec toute la communauté.")}
            </Text>
            <TouchableOpacity style={ms.emptyBtn} onPress={() => setShowPublish(true)} activeOpacity={0.85}>
              <Feather name="plus" size={16} color="#fff" />
              <Text style={ms.emptyBtnText}>{t("Publier la première actualité")}</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* FAB (gold) — cross-platform: tab bar 84px web / 62px native */}
      {filtered.length > 0 && (
        <View
          style={[ms.fabWrapper, { bottom: (Platform.select({ web: 84, default: 62 }) ?? 62) + 10 }]}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            style={ms.fab}
            onPress={() => setShowPublish(true)}
            activeOpacity={0.85}
          >
            <Feather name="edit-2" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      {/* Modals */}
      <PublishModal visible={showPublish} onClose={() => setShowPublish(false)} />
      <CommentSheet
        postId={commentPostId}
        visible={commentPostId !== null}
        onClose={() => setCommentPostId(null)}
      />
      <PhotoViewerModal
        visible={!!viewingPhoto}
        photoURL={viewingPhoto?.url}
        name={viewingPhoto?.name}
        onClose={() => setViewingPhoto(null)}
      />
    </View>
  );
}

const ms = StyleSheet.create({
  root: { flex: 1, minWidth: 0, backgroundColor: CREAM, overflow: "hidden" },
  empty: { alignItems: "center", paddingTop: 72, paddingHorizontal: 36, gap: 12 },
  emptyCircle: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: "#FFF8EC", alignItems: "center", justifyContent: "center", marginBottom: 8,
  },
  emptyTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: DARK, textAlign: "center" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#7A7A8A", textAlign: "center", lineHeight: 21 },
  emptyBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: NAVY, paddingHorizontal: 24, paddingVertical: 14,
    borderRadius: 26, marginTop: 8,
    shadowColor: "#EADFCB", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.22, shadowRadius: 10, elevation: 5,
  },
  emptyBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#111111" },
  fabWrapper: {
    position: "absolute", right: 18, zIndex: 999,
  },
  fab: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: GOLD, alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.22, shadowRadius: 10, elevation: 6,
  },
});
