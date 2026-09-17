import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type ViewStyle,
} from "react-native";
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/context/I18nContext";
import { useColors } from "@/hooks/useColors";
import { Avatar } from "@/components/ui/Avatar";
import { PublicationCard } from "@/components/ui/PublicationCard";
import { CompactFilterChip, CompactFilterRow } from "@/components/ui/CompactFilterRow";
import { PublicationPhotoPicker } from "@/components/ui/PublicationPhotoPicker";
import { PhotoViewerModal } from "@/components/ui/PhotoViewerModal";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { canDeletePublication } from "@/lib/publicationPermissions";
import { GuestBanner } from "@/components/ui/GuestBanner";
import { Card } from "@/components/ui/Card";
import { ConfirmSheet } from "@/components/ConfirmSheet";
import { sendPushToParish, sendPushToUsers } from "@/lib/pushNotifications";
import { subscribeToParishCollection } from "@/lib/subscribeParishCollection";
import { normalizePublicationImageUrls, uploadPublicationImages } from "@/lib/publicationMedia";

// ─── Types ────────────────────────────────────────────────────────────────────

type PostType = "prayer" | "intention";
type IntentionStatus = "en_attente" | "approuvée" | "refusée";
type FilterType = "all" | PostType | "pending";

interface Prayer {
  id: string;
  type: PostType;
  title: string;
  content: string;
  authorId: string;
  authorName: string;
  authorPhotoURL: string | null;
  imageUrls?: string[];
  imageUrl?: string | null;
  authorParishName: string;
  parishId: string;
  createdAt: { seconds: number } | null;
  updatedAt: { seconds: number } | null;
  prayerCount: number;
  prayedBy: string[];
  commentCount: number;
  status: IntentionStatus;
  isAnonymous: boolean;
}

