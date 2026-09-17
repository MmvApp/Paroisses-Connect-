import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  ActivityIndicator,
  Platform,
  TextInput,
} from "react-native";
import { ConfirmSheet } from "@/components/ConfirmSheet";
import { GuestScreen } from "@/components/ui/GuestScreen";
import * as ImagePicker from "expo-image-picker";
import { uploadToSupabase, base64ToBlob } from "@/lib/uploadToSupabase";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { useParishPermissions } from "@/hooks/useParishPermissions";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/context/I18nContext";
import { LanguagePickerCard } from "@/components/ui/LanguagePickerCard";
import { useTabScrollToTop } from "@/hooks/useTabScrollToTop";

const GOLD   = "#C9A24A";
const DARK   = "#111111";
const CREAM  = "#FFF8EC";
const BORDER = "#EADFCB";
const MUTED  = "#666666";

const ROLE_DISPLAY: Record<string, string> = {
  super_admin: "Super Administrateur",
  admin:     "Administrateur",
  priest:    "Prêtre",
  moderator: "Modérateur",
  member:    "Membre de la paroisse",
};

// ─── Barre de progression animée ────────────────────────────────────────────
function UploadProgressBar({ progress }: { progress: number }) {
  const widthVal = useSharedValue(0);
  const animStyle = useAnimatedStyle(() => ({
    width: `${widthVal.value}%` as unknown as number,
  }));
  React.useEffect(() => {
    widthVal.value = withTiming(progress, { duration: 250 });
  }, [progress, widthVal]);

  return (
    <View style={pb.track}>
      <Animated.View style={[pb.fill, animStyle]} />
    </View>
  );
}
const pb = StyleSheet.create({
  track: { height: 3, backgroundColor: BORDER, borderRadius: 2, overflow: "hidden", marginTop: 6, width: "60%" },
  fill:  { height: 3, backgroundColor: GOLD, borderRadius: 2 },
});

// ─── Helpers upload ──────────────────────────────────────────────────────────

/**
 * Upload avatar vers Supabase Storage.
 * La compression JPEG (Canvas, HEIC-safe) est gérée dans uploadToSupabase.
 * Supabase a le CORS pré-configuré — pas de blocage iOS Safari PWA.
 */
async function uploadAvatarToStorage(
  uri: string,
  uid: string,
  sourceBlob?: Blob,
  onProgress?: (pct: number) => void,
): Promise<string> {
  let blob: Blob;

  if (typeof document !== "undefined") {
    // ── WEB ──────────────────────────────────────────────────────────────────
    if (sourceBlob) {
      console.log("[upload] étape 3a — sourceBlob fourni, size:", sourceBlob.size, "type:", sourceBlob.type);
      blob = sourceBlob;
    } else {
      console.log("[upload] étape 3a — recours XHR sur uri:", uri.slice(0, 60));
      blob = await new Promise<Blob>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.onload    = () => { console.log("[upload] XHR OK, size:", (xhr.response as Blob)?.size); resolve(xhr.response as Blob); };
        xhr.onerror   = () => reject(new Error("Lecture du fichier impossible."));
        xhr.ontimeout = () => reject(new Error("Lecture expirée."));
        xhr.responseType = "blob";
        xhr.timeout = 15_000;
        xhr.open("GET", uri, true);
        xhr.send();
      });
    }
  } else {
    // ── NATIF ────────────────────────────────────────────────────────────────
    console.log("[upload] étape 3 (natif) — fetch uri:", uri.slice(0, 60));
    const resp = await fetch(uri);
    blob = await resp.blob();
    console.log("[upload] étape 3 (natif) OK, blob size:", blob.size);
  }

  const storagePath = `${uid}/profile.jpg`;
  console.log("[upload] étape 4 — uploadToSupabase début, chemin:", storagePath, "blob size:", blob.size);
  onProgress?.(40);
  const url = await uploadToSupabase(blob, storagePath);
  console.log("[upload] étape 4 OK — url:", url.slice(0, 80));
  onProgress?.(80);
  return url;
}

