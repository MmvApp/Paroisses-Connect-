import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  useWindowDimensions,
  Image,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  increment,
  query,
  orderBy,
  limit,
  onSnapshot,
  updateDoc,
} from "firebase/firestore";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { useParishCover } from "@/hooks/useParishCover";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { PublicationCard } from "@/components/ui/PublicationCard";
import { normalizePublicationImageUrls } from "@/lib/publicationMedia";
import { ReactionBar } from "@/components/ui/ReactionBar";
import { GuestBanner } from "@/components/ui/GuestBanner";
import { NotificationBell } from "@/components/ui/NotificationBell";
import { useUnreadNotifCount } from "@/hooks/useUnreadNotifCount";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { sendPushToUsers } from "@/lib/pushNotifications";
import { subscribeToParishCollection } from "@/lib/subscribeParishCollection";
import { useTabScrollToTop } from "@/hooks/useTabScrollToTop";
import { LanguagePickerCard } from "@/components/ui/LanguagePickerCard";
import { useI18n } from "@/context/I18nContext";
import { EventCard, type ParishEvent } from "./events";
import {
  normalizeMassSchedules,
  sortMassSchedules,
  type LegacyMassScheduleEntry,
  type MassScheduleEntry,
} from "@/lib/massSchedules";

// ─── Palette ──────────────────────────────────────────────────────────────────
const GOLD   = "#C9A24A";
const DARK   = "#111111";
const CREAM  = "#FFF8EC";
const BORDER = "#EADFCB";
const MUTED  = "#666666";

const GRID_COLS = 3;
const GRID_GAP = 10;

interface Announcement {
  id: string;
  title: string;
  content: string;
  authorName: string;
  createdAt: { seconds: number } | null;
  category: string;
  imageUrl?: string | null;
  isPinned?: boolean;
  isUrgent?: boolean;
  authorId?: string;
  likeCount?: number;
  likedBy?: string[];
  commentCount?: number;
}

interface PrayerRequest {
  id: string;
  content: string;
  authorName: string;
  createdAt: { seconds: number } | null;
  prayerCount: number;
  prayedBy?: string[];
  commentCount?: number;
  authorId?: string;
  title?: string;
}

interface GridItem {
  icon: string;
  label: string;
  route: string | null;
  highlight?: boolean;
}

const GRID_ITEMS: GridItem[] = [
  { icon: "file-text",      label: "Actualités",           route: "/(tabs)/announcements" },
  { icon: "clock",          label: "Horaires\ndes messes",  route: "/mass-schedule" },
  { icon: "calendar",       label: "Événements",            route: "/(tabs)/events" },
  { icon: "heart",          label: "Intentions\nde prière", route: "/(tabs)/prayers", highlight: true },
  { icon: "bell",           label: "Annonces",              route: "/(tabs)/announcements" },
  { icon: "users",          label: "Groupes",               route: "/groups" },
  { icon: "help-circle",    label: "Aide &\nEntraide",      route: "/mutual-aid" },
  { icon: "navigation",     label: "Covoiturage",           route: "/(tabs)/covoiturage" },
  { icon: "more-horizontal", label: "Plus",                 route: "/more" },
];

function timeAgo(seconds: number, t: (source: string, variables?: Record<string, string | number>) => string) {
  const diff = Math.floor(Date.now() / 1000 - seconds);
  if (diff < 60) return t("à l'instant");
  if (diff < 3600) return t("il y a {count} min", { count: Math.floor(diff / 60) });
  if (diff < 86400) return t("il y a {count} h", { count: Math.floor(diff / 3600) });
  return t("il y a {count} j", { count: Math.floor(diff / 86400) });
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonsoir";
}

