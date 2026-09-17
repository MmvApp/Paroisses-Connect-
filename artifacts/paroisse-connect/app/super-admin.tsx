import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import {
  collection,
  getDocs,
  query,
  where,
  getCountFromServer,
  orderBy,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";

// ─── Palette ──────────────────────────────────────────────────────────────────
const DARK   = "#111111";
const GOLD   = "#C9A24A";
const CREAM  = "#FFF8EC";
const BORDER = "#EADFCB";
const MUTED  = "#666666";
const RED    = "#D32F2F";
const PURPLE = "#7C3AED";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ParishSummary {
  id: string;
  name: string;
  city: string;
  postalCode?: string;
  priestName?: string;
  memberCount: number;
  isClaimed?: boolean;
  claimStatus?: string;
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function SuperAdminScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();

  const ownParishId = profile?.parishId ?? profile?.priestParishId ?? null;
  const isSuperAdmin =
    profile?.role === "super_admin" ||
    (profile?.role === "admin" && !ownParishId);

  const [parishes,       setParishes]       = useState<ParishSummary[]>([]);
  const [stats,          setStats]          = useState({ parishes: 0, users: 0, pendingClaims: 0 });
  const [loading,        setLoading]        = useState(true);
  const [refreshing,     setRefreshing]     = useState(false);
  const [searchQuery,    setSearchQuery]    = useState("");

  const loadData = useCallback(async () => {
    try {
      // Parishes
      const parishSnap = await getDocs(query(collection(db, "parishes"), orderBy("name")));
      const parishList: ParishSummary[] = parishSnap.docs.map((d) => {
        const data = d.data();
        return {
          id:          d.id,
          name:        data.name ?? "",
          city:        data.city ?? "",
          postalCode:  data.postalCode ?? "",
          priestName:  data.priestName ?? null,
          memberCount: data.memberCount ?? 0,
          isClaimed:   data.isClaimed ?? false,
          claimStatus: data.claimStatus ?? null,
        };
      });
      setParishes(parishList);

      // Stats
      const [usersCount, claimsCount] = await Promise.all([
        getCountFromServer(collection(db, "users")),
        getCountFromServer(query(collection(db, "parishClaims"), where("status", "==", "pending"))),
      ]);

      setStats({
        parishes:     parishList.length,
        users:        usersCount.data().count,
        pendingClaims: claimsCount.data().count,
      });
    } catch (e) {
      console.error("SuperAdmin load error:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = () => { setRefreshing(true); loadData(); };

  // Guard: redirect non-super-admins
  if (!isSuperAdmin) {
    return (
      <View style={[s.root, { paddingTop: insets.top + 20, alignItems: "center", justifyContent: "center" }]}>
        <Feather name="shield-off" size={48} color={MUTED} />
        <Text style={[s.emptyTitle, { marginTop: 16 }]}>Accès refusé</Text>
        <Text style={s.emptySub}>Cette section est réservée aux super administrateurs.</Text>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Text style={s.backBtnText}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const filteredParishes = searchQuery.trim()
    ? parishes.filter((p) =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.city.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : parishes;

  const ACTIONS = [
    {
      icon: "file-text" as const,
      label: "Revendications",
      sub: `${stats.pendingClaims} en attente`,
      color: stats.pendingClaims > 0 ? RED : GOLD,
      onPress: () => router.push("/admin-claims"),
    },
    {
      icon: "download" as const,
      label: "Import paroisses",
      sub: "Importer depuis JSON",
      color: GOLD,
      onPress: () => router.push("/admin-import-parishes"),
    },
    {
      icon: "users" as const,
      label: "Utilisateurs",
      sub: `${stats.users} comptes`,
      color: PURPLE,
      onPress: () => Alert.alert("Bientôt disponible", "La gestion des utilisateurs sera disponible dans une prochaine mise à jour."),
    },
    {
      icon: "flag" as const,
      label: "Signalements",
      sub: "Contenus signalés",
      color: RED,
      onPress: () => Alert.alert("Bientôt disponible", "Le module de signalements sera disponible dans une prochaine mise à jour."),
    },
  ];

  return (
    <View style={[s.root, { backgroundColor: "#F8F8F5" }]}>
      {/* ── Header ── */}
      <View style={[s.header, { paddingTop: insets.top + 10, borderBottomColor: BORDER }]}>
        <TouchableOpacity style={s.headerBack} onPress={() => router.back()} activeOpacity={0.7}>
          <Feather name="arrow-left" size={22} color={DARK} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Panneau Super Admin</Text>
          <Text style={s.headerSub}>{profile?.displayName} · Accès total</Text>
        </View>
        <View style={[s.badgeWrap, { backgroundColor: PURPLE + "18", borderColor: PURPLE + "44" }]}>
          <Feather name="shield" size={12} color={PURPLE} />
          <Text style={[s.badgeText, { color: PURPLE }]}>Super Admin</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 60, gap: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD} />}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator size="large" color={GOLD} style={{ marginTop: 60 }} />
        ) : (
          <>
            {/* ── Stats row ── */}
            <Animated.View entering={FadeInDown.delay(0).duration(400)} style={s.statsRow}>
              <StatCard value={stats.parishes}      label="Paroisses"    icon="map-pin"   color={GOLD} />
              <StatCard value={stats.users}         label="Utilisateurs" icon="users"     color={PURPLE} />
              <StatCard value={stats.pendingClaims} label="En attente"   icon="clock"     color={stats.pendingClaims > 0 ? RED : MUTED} />
            </Animated.View>

            {/* ── Quick actions ── */}
            <Animated.View entering={FadeInDown.delay(60).duration(400)}>
              <Text style={s.sectionLabel}>Actions rapides</Text>
              <View style={s.actionsGrid}>
                {ACTIONS.map((a) => (
                  <TouchableOpacity
                    key={a.label}
                    style={[s.actionCard, { borderColor: BORDER, backgroundColor: "#FFFFFF" }]}
                    onPress={a.onPress}
                    activeOpacity={0.8}
                  >
                    <View style={[s.actionIcon, { backgroundColor: a.color + "18" }]}>
                      <Feather name={a.icon} size={20} color={a.color} />
                    </View>
                    <Text style={s.actionLabel}>{a.label}</Text>
                    <Text style={[s.actionSub, { color: a.color === RED && a.label === "Revendications" && stats.pendingClaims > 0 ? RED : MUTED }]}>
                      {a.sub}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Animated.View>

            {/* ── All parishes ── */}
            <Animated.View entering={FadeInDown.delay(120).duration(400)}>
              <View style={s.sectionHeader}>
                <Text style={s.sectionLabel}>Toutes les paroisses ({parishes.length})</Text>
              </View>

              {filteredParishes.map((parish, i) => (
                <Animated.View
                  key={parish.id}
                  entering={FadeInDown.delay(140 + i * 20).duration(350)}
                >
                  <ParishRow
                    parish={parish}
                    onManage={() =>
                      router.push({ pathname: "/parish-admin", params: { parishId: parish.id } })
                    }
                  />
                </Animated.View>
              ))}

              {filteredParishes.length === 0 && (
                <View style={s.emptyWrap}>
                  <Feather name="inbox" size={32} color={MUTED} />
                  <Text style={s.emptySub}>Aucune paroisse trouvée</Text>
                </View>
              )}
            </Animated.View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────
function StatCard({
  value, label, icon, color,
}: { value: number; label: string; icon: React.ComponentProps<typeof Feather>["name"]; color: string }) {
  return (
    <View style={[s.statCard, { borderColor: BORDER, backgroundColor: "#FFFFFF" }]}>
      <View style={[s.statIcon, { backgroundColor: color + "18" }]}>
        <Feather name={icon} size={18} color={color} />
      </View>
      <Text style={[s.statValue, { color }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

// ─── ParishRow ────────────────────────────────────────────────────────────────
function ParishRow({
  parish, onManage,
}: { parish: ParishSummary; onManage: () => void }) {
  const claimed = parish.isClaimed && parish.priestName;
  return (
    <View style={[s.parishRow, { borderColor: BORDER, backgroundColor: "#FFFFFF" }]}>
      <View style={[s.parishIcon, { backgroundColor: GOLD + "18" }]}>
        <Feather name="home" size={16} color={GOLD} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.parishName} numberOfLines={1}>{parish.name}</Text>
        <Text style={s.parishCity}>{parish.city}{parish.postalCode ? ` · ${parish.postalCode}` : ""}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
          <View style={[
            s.claimBadge,
            { backgroundColor: claimed ? GOLD + "18" : BORDER, borderColor: claimed ? GOLD + "44" : BORDER },
          ]}>
            <Feather name={claimed ? "star" : "user-x"} size={10} color={claimed ? GOLD : MUTED} />
            <Text style={[s.claimBadgeText, { color: claimed ? GOLD : MUTED }]}>
              {claimed ? parish.priestName : "Pas de prêtre"}
            </Text>
          </View>
          <Text style={s.memberCount}>
            <Feather name="users" size={10} color={MUTED} /> {parish.memberCount}
          </Text>
        </View>
      </View>
      <TouchableOpacity style={[s.manageBtn, { borderColor: GOLD + "66" }]} onPress={onManage} activeOpacity={0.8}>
        <Feather name="settings" size={14} color={GOLD} />
        <Text style={s.manageBtnText}>Gérer</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:          { flex: 1 },
  header:        { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, gap: 12, backgroundColor: "#FFFFFF" },
  headerBack:    { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  headerTitle:   { fontSize: 17, fontFamily: "Inter_700Bold", color: DARK },
  headerSub:     { fontSize: 12, fontFamily: "Inter_400Regular", color: MUTED },
  badgeWrap:     { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1 },
  badgeText:     { fontSize: 11, fontFamily: "Inter_700Bold" },

  sectionLabel:  { fontSize: 11, fontFamily: "Inter_600SemiBold", color: MUTED, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },

  statsRow:      { flexDirection: "row", gap: 10 },
  statCard:      { flex: 1, borderRadius: 14, borderWidth: 1, padding: 14, alignItems: "center", gap: 6 },
  statIcon:      { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  statValue:     { fontSize: 22, fontFamily: "Inter_700Bold" },
  statLabel:     { fontSize: 11, fontFamily: "Inter_500Medium", color: MUTED, textAlign: "center" },

  actionsGrid:   { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  actionCard:    { width: "47%", borderRadius: 14, borderWidth: 1, padding: 14, gap: 6 },
  actionIcon:    { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  actionLabel:   { fontSize: 14, fontFamily: "Inter_700Bold", color: DARK },
  actionSub:     { fontSize: 11, fontFamily: "Inter_400Regular" },

  parishRow:     { flexDirection: "row", alignItems: "center", borderRadius: 14, borderWidth: 1, padding: 14, gap: 12, marginBottom: 10 },
  parishIcon:    { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  parishName:    { fontSize: 14, fontFamily: "Inter_700Bold", color: DARK },
  parishCity:    { fontSize: 12, fontFamily: "Inter_400Regular", color: MUTED },
  claimBadge:    { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1 },
  claimBadgeText:{ fontSize: 10, fontFamily: "Inter_600SemiBold" },
  memberCount:   { fontSize: 11, fontFamily: "Inter_400Regular", color: MUTED },
  manageBtn:     { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 7 },
  manageBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: GOLD },

  emptyWrap:     { alignItems: "center", padding: 40, gap: 10 },
  emptyTitle:    { fontSize: 18, fontFamily: "Inter_700Bold", color: DARK },
  emptySub:      { fontSize: 13, fontFamily: "Inter_400Regular", color: MUTED, textAlign: "center" },
  backBtn:       { marginTop: 20, backgroundColor: GOLD, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  backBtnText:   { fontSize: 15, fontFamily: "Inter_600SemiBold", color: DARK },
});