// ─── Écran profil ────────────────────────────────────────────────────────────
export default function ProfileScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const { profile, user, logOut, updatePhotoURL, updateDisplayName } = useAuth();
  const { t } = useI18n();
  const scrollRef = useRef<ScrollView>(null);
  useTabScrollToTop(scrollRef);

  const [loading,        setLoading]        = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError,    setUploadError]    = useState<string | null>(null);
  const [refreshing,     setRefreshing]     = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [draftDisplayName, setDraftDisplayName] = useState("");
  const [savingDisplayName, setSavingDisplayName] = useState(false);
  const [displayNameError, setDisplayNameError] = useState<string | null>(null);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 700);
  }, []);

  const openEditProfile = () => {
    setDraftDisplayName(profile?.displayName ?? user?.displayName ?? "");
    setDisplayNameError(null);
    setShowEditProfile(true);
  };

  const saveDisplayName = async () => {
    const normalizedName = draftDisplayName.trim();
    if (!normalizedName) {
      setDisplayNameError("Le nom affiché est obligatoire.");
      return;
    }
    setSavingDisplayName(true);
    setDisplayNameError(null);
    try {
      await updateDisplayName(normalizedName);
      setShowEditProfile(false);
    } catch (error) {
      setDisplayNameError(error instanceof Error ? error.message : "Impossible de modifier le nom affiché.");
    } finally {
      setSavingDisplayName(false);
    }
  };

  const isSuperAdmin = profile?.role === "super_admin";
  const isPrivileged = profile?.role === "admin" || profile?.role === "priest" || isSuperAdmin;
  const { canManage } = useParishPermissions();
  const roleLabel = t(ROLE_DISPLAY[profile?.role ?? "member"] ?? "Membre");

  const [confirmLogout, setConfirmLogout] = useState(false);
  const [showPhotoSheet, setShowPhotoSheet] = useState(false);

  // ── Déconnexion ─────────────────────────────────────────────────────────────
  const handleLogout = () => {
    console.log("[logout] handleLogout pressed");
    if (Platform.OS === "web") {
      // On web, use the native browser confirm dialog — guaranteed clickable by
      // all browsers and test runners; avoids React Native Modal z-index issues.
      const ok = window.confirm("Voulez-vous vraiment vous déconnecter ?");
      if (ok) doLogout();
      return;
    }
    setConfirmLogout(true);
  };

  const doLogout = async () => {
    setConfirmLogout(false);
    setLoading(true);
    try {
      console.log("[logout] button pressed — calling logOut()");
      await logOut();
      console.log("[logout] auth user is null:", !user);

      // Web: hard navigation ensures Firebase IndexedDB is not re-read
      //      by a stale React tree; the full page reload starts fresh.
      // Native: router.replace exits the tab stack cleanly.
      if (Platform.OS === "web") {
        console.log("[logout] web → window.location.href = '/'");
        window.location.href = "/";
      } else {
        console.log("[logout] native → router.replace('/')");
        router.replace("/");
      }
    } catch (err) {
      console.error("[logout] failed:", err);
      setLoading(false);
      Alert.alert("Erreur", "Impossible de se déconnecter. Réessayez.");
    }
  };

  // ── Upload : point central ───────────────────────────────────────────────────
  // sourceBlob : Blob déjà disponible (depuis base64 ou File object) — si absent
  //              le pipeline web retombe sur XHR, et le pipeline natif sur fetch.
  const uploadPhoto = async (uri: string, sourceBlob?: Blob) => {
    if (!user) return;
    setUploadingPhoto(true);
    setUploadError(null);
    setUploadProgress(10);
    console.log("[upload] étape 1 — uploadPhoto démarré, uid:", user.uid, "uri:", uri.slice(0, 60), "a sourceBlob:", !!sourceBlob, sourceBlob ? "size:" + sourceBlob.size : "");
    try {
      console.log("[upload] étape 2 — appel uploadAvatarToStorage");
      const url = await uploadAvatarToStorage(
        uri,
        user.uid,
        sourceBlob,
        (pct) => setUploadProgress(pct),
      );
      setUploadProgress(90);
      console.log("[upload] étape 6 — updatePhotoURL, url:", url.slice(0, 80));
      await updatePhotoURL(url);
      console.log("[upload] étape 7 — updatePhotoURL OK (Firestore + Auth + state)");
      setUploadProgress(100);
      console.log("[upload] étape 8 — TERMINÉ avec succès");
      setTimeout(() => { setUploadingPhoto(false); setUploadProgress(0); }, 800);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Téléversement impossible.";
      console.error("[upload] ÉCHEC —", msg, err);
      setUploadError(msg);
      setUploadingPhoto(false);
      setUploadProgress(0);
    }
  };

  // ── Sélecteur web (iOS Safari / navigateur desktop) ──────────────────────────
  const pickOnWeb = async () => {
    console.log("[upload] étape 0 — launchImageLibraryAsync début");
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      base64: true,
      quality: 0.82,
    });
    if (result.canceled || !result.assets.length) {
      console.log("[upload] étape 0 — annulé ou aucun asset");
      return;
    }
    const asset = result.assets[0];
    console.log("[upload] étape 0 OK — asset reçu:", {
      uri: asset.uri?.slice(0, 60),
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
      hasBase64: !!asset.base64,
      base64Len: asset.base64?.length ?? 0,
      hasFile: !!(asset as unknown as { file?: File }).file,
    });

    let sourceBlob: Blob | undefined;

    if (asset.base64) {
      // Option 1 : base64 → Blob entièrement en mémoire (aucun accès réseau)
      sourceBlob = base64ToBlob(asset.base64, asset.mimeType ?? "image/jpeg");
      console.log("[upload] étape 0 — base64ToBlob OK, size:", sourceBlob.size);
    } else {
      // Option 2 : File object natif si expo-image-picker le fournit
      const maybeFile = (asset as unknown as { file?: File }).file;
      if (maybeFile) {
        sourceBlob = maybeFile;
        console.log("[upload] étape 0 — File object utilisé, size:", maybeFile.size);
      } else {
        console.log("[upload] étape 0 — pas de base64 ni de File, recours XHR");
      }
    }

    await uploadPhoto(asset.uri, sourceBlob);
  };

  // ── Sélecteur natif (Expo Go / application installée iOS & Android) ───────────
  const pickOnNative = async (source: "camera" | "library") => {
    if (!user) return;
    if (source === "camera") {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Accès caméra refusé", "Autorisez l'accès à la caméra dans Réglages → Confidentialité.");
        return;
      }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Accès aux photos refusé", "Autorisez l'accès à vos photos dans Réglages → Confidentialité.");
        return;
      }
    }
    // Sur natif React Native, fetch(file://) est géré nativement — aucun problème iOS Safari.
    // On n'utilise pas base64 sur natif (lourd en mémoire, inutile).
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.82 };
    const result = source === "camera"
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync(opts);
    if (result.canceled || !result.assets.length) return;
    await uploadPhoto(result.assets[0].uri);
  };

  // ── Point d'entrée unique ────────────────────────────────────────────────────
  const handleChangePhoto = () => {
    if (uploadingPhoto) return;
    if (Platform.OS === "web") { void pickOnWeb(); return; }
    setShowPhotoSheet(true);
  };

  // ── Items du menu ────────────────────────────────────────────────────────────
  const menuItems = [
    { icon: "bell",        label: t("Notifications"),   onPress: () => router.push("/notifications") },
    { icon: "shield",      label: t("Confidentialité"), onPress: () => router.push("/confidentialite") },
    { icon: "help-circle", label: t("Aide & Support"),  onPress: () => router.push("/aide-support") },
    { icon: "info",        label: t("À propos"),        onPress: () => router.push("/a-propos") },
  ];

  if (!user) {
    return (
      <GuestScreen
        icon="user"
        title="Connexion requise"
        message="Connectez-vous pour accéder à votre profil."
        footer={<LanguagePickerCard />}
      />
    );
  }

  return (
    <>
    <ScrollView
      ref={scrollRef}
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD} colors={[GOLD]} />
      }
    >
      {/* ── Hero ── */}
      <View style={[styles.hero, { paddingTop: insets.top + 20, backgroundColor: CREAM, borderBottomColor: BORDER }]}>
        <TouchableOpacity onPress={handleChangePhoto} disabled={uploadingPhoto} activeOpacity={0.85}>
          <View style={styles.avatarWrap}>
            <Avatar name={profile?.displayName ?? "?"} size={120} photoURL={profile?.photoURL} />
            <View style={styles.cameraOverlay}>
              {uploadingPhoto
                ? <ActivityIndicator size="small" color={DARK} />
                : <Feather name="camera" size={14} color={DARK} />}
            </View>
          </View>
        </TouchableOpacity>

        <Text style={[styles.heroName,  { color: DARK }]}>{profile?.displayName ?? "Utilisateur"}</Text>
        <Text style={[styles.heroEmail, { color: MUTED }]}>{user?.email}</Text>

        <View style={styles.roleBadgeWrap}>
          <View style={[styles.roleBadge, {
            backgroundColor: isPrivileged ? GOLD + "22" : BORDER,
            borderColor:     isPrivileged ? GOLD + "55" : BORDER,
            borderWidth: 1,
          }]}>
            <Feather
              name={profile?.role === "admin" ? "shield" : profile?.role === "priest" ? "star" : "user"}
              size={12}
              color={isPrivileged ? GOLD : MUTED}
            />
            <Text style={[styles.roleBadgeText, { color: isPrivileged ? GOLD : MUTED }]}>{roleLabel}</Text>
          </View>
        </View>

        {profile?.parishName && (
          <View style={styles.parishRow}>
            <Feather name="map-pin" size={12} color={GOLD} />
            <Text style={[styles.parishText, { color: MUTED }]}>{profile.parishName}</Text>
          </View>
        )}

        <TouchableOpacity
          onPress={handleChangePhoto}
          disabled={uploadingPhoto}
          activeOpacity={0.7}
          style={styles.changePhotoBtn}
        >
          <Text style={[styles.changePhotoText, { color: GOLD }]}>
            {uploadingPhoto ? "Téléversement en cours…" : "Changer la photo de profil"}
          </Text>
        </TouchableOpacity>
        {uploadingPhoto && <UploadProgressBar progress={uploadProgress} />}
        {uploadError && (
          <Text style={{ color: "#c0392b", fontSize: 13, marginTop: 6, textAlign: "center", paddingHorizontal: 16 }}>
            Impossible de charger la photo. Veuillez réessayer.
          </Text>
        )}
        <TouchableOpacity
          onPress={openEditProfile}
          activeOpacity={0.75}
          style={styles.editProfileBtn}
        >
          <Feather name="edit-2" size={14} color={GOLD} />
          <Text style={[styles.changePhotoText, { color: GOLD }]}>Modifier le profil</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {/* ── Langue de l’application ── */}
        <Animated.View entering={FadeInDown.delay(30).duration(400)}>
          <LanguagePickerCard />
        </Animated.View>

        {/* ── Panneau Super Admin ── */}
        {isSuperAdmin && (
          <Animated.View entering={FadeInDown.delay(55).duration(400)}>
            <TouchableOpacity
              style={[styles.adminCard, { backgroundColor: "#F3F0FD", borderColor: "#7C3AED44" }]}
              onPress={() => router.push("/super-admin")}
              activeOpacity={0.85}
            >
              <View style={[styles.adminAccent, { backgroundColor: "#7C3AED" }]} />
              <View style={[styles.adminIconWrap, { backgroundColor: "#7C3AED22" }]}>
                <Feather name="shield" size={22} color="#7C3AED" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.adminTitle, { color: DARK }]}>Panneau Super Admin</Text>
                <Text style={[styles.adminSub, { color: MUTED }]}>Toutes les paroisses, utilisateurs et signalements</Text>
              </View>
              <Feather name="chevron-right" size={18} color="#7C3AED" />
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* ── Gérer ma paroisse ── */}
        {canManage && (
          <Animated.View entering={FadeInDown.delay(70).duration(400)}>
            <TouchableOpacity
              style={[styles.adminCard, { backgroundColor: CREAM, borderColor: GOLD + "55" }]}
              onPress={() => router.push("/parish-manage")}
              activeOpacity={0.85}
            >
              <View style={[styles.adminAccent, { backgroundColor: GOLD }]} />
              <View style={[styles.adminIconWrap, { backgroundColor: GOLD + "22" }]}>
                <Feather name="shield" size={22} color={GOLD} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.adminTitle, { color: DARK }]}>Gérer ma paroisse</Text>
                <Text style={[styles.adminSub,   { color: MUTED }]}>Annonces, événements, groupes, membres et horaires</Text>
              </View>
              <Feather name="chevron-right" size={18} color={GOLD} />
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* ── Administration avancée ── */}
        {isPrivileged && (
          <Animated.View entering={FadeInDown.delay(80).duration(400)}>
            <TouchableOpacity
              style={[styles.adminCard, { backgroundColor: CREAM, borderColor: GOLD + "33" }]}
              onPress={() => router.push("/parish-admin")}
              activeOpacity={0.85}
            >
              <View style={[styles.adminAccent, { backgroundColor: GOLD + "80" }]} />
              <View style={[styles.adminIconWrap, { backgroundColor: GOLD + "14" }]}>
                <Feather name="settings" size={22} color={GOLD} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.adminTitle, { color: DARK }]}>Administration avancée</Text>
                <Text style={[styles.adminSub,   { color: MUTED }]}>Paramètres détaillés, rôles, photos et invitations</Text>
              </View>
              <Feather name="chevron-right" size={18} color={GOLD} />
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* ── Infos du compte ── */}
        <Animated.View entering={FadeInDown.delay(isPrivileged ? 130 : 100).duration(400)}>
          <Card elevated style={styles.infoCard}>
            {(
              [
                { icon: "user",    label: t("Nom complet"), value: profile?.displayName },
                { icon: "mail",    label: "Email",        value: user?.email },
                { icon: "users",   label: t("Rôle"),         value: roleLabel },
                profile?.parishName
                  ? { icon: "map-pin", label: t("Paroisse"), value: profile.parishName }
                  : null,
              ] as ({ icon: string; label: string; value?: string | null } | null)[]
            )
              .filter(Boolean)
              .map((item, i, arr) => (
                <React.Fragment key={item!.label}>
                  <View style={styles.infoRow}>
                    <Feather name={item!.icon as never} size={18} color={GOLD} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{item!.label}</Text>
                      <Text style={[styles.infoValue, { color: colors.foreground }]}>{item!.value}</Text>
                    </View>
                  </View>
                  {i < arr.length - 1 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
                </React.Fragment>
              ))}
          </Card>
        </Animated.View>

        {/* ── Menu paramètres ── */}
        <Animated.View entering={FadeInDown.delay(isPrivileged ? 180 : 150).duration(400)}>
          <Card elevated style={styles.menuCard}>
            {menuItems.map((item, i) => (
              <React.Fragment key={item.label}>
                <TouchableOpacity style={styles.menuRow} onPress={item.onPress} activeOpacity={0.7}>
                  <View style={[styles.menuIcon, { backgroundColor: GOLD + "18", borderRadius: 8 }]}>
                    <Feather name={item.icon as never} size={18} color={GOLD} />
                  </View>
                  <Text style={[styles.menuLabel, { color: colors.foreground }]}>{item.label}</Text>
                  <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
                {i < menuItems.length - 1 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
              </React.Fragment>
            ))}
          </Card>
        </Animated.View>

        {/* ── Déconnexion ── */}
        <Animated.View entering={FadeInDown.delay(isPrivileged ? 230 : 200).duration(400)}>
          <Button
            title="Se déconnecter"
            onPress={handleLogout}
            loading={loading}
            variant="outline"
            style={{ borderColor: colors.destructive }}
            textStyle={{ color: colors.destructive }}
          />
        </Animated.View>
      </View>
    </ScrollView>

    {/* ── Confirmation déconnexion ── */}
    <ConfirmSheet
      visible={confirmLogout}
      title="Se déconnecter ?"
      message="Voulez-vous vraiment vous déconnecter ?"
      confirmLabel="Oui, se déconnecter"
      confirmColor="#D32F2F"
      onConfirm={doLogout}
      onCancel={() => setConfirmLogout(false)}
    />

    <Modal
      visible={showEditProfile}
      animationType="slide"
      transparent
      presentationStyle="overFullScreen"
      onRequestClose={() => !savingDisplayName && setShowEditProfile(false)}
    >
      <View style={styles.editProfileOverlay}>
        <TouchableOpacity
          style={styles.editProfileBackdrop}
          activeOpacity={1}
          onPress={() => !savingDisplayName && setShowEditProfile(false)}
        />
        <View style={[styles.editProfileSheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.photoHandle} />
          <View style={styles.editProfileTitleRow}>
            <View style={[styles.menuIcon, { backgroundColor: GOLD + "18" }]}>
              <Feather name="user" size={18} color={GOLD} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.editProfileTitle, { color: colors.foreground }]}>Modifier le profil</Text>
              <Text style={[styles.editProfileHint, { color: colors.mutedForeground }]}>
                Ce nom sera visible dans l’application.
              </Text>
            </View>
          </View>
          <Text style={[styles.editProfileLabel, { color: colors.mutedForeground }]}>Nom affiché</Text>
          <TextInput
            style={[
              styles.editProfileInput,
              { color: colors.foreground, borderColor: displayNameError ? colors.destructive : colors.border, backgroundColor: colors.background },
            ]}
            value={draftDisplayName}
            onChangeText={(value) => {
              setDraftDisplayName(value);
              if (displayNameError) setDisplayNameError(null);
            }}
            placeholder="Votre nom"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={80}
            editable={!savingDisplayName}
            returnKeyType="done"
            onSubmitEditing={() => void saveDisplayName()}
          />
          {displayNameError && (
            <Text style={[styles.editProfileError, { color: colors.destructive }]}>{displayNameError}</Text>
          )}
          <View style={styles.editProfileActions}>
            <TouchableOpacity
              style={[styles.editProfileCancel, { borderColor: colors.border }]}
              onPress={() => setShowEditProfile(false)}
              disabled={savingDisplayName}
              activeOpacity={0.75}
            >
              <Text style={[styles.editProfileCancelText, { color: colors.foreground }]}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.editProfileSave, { backgroundColor: GOLD }]}
              onPress={() => void saveDisplayName()}
              disabled={savingDisplayName}
              activeOpacity={0.8}
            >
              {savingDisplayName ? (
                <ActivityIndicator size="small" color={DARK} />
              ) : (
                <Text style={styles.editProfileSaveText}>Enregistrer</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>

    {/* ── Choix source photo (native seulement) ── */}
    <Modal
      visible={showPhotoSheet}
      animationType="slide"
      transparent
      presentationStyle="overFullScreen"
      onRequestClose={() => setShowPhotoSheet(false)}
    >
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }}
        activeOpacity={1}
        onPress={() => setShowPhotoSheet(false)}
      />
      <View style={[styles.photoSheet, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.photoHandle} />
        <TouchableOpacity
          style={styles.photoItem}
          onPress={() => { setShowPhotoSheet(false); void pickOnNative("camera"); }}
          activeOpacity={0.75}
        >
          <Feather name="camera" size={20} color={DARK} />
          <Text style={styles.photoItemText}>Prendre une photo</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.photoItem}
          onPress={() => { setShowPhotoSheet(false); void pickOnNative("library"); }}
          activeOpacity={0.75}
        >
          <Feather name="image" size={20} color={DARK} />
          <Text style={styles.photoItemText}>Bibliothèque photo</Text>
        </TouchableOpacity>
        <View style={{ height: 8 }} />
        <TouchableOpacity
          style={styles.photoCancelItem}
          onPress={() => setShowPhotoSheet(false)}
          activeOpacity={0.75}
        >
          <Text style={styles.photoCancelText}>Annuler</Text>
        </TouchableOpacity>
      </View>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  hero: {
    alignItems: "center",
    paddingBottom: 24,
    paddingHorizontal: 20,
    gap: 4,
    borderBottomWidth: 1,
  },
  avatarWrap:   { position: "relative", marginBottom: 2 },
  cameraOverlay: {
    position: "absolute",
    bottom: 0, right: 0,
    width: 26, height: 26,
    borderRadius: 13,
    backgroundColor: GOLD,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  heroName:  { fontSize: 24, fontFamily: "Inter_700Bold",    marginTop: 8 },
  heroEmail: { fontSize: 14, fontFamily: "Inter_400Regular" },

  roleBadgeWrap: { marginTop: 6 },
  roleBadge: {
    flexDirection: "row", alignItems: "center",
    gap: 6, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16,
  },
  roleBadgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  parishRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  parishText: { fontSize: 12, fontFamily: "Inter_400Regular" },

  changePhotoBtn: { marginTop: 8, paddingVertical: 4, paddingHorizontal: 12 },
  changePhotoText: { fontSize: 12, fontFamily: "Inter_500Medium", textDecorationLine: "underline" },
  editProfileBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, paddingVertical: 4, paddingHorizontal: 12 },

  content: { padding: 16, gap: 12 },

  adminCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    borderRadius: 16, padding: 16, overflow: "hidden", borderWidth: 1,
    shadowColor: BORDER, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5, shadowRadius: 8, elevation: 2,
  },
  adminAccent:   { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
  adminIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  adminTitle:    { fontSize: 14, fontFamily: "Inter_700Bold",    marginBottom: 2 },
  adminSub:      { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },

  infoCard: { gap: 0, padding: 0, overflow: "hidden" },
  infoRow:  { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  infoLabel: {
    fontSize: 11, fontFamily: "Inter_500Medium",
    textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 2,
  },
  infoValue: { fontSize: 15, fontFamily: "Inter_400Regular" },
  divider:   { height: 1, marginLeft: 16 },

  menuCard: { gap: 0, padding: 0, overflow: "hidden" },
  menuRow:  { flexDirection: "row", alignItems: "center", padding: 16, gap: 12 },
  menuIcon: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  menuLabel: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
  // Photo picker sheet (native)
  photoSheet: {
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
  photoHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: "#DADDE3", alignSelf: "center", marginBottom: 14,
  },
  photoItem: {
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingVertical: 15, paddingHorizontal: 6,
    borderBottomWidth: 1, borderBottomColor: "#F3F4F6",
  },
  photoItemText: { fontSize: 16, fontFamily: "Inter_500Medium", color: "#111" },
  photoCancelItem: { alignItems: "center", paddingVertical: 15 },
  photoCancelText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#7A7A8A" },
  editProfileOverlay: { flex: 1, justifyContent: "flex-end" },
  editProfileBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)" },
  editProfileSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    paddingHorizontal: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 12,
  },
  editProfileTitleRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 22 },
  editProfileTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  editProfileHint: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 3 },
  editProfileLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 7 },
  editProfileInput: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 16, fontFamily: "Inter_400Regular" },
  editProfileError: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 6 },
  editProfileActions: { flexDirection: "row", gap: 10, marginTop: 20 },
  editProfileCancel: { flex: 1, minHeight: 46, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  editProfileCancelText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  editProfileSave: { flex: 1, minHeight: 46, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  editProfileSaveText: { fontSize: 14, fontFamily: "Inter_700Bold", color: DARK },
});