function todayLabel(locale: string) {
  const localeTag = locale === "fr" ? "fr-FR" : locale;
  const raw = new Date().toLocaleDateString(localeTag, {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

// ─── Grid button ──────────────────────────────────────────────────────────────

function GridButton({ item, index }: { item: GridItem; index: number }) {
  const colors = useColors();
  const { t } = useI18n();
  const { width: screenWidth } = useWindowDimensions();
  const gridItemSize = (screenWidth - 32 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;
  const isGold = !!item.highlight;
  return (
    <Animated.View entering={FadeInDown.delay(index * 40).duration(360)} style={{ width: gridItemSize }}>
      <TouchableOpacity
        style={[
          grid.btn,
          {
            backgroundColor: isGold ? GOLD : colors.card,
            borderColor: isGold ? GOLD : BORDER,
            shadowColor: "#EADFCB",
          },
        ]}
        onPress={() => { if (item.route) router.push(item.route as never); }}
        activeOpacity={item.route ? 0.78 : 0.95}
      >
        <View style={[grid.iconWrap, { backgroundColor: isGold ? "rgba(255,255,255,0.25)" : GOLD + "18" }]}>
          <Feather name={item.icon as never} size={22} color={isGold ? DARK : GOLD} />
        </View>
        <Text style={[grid.label, { color: isGold ? DARK : colors.foreground }]} numberOfLines={2}>
          {t(item.label)}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title, onSeeAll }: { title: string; onSeeAll?: () => void }) {
  const colors = useColors();
  return (
    <View style={sh.row}>
      <View style={sh.titleWrap}>
        <View style={[sh.titleBar, { backgroundColor: GOLD }]} />
        <Text style={[sh.title, { color: colors.foreground }]}>{title}</Text>
      </View>
      {onSeeAll && (
        <TouchableOpacity onPress={onSeeAll} activeOpacity={0.7}>
          <Text style={[sh.link, { color: GOLD }]}>Tout voir</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Empty card ───────────────────────────────────────────────────────────────

function EmptyCard({ icon, text }: { icon: string; text: string }) {
  const colors = useColors();
  return (
    <Card elevated style={{ alignItems: "center", paddingVertical: 26, gap: 10, marginBottom: 4 }}>
      <Feather name={icon as never} size={26} color={colors.mutedForeground} />
      <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>{text}</Text>
    </Card>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { user, profile, userDirectory } = useAuth();
  const { locale, t } = useI18n();
  const { requireAuth } = useRequireAuth();
  const scrollRef = useRef<ScrollView>(null);
  useTabScrollToTop(scrollRef);
  const parishCoverURL = useParishCover(profile?.parishId);
  const unreadNotifCount = useUnreadNotifCount(user?.uid ?? null);

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [events, setEvents] = useState<ParishEvent[]>([]);
  const [massSchedules, setMassSchedules] = useState<MassScheduleEntry[]>([]);
  const [prayers, setPrayers] = useState<PrayerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!user) { setLoading(false); return; }

    const currentParishId = profile?.parishId ?? profile?.priestParishId ?? null;
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) { resolved = true; setLoading(false); }
    }, 6000);

    const unsubA = subscribeToParishCollection(
      "announcements",
      currentParishId,
      (docs) => {
        setAnnouncements(docs.map((d) => {
          const data = d.data();
          const liveAuthor = typeof data.authorId === "string" ? userDirectory[data.authorId] : undefined;
          return {
            id: d.id,
            ...data,
            authorName: liveAuthor?.displayName ?? data.authorName,
          } as Announcement;
        }));
        if (!resolved) { resolved = true; setLoading(false); }
      },
      () => { if (!resolved) { resolved = true; setLoading(false); } },
      user.uid,
      3,
    );
    const unsubE = onSnapshot(
      query(collection(db, "events"), orderBy("date", "asc"), limit(3)),
      (snap) => setEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ParishEvent))),
      () => {}
    );
    const unsubP = subscribeToParishCollection(
      "prayers",
      currentParishId,
       (docs) => setPrayers(docs.map((d) => {
         const data = d.data();
         const liveAuthor = typeof data.authorId === "string" ? userDirectory[data.authorId] : undefined;
         return {
           id: d.id,
           ...data,
           authorName: liveAuthor?.displayName ?? data.authorName,
         } as PrayerRequest;
       })),
      () => {},
      user.uid,
      2,
    );
    return () => {
      clearTimeout(timeout);
      unsubA(); unsubE(); unsubP();
    };
  }, [user, profile?.parishId, profile?.priestParishId, userDirectory]);

  useEffect(() => {
    const parishId = profile?.parishId ?? profile?.priestParishId ?? null;
    if (!parishId) {
      setMassSchedules([]);
      return;
    }

    let parishData: LegacyMassScheduleEntry[] = [];
    let importedData: LegacyMassScheduleEntry[] = [];
    let subcollectionData: LegacyMassScheduleEntry[] = [];
    const publish = () => {
      setMassSchedules(sortMassSchedules(normalizeMassSchedules(
        { massSchedule: parishData, massSchedules: importedData },
        subcollectionData,
      )));
    };

    const unsubParish = onSnapshot(doc(db, "parishes", parishId), (snap) => {
      const data = snap.data() ?? {};
      parishData = Array.isArray(data.massSchedule) ? data.massSchedule as LegacyMassScheduleEntry[] : [];
      importedData = Array.isArray(data.massSchedules) ? data.massSchedules as LegacyMassScheduleEntry[] : [];
      publish();
    }, () => setMassSchedules([]));
    const unsubSubcollection = onSnapshot(
      collection(db, "parishes", parishId, "massSchedules"),
      (snap) => {
        subcollectionData = snap.docs.map((d) => d.data() as LegacyMassScheduleEntry);
        publish();
      },
      () => publish(),
    );
    return () => {
      unsubParish();
      unsubSubcollection();
    };
  }, [profile?.parishId, profile?.priestParishId]);

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 900);
  };

  const handleAnnouncementLike = async (item: Announcement) => {
    if (!user) return;
    const liked = (item.likedBy ?? []).includes(user.uid);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await updateDoc(doc(db, "announcements", item.id), {
        likedBy: liked ? arrayRemove(user.uid) : arrayUnion(user.uid),
        likeCount: increment(liked ? -1 : 1),
      });
      if (!liked && item.authorId && item.authorId !== user.uid) {
        void sendPushToUsers(
          [item.authorId],
          `${profile?.displayName ?? "Un paroissien"} a aimé votre actualité`,
          item.title,
          { screen: "/(tabs)/announcements", announcementId: item.id },
          "announcements",
        );
      }
    } catch {
      Alert.alert("Erreur", "Impossible d’enregistrer votre réaction.");
    }
  };

  const handlePrayerReaction = async (item: PrayerRequest) => {
    if (!user) return;
    const prayed = (item.prayedBy ?? []).includes(user.uid);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      await updateDoc(doc(db, "prayers", item.id), {
        prayedBy: prayed ? arrayRemove(user.uid) : arrayUnion(user.uid),
        prayerCount: increment(prayed ? -1 : 1),
      });
      if (!prayed && item.authorId && item.authorId !== user.uid) {
        void sendPushToUsers(
          [item.authorId],
          `${profile?.displayName ?? "Un paroissien"} prie pour votre publication`,
          item.title || "Une prière de la communauté",
          { screen: "/(tabs)/prayers", prayerId: item.id },
          "prayers",
        );
      }
    } catch {
      Alert.alert("Erreur", "Impossible d’enregistrer votre prière.");
    }
  };

  const firstName  = profile?.displayName?.split(" ")[0] ?? "Fidèle";
  const parishName = profile?.parishName ?? "Paroisse Connect";

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD} colors={[GOLD]} />
        }
      >

        <View style={[s.languageSection, { paddingTop: insets.top + 8 }]}>
          <LanguagePickerCard />
        </View>

        {!user && <GuestBanner />}

        {/* ── HERO ── */}
        <View style={[
          s.hero,
          parishCoverURL
            ? { paddingTop: insets.top + 20 }
            : { backgroundColor: CREAM, paddingTop: insets.top + 20, borderBottomWidth: 1, borderBottomColor: BORDER },
        ]}>
          {/* Cover photo */}
          {parishCoverURL ? (
            <ExpoImage
              source={{ uri: parishCoverURL }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
          ) : null}
          {/* Dark scrim for text readability */}
          {parishCoverURL ? <View style={s.heroScrim} /> : null}

          <Animated.View entering={FadeIn.duration(500)} style={s.heroTop}>
            <View style={{ flex: 1 }}>
               <Text style={[s.greetingText, { color: parishCoverURL ? "rgba(255,255,255,0.78)" : MUTED }]}>{t(greeting())},</Text>
              <Text style={[s.firstName, { color: parishCoverURL ? "#fff" : DARK }]}>{firstName}</Text>
               <Text style={[s.dateText, { color: GOLD }]}>{todayLabel(locale)}</Text>
            </View>
            <View style={{ alignItems: "center", gap: 8 }}>
              <NotificationBell
                count={unreadNotifCount}
                color={parishCoverURL ? "#fff" : DARK}
                onPress={() => router.push("/notifications")}
              />
              <TouchableOpacity onPress={() => router.push("/(tabs)/profile")} activeOpacity={0.85} style={s.avatarBtn}>
                <View style={s.avatarRing}>
                  <Avatar name={profile?.displayName ?? "?"} size={100} photoURL={profile?.photoURL} />
                </View>
              </TouchableOpacity>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(100).duration(450)} style={s.parishStrip}>
            <View style={[s.goldPill, { backgroundColor: GOLD }]} />
            <Feather name="map-pin" size={12} color={GOLD} />
            <Text style={[s.parishName, { color: GOLD }]} numberOfLines={1}>{parishName}</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(160).duration(450)}>
            <Text style={[s.verse, { color: parishCoverURL ? "rgba(255,255,255,0.85)" : MUTED }]}>
              « Là où deux ou trois sont réunis en mon nom, je suis au milieu d'eux. »
            </Text>
            <Text style={[s.verseRef, { color: GOLD }]}>— Matthieu 18,20</Text>
          </Animated.View>
        </View>

        {/* ── SERVICES GRID ── */}
        <View style={s.section}>
          <SectionHeader title="Services" />
          <View style={s.gridWrap}>
            {GRID_ITEMS.map((item, i) => (
              <GridButton key={item.label} item={item} index={i} />
            ))}
          </View>
        </View>

        {/* ── HORAIRES DES MESSES ── */}
        <View style={s.section}>
          <SectionHeader title="Horaires des messes" />
          <TouchableOpacity onPress={() => router.push("/mass-schedule")} activeOpacity={0.82}>
            <Card elevated style={s.massCard}>
              <View style={s.massHeader}>
                <View style={[s.massIconWrap, { backgroundColor: GOLD + "18" }]}>
                  <Feather name="clock" size={18} color={GOLD} />
                </View>
                <View>
                  <Text style={[s.massHeaderTitle, { color: colors.foreground }]}>Horaires de la paroisse</Text>
                  <Text style={[s.massHeaderSub, { color: colors.mutedForeground }]}>
                    Horaires récurrents et dates précises
                  </Text>
                </View>
              </View>
              <View style={[s.massDivider, { backgroundColor: BORDER }]} />
              {massSchedules.length === 0 ? (
                <Text style={[s.massDay, { color: colors.mutedForeground }]}>Aucun horaire renseigné</Text>
              ) : massSchedules.map((m, i) => (
                <View key={m.id} style={[s.massRow, i < massSchedules.length - 1 && s.massRowBorder, i < massSchedules.length - 1 && { borderBottomColor: BORDER }]}>
                  <View style={[s.massTime, { backgroundColor: GOLD + "18", borderColor: GOLD + "44", borderWidth: 1 }]}>
                    <Text style={[s.massTimeText, { color: GOLD }]}>{m.startTime || "—"}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.massType, { color: colors.foreground }]}>{m.celebrationType}</Text>
                    <Text style={[s.massDay, { color: colors.mutedForeground }]}>
                      {m.mode === "specific" ? `Le ${m.date}` : m.day}
                    </Text>
                    <Text style={[s.massDay, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {m.location}{m.address ? ` · ${m.address}` : ""}
                    </Text>
                  </View>
                  <Feather name={m.mode === "specific" ? "calendar" : "repeat"} size={14} color={GOLD} />
                </View>
              ))}
            </Card>
          </TouchableOpacity>
        </View>

        {/* ── ACTUALITÉS DE LA PAROISSE ── */}
        <View style={s.section}>
          <SectionHeader title="Actualités de la paroisse" onSeeAll={() => router.push("/(tabs)/announcements")} />
          {loading ? (
            <ActivityIndicator color={GOLD} style={{ marginVertical: 20 }} />
          ) : announcements.length === 0 ? (
            <EmptyCard icon="bell-off" text="Aucune actualité pour l'instant" />
          ) : (
            announcements.map((item, i) => {
              return (
                <Animated.View key={item.id} entering={FadeInDown.delay(i * 60).duration(360)} style={{ marginBottom: 12 }}>
                  <PublicationCard
                    imageUrls={normalizePublicationImageUrls(item)}
                    category={item.category || "Général"}
                    badges={[
                      ...(item.isPinned ? [{ icon: "bookmark", color: "rgba(201,162,74,0.92)" }] : []),
                      ...(item.isUrgent ? [{ label: "Urgent", color: "rgba(211,47,47,0.90)" }] : []),
                    ]}
                     timeLabel={item.createdAt ? timeAgo(item.createdAt.seconds, t) : ""}
                    title={item.title}
                    body={item.content}
                    authorName={item.authorName}
                     onPress={() => router.push("/(tabs)/announcements")}
                     footer={
                       <ReactionBar
                         liked={user ? (item.likedBy ?? []).includes(user.uid) : false}
                         likeCount={item.likeCount}
                         onLike={() => requireAuth(() => { void handleAnnouncementLike(item); })}
                         commentCount={item.commentCount}
                         onComment={() => requireAuth(() => router.push({
                           pathname: "/(tabs)/announcements",
                           params: { announcementId: item.id, openComments: "true" },
                         } as never))}
                       />
                     }
                  />
                </Animated.View>
              );
            })
          )}
        </View>

        {/* ── ÉVÉNEMENTS À VENIR ── */}
        <View style={s.section}>
          <SectionHeader title="Événements à venir" onSeeAll={() => router.push("/(tabs)/events")} />
          {events.length === 0 ? (
            <EmptyCard icon="calendar" text="Aucun événement à venir" />
          ) : (
            events.map((ev, i) => (
              <EventCard
                key={ev.id}
                item={ev}
                index={i}
                currentUid={user?.uid}
                currentRole={profile?.role}
                currentParishId={profile?.parishId ?? profile?.priestParishId ?? null}
                isPrivileged={false}
                isAuthor={false}
                onEdit={() => router.push("/(tabs)/events")}
              />
            ))
          )}
        </View>

        {/* ── INTENTIONS DE PRIÈRE ── */}
        <View style={s.section}>
          <SectionHeader title="Intentions de prière" onSeeAll={() => router.push("/(tabs)/prayers")} />
          {prayers.length === 0 ? (
            <EmptyCard icon="heart" text="Aucune intention pour l'instant" />
          ) : (
            prayers.map((item, i) => (
              <Animated.View key={item.id} entering={FadeInDown.delay(i * 60 + 80).duration(360)}>
                <TouchableOpacity activeOpacity={0.86} onPress={() => router.push("/(tabs)/prayers")}>
                  <Card elevated style={s.prayerCard}>
                    <View style={[s.accentBar, { backgroundColor: GOLD }]} />
                    <View style={s.prayerRow}>
                      <Avatar name={item.authorName} size={38} />
                      <View style={{ flex: 1 }}>
                        <Text style={[s.prayerContent, { color: colors.foreground }]}>
                          "{item.content}"
                        </Text>
                        <Text style={[s.prayerAuthor, { color: colors.mutedForeground }]}>
                          — {item.authorName}
                        </Text>
                      </View>
                    </View>
                    <ReactionBar
                      prayed={user ? (item.prayedBy ?? []).includes(user.uid) : false}
                      prayerCount={item.prayerCount}
                      onPray={() => requireAuth(() => { void handlePrayerReaction(item); })}
                      commentCount={item.commentCount}
                      onComment={() => requireAuth(() => router.push({
                        pathname: "/(tabs)/prayers",
                        params: { prayerId: item.id, openComments: "true" },
                      } as never))}
                    />
                  </Card>
                </TouchableOpacity>
              </Animated.View>
            ))
          )}
        </View>

      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const grid = StyleSheet.create({
  btn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 6,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  iconWrap: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 11, fontFamily: "Inter_600SemiBold", textAlign: "center", lineHeight: 15 },
});