interface Comment {
  id: string;
  content: string;
  authorId: string;
  authorName: string;
  authorPhotoURL: string | null;
  createdAt: { seconds: number } | null;
  updatedAt?: { seconds: number } | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(seconds: number, t: (source: string, variables?: Record<string, string | number>) => string): string {
  const diff = Math.floor(Date.now() / 1000 - seconds);
  if (diff < 60) return t("à l'instant");
  if (diff < 3600) return t("il y a {count} min", { count: Math.floor(diff / 60) });
  if (diff < 86400) return t("il y a {count} h", { count: Math.floor(diff / 3600) });
  const days = Math.floor(diff / 86400);
  if (days < 8) return t("il y a {count} j", { count: days });
  return new Date(seconds * 1000).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
}

const TYPE_META: Record<PostType, { label: string; icon: "heart" | "book"; color: string }> = {
  intention: { label: "Intention", icon: "heart", color: "#C9A24A" },
  prayer: { label: "Prière", icon: "book", color: "#6B8F71" },
};

const STATUS_META: Record<IntentionStatus, { label: string; bg: string; text: string }> = {
  en_attente: { label: "En attente", bg: "#F59E0B22", text: "#92400E" },
  approuvée: { label: "Approuvée", bg: "#16A34A18", text: "#14532D" },
  refusée: { label: "Refusée", bg: "#DC262618", text: "#7F1D1D" },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function PrayersScreen() {
  const colors = useColors();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { user, profile, userDirectory } = useAuth();
  const params = useLocalSearchParams<{ prayerId?: string; openComments?: string }>();
  const { requireAuth } = useRequireAuth();

  // ── Feed ──
  const [items, setItems] = useState<Prayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");
  const [viewingPhoto, setViewingPhoto] = useState<{ url: string; name: string } | null>(null);
  const [legacyAuthorParishes, setLegacyAuthorParishes] = useState<Record<string, string | null>>({});
  const feedRef = useRef<FlatList<Prayer>>(null);

  // ── Post / Edit modal ──
  const [showPickerModal, setShowPickerModal] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<PostType>("intention");
  const [modalTitle, setModalTitle] = useState("");
  const [modalContent, setModalContent] = useState("");
  const [modalError, setModalError] = useState("");
  const [posting, setPosting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 700);
  }, []);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [imageUris, setImageUris] = useState<string[]>([]);
  const [existingImageUrls, setExistingImageUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  // ── Comment sheet ──
  const [commentTarget, setCommentTarget] = useState<Prayer | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const commentInputRef = useRef<TextInput>(null);
  const [menuComment, setMenuComment] = useState<Comment | null>(null);
  const [editingComment, setEditingComment] = useState<Comment | null>(null);
  const [editCommentText, setEditCommentText] = useState("");
  const [savingCommentEdit, setSavingCommentEdit] = useState(false);

  // Confirmation cross-platform (remplace Alert.alert multi-boutons)
  const [confirmSheet, setConfirmSheet] = useState<{
    title: string;
    message?: string;
    confirmLabel: string;
    confirmColor: string;
    action: () => Promise<void>;
  } | null>(null);

  // ── Permissions ──
  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";
  const isPriest = profile?.role === "priest";
  const isModerator = isAdmin || isPriest;

  // ── Real-time feed listener ──
  useEffect(() => {
    const currentParishId = profile?.parishId ?? profile?.priestParishId ?? null;
    setLoading(true);
    if (!user || !currentParishId) {
      setItems([]);
      setLoading(false);
      return;
    }

    return subscribeToParishCollection(
      "prayers",
      currentParishId,
      (docs) => {
        setItems(
          docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              type: data.type ?? "intention",
              content: data.content ?? "",
              authorId: data.authorId ?? "",
              authorName: userDirectory[data.authorId]?.displayName ?? data.authorName ?? "Anonyme",
              authorPhotoURL: userDirectory[data.authorId]?.photoURL ?? data.authorPhotoURL ?? null,
              authorParishName: data.authorParishName ?? "",
              parishId: data.parishId ?? "",
              createdAt: data.createdAt ?? null,
              updatedAt: data.updatedAt ?? null,
              prayerCount: data.prayerCount ?? 0,
              prayedBy: data.prayedBy ?? [],
              commentCount: data.commentCount ?? 0,
              title: data.title ?? "",
              // Legacy docs without status → treat as approved
              status: data.status ?? "approuvée",
              isAnonymous: data.isAnonymous ?? false,
            } as Prayer;
          }),
        );
        setLoading(false);
      },
      () => setLoading(false),
      user.uid,
    );
  }, [user, profile?.parishId, profile?.priestParishId, userDirectory]);

  // Legacy prayers may not have parishId. Resolve the author's parish only
  // for priests so the visible delete action matches Firestore's fallback.
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

  // ── Real-time comments listener ──
  useEffect(() => {
    if (!commentTarget) { setComments([]); return; }
    setCommentsLoading(true);
    const q = query(
      collection(db, "prayers", commentTarget.id, "comments"),
      orderBy("createdAt", "asc"),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setComments(snap.docs.map((d) => {
          const data = d.data();
          const authorId = typeof data.authorId === "string" ? data.authorId : "";
          return {
            id: d.id,
            ...data,
            authorName: userDirectory[authorId]?.displayName ?? data.authorName ?? "Anonyme",
            authorPhotoURL: userDirectory[authorId]?.photoURL ?? data.authorPhotoURL ?? null,
          } as Comment;
        }));
        setCommentsLoading(false);
      },
      (error) => {
        console.error("Unable to read prayer comments", error);
        setComments([]);
        setCommentsLoading(false);
      },
    );
    return unsub;
  }, [commentTarget?.id, userDirectory]);

  // ── Visibility logic ──────────────────────────────────────────────────────
  // Regular users: only approved items
  // Priests: approved + pending from their parish
  // Admins: everything
  const visibleItems = items.filter((item) => {
    const s = item.status;
    if (s === "approuvée") return true;
    if (s === "en_attente") {
      if (isAdmin) return true;
      if (isPriest && item.parishId === profile?.priestParishId) return true;
      // Author can also see their own pending intention
      if (user && item.authorId === user.uid) return true;
      return false;
    }
    if (s === "refusée") {
      // Admin sees refused (to audit), author sees their own
      return isAdmin || (user && item.authorId === user.uid);
    }
    return false;
  });

  const pendingCount = items.filter((item) => {
    if (item.status !== "en_attente") return false;
    if (isAdmin) return true;
    if (isPriest) return item.parishId === profile?.priestParishId;
    return false;
  }).length;

  const filtered = visibleItems.filter((item) => {
    if (filter === "pending") return item.status === "en_attente";
    if (filter === "all") return true;
    return item.type === filter;
  });

  const openedNotification = useRef<string | null>(null);
  useEffect(() => {
    const prayerId = typeof params.prayerId === "string" ? params.prayerId : undefined;
    if (!prayerId) {
      openedNotification.current = null;
      return;
    }
    const key = `${prayerId}:${params.openComments === "true" ? "comments" : "post"}`;
    if (openedNotification.current === key) return;
    const item = filtered.find((candidate) => candidate.id === prayerId);
    if (!item) {
      if (items.some((candidate) => candidate.id === prayerId) && filter !== "all") setFilter("all");
      return;
    }
    openedNotification.current = key;
    if (params.openComments === "true") {
      setCommentTarget(item);
      setNewComment("");
    } else {
      const index = filtered.findIndex((candidate) => candidate.id === prayerId);
      const timer = setTimeout(() => {
        feedRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.2 });
      }, 120);
      return () => clearTimeout(timer);
    }
  }, [params.prayerId, params.openComments, filtered, items, filter]);

  // ── Permission helpers ──
  const canModerate = useCallback(
    (item: Prayer) =>
      isAdmin || (isPriest && profile?.priestParishId === item.parishId),
    [isAdmin, isPriest, profile],
  );

  const canEdit = useCallback(
    (item: Prayer) => !!user && item.authorId === user.uid && item.status !== "approuvée",
    [user],
  );

  const canDelete = useCallback(
    (item: Prayer) => canDeletePublication(
      {
        userId: user?.uid,
        role: profile?.role,
        parishId: profile?.parishId ?? profile?.priestParishId ?? null,
        legacyParishId: legacyAuthorParishes[item.authorId] ?? null,
      },
      item,
    ),
    [user, profile, legacyAuthorParishes],
  );

  // ── Actions ──────────────────────────────────────────────────────────────

  const handlePray = useCallback(
    async (item: Prayer) => {
      if (!user) {
        Alert.alert("Connexion requise", "Connectez-vous pour prier pour cette intention.");
        return;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const hasPrayed = item.prayedBy.includes(user.uid);
      try {
        await updateDoc(doc(db, "prayers", item.id), {
          prayerCount: increment(hasPrayed ? -1 : 1),
          prayedBy: hasPrayed ? arrayRemove(user.uid) : arrayUnion(user.uid),
        });
        if (!hasPrayed && item.authorId && item.authorId !== user.uid) {
          void sendPushToUsers(
            [item.authorId],
            `${profile?.displayName ?? "Un paroissien"} prie pour votre publication`,
            item.title || "Une prière de la communauté",
            { screen: "/(tabs)/prayers", prayerId: item.id },
            "prayers",
          );
        }
      } catch {
        Alert.alert("Erreur", "Impossible d'enregistrer votre prière.");
      }
    },
    [user, profile],
  );

  const openPost = useCallback((type: PostType = "intention") => {
    setEditingId(null);
    setModalType(type);
    setModalTitle("");
    setModalContent("");
    setModalError("");
    setIsAnonymous(false);
    setImageUris([]);
    setExistingImageUrls([]);
    setShowModal(true);
  }, []);

  const openEdit = useCallback((item: Prayer) => {
    setEditingId(item.id);
    setModalType(item.type);
    setModalTitle(item.title ?? "");
    setModalContent(item.content);
    setModalError("");
    setIsAnonymous(false);
    setImageUris([]);
    setExistingImageUrls(normalizePublicationImageUrls(item));
    setShowModal(true);
  }, []);

  const closeModal = useCallback(() => {
    if (posting) return;
    setShowModal(false);
    setModalTitle("");
    setModalContent("");
    setEditingId(null);
    setModalError("");
    setIsAnonymous(false);
    setImageUris([]);
    setExistingImageUrls([]);
  }, [posting]);

  const handleSubmit = useCallback(async () => {
    if (!user) return;
    const text = modalContent.trim();
    if (!text) {
      setModalError("Le contenu ne peut pas être vide.");
      return;
    }
    setModalError("");
    setPosting(true);
    try {
      if (editingId) {
        setUploading(true);
        const uploadedUrls = imageUris.length > 0
          ? await uploadPublicationImages(imageUris, "prayers")
          : [];
        const imageUrls = [...existingImageUrls, ...uploadedUrls].slice(0, 2);
        await updateDoc(doc(db, "prayers", editingId), {
          content: text,
          updatedAt: serverTimestamp(),
          imageUrls,
          imageUrl: imageUrls[0] ?? null,
        });
        setUploading(false);
        setShowModal(false);
        setModalContent("");
        setEditingId(null);
      } else {
        setUploading(true);
        const uploadedUrls = imageUris.length > 0
          ? await uploadPublicationImages(imageUris, "prayers")
          : [];
        setUploading(false);
        // Intentions require moderation; prayers are auto-approved
        const status: IntentionStatus =
          modalType === "intention" ? "en_attente" : "approuvée";

        const prayerRef = await addDoc(collection(db, "prayers"), {
          type: modalType,
          title: modalTitle.trim(),
          content: text,
          authorId: user.uid,
          authorName: profile?.displayName ?? "Anonyme",
          authorPhotoURL: profile?.photoURL ?? null,
          imageUrls: uploadedUrls,
          imageUrl: uploadedUrls[0] ?? null,
          authorParishName: profile?.parishName ?? "",
          parishId: profile?.parishId ?? profile?.priestParishId ?? "",
          createdAt: serverTimestamp(),
          updatedAt: null,
          prayerCount: 0,
          prayedBy: [],
          commentCount: 0,
          status,
          isAnonymous: modalType === "intention" ? isAnonymous : false,
        });

        // Notification push pour les prières partagées (pas les intentions en attente)
        if (profile?.parishId && modalType !== "intention") {
          void sendPushToParish(
            profile.parishId,
            `🙏 ${modalTitle.trim() || "Nouvelle prière"}`,
            text.length > 100 ? text.substring(0, 100) + "…" : text,
             { screen: "/(tabs)/prayers", prayerId: prayerRef.id },
            "prayers",
            user?.uid
          );
        }

        setShowModal(false);
        setModalContent("");
        setEditingId(null);

        if (modalType === "intention") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert(
            "Intention envoyée 🙏",
            "Votre intention de prière a été envoyée et sera publiée après validation.",
            [{ text: "Merci", style: "default" }],
          );
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      }
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? "";
      const msg = err instanceof Error ? err.message : "";
      if (
        code === "unavailable" ||
        code.includes("network") ||
        msg.toLowerCase().includes("offline")
      ) {
        setModalError("Vous êtes hors connexion. Vérifiez votre réseau et réessayez.");
      } else {
        setModalError("Impossible de publier. Réessayez.");
      }
    } finally {
        setUploading(false);
      setPosting(false);
    }
  }, [user, profile, modalTitle, modalContent, modalType, editingId, isAnonymous, imageUris, existingImageUrls]);

  const handleApprove = useCallback((item: Prayer) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setConfirmSheet({
      title: "Approuver cette intention ?",
      message: "Elle sera visible par tous les membres.",
      confirmLabel: "Approuver",
      confirmColor: "#2563EB",
      action: async () => {
        await updateDoc(doc(db, "prayers", item.id), { status: "approuvée" });
      },
    });
  }, []);

  const handleRefuse = useCallback((item: Prayer) => {
    setConfirmSheet({
      title: "Refuser cette intention ?",
      message: "L'auteur sera informé que son intention n'a pas été retenue.",
      confirmLabel: "Refuser",
      confirmColor: "#D32F2F",
      action: async () => {
        await updateDoc(doc(db, "prayers", item.id), { status: "refusée" });
      },
    });
  }, []);

  const handleDelete = useCallback((item: Prayer) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setConfirmSheet({
      title: "Voulez-vous vraiment supprimer cette publication ?",
      message: "Cette action est irréversible.",
      confirmLabel: "Oui, supprimer",
      confirmColor: "#D32F2F",
      action: async () => {
        await deleteDoc(doc(db, "prayers", item.id));
      },
    });
  }, []);

  const handleReport = useCallback((item: Prayer) => {
    void item;
    setConfirmSheet({
      title: "Signaler ce contenu ?",
      message: "Un modérateur examinera ce contenu et prendra les mesures nécessaires.",
      confirmLabel: "Oui, signaler",
      confirmColor: "#7A7A8A",
      action: async () => {
        Alert.alert("Signalement envoyé", "Merci. Un modérateur examinera ce contenu.");
      },
    });
  }, []);

  const openComments = useCallback((item: Prayer) => {
    setCommentTarget(item);
    setNewComment("");
  }, []);

  const closeComments = useCallback(() => {
    setCommentTarget(null);
    setNewComment("");
  }, []);

  const handlePostComment = useCallback(async () => {
    if (!user || !commentTarget) return;
    const text = newComment.trim();
    if (!text) return;
    setPostingComment(true);
    try {
      const commentRef = doc(collection(db, "prayers", commentTarget.id, "comments"));
      const batch = writeBatch(db);
      batch.set(commentRef, {
        content: text,
        authorId: user.uid,
        authorName: profile?.displayName ?? "Anonyme",
        authorPhotoURL: profile?.photoURL ?? null,
        createdAt: serverTimestamp(),
      });
      batch.update(doc(db, "prayers", commentTarget.id), {
        commentCount: increment(1),
      });
      await batch.commit();
      setComments((current) => current.some((comment) => comment.id === commentRef.id)
        ? current
        : [...current, {
          id: commentRef.id,
          content: text,
          authorId: user.uid,
          authorName: profile?.displayName ?? "Anonyme",
          authorPhotoURL: profile?.photoURL ?? null,
          createdAt: Timestamp.now(),
        }]);
      setNewComment("");
      if (commentTarget.authorId && commentTarget.authorId !== user.uid) {
        void sendPushToUsers(
          [commentTarget.authorId],
          `${profile?.displayName ?? "Un paroissien"} a commenté votre prière`,
          text.length > 100 ? `${text.substring(0, 100)}…` : text,
          { screen: "/(tabs)/prayers", prayerId: commentTarget.id, openComments: true },
          "prayers",
        );
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error("Unable to create prayer comment", error);
      Alert.alert("Erreur", "Impossible d'envoyer le commentaire.");
    } finally {
      setPostingComment(false);
    }
  }, [user, profile, commentTarget, newComment]);

  const handleDeleteComment = useCallback(
    (comment: Comment) => {
      if (!commentTarget) return;
      const targetId = commentTarget.id;
      setConfirmSheet({
        title: "Supprimer ce commentaire ?",
        confirmLabel: "Oui, supprimer",
        confirmColor: "#D32F2F",
        action: async () => {
          await deleteDoc(doc(db, "prayers", targetId, "comments", comment.id));
          await updateDoc(doc(db, "prayers", targetId), {
            commentCount: increment(-1),
          });
        },
      });
    },
    [commentTarget],
  );

  const openCommentEdit = useCallback((comment: Comment) => {
    setMenuComment(null);
    setEditingComment(comment);
    setEditCommentText(comment.content);
  }, []);

  const handleSaveCommentEdit = useCallback(async () => {
    if (!user || !commentTarget || !editingComment) return;
    const text = editCommentText.trim();
    if (!text) return;
    setSavingCommentEdit(true);
    try {
      await updateDoc(
        doc(db, "prayers", commentTarget.id, "comments", editingComment.id),
        { content: text, updatedAt: serverTimestamp() },
      );
      setComments((current) => current.map((comment) =>
        comment.id === editingComment.id
          ? { ...comment, content: text, updatedAt: Timestamp.now() }
          : comment,
      ));
      setEditingComment(null);
      setEditCommentText("");
    } catch (error) {
      console.error("Unable to edit prayer comment", error);
      Alert.alert("Erreur", "Impossible de modifier le commentaire.");
    } finally {
      setSavingCommentEdit(false);
    }
  }, [user, commentTarget, editingComment, editCommentText]);

  // ── Render prayer card ──────────────────────────────────────────────────
  const renderItem = useCallback(
    ({ item, index }: { item: Prayer; index: number }) => {
      const hasPrayed = user ? item.prayedBy.includes(user.uid) : false;
      const meta = TYPE_META[item.type] ?? TYPE_META.intention;
      const statusMeta = STATUS_META[item.status];
      const mine = item.authorId === user?.uid;
      const isPending = item.status === "en_attente";
      const isRefused = item.status === "refusée";
      const canMod = canModerate(item);
      const showComments = item.status === "approuvée";

      // Anonymous visibility: moderators and the author see the real identity
      const canSeeRealIdentity = isModerator || mine;
      const displayAnon = item.isAnonymous && !canSeeRealIdentity;
      const displayName = displayAnon ? "Anonyme" : item.authorName;
      const displayPhoto = displayAnon ? null : item.authorPhotoURL;
      const displayParish = displayAnon ? "" : item.authorParishName;

      return (
        <Animated.View entering={FadeInDown.delay(Math.min(index, 6) * 55).duration(320)} style={{ marginBottom: 12 }}>
          <PublicationCard
             imageUrls={normalizePublicationImageUrls(item)}
            category={t(meta.label)}
            categoryColor={meta.color + "CC"}
            badges={[
               ...((isModerator || mine) && isPending ? [{ label: t("En attente"), icon: "clock", color: "rgba(245,158,11,0.88)" }] : []),
               ...((isModerator || mine) && isRefused ? [{ label: t("Refusée"), icon: "x-circle", color: "rgba(239,68,68,0.88)" }] : []),
              ...(item.isAnonymous && canSeeRealIdentity ? [{ icon: "eye-off", color: "rgba(107,114,128,0.75)" }] : []),
            ]}
             timeLabel={item.createdAt ? timeAgo(item.createdAt.seconds, t) : ""}
            title={item.title}
            body={item.type === "intention" ? `« ${item.content} »` : item.content}
            authorName={displayName}
            authorPhotoURL={displayPhoto}
            onAuthorAvatarPress={displayPhoto ? () => setViewingPhoto({ url: displayPhoto, name: displayName }) : undefined}
            style={Object.assign(
              {} as ViewStyle,
              isPending ? { borderLeftWidth: 3, borderLeftColor: "#F59E0B" } : undefined,
              isRefused ? { opacity: 0.7 } : undefined,
            )}
            footer={
              <View>
                {isPending && canMod && (
                  <View style={[styles.moderationRow, { marginBottom: 8 }]}>
                    <TouchableOpacity style={styles.approveBtn} onPress={() => handleApprove(item)} activeOpacity={0.8}>
                      <Feather name="check" size={14} color="#fff" />
                      <Text style={styles.approveBtnText}>Approuver</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.refuseBtn, { borderColor: colors.destructive }]} onPress={() => handleRefuse(item)} activeOpacity={0.8}>
                      <Feather name="x" size={14} color={colors.destructive} />
                      <Text style={[styles.refuseBtnText, { color: colors.destructive }]}>Refuser</Text>
                    </TouchableOpacity>
                  </View>
                )}
                <View style={styles.actions}>
                  {!isPending && !isRefused && (
                    <TouchableOpacity
                      style={[styles.actionBtn, hasPrayed ? { backgroundColor: colors.primary + "1A", borderColor: colors.primary + "55", borderWidth: 1 } : { backgroundColor: colors.secondary }]}
                      onPress={() => requireAuth(() => handlePray(item))}
                      activeOpacity={0.75}
                    >
                      <Feather name="heart" size={14} color={hasPrayed ? colors.primary : colors.mutedForeground} />
                      <Text style={[styles.actionBtnText, { color: hasPrayed ? colors.primary : colors.mutedForeground }]}>
                        {item.prayerCount > 0 ? `${item.prayerCount}  ` : ""}🙏 Je prie
                      </Text>
                    </TouchableOpacity>
                  )}
                  {showComments && (
                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.secondary }]} onPress={() => requireAuth(() => openComments(item))} activeOpacity={0.75}>
                      <Feather name="message-circle" size={14} color={colors.mutedForeground} />
                      <Text style={[styles.actionBtnText, { color: colors.mutedForeground }]}>
                        {item.commentCount > 0 ? `${item.commentCount}  ` : ""}Commenter
                      </Text>
                    </TouchableOpacity>
                  )}
                  <View style={{ flex: 1 }} />
                  {canEdit(item) && (
                    <TouchableOpacity style={styles.iconBtn} onPress={() => openEdit(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Feather name="edit-2" size={15} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  )}
                  {canDelete(item) && (
                    <TouchableOpacity
                      style={[styles.iconBtn, styles.deleteIconBtn]}
                      onPress={() => handleDelete(item)}
                      accessibilityRole="button"
                      accessibilityLabel="Supprimer cette publication"
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Feather name="trash-2" size={15} color={colors.destructive} />
                    </TouchableOpacity>
                  )}
                  {!mine && !!user && !isPending && (
                    <TouchableOpacity style={styles.iconBtn} onPress={() => handleReport(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Feather name="flag" size={15} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            }
          />
        </Animated.View>
      );
    },
    [
      user, colors, isModerator, canModerate, canEdit, canDelete,
      handlePray, openComments, openEdit, handleDelete, handleReport,
      handleApprove, handleRefuse, requireAuth,
    ],
  );

  // ─── JSX ─────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {!user && <GuestBanner />}

      {/* ── Moderation banner (priests / admins) ── */}
      {isModerator && pendingCount > 0 && (
        <TouchableOpacity
          style={[styles.moderationBanner, { backgroundColor: "#FEF3C7", borderBottomColor: "#FDE68A" }]}
          onPress={() => setFilter("pending")}
          activeOpacity={0.85}
        >
          <Feather name="clock" size={14} color="#92400E" />
          <Text style={styles.moderationBannerText}>
            {pendingCount} intention{pendingCount > 1 ? "s" : ""} en attente de validation
          </Text>
          <Feather name="chevron-right" size={14} color="#92400E" />
        </TouchableOpacity>
      )}

      {/* ── Filter chips ── */}
      <CompactFilterRow style={[styles.filterBar, { borderBottomColor: colors.border }]}>
        {(["all", "intention", "prayer", ...(isModerator ? ["pending"] : [])] as FilterType[]).map((f) => {
          const active = filter === f;
            const label =
              f === "all" ? t("Tout") :
              f === "intention" ? t("Intentions") :
              f === "prayer" ? t("Prières") :
              `${t("En attente")}${pendingCount > 0 ? ` (${pendingCount})` : ""}`;
          return (
            <CompactFilterChip
              key={f}
              label={label}
              onPress={() => setFilter(f)}
              style={[
                styles.chip,
                { borderColor: active ? colors.primary + "55" : colors.border },
                active && { backgroundColor: colors.primary + "18" },
                f === "pending" && active && { backgroundColor: "#FEF3C7", borderColor: "#F59E0B55" },
                f === "pending" && !active && { borderColor: "#F59E0B44" },
              ]}
              textStyle={[
                styles.chipText,
                { color: active ? colors.primary : colors.mutedForeground },
                f === "pending" && { color: "#92400E" },
              ]}
            />
          );
        })}
      </CompactFilterRow>

      {/* ── Feed ── */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
            Chargement…
          </Text>
        </View>
      ) : (
        <FlatList
          ref={feedRef}
          data={filtered}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 110 },
          ]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#C9A24A" colors={["#C9A24A"]} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="heart" size={52} color={colors.border} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                {filter === "pending" ? t("Aucune intention en attente") : t("Aucune publication")}
              </Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {filter === "pending"
                  ? t("Toutes les intentions ont été traitées.")
                  : t("Partagez une prière ou une intention de prière avec votre communauté.")}
              </Text>
            </View>
          }
        />
      )}

      {/* ── FAB unique (cross-platform: tab bar = 84px web / 62px native) ── */}
      {(
        <View
          style={[styles.fabWrapper, { bottom: (Platform.select({ web: 84, default: 62 }) ?? 62) + 10 }]}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            style={[styles.fab, { backgroundColor: "#3B82F6" }]}
            onPress={() => requireAuth(() => setShowPickerModal(true))}
            activeOpacity={0.85}
          >
            <Feather name="plus" size={28} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      {/* ── Picker modal (choice between intention and prayer) ── */}
      <Modal
        visible={showPickerModal}
        animationType="slide"
        transparent
        presentationStyle="overFullScreen"
        onRequestClose={() => setShowPickerModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => setShowPickerModal(false)}
          />
          <View
            style={[
              styles.pickerSheet,
              { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 },
            ]}
          >
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <Text style={[styles.pickerTitle, { color: colors.foreground }]}>
              Que souhaitez-vous partager ?
            </Text>

            {/* Option : Intention */}
            <TouchableOpacity
              style={[styles.pickerOption, { borderColor: colors.border }]}
              onPress={() => { setShowPickerModal(false); openPost("intention"); }}
              activeOpacity={0.85}
            >
              <View style={[styles.pickerIconBox, { backgroundColor: "#EFF6FF" }]}>
                <Text style={styles.pickerEmoji}>❤️</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.pickerOptionTitle, { color: colors.foreground }]}>
                  Intention de prière
                </Text>
                <Text style={[styles.pickerOptionDesc, { color: colors.mutedForeground }]}>
                  Déposez une demande de prière à la communauté
                </Text>
              </View>
              <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>

            {/* Option : Prière */}
            <TouchableOpacity
              style={[styles.pickerOption, { borderColor: colors.border }]}
              onPress={() => { setShowPickerModal(false); openPost("prayer"); }}
              activeOpacity={0.85}
            >
              <View style={[styles.pickerIconBox, { backgroundColor: "#F0FDF4" }]}>
                <Text style={styles.pickerEmoji}>🙏</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.pickerOptionTitle, { color: colors.foreground }]}>
                  Partager une prière
                </Text>
                <Text style={[styles.pickerOptionDesc, { color: colors.mutedForeground }]}>
                  Partagez un psaume, une méditation ou une prière
                </Text>
              </View>
              <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>

            {/* Annuler */}
            <TouchableOpacity
              style={[styles.cancelPickerBtn, { borderColor: colors.border }]}
              onPress={() => setShowPickerModal(false)}
              activeOpacity={0.8}
            >
              <Text style={[styles.cancelPickerText, { color: colors.mutedForeground }]}>
                Annuler
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Post / Edit modal ── */}
      <Modal
        visible={showModal}
        animationType="slide"
        transparent
        presentationStyle="overFullScreen"
        onRequestClose={closeModal}
      >
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeModal} />
          <View
            style={[
              styles.sheet,
              { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 },
            ]}
          >
            <View style={[styles.handle, { backgroundColor: colors.border }]} />

            {/* Header */}
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
                {editingId
                  ? "Modifier la publication"
                  : modalType === "intention"
                  ? "Déposer une intention de prière"
                  : "Partager une prière"}
              </Text>
              <TouchableOpacity onPress={closeModal} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {/* Type selector */}
            {!editingId && (
              <View style={[styles.typeSelector, { backgroundColor: colors.secondary }]}>
                {(["intention", "prayer"] as PostType[]).map((t) => {
                  const active = modalType === t;
                  return (
                    <TouchableOpacity
                      key={t}
                      style={[
                        styles.typeOption,
                        active && {
                          backgroundColor: colors.card,
                          shadowColor: "#000",
                          shadowOffset: { width: 0, height: 1 },
                          shadowOpacity: 0.08,
                          shadowRadius: 4,
                          elevation: 2,
                        },
                      ]}
                      onPress={() => setModalType(t)}
                      activeOpacity={0.85}
                    >
                      <Feather
                        name={TYPE_META[t].icon}
                        size={14}
                        color={active ? colors.primary : colors.mutedForeground}
                      />
                      <Text
                        style={[
                          styles.typeOptionText,
                          { color: active ? colors.primary : colors.mutedForeground },
                        ]}
                      >
                        {t === "intention" ? "Intention" : "Prière"}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Moderation note for intentions */}
            {!editingId && modalType === "intention" && (
              <View style={[styles.moderationNote, { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" }]}>
                <Feather name="info" size={13} color="#2563EB" />
                <Text style={styles.moderationNoteText}>
                  Votre intention sera examinée par un prêtre ou un administrateur avant publication.
                </Text>
              </View>
            )}

            {/* Hint */}
            <Text style={[styles.sheetHint, { color: colors.mutedForeground }]}>
              {modalType === "intention"
                ? "Partagez votre demande de prière avec la communauté."
                : "Partagez un psaume, une méditation ou une prière personnelle."}
            </Text>

            {/* Title input (optional) */}
            <View
              style={[
                styles.titleInputWrap,
                {
                  backgroundColor: colors.secondary,
                  borderColor: colors.border,
                },
              ]}
            >
              <TextInput
                style={[styles.titleInput, { color: colors.foreground }]}
                placeholder="Titre (facultatif)"
                placeholderTextColor={colors.mutedForeground}
                value={modalTitle}
                onChangeText={setModalTitle}
                maxLength={80}
                returnKeyType="next"
              />
            </View>

            {/* Text area */}
            <View
              style={[
                styles.textArea,
                {
                  backgroundColor: colors.secondary,
                  borderColor: modalError ? colors.destructive : colors.border,
                },
              ]}
            >
              <TextInput
                style={[styles.textAreaInput, { color: colors.foreground }]}
                placeholder={
                  modalType === "intention"
                    ? "Priez pour… (ex. la guérison de ma famille)"
                    : "Seigneur, je vous offre…"
                }
                placeholderTextColor={colors.mutedForeground}
                value={modalContent}
                onChangeText={(t) => {
                  setModalContent(t);
                  if (t.trim()) setModalError("");
                }}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
                maxLength={1000}
              />
            </View>
            <PublicationPhotoPicker
              localUris={imageUris}
              existingUrls={existingImageUrls}
              onLocalUrisChange={setImageUris}
              onExistingUrlsChange={setExistingImageUrls}
              disabled={posting}
              uploading={uploading}
            />
            {/* Anonymous checkbox — intentions only, creation only */}
            {!editingId && modalType === "intention" && (
              <TouchableOpacity
                style={[
                  styles.anonRow,
                  { borderColor: colors.border, backgroundColor: isAnonymous ? "#F3F4F6" : colors.secondary },
                ]}
                onPress={() => setIsAnonymous((v) => !v)}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.checkbox,
                    {
                      borderColor: isAnonymous ? colors.primary : colors.border,
                      backgroundColor: isAnonymous ? colors.primary : "transparent",
                    },
                  ]}
                >
                  {isAnonymous && <Feather name="check" size={11} color="#fff" />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.anonLabel, { color: colors.foreground }]}>
                    Publier anonymement
                  </Text>
                  <Text style={[styles.anonHint, { color: colors.mutedForeground }]}>
                    Votre nom reste visible par le prêtre et les administrateurs pour la modération.
                  </Text>
                </View>
              </TouchableOpacity>
            )}

            {!!modalError && (
              <Text style={[styles.errorText, { color: colors.destructive }]}>
                {modalError}
              </Text>
            )}

            {/* Submit */}
            <TouchableOpacity
              style={[
                styles.submitBtn,
                {
                  backgroundColor:
                    modalContent.trim() && !posting ? "#3B82F6" : colors.border,
                },
              ]}
              onPress={handleSubmit}
              disabled={posting || !modalContent.trim()}
              activeOpacity={0.85}
            >
              {posting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>
                  {editingId
                    ? "Enregistrer"
                    : modalType === "intention"
                    ? "Déposer l'intention"
                    : "Publier"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Comment sheet ── */}
      <Modal
        visible={commentTarget !== null}
        animationType="slide"
        transparent
        presentationStyle="overFullScreen"
        onRequestClose={closeComments}
      >
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeComments} />
          <View
            style={[
              styles.commentSheet,
              { backgroundColor: colors.card, paddingBottom: insets.bottom + 8 },
            ]}
          >
            <View style={[styles.handle, { backgroundColor: colors.border }]} />

            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
                Commentaires
              </Text>
              <TouchableOpacity onPress={closeComments} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {/* Original post preview */}
            {commentTarget && (
              <View
                style={[
                  styles.origPreview,
                  { backgroundColor: colors.secondary, borderLeftColor: colors.primary },
                ]}
              >
                <Text style={[styles.origAuthor, { color: colors.foreground }]}>
                  {commentTarget.authorName}
                </Text>
                <Text
                  style={[styles.origContent, { color: colors.mutedForeground }]}
                >
                  {commentTarget.content}
                </Text>
              </View>
            )}

            {/* Comments list */}
            {commentsLoading ? (
              <View style={[styles.center, { height: 120 }]}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : (
              <FlatList
                data={comments}
                keyExtractor={(c) => c.id}
                style={{ maxHeight: 280 }}
                contentContainerStyle={{ padding: 16, gap: 12 }}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={
                  <Text
                    style={[
                      styles.emptyText,
                      { color: colors.mutedForeground, textAlign: "center", marginTop: 16 },
                    ]}
                  >
                    Soyez le premier à commenter.
                  </Text>
                }
                renderItem={({ item: c }) => {
                  const canDelCom =
                    !!user &&
                    (c.authorId === user.uid ||
                      isAdmin ||
                      (isPriest && profile?.priestParishId === commentTarget?.parishId));
                  const isOwnComment = c.authorId === user?.uid;
                  return (
                    <View style={styles.commentRow}>
                      <Avatar
                        name={c.authorName}
                        size={32}
                        photoURL={c.authorPhotoURL}
                        onPress={c.authorPhotoURL ? () => setViewingPhoto({ url: c.authorPhotoURL!, name: c.authorName }) : undefined}
                      />
                      <View
                        style={[styles.commentBubble, { backgroundColor: colors.secondary }]}
                      >
                        <View style={styles.commentMeta}>
                          <Text style={[styles.commentAuthor, { color: colors.foreground }]}>
                            {c.authorName}
                          </Text>
                          <View style={styles.commentMetaRight}>
                            <Text style={[styles.commentTime, { color: colors.mutedForeground }]}>
                              {c.createdAt ? timeAgo(c.createdAt.seconds, t) : "…"}
                            </Text>
                            {c.updatedAt && (
                              <Text style={[styles.commentEdited, { color: colors.mutedForeground }]}>
                                Modifié
                              </Text>
                            )}
                          </View>
                        </View>
                        <Text style={[styles.commentContent, { color: colors.foreground }]}>
                          {c.content}
                        </Text>
                      </View>
                      {isOwnComment && (
                        <TouchableOpacity
                          onPress={() => setMenuComment(c)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          style={styles.commentMenuButton}
                          accessibilityLabel="Actions du commentaire"
                        >
                          <Feather name="more-vertical" size={17} color={colors.mutedForeground} />
                        </TouchableOpacity>
                      )}
                      {!isOwnComment && canDelCom && (
                        <TouchableOpacity
                          onPress={() => handleDeleteComment(c)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Feather name="trash-2" size={14} color={colors.destructive} />
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                }}
              />
            )}

            {/* Comment input */}
            {!!user && (
              <View style={[styles.commentInputRow, { borderTopColor: colors.border }]}>
                <Avatar
                  name={profile?.displayName ?? "?"}
                  size={32}
                  photoURL={profile?.photoURL}
                />
                <TextInput
                  ref={commentInputRef}
                  style={[
                    styles.commentInput,
                    {
                      backgroundColor: colors.secondary,
                      color: colors.foreground,
                      borderColor: colors.border,
                    },
                  ]}
                  placeholder="Écrire un commentaire…"
                  placeholderTextColor={colors.mutedForeground}
                  value={newComment}
                  onChangeText={setNewComment}
                  multiline
                  maxLength={500}
                  returnKeyType="send"
                  onSubmitEditing={handlePostComment}
                />
                <TouchableOpacity
                  style={[
                    styles.sendBtn,
                    {
                      backgroundColor:
                        newComment.trim() && !postingComment
                          ? colors.primary
                          : colors.border,
                    },
                  ]}
                  onPress={handlePostComment}
                  disabled={!newComment.trim() || postingComment}
                  activeOpacity={0.85}
                >
                  {postingComment ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Feather name="send" size={16} color="#fff" />
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={menuComment !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuComment(null)}
      >
        <View style={styles.commentMenuOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setMenuComment(null)}
          />
          <View style={styles.commentMenuCard}>
            <Text style={[styles.commentMenuTitle, { color: colors.mutedForeground }]}>
              Commentaire
            </Text>
            <TouchableOpacity
              style={styles.commentMenuItem}
              onPress={() => menuComment && openCommentEdit(menuComment)}
            >
              <Feather name="edit-2" size={16} color={colors.foreground} />
              <Text style={[styles.commentMenuItemText, { color: colors.foreground }]}>
                Modifier
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.commentMenuItem}
              onPress={() => {
                const comment = menuComment;
                setMenuComment(null);
                if (comment) handleDeleteComment(comment);
              }}
            >
              <Feather name="trash-2" size={16} color={colors.destructive} />
              <Text style={[styles.commentMenuItemText, { color: colors.destructive }]}>
                Supprimer
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={editingComment !== null}
        transparent
        animationType="fade"
        onRequestClose={() => !savingCommentEdit && setEditingComment(null)}
      >
        <KeyboardAvoidingView
          style={styles.commentEditOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={[styles.commentEditCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.commentEditTitle, { color: colors.foreground }]}>
              Modifier le commentaire
            </Text>
            <TextInput
              style={[
                styles.commentEditInput,
                {
                  backgroundColor: colors.secondary,
                  borderColor: colors.border,
                  color: colors.foreground,
                },
              ]}
              value={editCommentText}
              onChangeText={setEditCommentText}
              multiline
              maxLength={500}
              autoFocus
              placeholder="Votre commentaire…"
              placeholderTextColor={colors.mutedForeground}
            />
            <View style={styles.commentEditActions}>
              <TouchableOpacity
                style={[styles.commentEditAction, { backgroundColor: colors.secondary }]}
                onPress={() => setEditingComment(null)}
                disabled={savingCommentEdit}
              >
                <Text style={[styles.commentEditCancelText, { color: colors.foreground }]}>
                  Annuler
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.commentEditAction,
                  {
                    backgroundColor:
                      editCommentText.trim() && !savingCommentEdit
                        ? colors.primary
                        : colors.border,
                  },
                ]}
                onPress={handleSaveCommentEdit}
                disabled={!editCommentText.trim() || savingCommentEdit}
              >
                {savingCommentEdit
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.commentEditSaveText}>Enregistrer</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ConfirmSheet
        visible={!!confirmSheet}
        title={confirmSheet?.title ?? ""}
        message={confirmSheet?.message}
        confirmLabel={confirmSheet?.confirmLabel ?? "Confirmer"}
        confirmColor={confirmSheet?.confirmColor ?? "#D32F2F"}
        onConfirm={async () => {
          const act = confirmSheet?.action;
          setConfirmSheet(null);
          if (act) {
            try { await act(); }
            catch { Alert.alert("Erreur", "Une erreur est survenue. Réessayez."); }
          }
        }}
        onCancel={() => setConfirmSheet(null)}
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, minWidth: 0, overflow: "hidden" },

  // Moderation banner
  moderationBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  moderationBannerText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#92400E",
  },

  // Filter bar
  filterBar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: { fontSize: 13, fontFamily: "Inter_500Medium" },

  // Feed
  listContent: { padding: 16, gap: 12 },
  center: {
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingTop: 60,
  },
  loadingText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  empty: {
    alignItems: "center",
    marginTop: 60,
    gap: 12,
    paddingHorizontal: 32,
  },
  emptyTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20, textAlign: "center" },

  // Prayer card
  card: { gap: 12 },

  // Status banner
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusBannerText: { flex: 1, fontSize: 12, fontFamily: "Inter_500Medium" },

  authorRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  authorInfo: { flex: 1, gap: 2 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  authorName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  anonBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
  },
  anonBadgeText: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#6B7280" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  metaChip: { flexDirection: "row", alignItems: "center", gap: 3 },
  metaText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  typeBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  content: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 23,
    fontStyle: "italic",
  },

  // Moderation actions
  moderationRow: {
    flexDirection: "row",
    gap: 10,
    paddingTop: 4,
  },
  approveBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#2563EB",
    borderRadius: 10,
    paddingVertical: 9,
  },
  approveBtnText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  refuseBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 9,
  },
  refuseBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  // Action bar
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 4,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  actionBtnText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  iconBtn: { padding: 6 },
  deleteIconBtn: {
    borderRadius: 14,
    backgroundColor: "#FEE2E2",
  },

  // FAB unique
  fabWrapper: {
    position: "absolute",
    right: 20,
    zIndex: 999,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 6,
  },

  // Picker modal (choice sheet)
  pickerSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    paddingTop: 14,
    gap: 12,
  },
  pickerTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    marginBottom: 4,
  },
  pickerOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  pickerIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  pickerEmoji: { fontSize: 24 },
  pickerOptionTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  pickerOptionDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17, marginTop: 2 },
  cancelPickerBtn: {
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 4,
  },
  cancelPickerText: { fontSize: 15, fontFamily: "Inter_500Medium" },

  // Card title
  itemTitle: { fontSize: 15, fontFamily: "Inter_700Bold", marginBottom: 2 },

  // Title input (optional field in form)
  titleInputWrap: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  titleInput: { fontSize: 15, fontFamily: "Inter_500Medium" },

  // Modals / sheets
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    paddingTop: 14,
    gap: 12,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sheetTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  sheetHint: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },

  typeSelector: {
    flexDirection: "row",
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  typeOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 9,
  },
  typeOptionText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  moderationNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  moderationNoteText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
    color: "#1E40AF",
  },

  textArea: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    minHeight: 120,
  },
  textAreaInput: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
    minHeight: 96,
  },
  // Anonymous checkbox
  anonRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  anonLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  anonHint: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },

  errorText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  submitBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 50,
  },
  submitBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },

  // Comment sheet
  commentSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    paddingTop: 14,
  },
  origPreview: {
    borderLeftWidth: 3,
    borderRadius: 8,
    padding: 10,
    gap: 2,
  },
  origAuthor: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  origContent: { fontSize: 13, fontFamily: "Inter_400Regular", fontStyle: "italic" },

  commentRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  commentBubble: { flex: 1, borderRadius: 12, padding: 10, gap: 3 },
  commentMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  commentMetaRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  commentAuthor: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  commentTime: { fontSize: 11, fontFamily: "Inter_400Regular" },
  commentEdited: { fontSize: 10, fontFamily: "Inter_400Regular" },
  commentContent: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  commentMenuButton: { paddingTop: 9, paddingLeft: 1 },
  commentMenuOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  commentMenuCard: {
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
  commentMenuTitle: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  commentMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  commentMenuItemText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  commentEditOverlay: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  commentEditCard: { borderRadius: 18, padding: 18 },
  commentEditTitle: { fontSize: 17, fontFamily: "Inter_700Bold", marginBottom: 12 },
  commentEditInput: {
    minHeight: 90,
    maxHeight: 150,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlignVertical: "top",
  },
  commentEditActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 14,
  },
  commentEditAction: {
    minWidth: 100,
    minHeight: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  commentEditCancelText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  commentEditSaveText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },

  commentInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 12,
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 4,
  },
  commentInput: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    maxHeight: 100,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});
