import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { doc, onSnapshot } from "firebase/firestore";

import { Avatar } from "@/components/ui/Avatar";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { ensureConversation } from "@/lib/conversations";
import { useColors } from "@/hooks/useColors";

const GOLD = "#C9A24A";
const DARK = "#111111";
const CREAM = "#FFF8EC";
const BORDER = "#EADFCB";
const MUTED = "#666666";

export default function PublicProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, profile, userDirectory } = useAuth();
  const params = useLocalSearchParams<{ uid?: string | string[] }>();
  const uid = Array.isArray(params.uid) ? params.uid[0] : params.uid;
  const [loadedProfile, setLoadedProfile] = useState<{ displayName: string; photoURL?: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [openingConversation, setOpeningConversation] = useState(false);

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(
      doc(db, "users", uid),
      (snapshot) => {
        const data = snapshot.data();
        if (data && typeof data.displayName === "string" && data.displayName.trim()) {
          setLoadedProfile({
            displayName: data.displayName,
            photoURL: typeof data.photoURL === "string" ? data.photoURL : null,
          });
        }
        setLoading(false);
      },
      () => setLoading(false),
    );

    return unsubscribe;
  }, [uid]);

  const publicProfile = useMemo(() => {
    if (!uid) return null;
    return loadedProfile ?? userDirectory[uid] ?? null;
  }, [loadedProfile, uid, userDirectory]);

  const displayName = publicProfile?.displayName ?? "Paroissien";
  const photoURL = publicProfile?.photoURL ?? null;
  const isOwnProfile = uid === user?.uid;

  const openMessage = async () => {
    if (!uid || !user || !profile || isOwnProfile || openingConversation) return;
    setOpeningConversation(true);
    try {
      const conversationId = await ensureConversation({
        currentUid: user.uid,
        currentName: profile.displayName,
        currentPhotoURL: profile.photoURL,
        targetUid: uid,
        targetName: displayName,
        targetPhotoURL: photoURL,
      });
      router.push(`/dm/${conversationId}`);
    } catch {
      Alert.alert("Erreur", "Impossible d'ouvrir la conversation. Réessayez.");
    } finally {
      setOpeningConversation(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: BORDER }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.headerButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Retour"
        >
          <Feather name="arrow-left" size={22} color={DARK} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profil</Text>
        <View style={styles.headerButton} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={GOLD} />
        </View>
      ) : (
        <View style={styles.content}>
          <View style={[styles.profileCard, { backgroundColor: CREAM, borderColor: BORDER }]}>
            <Avatar name={displayName} photoURL={photoURL} size={92} />
            <Text style={styles.displayName}>{displayName}</Text>
            <Text style={styles.subtitle}>Profil public Paroisse Connect</Text>
          </View>

          {!publicProfile ? (
            <Text style={[styles.missing, { color: colors.mutedForeground }]}>
              Ce profil n’est plus disponible.
            </Text>
          ) : isOwnProfile ? null : (
            <TouchableOpacity
              style={[styles.messageButton, { backgroundColor: GOLD, opacity: openingConversation ? 0.7 : 1 }]}
              onPress={openMessage}
              disabled={openingConversation}
              activeOpacity={0.85}
            >
              {openingConversation ? (
                <ActivityIndicator size="small" color={DARK} />
              ) : (
                <Feather name="message-circle" size={17} color={DARK} />
              )}
              <Text style={styles.messageButtonText}>Envoyer un message</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    backgroundColor: "#FFFFFF",
  },
  headerButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: DARK },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 20, gap: 16 },
  profileCard: {
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    padding: 28,
    gap: 10,
  },
  displayName: { fontSize: 24, fontFamily: "Inter_700Bold", color: DARK, textAlign: "center" },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", color: MUTED, textAlign: "center" },
  missing: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 21 },
  messageButton: {
    minHeight: 52,
    borderRadius: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  messageButtonText: { fontSize: 15, fontFamily: "Inter_700Bold", color: DARK },
});