const sh = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  titleWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  titleBar: { width: 3, height: 18, borderRadius: 2 },
  title: { fontSize: 17, fontFamily: "Inter_700Bold" },
  link: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
});

const s = StyleSheet.create({
  root: { flex: 1, minWidth: 0, overflow: "hidden" },

  // Hero section — cover photo or cream fallback
  hero: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 12,
    overflow: "hidden",
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  heroScrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.48)",
  },
  heroTop:     { flexDirection: "row", alignItems: "center", gap: 14, minWidth: 0 },
  greetingText:{ fontSize: 13, fontFamily: "Inter_400Regular" },
  firstName:   { fontSize: 26, fontFamily: "Inter_700Bold", letterSpacing: -0.5, marginTop: 1 },
  dateText:    { fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 4 },
  avatarBtn:   {},
  avatarRing: {
    width: 108,
    height: 108,
    borderRadius: 54,
    padding: 3,
    backgroundColor: "transparent",
    borderWidth: 2.5,
    borderColor: "#C9A24A",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  parishStrip: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
  goldPill:    { width: 3, height: 14, borderRadius: 2 },
  parishName:  { fontSize: 13, fontFamily: "Inter_600SemiBold", flex: 1 },
  verse:       { fontSize: 12, fontFamily: "Inter_400Regular", fontStyle: "italic", lineHeight: 19, flexShrink: 1 },
  verseRef:    { fontSize: 11, fontFamily: "Inter_500Medium", marginTop: 2 },

  // Sections
  languageSection: { paddingHorizontal: 16, minWidth: 0 },
  section: { paddingHorizontal: 16, paddingTop: 26, minWidth: 0 },
  gridWrap: { width: "100%", maxWidth: "100%", minWidth: 0, flexDirection: "row", flexWrap: "wrap", gap: GRID_GAP },

  // Accent bar
  accentBar: {
    position: "absolute", left: 0, top: 0, bottom: 0,
    width: 3, borderTopLeftRadius: 16, borderBottomLeftRadius: 16,
  },

  // Announcement cards (enlarged ~50 %, full-card tap, cover photo banner)
  annoOuter: {
    marginBottom: 14,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#fff",
    shadowColor: "#C9A24A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: "#EADFCB",
  },
  annoBannerWrap: { height: 170, width: "100%", backgroundColor: "#EDE0C8" },
  annoBanner:     { width: "100%", height: "100%" },
  annoBadgeRow: {
    position: "absolute",
    bottom: 10,
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  annoCategoryPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(17,17,17,0.62)",
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  annoCategoryText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#fff" },
  annoTimeOverlay: {
    marginLeft: "auto",
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.85)",
  },
  annoBody:    { padding: 14, gap: 8 },
  annoTitle:   { fontSize: 17, fontFamily: "Inter_700Bold", lineHeight: 24 },
  annoContent: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21 },
  annoFooter:  { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  authorText:  { fontSize: 12, fontFamily: "Inter_500Medium" },
  timeText:    { fontSize: 11, fontFamily: "Inter_400Regular" },

  // Mass schedule
  massCard:        { marginBottom: 4, gap: 0, overflow: "hidden" },
  massHeader:      { flexDirection: "row", alignItems: "center", gap: 12, paddingBottom: 12, minWidth: 0 },
  massIconWrap:    { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  massHeaderTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  massHeaderSub:   { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  massDivider:     { height: 1, marginBottom: 4 },
  massRow:         { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, minWidth: 0 },
  massRowBorder:   { borderBottomWidth: 1 },
  massTime:        { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, minWidth: 56, flexShrink: 0, alignItems: "center" },
  massTimeText:    { fontSize: 13, fontFamily: "Inter_700Bold" },
  massType:        { fontSize: 13, fontFamily: "Inter_600SemiBold", flexShrink: 1 },
  massDay:         { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1, flexShrink: 1 },

  // Prayer cards
  prayerCard:      { marginBottom: 10, overflow: "hidden" },
  prayerRow:       { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  prayerContent:   { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19, fontStyle: "italic" },
  prayerAuthor:    { fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 4 },
});
