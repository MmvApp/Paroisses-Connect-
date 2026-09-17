/**
 * notifications.tsx
 * Page Notifications : deux onglets
 *  - "Historique" : feed en temps réel depuis Firestore (notifications/{uid}/items)
 *  - "Paramètres" : toggles de préférences par catégorie
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  FlatList,
  StyleSheet,
  Switch,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Notifications from "expo-notifications";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/context/I18nContext";
import { db } from "@/lib/firebase";
import type { NotifPrefs } from "@/context/AuthContext";
import type { NotifCategory } from "@/lib/pushNotifications";

// ─── Palette ──────────────────────────────────────────────────────────────────
const GOLD   = "#C9A24A";
const DARK   = "#111111";
const CREAM  = "#FFF8EC";
const BORDER = "#EADFCB";
const MUTED  = "#666666";
const GREEN  = "#27AE60";
const RED    = "#E74C3C";
const BG     = "#F8F5EE";

// ─── Types ────────────────────────────────────────────────────────────────────
interface NotifItem {
  id: string;
  title: string;
  body: string;
  type: NotifCategory;
  data: Record<string, string | number | boolean | null | undefined>;
  read: boolean;
  createdAt: { seconds: number } | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(seconds: number, t: (source: string, variables?: Record<string, string | number>) => string, locale: string): string {
  const diff = Math.floor(Date.now() / 1000 - seconds);
  if (diff < 60) return t("à l'instant");
  if (diff < 3600) return t("il y a {count} min", { count: Math.floor(diff / 60) });
  if (diff < 86400) return t("il y a {count} h", { count: Math.floor(diff / 3600) });
  const days = Math.floor(diff / 86400);
  if (days < 8) return t("il y a {count} j", { count: days });
  return new Date(seconds * 1000).toLocaleDateString(locale === "fr" ? "fr-FR" : locale, {
    day: "numeric",
    month: "short",
  });
}

const TYPE_ICON: Record<string, string> = {
  messages:      "message-circle",
  prayers:       "heart",
  events:        "calendar",
  announcements: "bell",
  publications:  "file-text",
  covoiturage:   "navigation",
};

const TYPE_COLOR: Record<string, string> = {
  messages:      "#3B82F6",
  prayers:       "#E74C3C",
  events:        "#8B5CF6",
  announcements: GOLD,
  publications:  "#0EA5E9",
  covoiturage:   "#16A34A",
};

const DEFAULT_PREFS: NotifPrefs = {
  master: true,
  messages: true,
  prayers: true,
  events: true,
  announcements: true,
  publications: true,
  covoiturage: true,
};

// ─── ToggleRow ────────────────────────────────────────────────────────────────
function ToggleRow({
  icon, label, description, value, onValueChange, disabled,
}: {
  icon: string; label: string; description: string;
  value: boolean; onValueChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <View style={[s.row, disabled && { opacity: 0.4 }]}>
      <View style={s.rowIcon}>
        <Feather name={icon as never} size={18} color={GOLD} />
      </View>
      <View style={s.rowText}>
        <Text style={s.rowLabel}>{label}</Text>
        <Text style={s.rowDesc}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: BORDER, true: GOLD + "80" }}
        thumbColor={value ? GOLD : "#fff"}
        ios_backgroundColor={BORDER}
      />
    </View>
  );
}

// ─── NotifRow ─────────────────────────────────────────────────────────────────
function NotifRow({
  item,
  onPress,
}: {
  item: NotifItem;
  onPress: (item: NotifItem) => void;
}) {
  const icon  = TYPE_ICON[item.type]  ?? "bell";
  const color = TYPE_COLOR[item.type] ?? GOLD;
  const { t, locale } = useI18n();

  return (
    <TouchableOpacity
      style={[s.notifRow, !item.read && s.notifRowUnread]}
      onPress={() => onPress(item)}
      activeOpacity={0.78}
    >
      <View style={[s.notifIconWrap, { backgroundColor: color + "18" }]}>
        <Feather name={icon as never} size={18} color={color} />
      </View>
      <View style={s.notifContent}>
        <View style={s.notifTitleRow}>
          <Text style={s.notifTitle} numberOfLines={1}>{item.title}</Text>
          {!item.read && <View style={[s.unreadDot, { backgroundColor: GOLD }]} />}
        </View>
        <Text style={s.notifBody} numberOfLines={2}>{item.body}</Text>
        {item.createdAt && (
          <Text style={s.notifTime}>{timeAgo(item.createdAt.seconds, t, locale)}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── Écran principal ─────────────────────────────────────────────────────────
export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const { t } = useI18n();

  const [activeTab, setActiveTab] = useState<"feed" | "prefs">("feed");

  // ── Feed state ──
  const [notifications, setNotifications] = useState<NotifItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [unreadIds, setUnreadIds] = useState<string[]>([]);

  // ── Prefs state ──
  const [prefs, setPrefs] = useState<NotifPrefs>(
    profile?.notifPrefs ?? DEFAULT_PREFS
  );
  const [saving, setSaving] = useState(false);
  const [permStatus, setPermStatus] = useState<string>("unknown");
  const [requestingPerm, setRequestingPerm] = useState(false);

  // Sync prefs depuis Firestore quand le profil change
  useEffect(() => {
    if (profile?.notifPrefs) setPrefs({ ...DEFAULT_PREFS, ...profile.notifPrefs });
  }, [profile?.notifPrefs]);

  // Vérification des permissions (natif uniquement)
  useEffect(() => {
    if (Platform.OS === "web") { setPermStatus("web"); return; }
    Notifications.getPermissionsAsync()
      .then(({ status }) => setPermStatus(status))
      .catch(() => setPermStatus("unknown"));
  }, []);

  // ── Listener feed temps réel ──
  useEffect(() => {
    if (!user) { setFeedLoading(false); return; }
    const itemsRef = collection(db, "notifications", user.uid, "items");
    const unsubFeed = onSnapshot(
      query(
        itemsRef,
        orderBy("createdAt", "desc"),
        limit(100)
      ),
      (snap) => {
        setNotifications(
          snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
            createdAt: d.data().createdAt ?? null,
          } as NotifItem))
        );
        setFeedLoading(false);
      },
      () => setFeedLoading(false)
    );
    const unsubUnread = onSnapshot(
      query(itemsRef, where("read", "==", false)),
      (snap) => setUnreadIds(snap.docs.map((item) => item.id)),
      () => setUnreadIds([]),
    );
    return () => {
      unsubFeed();
      unsubUnread();
    };
  }, [user]);

  // ── Actions feed ──
  const handleNotifPress = useCallback(async (item: NotifItem) => {
    if (!user) return;
    // Marquer comme lu
    if (!item.read) {
      void updateDoc(
        doc(db, "notifications", user.uid, "items", item.id),
        { read: true }
      );
    }
    // Naviguer vers la source précise
    const screen = item.data?.screen;
    if (typeof screen === "string") {
      const params: Record<string, string> = {};
      for (const key of ["announcementId", "prayerId", "eventId", "rideId", "requestId", "publicationId", "interestId", "friendUid"]) {
        const value = item.data?.[key];
        if (typeof value === "string" && value) params[key] = value;
      }
      if (item.data?.openComments === true || item.data?.openComments === "true") {
        params.openComments = "true";
      }
      try {
        if (Object.keys(params).length > 0) {
          router.push({ pathname: screen as never, params } as never);
        } else {
          router.push(screen as never);
        }
      } catch { /* non-critique */ }
    }
  }, [user]);

  const markAllRead = useCallback(async () => {
    if (!user) return;
    if (unreadIds.length === 0) return;
    try {
      for (let offset = 0; offset < unreadIds.length; offset += 450) {
        const batch = writeBatch(db);
        unreadIds.slice(offset, offset + 450).forEach((id) => {
          batch.update(doc(db, "notifications", user.uid, "items", id), { read: true });
        });
        await batch.commit();
      }
    } catch {
      Alert.alert("Erreur", "Impossible de marquer les notifications comme lues.");
    }
  }, [user, unreadIds]);

  // ── Actions prefs ──
  const savePrefs = useCallback(async (updated: NotifPrefs) => {
    if (!user) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "users", user.uid), { notifPrefs: updated });
    } catch { /* non-critique */ }
    finally { setSaving(false); }
  }, [user]);

  const handleToggle = useCallback((key: keyof NotifPrefs) => (v: boolean) => {
    const updated = { ...prefs, [key]: v };
    if (key === "master" && !v) {
      const allOff: NotifPrefs = {
        master: false, messages: false, prayers: false,
        events: false, announcements: false, publications: false, covoiturage: false,
      };
      setPrefs(allOff);
      void savePrefs(allOff);
      return;
    }
    if (key !== "master" && v && !prefs.master) updated.master = true;
    setPrefs(updated);
    void savePrefs(updated);
  }, [prefs, savePrefs]);

  const requestPermission = useCallback(async () => {
    if (Platform.OS === "web") {
      if (typeof Notification !== "undefined") {
        const status = await Notification.requestPermission();
        setPermStatus(status === "granted" ? "granted" : "denied");
      }
      return;
    }
    setRequestingPerm(true);
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      setPermStatus(status);
    } finally { setRequestingPerm(false); }
  }, []);

  const permGranted = permStatus === "granted" || permStatus === "web";
  const unreadCount = unreadIds.length;

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={s.root}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={s.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="arrow-left" size={22} color={DARK} />
        </TouchableOpacity>
        <Text style={s.title}>Notifications</Text>
        <View style={{ width: 36, alignItems: "center" }}>
          {saving && <ActivityIndicator size="small" color={GOLD} />}
        </View>
      </View>

      {/* Tab switcher */}
      <View style={s.tabBar}>
        {(["feed", "prefs"] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[s.tabBtn, activeTab === tab && s.tabBtnActive]}
            onPress={() => setActiveTab(tab)}
            activeOpacity={0.8}
          >
            <Feather
              name={tab === "feed" ? "bell" : "settings"}
              size={14}
              color={activeTab === tab ? GOLD : MUTED}
            />
            <Text style={[s.tabLabel, activeTab === tab && s.tabLabelActive]}>
              {tab === "feed"
                ? `${t("Historique")}${unreadCount > 0 ? ` (${unreadCount})` : ""}`
                : t("Paramètres")}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── FEED TAB ── */}
      {activeTab === "feed" && (
        <View style={{ flex: 1 }}>
          {feedLoading ? (
            <View style={s.center}>
              <ActivityIndicator size="large" color={GOLD} />
            </View>
          ) : notifications.length === 0 ? (
            <View style={s.emptyWrap}>
              <Animated.View entering={FadeInDown.duration(400)} style={s.emptyState}>
                <View style={[s.emptyIcon, { backgroundColor: GOLD + "15" }]}>
                  <Feather name="bell-off" size={36} color={GOLD} />
                </View>
                <Text style={s.emptyTitle}>{t("Aucune notification")}</Text>
                <Text style={s.emptyBody}>
                  {t("Les nouveaux événements, annonces et messages de votre paroisse apparaîtront ici.")}
                </Text>
              </Animated.View>
            </View>
          ) : (
            <>
              {unreadCount > 0 && (
                <TouchableOpacity style={s.markAllBtn} onPress={markAllRead} activeOpacity={0.8}>
                  <Feather name="check-circle" size={14} color={GOLD} />
                  <Text style={s.markAllText}>{t("Tout marquer comme lu")}</Text>
                </TouchableOpacity>
              )}
              <FlatList
                data={notifications}
                keyExtractor={(n) => n.id}
                contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
                showsVerticalScrollIndicator={false}
                ItemSeparatorComponent={() => <View style={s.separator} />}
                renderItem={({ item }) => (
                  <NotifRow item={item} onPress={handleNotifPress} />
                )}
              />
            </>
          )}
        </View>
      )}

      {/* ── PREFS TAB ── */}
      {activeTab === "prefs" && (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Statut permission */}
          <Animated.View entering={FadeInDown.delay(0).duration(380)}>
            <View style={[
              s.permCard,
              { borderColor: permGranted ? GREEN + "40" : RED + "40",
                backgroundColor: permGranted ? GREEN + "08" : RED + "08" }
            ]}>
              <Feather
                name={permGranted ? "check-circle" : "alert-circle"}
                size={18}
                color={permGranted ? GREEN : RED}
              />
              <View style={{ flex: 1 }}>
                <Text style={[s.permTitle, { color: permGranted ? GREEN : RED }]}>
                  {permGranted ? "Notifications autorisées" : "Notifications bloquées"}
                </Text>
                <Text style={s.permDesc}>
                  {permGranted
                    ? Platform.OS === "web"
                      ? "Les notifications navigateur sont prêtes."
                      : "Votre appareil est prêt à recevoir les alertes."
                    : "Autorisez les notifications pour recevoir les alertes."}
                </Text>
              </View>
              {!permGranted && (
                <TouchableOpacity
                  style={s.permBtn}
                  onPress={requestPermission}
                  disabled={requestingPerm}
                >
                  {requestingPerm
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={s.permBtnText}>Autoriser</Text>}
                </TouchableOpacity>
              )}
            </View>
          </Animated.View>

          {/* Master toggle */}
          <Animated.View entering={FadeInDown.delay(40).duration(380)}>
            <View style={[s.card, s.masterCard]}>
              <View style={s.masterLeft}>
                <View style={[s.masterIconWrap, { backgroundColor: GOLD + "20" }]}>
                  <Feather name="bell" size={22} color={GOLD} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.masterLabel}>Activer les notifications</Text>
                  <Text style={s.masterDesc}>Activez pour recevoir toutes les alertes</Text>
                </View>
              </View>
              <Switch
                value={prefs.master}
                onValueChange={handleToggle("master")}
                trackColor={{ false: BORDER, true: GOLD + "80" }}
                thumbColor={prefs.master ? GOLD : "#fff"}
                ios_backgroundColor={BORDER}
              />
            </View>
          </Animated.View>

          {/* Catégories */}
          <Animated.View entering={FadeInDown.delay(100).duration(380)}>
            <Text style={s.sectionTitle}>Choisir les notifications</Text>
            <View style={s.card}>
              <ToggleRow
                icon="message-circle"
                label="Messages"
                description="Nouveaux messages privés"
                value={prefs.messages ?? true}
                onValueChange={handleToggle("messages")}
                disabled={!prefs.master}
              />
              <View style={s.divider} />
              <ToggleRow
                icon="calendar"
                label="Événements"
                description="Nouvelles activités de votre paroisse"
                value={prefs.events ?? true}
                onValueChange={handleToggle("events")}
                disabled={!prefs.master}
              />
              <View style={s.divider} />
              <ToggleRow
                icon="bell"
                label="Annonces"
                description="Actualités et annonces paroissiales"
                value={prefs.announcements ?? true}
                onValueChange={handleToggle("announcements")}
                disabled={!prefs.master}
              />
              <View style={s.divider} />
              <ToggleRow
                icon="file-text"
                label="Publications"
                description="Nouvelles publications du fil"
                value={prefs.publications ?? true}
                onValueChange={handleToggle("publications")}
                disabled={!prefs.master}
              />
              <View style={s.divider} />
              <ToggleRow
                icon="heart"
                label="Prières"
                description="Intentions et prières partagées"
                value={prefs.prayers ?? true}
                onValueChange={handleToggle("prayers")}
                disabled={!prefs.master}
              />
              <View style={s.divider} />
              <ToggleRow
                icon="navigation"
                label="Covoiturage"
                description="Nouvelles offres et demandes de trajets"
                value={prefs.covoiturage ?? true}
                onValueChange={handleToggle("covoiturage")}
                disabled={!prefs.master}
              />
            </View>
          </Animated.View>

          {/* Note */}
          <Animated.View entering={FadeInDown.delay(160).duration(380)}>
            <View style={s.note}>
              <Feather name="info" size={14} color={MUTED} />
              <Text style={s.noteText}>
                Vos préférences sont sauvegardées automatiquement et synchronisées sur tous vos appareils.
              </Text>
            </View>
          </Animated.View>
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  // Header
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: CREAM, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  backBtn: { padding: 6, minWidth: 36 },
  title: { fontSize: 17, fontFamily: "Inter_600SemiBold", color: DARK },

  // Tabs
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  tabBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 12, borderBottomWidth: 2.5, borderBottomColor: "transparent",
  },
  tabBtnActive: { borderBottomColor: GOLD },
  tabLabel: { fontSize: 13, fontFamily: "Inter_500Medium", color: MUTED },
  tabLabelActive: { color: GOLD, fontFamily: "Inter_600SemiBold" },

  // Feed
  markAllBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: GOLD + "10",
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  markAllText: { fontSize: 13, fontFamily: "Inter_500Medium", color: GOLD },
  separator: { height: 1, backgroundColor: BORDER, marginLeft: 68 },

  notifRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: "#fff",
  },
  notifRowUnread: { backgroundColor: GOLD + "08" },
  notifIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  notifContent: { flex: 1 },
  notifTitleRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3 },
  notifTitle: { flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold", color: DARK },
  unreadDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  notifBody: { fontSize: 13, fontFamily: "Inter_400Regular", color: MUTED, lineHeight: 18 },
  notifTime: { fontSize: 11, fontFamily: "Inter_400Regular", color: MUTED, marginTop: 4 },

  // Empty state
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  emptyState: { alignItems: "center", gap: 14, maxWidth: 280 },
  emptyIcon: { width: 72, height: 72, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: DARK, textAlign: "center" },
  emptyBody: { fontSize: 14, fontFamily: "Inter_400Regular", color: MUTED, textAlign: "center", lineHeight: 20 },

  // Prefs
  permCard: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginHorizontal: 16, marginTop: 16,
    borderRadius: 14, padding: 14, borderWidth: 1,
  },
  permTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  permDesc: { fontSize: 12, fontFamily: "Inter_400Regular", color: MUTED, marginTop: 2 },
  permBtn: { backgroundColor: RED, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  permBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#fff" },

  sectionTitle: {
    fontSize: 12, fontFamily: "Inter_600SemiBold", color: MUTED,
    textTransform: "uppercase", letterSpacing: 0.8,
    marginHorizontal: 16, marginTop: 24, marginBottom: 8,
  },
  card: {
    marginHorizontal: 16, backgroundColor: "#fff",
    borderRadius: 16, borderWidth: 1, borderColor: BORDER,
    overflow: "hidden",
    shadowColor: BORDER, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5, shadowRadius: 6, elevation: 2,
  },
  masterCard: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", padding: 16, marginTop: 20,
    backgroundColor: CREAM, borderColor: BORDER,
  },
  masterLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  masterIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  masterLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: DARK },
  masterDesc:  { fontSize: 12, fontFamily: "Inter_400Regular", color: MUTED, marginTop: 2 },

  row: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  rowIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: GOLD + "18", alignItems: "center", justifyContent: "center",
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, fontFamily: "Inter_500Medium", color: DARK },
  rowDesc:  { fontSize: 12, fontFamily: "Inter_400Regular", color: MUTED, marginTop: 1 },
  divider: { height: 1, backgroundColor: BORDER, marginLeft: 16 },

  note: {
    flexDirection: "row", gap: 8,
    marginHorizontal: 16, marginTop: 20,
    backgroundColor: CREAM, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: BORDER,
  },
  noteText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: MUTED, lineHeight: 18 },
});
