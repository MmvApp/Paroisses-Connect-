import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Share,
  Platform,
  Modal,
  KeyboardAvoidingView,
} from "react-native";
import { ConfirmSheet } from "@/components/ConfirmSheet";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import {
  doc, getDoc, updateDoc, collection,
  query, where, getDocs, getCountFromServer,
  arrayUnion, arrayRemove, writeBatch,
} from "firebase/firestore";
import { uploadToSupabase, base64ToBlob } from "@/lib/uploadToSupabase";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { useParishPermissions, AdminProfile } from "@/hooks/useParishPermissions";
import { ClaimsSummary } from "@/components/ui/ClaimsSummary";
import { sendPushToParish } from "@/lib/pushNotifications";
import { Avatar } from "@/components/ui/Avatar";
import { CompactFilterChip, CompactFilterRow } from "@/components/ui/CompactFilterRow";

const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ||
  (process.env.EXPO_PUBLIC_DOMAIN
    ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
    : "");

// ─── Palette ──────────────────────────────────────────────────────────────────
const DARK   = "#111111";
const GOLD   = "#C9A24A";
const CREAM  = "#FFF8EC";
const BORDER = "#EADFCB";
const MUTED  = "#666666";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ParishData {
  id: string;
  name: string;
  city: string;
  postalCode: string;
  description: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  logoUrl?: string;
  coverUrl?: string;
  memberCount: number;
  priestUid?: string;
  priestName?: string;
  massSchedule?: MassEntry[];
  massSchedules?: Array<Record<string, unknown>>;
  confessionSchedules?: string;
  adorationSchedules?: string;
  permanenceSchedules?: string;
  massSchedulesText?: string;
  _enrichedAt?: string;
  /** Nom de l'église ou lieu de célébration principal. */
  churchName?: string;
  /** Liens officiels utiles importés depuis le site web. */
  usefulLinks?: Array<{ label: string; url: string }>;
  /** Champs modifiés manuellement — ne jamais écraser sans confirmation. */
  _manuallyEditedFields?: string[];
}

interface EnrichedData {
  name?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  priestName?: string | null;
  confessionSchedules?: string | null;
  adorationSchedules?: string | null;
  permanenceSchedules?: string | null;
  massSchedule?: Array<{ day: string; time: string; type: string }> | null;
  massSchedulesText?: string | null;
}

// ─── Types pour l'import depuis le site officiel ──────────────────────────────
type ImportConfidence = "fiable" | "à vérifier" | "incertain";

interface ImportSelectableItem {
  id: string;
  fieldKey: string;
  label: string;
  icon: string;
  newValue: string;
  oldValue?: string;
  confidence: ImportConfidence;
  sourceUrl?: string;
  massEntries?: Array<{ day: string; time: string; type: string }>;
  linkUrl?: string;
  linkLabel?: string;
}

interface ImportValueField { value: string; confidence: ImportConfidence; sourceUrl?: string }
interface ImportMassField  {
  entries: Array<{ day: string; time: string; type: string }>;
  confidence: ImportConfidence;
  sourceUrl?: string;
}
interface ImportLinkField  { label: string; url: string; confidence: ImportConfidence; sourceUrl?: string }

interface ImportRawResult {
  parishName?:          ImportValueField  | null;
  description?:         ImportValueField  | null;
  phones?:              ImportValueField[] | null;
  emails?:              ImportValueField[] | null;
  address?:             ImportValueField  | null;
  website?:             ImportValueField  | null;
  churchNames?:         ImportValueField[] | null;
  priestName?:          ImportValueField  | null;
  massSchedule?:        ImportMassField   | null;
  massSchedulesText?:   ImportValueField  | null;
  confessionSchedules?: ImportValueField  | null;
  adorationSchedules?:  ImportValueField  | null;
  permanenceSchedules?: ImportValueField  | null;
  usefulLinks?:         ImportLinkField[] | null;
  _sourceUrl:  string;
  _fetchedAt:  string;
  _pagesCount?: number;
  _pageUrls?:   string[];
}

interface MassEntry {
  _key: string;
  day: string;
  time: string;
  type: string;
}

interface ParishMember {
  uid: string;
  displayName: string;
  email: string;
  role: string;
}

const ENRICH_FIELD_META: Array<{ key: keyof EnrichedData; label: string; icon: string; multiline?: boolean }> = [
  { key: "name",                label: "Nom de la paroisse",  icon: "home" },
  { key: "address",             label: "Adresse",             icon: "map-pin" },
  { key: "phone",               label: "Téléphone",           icon: "phone" },
  { key: "email",               label: "E-mail",              icon: "mail" },
  { key: "website",             label: "Site web",            icon: "globe" },
  { key: "priestName",          label: "Curé / prêtre",       icon: "user" },
  { key: "confessionSchedules", label: "Confessions",         icon: "clock",    multiline: true },
  { key: "adorationSchedules",  label: "Adoration",           icon: "sun",      multiline: true },
  { key: "permanenceSchedules", label: "Permanences",         icon: "calendar", multiline: true },
  { key: "massSchedulesText",   label: "Horaires de messes",  icon: "clock",    multiline: true },
];

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Administrateur",
  admin:   "Administrateur",
  priest:  "Prêtre",
  moderator: "Modérateur",
  member:  "Membre",
  depute:  "MV",
  député:  "MV",
  mv:      "MV",
};
const ROLE_COLORS: Record<string, string> = {
  admin: "#7C3AED",
  priest: GOLD,
  moderator: "#0891B2",
  member: "#6B7280",
};
const ROLE_OPTIONS = ["member", "moderator", "priest", "admin"] as const;

const MASS_DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ icon, title, action }: { icon: string; title: string; action?: React.ReactNode }) {
  return (
    <View style={s.sectionHead}>
      <View style={s.sectionTitleRow}>
        <View style={s.sectionIcon}><Feather name={icon as never} size={15} color={GOLD} /></View>
        <Text style={s.sectionTitle}>{title}</Text>
      </View>
      {action ? <View style={s.sectionActionWrap}>{action}</View> : null}
    </View>
  );
}

function StatBox({ label, value, icon, color }: { label: string; value: string | number; icon: string; color: string }) {
  return (
    <View style={[s.statBox, { borderTopColor: color }]}>
      <Feather name={icon as never} size={18} color={color} />
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

// ─── Add Mass Modal ───────────────────────────────────────────────────────────
function AddMassModal({
  visible,
  onClose,
  onAdd,
  existing,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (entry: Omit<MassEntry, "_key">) => void;
  existing: Omit<MassEntry, "_key"> | null;
}) {
  const [day, setDay]   = useState("Dimanche");
  const [time, setTime] = useState("10:30");
  const [type, setType] = useState("Messe dominicale");

  useEffect(() => {
    if (existing) { setDay(existing.day); setTime(existing.time); setType(existing.type); }
    else { setDay("Dimanche"); setTime("10:30"); setType("Messe dominicale"); }
  }, [visible, existing]);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView style={mm.overlay} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={mm.sheet}>
          <View style={mm.header}>
            <Text style={mm.title}>{existing ? "Modifier" : "Ajouter un horaire"}</Text>
            <TouchableOpacity onPress={onClose}><Feather name="x" size={20} color={DARK} /></TouchableOpacity>
          </View>

          <Text style={mm.label}>Jour</Text>
          <CompactFilterRow style={{ marginBottom: 14 }}>
            {MASS_DAYS.map((d) => (
              <CompactFilterChip
                key={d}
                label={d}
                onPress={() => setDay(d)}
                style={[mm.chip, { backgroundColor: day === d ? GOLD : CREAM }]}
                textStyle={[mm.chipText, { color: DARK }]}
              />
            ))}
          </CompactFilterRow>

          <Text style={mm.label}>Heure</Text>
          <TextInput style={mm.input} value={time} onChangeText={setTime} placeholder="10:30" placeholderTextColor="#9AA3B0" keyboardType="numeric" maxLength={5} />

          <Text style={mm.label}>Type de messe</Text>
          <TextInput style={mm.input} value={type} onChangeText={setType} placeholder="Messe dominicale…" placeholderTextColor="#9AA3B0" />

          <TouchableOpacity
            style={mm.saveBtn}
            onPress={() => { if (time.trim() && type.trim()) { onAdd({ day, time, type }); onClose(); } }}
            activeOpacity={0.85}
          >
            <Text style={mm.saveBtnText}>{existing ? "Enregistrer" : "Ajouter"}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const mm = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  title: { fontSize: 17, fontFamily: "Inter_700Bold", color: DARK },
  label: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#7A7A8A", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginRight: 8 },
  chipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  input: { borderWidth: 1.5, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, fontFamily: "Inter_400Regular", color: DARK, marginBottom: 14 },
  saveBtn: { backgroundColor: GOLD, borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  saveBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: DARK },
});

// ─── Enrich Preview Modal ─────────────────────────────────────────────────────
function EnrichPreviewModal({
  visible,
  data,
  onApply,
  onClose,
}: {
  visible: boolean;
  data: EnrichedData;
  onApply: (
    selected: Partial<EnrichedData>,
    massSchedule?: Array<{ day: string; time: string; type: string }>
  ) => void;
  onClose: () => void;
}) {
  const availableFields = ENRICH_FIELD_META.filter((f) => data[f.key]);
  const hasMassSchedule = (data.massSchedule?.length ?? 0) > 0;

  const allKeys = [
    ...availableFields.map((f) => f.key as string),
    ...(hasMassSchedule ? ["massSchedule"] : []),
  ];
  const [selected, setSelected] = React.useState<Set<string>>(new Set(allKeys));

  React.useEffect(() => {
    if (visible) setSelected(new Set(allKeys));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const handleApply = () => {
    const out: Partial<EnrichedData> = {};
    for (const f of ENRICH_FIELD_META) {
      if (selected.has(f.key as string) && data[f.key] != null) {
        (out as Record<string, unknown>)[f.key] = data[f.key];
      }
    }
    const ms =
      selected.has("massSchedule") && hasMassSchedule
        ? data.massSchedule ?? undefined
        : undefined;
    onApply(out, ms);
  };

  const isEmpty = availableFields.length === 0 && !hasMassSchedule;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={em.overlay}>
        <View style={em.sheet}>
          {/* En-tête */}
          <View style={em.header}>
            <View style={{ flex: 1 }}>
              <Text style={em.title}>Informations trouvées sur Internet</Text>
              <Text style={em.subtitle}>
                Sélectionnez les champs à importer dans la fiche
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Feather name="x" size={20} color={DARK} />
            </TouchableOpacity>
          </View>

          <ScrollView style={em.body} showsVerticalScrollIndicator={false}>
            {isEmpty ? (
              <View style={em.emptyWrap}>
                <Feather name="frown" size={36} color="#C4C4C4" />
                <Text style={em.emptyTitle}>Aucune information trouvée</Text>
                <Text style={em.emptyDesc}>
                  Le site web de la paroisse n'a pas pu être analysé.
                  Vérifiez que le nom et la ville sont corrects.
                </Text>
              </View>
            ) : (
              <>
                {availableFields.map((f) => {
                  const isOn = selected.has(f.key as string);
                  return (
                    <TouchableOpacity
                      key={f.key}
                      style={[em.row, isOn && em.rowOn]}
                      onPress={() => toggle(f.key as string)}
                      activeOpacity={0.8}
                    >
                      <View style={em.check}>
                        <Feather
                          name={isOn ? "check-square" : "square"}
                          size={20}
                          color={isOn ? GOLD : "#C4C4C4"}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={em.fieldHead}>
                          <Feather name={f.icon as never} size={12} color={GOLD} />
                          <Text style={em.fieldLabel}>{f.label}</Text>
                        </View>
                        <Text
                          style={em.fieldValue}
                          numberOfLines={f.multiline ? 5 : 2}
                        >
                          {String(data[f.key] ?? "")}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}

                {hasMassSchedule && (
                  <TouchableOpacity
                    style={[em.row, selected.has("massSchedule") && em.rowOn]}
                    onPress={() => toggle("massSchedule")}
                    activeOpacity={0.8}
                  >
                    <View style={em.check}>
                      <Feather
                        name={selected.has("massSchedule") ? "check-square" : "square"}
                        size={20}
                        color={selected.has("massSchedule") ? GOLD : "#C4C4C4"}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={em.fieldHead}>
                        <Feather name="clock" size={12} color={GOLD} />
                        <Text style={em.fieldLabel}>Horaires de messes (structurés)</Text>
                      </View>
                      {data.massSchedule!.map((m, i) => (
                        <Text key={i} style={em.fieldValue}>
                          {m.day} {m.time} — {m.type}
                        </Text>
                      ))}
                    </View>
                  </TouchableOpacity>
                )}
              </>
            )}
          </ScrollView>

          {!isEmpty && (
            <TouchableOpacity
              style={em.applyBtn}
              onPress={handleApply}
              activeOpacity={0.85}
            >
              <Feather name="check" size={16} color={DARK} />
              <Text style={em.applyText}>
                Appliquer la sélection ({selected.size})
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const em = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "88%",
    paddingBottom: 28,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    gap: 12,
  },
  title:    { fontSize: 16, fontFamily: "Inter_700Bold",    color: DARK },
  subtitle: { fontSize: 12, fontFamily: "Inter_400Regular", color: MUTED, marginTop: 2 },
  body:     { padding: 16, maxHeight: 440 },
  emptyWrap: { alignItems: "center", paddingVertical: 36, gap: 10 },
  emptyTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: DARK, textAlign: "center" },
  emptyDesc:  { fontSize: 13, fontFamily: "Inter_400Regular",  color: MUTED, textAlign: "center", lineHeight: 19 },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: "#F8F5EE",
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  rowOn:      { borderColor: GOLD, backgroundColor: GOLD + "0D" },
  check:      { paddingTop: 1 },
  fieldHead:  { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 3 },
  fieldLabel: {
    fontSize: 10, fontFamily: "Inter_600SemiBold",
    color: MUTED, textTransform: "uppercase", letterSpacing: 0.7,
  },
  fieldValue: { fontSize: 13, fontFamily: "Inter_400Regular", color: DARK, lineHeight: 18 },
  applyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: GOLD,
    borderRadius: 16,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginTop: 8,
  },
  applyText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: DARK },
});

// ─── Import Web Modal ─────────────────────────────────────────────────────────

function buildImportItems(result: ImportRawResult, parish: ParishData | null): ImportSelectableItem[] {
  const out: ImportSelectableItem[] = [];

  const push = (item: ImportSelectableItem) => out.push(item);

  if (result.parishName)
    push({ id: "parishName", fieldKey: "parishName", label: "Nom de la paroisse", icon: "home",
      newValue: result.parishName.value, oldValue: parish?.name || undefined,
      confidence: result.parishName.confidence, sourceUrl: result.parishName.sourceUrl });

  if (result.description)
    push({ id: "description", fieldKey: "description", label: "Description", icon: "align-left",
      newValue: result.description.value, oldValue: parish?.description || undefined,
      confidence: result.description.confidence, sourceUrl: result.description.sourceUrl });

  (result.phones ?? []).forEach((p, i) =>
    push({ id: `phone_${i}`, fieldKey: "phone",
      label: i === 0 ? "Téléphone" : `Téléphone (${i + 1})`, icon: "phone",
      newValue: p.value, oldValue: i === 0 ? (parish?.phone || undefined) : undefined,
      confidence: p.confidence, sourceUrl: p.sourceUrl }));

  (result.emails ?? []).forEach((e, i) =>
    push({ id: `email_${i}`, fieldKey: "email",
      label: i === 0 ? "E-mail" : `E-mail (${i + 1})`, icon: "mail",
      newValue: e.value, oldValue: i === 0 ? (parish?.email || undefined) : undefined,
      confidence: e.confidence, sourceUrl: e.sourceUrl }));

  if (result.address)
    push({ id: "address", fieldKey: "address", label: "Adresse postale", icon: "map-pin",
      newValue: result.address.value, oldValue: parish?.address || undefined,
      confidence: result.address.confidence, sourceUrl: result.address.sourceUrl });

  if (result.website)
    push({ id: "website", fieldKey: "website", label: "Site officiel", icon: "globe",
      newValue: result.website.value, oldValue: parish?.website || undefined,
      confidence: result.website.confidence, sourceUrl: result.website.sourceUrl });

  (result.churchNames ?? []).forEach((c, i) =>
    push({ id: `church_${i}`, fieldKey: "churchName",
      label: i === 0 ? "Lieu de célébration" : `Lieu de célébration (${i + 1})`, icon: "map-pin",
      newValue: c.value, oldValue: i === 0 ? (parish?.churchName || undefined) : undefined,
      confidence: c.confidence, sourceUrl: c.sourceUrl }));

  if (result.priestName)
    push({ id: "priestName", fieldKey: "priestName", label: "Curé / prêtre", icon: "user",
      newValue: result.priestName.value, oldValue: parish?.priestName || undefined,
      confidence: result.priestName.confidence, sourceUrl: result.priestName.sourceUrl });

  const ms = result.massSchedule;
  if (ms && (ms.entries?.length ?? 0) > 0) {
    const preview = ms.entries.slice(0, 4).map(e => `${e.day} ${e.time} — ${e.type}`).join("\n") +
      (ms.entries.length > 4 ? `\n+ ${ms.entries.length - 4} autres créneaux` : "");
    const oldMs = (parish?.massSchedule ?? []).slice(0, 3).map(e => `${e.day} ${e.time}`).join(", ");
    push({ id: "massSchedule", fieldKey: "massSchedule",
      label: "Horaires de messes (structurés)", icon: "clock",
      newValue: preview, oldValue: oldMs || undefined,
      confidence: ms.confidence, massEntries: ms.entries, sourceUrl: ms.sourceUrl });
  }

  if (result.massSchedulesText)
    push({ id: "massSchedulesText", fieldKey: "massSchedulesText",
      label: "Description des horaires de messes", icon: "align-left",
      newValue: result.massSchedulesText.value,
      oldValue: parish?.massSchedulesText || undefined,
      confidence: result.massSchedulesText.confidence, sourceUrl: result.massSchedulesText.sourceUrl });

  if (result.confessionSchedules)
    push({ id: "confessionSchedules", fieldKey: "confessionSchedules",
      label: "Confessions", icon: "clock",
      newValue: result.confessionSchedules.value,
      oldValue: parish?.confessionSchedules || undefined,
      confidence: result.confessionSchedules.confidence, sourceUrl: result.confessionSchedules.sourceUrl });

  if (result.adorationSchedules)
    push({ id: "adorationSchedules", fieldKey: "adorationSchedules",
      label: "Adoration", icon: "sun",
      newValue: result.adorationSchedules.value,
      oldValue: parish?.adorationSchedules || undefined,
      confidence: result.adorationSchedules.confidence, sourceUrl: result.adorationSchedules.sourceUrl });

  if (result.permanenceSchedules)
    push({ id: "permanenceSchedules", fieldKey: "permanenceSchedules",
      label: "Permanences", icon: "calendar",
      newValue: result.permanenceSchedules.value,
      oldValue: parish?.permanenceSchedules || undefined,
      confidence: result.permanenceSchedules.confidence, sourceUrl: result.permanenceSchedules.sourceUrl });

  (result.usefulLinks ?? []).forEach((l, i) =>
    push({ id: `link_${i}`, fieldKey: "usefulLinks",
      label: l.label || `Lien officiel (${i + 1})`, icon: "link",
      newValue: l.url, confidence: l.confidence,
      linkUrl: l.url, linkLabel: l.label, sourceUrl: l.sourceUrl }));

  return out;
}

function ImportWebModal({
  visible, result, parish, onApply, onClose, onRefresh, refreshing,
}: {
  visible: boolean;
  result: ImportRawResult | null;
  parish: ParishData | null;
  onApply: (selected: ImportSelectableItem[]) => void;
  onClose: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const items = React.useMemo(
    () => (result ? buildImportItems(result, parish) : []),
    [result, parish],
  );
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    if (visible && items.length > 0)
      setSelected(new Set(items.filter(i => i.confidence === "fiable").map(i => i.id)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, result]);

  if (!result) return null;

  const allSelected = items.length > 0 && selected.size === items.length;
  const toggle = (id: string) =>
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const fetchDate = (() => {
    try {
      return new Date(result._fetchedAt).toLocaleString("fr-FR", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
    } catch { return result._fetchedAt; }
  })();

  const pagesCount = result._pagesCount ?? 1;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={iw.overlay}>
        <View style={iw.sheet}>
          {/* En-tête */}
          <View style={iw.header}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={iw.title}>Importer depuis le site officiel</Text>
              <View style={iw.metaRow}>
                <Feather name="globe" size={11} color={MUTED} />
                <Text style={iw.metaText} numberOfLines={1}>{result._sourceUrl}</Text>
              </View>
              <View style={iw.metaRow}>
                <Feather name="layers" size={11} color={MUTED} />
                <Text style={iw.metaText}>
                  {pagesCount} page{pagesCount > 1 ? "s" : ""} analysée{pagesCount > 1 ? "s" : ""} · {fetchDate}
                </Text>
              </View>
            </View>
            <View style={{ alignItems: "flex-end", gap: 8 }}>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Feather name="x" size={20} color={DARK} />
              </TouchableOpacity>
              {onRefresh && (
                <TouchableOpacity
                  onPress={onRefresh}
                  disabled={refreshing}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  style={[iw.refreshChip, refreshing && { opacity: 0.45 }]}
                >
                  {refreshing
                    ? <ActivityIndicator size="small" color={GOLD} />
                    : <><Feather name="refresh-cw" size={12} color={GOLD} /><Text style={iw.refreshChipText}>Actualiser</Text></>}
                </TouchableOpacity>
              )}
            </View>
          </View>

          {items.length === 0 ? (
            /* État vide */
            <View style={iw.emptyWrap}>
              <Feather name="search" size={36} color="#C4C4C4" />
              <Text style={iw.emptyTitle}>Aucune information trouvée</Text>
              <Text style={iw.emptyDesc}>
                Le site analysé ({pagesCount} page{pagesCount > 1 ? "s" : ""}) n'a pas permis d'extraire d'informations utilisables.{"\n"}
                Vérifiez l'URL ou saisissez les informations manuellement.
              </Text>
              {onRefresh && (
                <TouchableOpacity
                  style={[iw.cancelBtnSolo, { flexDirection: "row", gap: 6, alignItems: "center" }]}
                  onPress={onRefresh}
                  disabled={refreshing}
                  activeOpacity={0.85}
                >
                  {refreshing
                    ? <ActivityIndicator size="small" color={GOLD} />
                    : <Feather name="refresh-cw" size={14} color={GOLD} />}
                  <Text style={[iw.cancelText, { color: GOLD }]}>Relancer l'analyse</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={iw.cancelBtnSolo} onPress={onClose} activeOpacity={0.85}>
                <Text style={iw.cancelText}>Fermer</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* Barre tout sélectionner */}
              <View style={iw.selectAllRow}>
                <TouchableOpacity
                  style={iw.selectAllBtn}
                  onPress={() => setSelected(allSelected ? new Set() : new Set(items.map(i => i.id)))}
                  activeOpacity={0.8}
                >
                  <Feather name={allSelected ? "check-square" : "square"} size={16} color={GOLD} />
                  <Text style={iw.selectAllText}>
                    {allSelected ? "Tout désélectionner" : "Tout sélectionner"}
                  </Text>
                </TouchableOpacity>
                <Text style={iw.countText}>
                  {selected.size} / {items.length} sélectionné{selected.size > 1 ? "s" : ""}
                </Text>
              </View>

              {/* Liste */}
              <ScrollView style={iw.body} showsVerticalScrollIndicator={false}>
                {items.map((item) => {
                  const isOn      = selected.has(item.id);
                  const confColor = item.confidence === "fiable" ? "#16A34A"
                                  : item.confidence === "à vérifier" ? "#D97706" : "#DC2626";
                  const confBg    = item.confidence === "fiable" ? "#F0FDF4"
                                  : item.confidence === "à vérifier" ? "#FFFBEB" : "#FEF2F2";
                  // Afficher l'URL source de façon lisible (sans protocole)
                  const srcLabel  = item.sourceUrl
                    ? item.sourceUrl.replace(/^https?:\/\//, "").replace(/\/$/, "").slice(0, 60)
                    : null;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[iw.row, isOn && iw.rowOn]}
                      onPress={() => toggle(item.id)}
                      activeOpacity={0.8}
                    >
                      <View style={iw.check}>
                        <Feather name={isOn ? "check-square" : "square"} size={20} color={isOn ? GOLD : "#C4C4C4"} />
                      </View>
                      <View style={{ flex: 1, gap: 3 }}>
                        <View style={iw.fieldHead}>
                          <Feather name={item.icon as never} size={12} color={GOLD} />
                          <Text style={iw.fieldLabel}>{item.label}</Text>
                          <View style={[iw.confBadge, { backgroundColor: confBg }]}>
                            <Text style={[iw.confText, { color: confColor }]}>{item.confidence}</Text>
                          </View>
                        </View>
                        {item.oldValue ? (
                          <View style={iw.valueRow}>
                            <Text style={iw.oldLabel}>Actuel :</Text>
                            <Text style={iw.oldValue} numberOfLines={2}>{item.oldValue}</Text>
                          </View>
                        ) : null}
                        <View style={iw.valueRow}>
                          <Text style={iw.newLabel}>Trouvé :</Text>
                          <Text style={iw.newValue} numberOfLines={6}>{item.newValue}</Text>
                        </View>
                        {srcLabel ? (
                          <View style={iw.sourceRow}>
                            <Feather name="link-2" size={9} color="#B0BAC4" />
                            <Text style={iw.sourceText} numberOfLines={1}>{srcLabel}</Text>
                          </View>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
                <View style={{ height: 8 }} />
              </ScrollView>

              {/* Boutons bas */}
              <View style={iw.footer}>
                <TouchableOpacity style={iw.cancelBtn} onPress={onClose} activeOpacity={0.85}>
                  <Text style={iw.cancelText}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[iw.applyBtn, selected.size === 0 && { opacity: 0.38 }]}
                  onPress={() => onApply(items.filter(i => selected.has(i.id)))}
                  disabled={selected.size === 0}
                  activeOpacity={0.85}
                >
                  <Feather name="download" size={15} color={DARK} />
                  <Text style={iw.applyText}>
                    Importer les éléments sélectionnés ({selected.size})
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const iw = StyleSheet.create({
  overlay:      { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" },
  sheet:        { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "92%", paddingBottom: 20 },
  header:       { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 20, borderBottomWidth: 1, borderBottomColor: BORDER },
  title:        { fontSize: 16, fontFamily: "Inter_700Bold", color: DARK },
  metaRow:      { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText:     { fontSize: 11, fontFamily: "Inter_400Regular", color: MUTED, flex: 1 },

  emptyWrap:    { alignItems: "center", paddingVertical: 44, paddingHorizontal: 24, gap: 10 },
  emptyTitle:   { fontSize: 15, fontFamily: "Inter_600SemiBold", color: DARK, textAlign: "center" },
  emptyDesc:    { fontSize: 13, fontFamily: "Inter_400Regular", color: MUTED, textAlign: "center", lineHeight: 19 },
  cancelBtnSolo:{ backgroundColor: CREAM, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28, marginTop: 8, borderWidth: 1, borderColor: BORDER },

  selectAllRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#F0EDE8" },
  selectAllBtn: { flexDirection: "row", alignItems: "center", gap: 7 },
  selectAllText:{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: GOLD },
  countText:    { fontSize: 12, fontFamily: "Inter_400Regular", color: MUTED },

  body: { paddingHorizontal: 12, paddingTop: 8, maxHeight: 380 },

  row:       { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: 12, marginBottom: 8, backgroundColor: "#F8F5EE", borderWidth: 1.5, borderColor: "transparent" },
  rowOn:     { borderColor: GOLD, backgroundColor: GOLD + "0D" },
  check:     { paddingTop: 1 },
  fieldHead: { flexDirection: "row", alignItems: "center", gap: 5, flexWrap: "wrap" },
  fieldLabel:{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: MUTED, textTransform: "uppercase", letterSpacing: 0.7 },
  confBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  confText:  { fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 0.4 },

  valueRow:   { flexDirection: "row", alignItems: "flex-start", gap: 4 },
  oldLabel:   { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#9AA3B0", width: 52 },
  oldValue:   { fontSize: 11, fontFamily: "Inter_400Regular",  color: "#9AA3B0", flex: 1, textDecorationLine: "line-through" },
  newLabel:   { fontSize: 12, fontFamily: "Inter_600SemiBold", color: DARK, width: 52 },
  newValue:   { fontSize: 13, fontFamily: "Inter_400Regular",  color: DARK, flex: 1, lineHeight: 18 },
  sourceRow:  { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 1 },
  sourceText: { fontSize: 10, fontFamily: "Inter_400Regular", color: "#B0BAC4", flex: 1 },

  refreshChip:     { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: GOLD + "14", paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: GOLD + "40" },
  refreshChipText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: GOLD },

  footer:       { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#F0EDE8" },
  cancelBtn:    { flex: 1, backgroundColor: CREAM, borderRadius: 14, paddingVertical: 13, alignItems: "center", borderWidth: 1, borderColor: BORDER },
  cancelText:   { fontSize: 14, fontFamily: "Inter_600SemiBold", color: DARK },
  applyBtn:     { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: GOLD, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 8 },
  applyText:    { fontSize: 12, fontFamily: "Inter_600SemiBold", color: DARK, flexShrink: 1, textAlign: "center" },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ParishAdminScreen() {
  const insets = useSafeAreaInsets();
  const { profile, user } = useAuth();
  // Super admin can manage any parish via ?parishId= URL param
  const params = useLocalSearchParams<{ parishId?: string }>();
  const parishId = params.parishId ?? profile?.parishId ?? profile?.priestParishId ?? null;

  // Droits : on passe parishId pour que le hook observe le bon document
  // (important quand le super_admin gère une paroisse autre que la sienne)
  const {
    canManageAdmins,
    canManage,
    isSuperAdmin,
    isPriest,
    isParishAdmin,
    canViewClaims,
    canReviewClaims,
    parishAdmins,
    parishAdminProfiles,
  } = useParishPermissions(parishId);
  const isGlobalAdmin = isSuperAdmin;

  // Paroisse propre du compte connecté (distinct de la paroisse consultée)
  const ownParishId  = profile?.parishId ?? profile?.priestParishId ?? null;
  const isPriestRole = isPriest || profile?.role === "priest";
  const canChangeMemberRoles = isGlobalAdmin || isPriestRole;

  // ── State ──
  const [parish, setParish]       = useState<ParishData | null>(null);
  const [members, setMembers]     = useState<ParishMember[]>([]);
  const [stats, setStats]         = useState({ announcements: 0, events: 0, views: 0 });
  const [loading, setLoading]     = useState(true);

  // Parish info edit
  const [editing, setEditing]     = useState(false);
  const [eName, setEName]         = useState("");
  const [eDesc, setEDesc]         = useState("");
  const [eAddress, setEAddress]   = useState("");
  const [ePhone, setEPhone]       = useState("");
  const [eWebsite, setEWebsite]   = useState("");
  const [savingInfo, setSavingInfo] = useState(false);
  // Extended parish info (éditable)
  const [ePriestName, setEPriestName] = useState("");
  const [eEmail, setEEmail]           = useState("");
  const [eConfession, setEConfession] = useState("");
  const [eAdoration, setEAdoration]   = useState("");
  const [ePermanence, setEPermanence] = useState("");

  // Enrichissement automatique
  const [enriching, setEnriching]           = useState(false);
  const [enrichData, setEnrichData]         = useState<EnrichedData | null>(null);
  const [showEnrichModal, setShowEnrichModal] = useState(false);

  // Import depuis le site officiel
  const [importingWeb,    setImportingWeb]    = useState(false);
  const [importWebData,   setImportWebData]   = useState<ImportRawResult | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);

  // Mass schedule
  const [schedule, setSchedule]   = useState<MassEntry[]>([]);
  const [showMassModal, setShowMassModal] = useState(false);
  const [editMassIdx, setEditMassIdx] = useState<number | null>(null);
  const [savingSched, setSavingSched] = useState(false);
  const [removeMassIdx, setRemoveMassIdx]             = useState<number | null>(null);
  const [removeAdminConfirm, setRemoveAdminConfirm]   = useState<AdminProfile | null>(null);
  const [changeRoleTarget, setChangeRoleTarget]       = useState<ParishMember | null>(null);

  // Photos
  const [uploadingLogo, setUploadingLogo]   = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  // Invite
  const [inviteEmail, setInviteEmail] = useState("");

  // Parish admins
  const [adminEmail,     setAdminEmail]     = useState("");
  const [addingAdmin,    setAddingAdmin]    = useState(false);
  const [adminEmailErr,  setAdminEmailErr]  = useState("");

  // ── Load data ──
  const loadData = useCallback(async () => {
    if (!parishId) { setLoading(false); return; }
    try {
      // Parish doc
      const snap = await getDoc(doc(db, "parishes", parishId));
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() } as ParishData;
        setParish(data);
        setEName(data.name ?? "");
        setEDesc(data.description ?? "");
        setEAddress(data.address ?? "");
        setEPhone(data.phone ?? "");
        setEWebsite(data.website ?? "");
        setEPriestName(data.priestName ?? "");
        setEEmail(data.email ?? "");
        setEConfession(data.confessionSchedules ?? "");
        setEAdoration(data.adorationSchedules ?? "");
        setEPermanence(data.permanenceSchedules ?? "");
        const rawSched = (data.massSchedule ?? []) as Omit<MassEntry, "_key">[];
        setSchedule(rawSched.map((m, i) => ({ ...m, _key: String(i) })));
      }

      // Members
      const membersSnap = await getDocs(query(collection(db, "users"), where("parishId", "==", parishId)));
      setMembers(membersSnap.docs.map((d) => ({ uid: d.id, ...d.data() } as ParishMember)));

      // Stats
      const [annoSnap, evSnap, annoDocsSnap] = await Promise.all([
        getCountFromServer(collection(db, "announcements")),
        getCountFromServer(collection(db, "events")),
        getDocs(collection(db, "announcements")),
      ]);
      const totalViews = annoDocsSnap.docs.reduce((acc, d) => acc + ((d.data().viewCount as number) ?? 0), 0);
      setStats({ announcements: annoSnap.data().count, events: evSnap.data().count, views: totalViews });
    } finally {
      setLoading(false);
    }
  }, [parishId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Save parish info ──
  const saveInfo = async () => {
    if (!parishId) return;
    setSavingInfo(true);
    try {
      // Recense les champs qui ont effectivement une valeur saisie manuellement
      const editedFields: string[] = [
        eName.trim()       && "name",
        eDesc.trim()       && "description",
        eAddress.trim()    && "address",
        ePhone.trim()      && "phone",
        eWebsite.trim()    && "website",
        ePriestName.trim() && "priestName",
        eEmail.trim()      && "email",
        eConfession.trim() && "confessionSchedules",
        eAdoration.trim()  && "adorationSchedules",
        ePermanence.trim() && "permanenceSchedules",
      ].filter(Boolean) as string[];

      await updateDoc(doc(db, "parishes", parishId), {
        name:                eName.trim(),
        description:         eDesc.trim(),
        address:             eAddress.trim()     || null,
        phone:               ePhone.trim()       || null,
        website:             eWebsite.trim()     || null,
        priestName:          ePriestName.trim()  || null,
        email:               eEmail.trim()       || null,
        confessionSchedules: eConfession.trim()  || null,
        adorationSchedules:  eAdoration.trim()   || null,
        permanenceSchedules: ePermanence.trim()  || null,
        // Marque ces champs comme édités manuellement
        ...(editedFields.length ? { _manuallyEditedFields: arrayUnion(...editedFields) } : {}),
      });
      setParish((p) => p ? {
        ...p,
        name: eName, description: eDesc, address: eAddress, phone: ePhone,
        website: eWebsite, priestName: ePriestName, email: eEmail,
        confessionSchedules: eConfession, adorationSchedules: eAdoration,
        permanenceSchedules: ePermanence,
      } : p);
      // Notifier les membres de la paroisse de la mise à jour
      void sendPushToParish(
        parishId,
        `📍 ${eName.trim() || "Votre paroisse"}`,
        "Les informations de la paroisse ont été mises à jour.",
        { screen: "/(tabs)/parishes" },
        "announcements",
        user?.uid
      );
      setEditing(false);
    } catch { Alert.alert("Erreur", "Impossible de sauvegarder."); }
    finally { setSavingInfo(false); }
  };

  // ── Mass schedule ──
  const saveSchedule = async (newSched: MassEntry[]) => {
    if (!parishId) return;
    setSavingSched(true);
    try {
      // Les anciennes données restent dans massSchedule. Les imports et les
      // prochaines modifications utilisent le format enrichi séparément.
      const payload = newSched.map(({ day, time, type }) => ({
        mode: "recurring",
        day,
        startTime: time,
        location: parish?.churchName ?? parish?.name ?? "Lieu à préciser",
        address: parish?.address ?? "",
        celebrationType: type,
        note: null,
      }));
      await updateDoc(doc(db, "parishes", parishId), {
        massSchedules: payload,
        _manuallyEditedFields: arrayUnion("massSchedules"),
      });
      setSchedule(newSched);
    } catch { Alert.alert("Erreur", "Impossible de sauvegarder les horaires."); }
    finally { setSavingSched(false); }
  };

  // ── Enrichissement automatique ──────────────────────────────────────────────
  const runEnrich = async () => {
    if (!parish) return;
    setEnriching(true);
    try {
      const resp = await fetch(`${API_BASE}/api/parishes/enrich`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parishName: parish.name,
          city: parish.city,
          postalCode: parish.postalCode,
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as EnrichedData;
      setEnrichData(data);
      setShowEnrichModal(true);
    } catch {
      Alert.alert("Erreur", "Impossible de récupérer les informations. Vérifiez votre connexion.");
    } finally {
      setEnriching(false);
    }
  };

  const applyEnrich = async (
    selected: Partial<EnrichedData>,
    importedMassSchedule?: Array<{ day: string; time: string; type: string }>
  ) => {
    if (!parishId) return;
    setShowEnrichModal(false);

    // Identifie les champs sélectionnés qui ont été modifiés manuellement
    const manuallyEdited = parish?._manuallyEditedFields ?? [];
    const selectedKeys = (Object.keys(selected) as (keyof EnrichedData)[])
      .filter((k) => selected[k] != null);
    const importsMassSchedule = !!(importedMassSchedule?.length);
    if (importsMassSchedule) selectedKeys.push("massSchedule" as never);

    const conflicting = selectedKeys.filter((k) => manuallyEdited.includes(k as string));

    // ── Effectue réellement l'écriture ──────────────────────────────────────
    const doWrite = async () => {
      try {
        const update: Record<string, unknown> = { _enrichedAt: new Date().toISOString() };

        if (selected.name)                { update.name                = selected.name;                setEName(selected.name); }
        if (selected.address)             { update.address              = selected.address;             setEAddress(selected.address); }
        if (selected.phone)               { update.phone                = selected.phone;               setEPhone(selected.phone); }
        if (selected.email)               { update.email                = selected.email;               setEEmail(selected.email); }
        if (selected.website)             { update.website              = selected.website;             setEWebsite(selected.website); }
        if (selected.priestName)          { update.priestName           = selected.priestName;          setEPriestName(selected.priestName); }
        if (selected.confessionSchedules) { update.confessionSchedules = selected.confessionSchedules; setEConfession(selected.confessionSchedules); }
        if (selected.adorationSchedules)  { update.adorationSchedules  = selected.adorationSchedules;  setEAdoration(selected.adorationSchedules); }
        if (selected.permanenceSchedules) { update.permanenceSchedules = selected.permanenceSchedules; setEPermanence(selected.permanenceSchedules); }
        if (selected.massSchedulesText)   { update.massSchedulesText   = selected.massSchedulesText; }

        // Les champs importés depuis Internet ne sont plus "manuels"
        const remainingManual = manuallyEdited.filter(
          (f) => !(selectedKeys as string[]).includes(f)
        );
        update._manuallyEditedFields = remainingManual;

        await updateDoc(doc(db, "parishes", parishId), update);
        setParish((p) => p ? { ...p, ...(update as Partial<ParishData>) } : p);

        if (importedMassSchedule?.length) {
          const newSched: MassEntry[] = importedMassSchedule.map((m, i) => ({
            ...m, _key: String(Date.now() + i),
          }));
          await saveSchedule(newSched);
        }

        Alert.alert("✓ Mise à jour réussie", "Les informations sélectionnées ont été importées dans la fiche.");
      } catch {
        Alert.alert("Erreur", "Impossible d'appliquer les modifications.");
      }
    };

    // ── Si des champs ont été édités manuellement : demander confirmation ───
    if (conflicting.length > 0) {
      const fieldLabels = conflicting.map(
        (k) => ENRICH_FIELD_META.find((f) => f.key === k)?.label ?? k
      );
      Alert.alert(
        "⚠️ Modifications manuelles détectées",
        `Ces champs ont été saisis ou modifiés manuellement :\n\n• ${fieldLabels.join("\n• ")}\n\nVoulez-vous les remplacer par les données trouvées sur Internet ?`,
        [
          { text: "Annuler", style: "cancel" },
          { text: "Remplacer quand même", style: "destructive", onPress: doWrite },
        ]
      );
    } else {
      await doWrite();
    }
  };

  // ── Import depuis le site officiel ─────────────────────────────────────────
  const runImportWeb = async () => {
    if (!parish?.website) {
      Alert.alert(
        "Site web manquant",
        "Veuillez d'abord renseigner l'URL du site officiel dans les informations de la paroisse.",
      );
      return;
    }
    setImportingWeb(true);
    try {
      const resp = await fetch(`${API_BASE}/api/parishes/import-web`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ websiteUrl: parish.website, parishName: parish.name }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${resp.status}`);
      }
      const data = (await resp.json()) as ImportRawResult;
      setImportWebData(data);
      setShowImportModal(true);
    } catch (err) {
      Alert.alert(
        "Erreur d'import",
        err instanceof Error ? err.message : "Impossible d'analyser le site officiel.",
      );
    } finally {
      setImportingWeb(false);
    }
  };

  const applyImportWeb = async (selectedItems: ImportSelectableItem[]) => {
    if (!parishId) return;
    setShowImportModal(false);

    const byField = new Map<string, ImportSelectableItem[]>();
    for (const item of selectedItems) {
      if (!byField.has(item.fieldKey)) byField.set(item.fieldKey, []);
      byField.get(item.fieldKey)!.push(item);
    }

    try {
      const update: Record<string, unknown> = { _enrichedAt: new Date().toISOString() };
      let newMassSchedule: Array<{ day: string; time: string; type: string }> | null = null;

      const first = (key: string) => byField.get(key)?.[0]?.newValue;

      if (byField.has("parishName")) { const v = first("parishName")!; update.name        = v; setEName(v); }
      if (byField.has("description")){ const v = first("description")!; update.description = v; setEDesc(v); }
      if (byField.has("phone"))      { const v = first("phone")!;       update.phone       = v; setEPhone(v); }
      if (byField.has("email"))      { const v = first("email")!;       update.email       = v; setEEmail(v); }
      if (byField.has("address"))    { const v = first("address")!;     update.address     = v; setEAddress(v); }
      if (byField.has("website"))    { const v = first("website")!;     update.website     = v; setEWebsite(v); }
      if (byField.has("churchName")) {
        update.churchName = byField.get("churchName")!.map(i => i.newValue).join(", ");
      }
      if (byField.has("priestName")) {
        const v = first("priestName")!; update.priestName = v; setEPriestName(v);
      }
      if (byField.has("massSchedule")) {
        const entries = byField.get("massSchedule")![0].massEntries;
        if (entries?.length) newMassSchedule = entries;
      }
      if (byField.has("massSchedulesText")) {
        update.massSchedulesText = first("massSchedulesText");
      }
      if (byField.has("confessionSchedules")) {
        const v = first("confessionSchedules")!; update.confessionSchedules = v; setEConfession(v);
      }
      if (byField.has("adorationSchedules")) {
        const v = first("adorationSchedules")!; update.adorationSchedules = v; setEAdoration(v);
      }
      if (byField.has("permanenceSchedules")) {
        const v = first("permanenceSchedules")!; update.permanenceSchedules = v; setEPermanence(v);
      }
      if (byField.has("usefulLinks")) {
        update.usefulLinks = byField.get("usefulLinks")!.map(i => ({
          label: i.linkLabel ?? i.label,
          url:   i.linkUrl  ?? i.newValue,
        }));
      }

      await updateDoc(doc(db, "parishes", parishId), update);
      setParish(p => p ? { ...p, ...(update as Partial<ParishData>) } : p);

      if (newMassSchedule?.length) {
        const newSched: MassEntry[] = newMassSchedule.map((m, i) => ({
          ...m, _key: String(Date.now() + i),
        }));
        await saveSchedule(newSched);
      }

      Alert.alert("✓ Import réussi", "Les informations sélectionnées ont été importées dans la fiche.");
    } catch {
      Alert.alert("Erreur", "Impossible d'appliquer les modifications.");
    }
  };

  const addMassEntry = async (entry: Omit<MassEntry, "_key">) => {
    if (editMassIdx !== null) {
      const updated = schedule.map((m, i) => i === editMassIdx ? { ...entry, _key: m._key } : m);
      await saveSchedule(updated);
      setEditMassIdx(null);
    } else {
      const updated = [...schedule, { ...entry, _key: Date.now().toString() }];
      await saveSchedule(updated);
    }
  };

  const removeMassEntry = (idx: number) => setRemoveMassIdx(idx);

  const doRemoveMassEntry = () => {
    if (removeMassIdx === null) return;
    saveSchedule(schedule.filter((_, i) => i !== removeMassIdx));
    setRemoveMassIdx(null);
  };

  // ── Photo upload ──
  const pickAndUpload = async (type: "logo" | "cover") => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") { Alert.alert("Permission requise"); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: true,
      aspect: type === "logo" ? [1, 1] : [16, 9],
      quality: 0.85,
      base64: true,       // obligatoire sur iOS Safari PWA (blob: fetch gèle)
    });
    if (result.canceled || !result.assets.length) return;
    const asset  = result.assets[0];
    const setter = type === "logo" ? setUploadingLogo : setUploadingCover;
    setter(true);
    try {
      // Acquérir le blob : base64 sur web, fetch natif sur iOS/Android
      let blob: Blob;
      if (asset.base64) {
        blob = base64ToBlob(asset.base64, asset.mimeType ?? "image/jpeg");
      } else {
        const resp = await fetch(asset.uri);
        blob = await resp.blob();
      }
      const storagePath = `parishes/${parishId}/${type}_${Date.now()}.jpg`;
      const url  = await uploadToSupabase(blob, storagePath);
      const field = type === "logo" ? "logoUrl" : "coverUrl";
      await updateDoc(doc(db, "parishes", parishId!), { [field]: url });
      setParish((p) => p ? { ...p, [field]: url } : p);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Échec du téléversement.";
      Alert.alert("Erreur", msg);
    }
    finally { setter(false); }
  };

  // ── Role management ──
  const changeRole = (member: ParishMember) => {
    if (!canChangeMemberRoles) {
      Alert.alert("Action non autorisée", "Seul le prêtre responsable ou le Super Admin peut modifier les rôles.");
      return;
    }
    setChangeRoleTarget(member);
  };

  const doChangeRole = async (role: string) => {
    if (!changeRoleTarget) return;
    if (!canChangeMemberRoles || (!isGlobalAdmin && (role === "priest" || role === "admin"))) {
      setChangeRoleTarget(null);
      Alert.alert("Action non autorisée", "Ce rôle ne peut pas être attribué depuis ce compte.");
      return;
    }
    const target = changeRoleTarget;
    setChangeRoleTarget(null);
    await updateDoc(doc(db, "users", target.uid), { role });
    setMembers((prev) => prev.map((m) => m.uid === target.uid ? { ...m, role: role as ParishMember["role"] } : m));
  };

  // ── Add parish admin ──
  const addParishAdmin = async () => {
    if (!parishId || !adminEmail.trim()) { setAdminEmailErr("Saisissez un e-mail."); return; }
    setAddingAdmin(true); setAdminEmailErr("");
    try {
      const q = query(collection(db, "users"), where("email", "==", adminEmail.trim().toLowerCase()));
      const snap = await getDocs(q);
      if (snap.empty) { setAdminEmailErr("Aucun utilisateur trouvé avec cet e-mail."); return; }
      const userData = snap.docs[0].data();
      const uid = snap.docs[0].id;
      if (parishAdmins.includes(uid)) { setAdminEmailErr("Cet utilisateur est déjà admin."); return; }
      const adminProfile: AdminProfile = {
        uid,
        displayName: userData.displayName ?? "Utilisateur",
        email: userData.email ?? adminEmail.trim(),
      };
      const batch = writeBatch(db);
      batch.update(doc(db, "parishes", parishId), {
        parishAdmins: arrayUnion(uid),
        parishAdminProfiles: arrayUnion(adminProfile),
      });
      batch.update(doc(db, "users", uid), {
        role: "admin",
        parishId,
        parishName: parish?.name ?? null,
      });
      await batch.commit();
      setAdminEmail("");
    } catch { setAdminEmailErr("Erreur. Réessayez."); }
    finally { setAddingAdmin(false); }
  };

  const removeParishAdmin = (admin: AdminProfile) => setRemoveAdminConfirm(admin);

  const doRemoveParishAdmin = async () => {
    if (!removeAdminConfirm || !parishId) return;
    const admin = removeAdminConfirm;
    setRemoveAdminConfirm(null);
    const batch = writeBatch(db);
    batch.update(doc(db, "parishes", parishId), {
      parishAdmins: arrayRemove(admin.uid),
      parishAdminProfiles: arrayRemove(admin),
    });
    batch.update(doc(db, "users", admin.uid), { role: "member" });
    await batch.commit();
  };

  // ── Invite priest ──
  const sendInvite = async () => {
    if (!inviteEmail.trim() || !parish) return;
    await Share.share({
      title: "Invitation Paroisse Connect",
      message: `Bonjour,\n\nVous êtes invité(e) à rejoindre "${parish.name}" sur Paroisse Connect en tant que prêtre.\n\nTéléchargez l'application et rejoignez la paroisse avec votre adresse e-mail : ${inviteEmail.trim()}\n\n– L'équipe de ${parish.name}`,
    });
  };

  // ─────────────────────────────────────────────────────────────────────────────

  if (!parishId) {
    return (
      <View style={[s.root, { justifyContent: "center", alignItems: "center" }]}>
        <View style={{ paddingTop: insets.top }}>
          <Feather name="alert-circle" size={42} color="#9AA3B0" />
          <Text style={[s.sectionTitle, { textAlign: "center", marginTop: 12 }]}>
            Vous n'êtes lié à aucune paroisse.
          </Text>
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 20, alignItems: "center" }}>
            <Text style={{ color: GOLD, fontFamily: "Inter_600SemiBold" }}>Retour</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Seul le Super Admin peut consulter une autre paroisse.
  if (!isGlobalAdmin && parishId !== ownParishId) {
    return (
      <View style={[s.root, { justifyContent: "center", alignItems: "center", paddingHorizontal: 32 }]}>
        <View style={{ paddingTop: insets.top, alignItems: "center", gap: 12 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#EF444420", alignItems: "center", justifyContent: "center" }}>
            <Feather name="shield-off" size={28} color="#EF4444" />
          </View>
          <Text style={[s.sectionTitle, { textAlign: "center" }]}>Accès refusé</Text>
          <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: MUTED, textAlign: "center", lineHeight: 19 }}>
            Vous ne pouvez administrer que votre propre paroisse.{"\n"}
            Contactez un super administrateur si vous pensez qu'il s'agit d'une erreur.
          </Text>
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 8, backgroundColor: GOLD, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}>
            <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: DARK }}>Retour</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[s.root, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={GOLD} />
      </View>
    );
  }

  const editMassEntry = editMassIdx !== null ? schedule[editMassIdx] : null;

  return (
    <View style={s.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 50 }}
      >
        {/* ═══════════ HERO HEADER ═══════════ */}
        <View style={[s.hero, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Feather name="arrow-left" size={22} color="#fff" />
          </TouchableOpacity>

          {/* Cover photo or gradient */}
          {parish?.coverUrl ? (
            <Image
              source={{ uri: parish.coverUrl }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              cachePolicy="none"
            />
          ) : null}
          <View style={s.heroOverlay} />

          <View style={s.heroContent}>
            {/* Logo */}
            <TouchableOpacity onPress={() => pickAndUpload("logo")} activeOpacity={0.85} style={s.logoWrap}>
              {uploadingLogo ? (
                <ActivityIndicator color="#fff" />
              ) : parish?.logoUrl ? (
                <Image source={parish.logoUrl} style={s.logo} contentFit="cover" />
              ) : (
                <View style={s.logoPlaceholder}>
                  <Feather name="camera" size={20} color="rgba(255,255,255,0.6)" />
                </View>
              )}
              <View style={s.logoEditBadge}><Feather name="edit-2" size={10} color={GOLD} /></View>
            </TouchableOpacity>

            <Text style={s.heroName}>{parish?.name ?? ""}</Text>
            <Text style={s.heroCity}>{parish?.city} · {parish?.postalCode}</Text>

            {/* Change cover photo */}
            <TouchableOpacity style={s.changeCoverBtn} onPress={() => pickAndUpload("cover")} activeOpacity={0.8}>
              {uploadingCover ? <ActivityIndicator size="small" color={GOLD} /> : <Feather name="image" size={13} color={GOLD} />}
              <Text style={s.changeCoverText}>{uploadingCover ? "Téléversement…" : "Modifier la photo de couverture"}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ═══════════ STATS ROW ═══════════ */}
        <Animated.View entering={FadeInDown.delay(60).duration(380)} style={s.statsRow}>
          <StatBox label="Membres" value={parish?.memberCount ?? members.length} icon="users" color="#7C3AED" />
          <StatBox label="Annonces" value={stats.announcements} icon="bell" color={GOLD} />
          <StatBox label="Événements" value={stats.events} icon="calendar" color={GOLD} />
          <StatBox label="Vues totales" value={stats.views > 999 ? `${(stats.views / 1000).toFixed(1)}k` : stats.views} icon="eye" color="#0891B2" />
        </Animated.View>

        {/* ═══════════ INFOS DE LA PAROISSE ═══════════ */}
        <Animated.View entering={FadeInDown.delay(100).duration(380)} style={s.card}>
          <SectionHeader
            icon="info"
            title="Informations de la paroisse"
            action={
              editing ? (
                <TouchableOpacity onPress={saveInfo} disabled={savingInfo} style={s.saveChip}>
                  {savingInfo ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.saveChipText}>Sauvegarder</Text>}
                </TouchableOpacity>
              ) : (
                <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                  {canManageAdmins && (
                    <TouchableOpacity onPress={runEnrich} disabled={enriching} style={s.enrichChip}>
                      {enriching
                        ? <ActivityIndicator size="small" color={GOLD} />
                        : <><Feather name="refresh-cw" size={13} color={GOLD} /><Text style={s.editChipText}>Actualiser</Text></>}
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => setEditing(true)} style={s.editChip}>
                    <Feather name="edit-2" size={13} color={GOLD} />
                    <Text style={s.editChipText}>Modifier</Text>
                  </TouchableOpacity>
                </View>
              )
            }
          />

          {/* Bouton import site officiel — prêtres, admins paroissiaux, super admins */}
          {!editing && canManage && (
            <TouchableOpacity
              style={[s.importWebBtn, (!parish?.website || importingWeb) && { opacity: 0.45 }]}
              onPress={runImportWeb}
              disabled={!parish?.website || importingWeb}
              activeOpacity={0.85}
            >
              {importingWeb
                ? <ActivityIndicator size="small" color={GOLD} />
                : <Feather name={importWebData ? "refresh-cw" : "download-cloud"} size={16} color={GOLD} />}
              <View style={{ flex: 1 }}>
                <Text style={s.importWebText}>
                  {importingWeb
                    ? "Analyse du site en cours…"
                    : importWebData
                    ? "Actualiser les informations depuis le site officiel"
                    : "Importer les informations depuis le site officiel"}
                </Text>
                {!parish?.website
                  ? <Text style={s.importWebHint}>Renseignez d'abord l'URL du site officiel</Text>
                  : importWebData
                  ? <Text style={s.importWebHint}>
                      Dernière analyse : {(() => { try { return new Date(importWebData._fetchedAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } })()}
                      {importWebData._pagesCount ? ` · ${importWebData._pagesCount} page${importWebData._pagesCount > 1 ? "s" : ""}` : ""}
                    </Text>
                  : null}
              </View>
            </TouchableOpacity>
          )}

          {editing ? (
            <View style={s.editForm}>
              {[
                { label: "Nom de la paroisse", value: eName, set: setEName, multiline: false },
                { label: "Description", value: eDesc, set: setEDesc, multiline: true },
                { label: "Adresse", value: eAddress, set: setEAddress, multiline: false },
                { label: "Téléphone", value: ePhone, set: setEPhone, multiline: false },
                { label: "Site web", value: eWebsite, set: setEWebsite, multiline: false },
                { label: "Curé / prêtre", value: ePriestName, set: setEPriestName, multiline: false },
                { label: "E-mail de contact", value: eEmail, set: setEEmail, multiline: false },
                { label: "Horaires des confessions", value: eConfession, set: setEConfession, multiline: true },
                { label: "Horaires de l'adoration", value: eAdoration, set: setEAdoration, multiline: true },
                { label: "Horaires des permanences", value: ePermanence, set: setEPermanence, multiline: true },
              ].map(({ label, value, set, multiline }) => (
                <View key={label} style={{ marginBottom: 12 }}>
                  <Text style={s.fieldLabel}>{label}</Text>
                  <TextInput
                    style={[s.fieldInput, multiline && { minHeight: 80, textAlignVertical: "top" }]}
                    value={value}
                    onChangeText={set}
                    placeholder={label + "…"}
                    placeholderTextColor="#9AA3B0"
                    multiline={multiline}
                  />
                </View>
              ))}
            </View>
          ) : (
            <View style={s.infoGrid}>
              {[
                { icon: "home", label: "Nom", val: parish?.name },
                { icon: "file-text", label: "Description", val: parish?.description },
                { icon: "map-pin", label: "Adresse", val: parish?.address || `${parish?.city}, ${parish?.postalCode}` },
                { icon: "phone", label: "Téléphone", val: parish?.phone || "—" },
                { icon: "globe",      label: "Site web",          val: parish?.website             || "—" },
                { icon: "user",       label: "Curé / prêtre",     val: parish?.priestName          || "—" },
                { icon: "mail",       label: "E-mail",            val: parish?.email               || "—" },
                { icon: "clock",      label: "Confessions",        val: parish?.confessionSchedules || "—" },
                { icon: "sun",        label: "Adoration",          val: parish?.adorationSchedules  || "—" },
                { icon: "calendar",   label: "Permanences",        val: parish?.permanenceSchedules || "—" },
              ].map(({ icon, label, val }, i, arr) => (
                <View key={label}>
                  <View style={s.infoRow}>
                    <Feather name={icon as never} size={15} color={GOLD} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.infoLabel}>{label}</Text>
                      <Text style={s.infoValue}>{val}</Text>
                    </View>
                  </View>
                  {i < arr.length - 1 && <View style={s.divider} />}
                </View>
              ))}
            </View>
          )}
        </Animated.View>

        {/* ═══════════ HORAIRES DES MESSES ═══════════ */}
        <Animated.View entering={FadeInDown.delay(140).duration(380)} style={s.card}>
          <SectionHeader
            icon="clock"
            title="Horaires des messes"
            action={
              <TouchableOpacity
                onPress={() => parishId && router.push({ pathname: "/mass-schedule", params: { parishId } } as never)}
                style={s.editChip}
              >
                <Feather name="clock" size={13} color={GOLD} />
                <Text style={s.editChipText}>Gérer</Text>
              </TouchableOpacity>
            }
          />

          {schedule.length === 0 ? (
            <View style={s.emptyRow}>
              <Feather name="clock" size={22} color="#D0D5DC" />
              <Text style={s.emptyText}>Aucun horaire défini</Text>
            </View>
          ) : (
            schedule.map((entry, i) => (
              <View key={entry._key}>
                <View style={s.massRow}>
                  <View style={s.massTimeBox}>
                    <Text style={s.massTime}>{entry.time}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.massType}>{entry.type}</Text>
                    <Text style={s.massDay}>{entry.day}</Text>
                  </View>
                </View>
                {i < schedule.length - 1 && <View style={s.divider} />}
              </View>
            ))
          )}
          <Text style={s.helperText}>
            Les horaires détaillés, les dates précises, les lieux et les adresses se gèrent dans l’écran dédié.
          </Text>
          {savingSched && <ActivityIndicator color={GOLD} style={{ marginTop: 8 }} />}
        </Animated.View>

        {/* ═══════════ GESTION DU CONTENU ═══════════ */}
        <Animated.View entering={FadeInDown.delay(180).duration(380)} style={s.card}>
          <SectionHeader icon="layout" title="Gestion du contenu" />
          <View style={s.contentGrid}>
            {[
              { icon: "bell", label: "Annonces", count: stats.announcements, route: "/(tabs)/announcements", color: GOLD },
              { icon: "calendar", label: "Événements", count: stats.events, route: "/(tabs)/events", color: GOLD },
              { icon: "heart", label: "Prières", count: null, route: "/(tabs)/prayers", color: "#E53935" },
              { icon: "users", label: "Membres", count: members.length, route: null, color: "#7C3AED" },
            ].map(({ icon, label, count, route, color }) => (
              <TouchableOpacity
                key={label}
                style={s.contentCard}
                onPress={() => route ? router.push(route as never) : null}
                activeOpacity={route ? 0.8 : 1}
              >
                <View style={[s.contentIcon, { backgroundColor: color + "18" }]}>
                  <Feather name={icon as never} size={20} color={color} />
                </View>
                {count != null && (
                  <View style={[s.contentBadge, { backgroundColor: color }]}>
                    <Text style={s.contentBadgeText}>{count}</Text>
                  </View>
                )}
                <Text style={s.contentLabel}>{label}</Text>
                {route && <Feather name="chevron-right" size={14} color="#9AA3B0" style={{ marginTop: 2 }} />}
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>

        {/* ═══════════ MEMBRES ET RÔLES ═══════════ */}
        <Animated.View entering={FadeInDown.delay(220).duration(380)} style={s.card}>
          <SectionHeader icon="users" title="Membres et rôles" />

          {members.length === 0 ? (
            <View style={s.emptyRow}>
              <Feather name="users" size={22} color="#D0D5DC" />
              <Text style={s.emptyText}>Aucun membre trouvé</Text>
            </View>
          ) : (
            members.slice(0, 20).map((m, i) => (
              <View key={m.uid}>
                <View style={s.memberRow}>
                  <Avatar name={m.displayName} size={38} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.memberName}>{m.displayName}</Text>
                    <Text style={s.memberEmail} numberOfLines={1}>{m.email}</Text>
                  </View>
                  <TouchableOpacity
                    style={[s.roleBadge, { backgroundColor: (ROLE_COLORS[m.role] ?? "#6B7280") + "18" }]}
                    onPress={() => changeRole(m)}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.roleBadgeText, { color: ROLE_COLORS[m.role] ?? "#6B7280" }]}>
                      {ROLE_LABELS[m.role] ?? m.role}
                    </Text>
                    <Feather name="chevron-down" size={11} color={ROLE_COLORS[m.role] ?? "#6B7280"} />
                  </TouchableOpacity>
                </View>
                {i < Math.min(members.length, 20) - 1 && <View style={s.divider} />}
              </View>
            ))
          )}
          {members.length > 20 && (
            <Text style={[s.emptyText, { textAlign: "center", marginTop: 8 }]}>
              + {members.length - 20} autres membres
            </Text>
          )}
        </Animated.View>

        {/* ═══════════ DEMANDES DE REVENDICATION ═══════════ */}
        {canViewClaims && (
          <Animated.View entering={FadeInDown.delay(250).duration(380)} style={s.card}>
            <SectionHeader icon="shield" title="Demandes / Revendications" />
            <Text style={s.inviteHint}>
              Les demandes sont limitées à cette paroisse. Le prêtre responsable et le Super Admin peuvent valider une demande de prêtre ; les demandes d’administrateur peuvent être déléguées.
            </Text>
            <ClaimsSummary parishId={parishId} canReview={canReviewClaims} />
            <TouchableOpacity
              style={s.claimsBtn}
              onPress={() => router.push("/admin-claims")}
              activeOpacity={0.85}
            >
              <Feather name="file-text" size={16} color="#fff" />
              <Text style={s.inviteBtnText}>Voir les demandes</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* ═══════════ IMPORT PAROISSES (admin seulement) ═══════════ */}
        {isGlobalAdmin && (
          <Animated.View entering={FadeInDown.delay(255).duration(380)} style={s.card}>
            <SectionHeader icon="download-cloud" title="Importer des paroisses" />
            <Text style={s.inviteHint}>
              Importer automatiquement les paroisses catholiques depuis OpenStreetMap par numéro de département.
            </Text>
            <TouchableOpacity
              style={s.claimsBtn}
              onPress={() => router.push("/admin-import-parishes")}
              activeOpacity={0.85}
            >
              <Feather name="download" size={16} color={GOLD} />
              <Text style={s.inviteBtnText}>Importer par département</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* ═══════════ ADMINS PAROISSIAUX (prêtre / super admin) ═══════════ */}
        {canManageAdmins && (
          <Animated.View entering={FadeInDown.delay(253).duration(380)} style={s.card}>
            <SectionHeader icon="user-check" title="Admins paroissiaux" />
            <Text style={s.inviteHint}>
              Les admins paroissiaux peuvent gérer les annonces, événements, groupes, horaires et membres de votre paroisse.
            </Text>

            {parishAdminProfiles.length > 0 && (
              <View style={{ gap: 8, marginBottom: 12 }}>
                {parishAdminProfiles.map((admin) => (
                  <View key={admin.uid} style={s.adminRow}>
                    <View style={s.adminAvatar}>
                      <Text style={s.adminAvatarText}>{(admin.displayName || "?")[0].toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.adminName}>{admin.displayName}</Text>
                      <Text style={s.adminEmail}>{admin.email}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => removeParishAdmin(admin)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Feather name="user-x" size={16} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <TextInput
              style={[s.inviteInput, adminEmailErr ? { borderColor: "#EF4444" } : null]}
              value={adminEmail}
              onChangeText={(t) => { setAdminEmail(t); setAdminEmailErr(""); }}
              placeholder="email@utilisateur.fr"
              placeholderTextColor="#9AA3B0"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            {adminEmailErr ? <Text style={s.adminEmailErr}>{adminEmailErr}</Text> : null}
            <TouchableOpacity
              style={[s.inviteBtn, !adminEmail.trim() && { opacity: 0.5 }, { backgroundColor: GOLD }]}
              onPress={addParishAdmin}
              disabled={addingAdmin || !adminEmail.trim()}
              activeOpacity={0.85}
            >
              {addingAdmin
                ? <ActivityIndicator size="small" color={DARK} />
                : <><Feather name="user-plus" size={16} color={DARK} /><Text style={[s.inviteBtnText, { color: DARK }]}>Nommer comme admin</Text></>}
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* ═══════════ INVITER UN PRÊTRE ═══════════ */}
        <Animated.View entering={FadeInDown.delay(260).duration(380)} style={s.card}>
          <SectionHeader icon="mail" title="Inviter un prêtre ou modérateur" />
          <Text style={s.inviteHint}>
            Saisissez l'e-mail de la personne à inviter. Un message d'invitation sera généré pour vous à partager.
          </Text>
          <TextInput
            style={s.inviteInput}
            value={inviteEmail}
            onChangeText={setInviteEmail}
            placeholder="pretre@diocese.fr"
            placeholderTextColor="#9AA3B0"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={[s.inviteBtn, !inviteEmail.trim() && { opacity: 0.5 }]}
            onPress={sendInvite}
            disabled={!inviteEmail.trim()}
            activeOpacity={0.85}
          >
            <Feather name="send" size={16} color="#fff" />
            <Text style={s.inviteBtnText}>Envoyer l'invitation</Text>
          </TouchableOpacity>
        </Animated.View>

      </ScrollView>

      {/* Enrichissement automatique */}
      {enrichData && (
        <EnrichPreviewModal
          visible={showEnrichModal}
          data={enrichData}
          onApply={applyEnrich}
          onClose={() => setShowEnrichModal(false)}
        />
      )}

      {/* Import depuis le site officiel */}
      <ImportWebModal
        visible={showImportModal}
        result={importWebData}
        parish={parish}
        onApply={applyImportWeb}
        onClose={() => setShowImportModal(false)}
        onRefresh={() => { setShowImportModal(false); runImportWeb(); }}
        refreshing={importingWeb}
      />

      {/* Add/Edit Mass Modal */}
      <AddMassModal
        visible={showMassModal}
        onClose={() => { setShowMassModal(false); setEditMassIdx(null); }}
        onAdd={addMassEntry}
        existing={editMassEntry ? { day: editMassEntry.day, time: editMassEntry.time, type: editMassEntry.type } : null}
      />
      <ConfirmSheet
        visible={removeMassIdx !== null}
        title="Supprimer cet horaire ?"
        confirmLabel="Supprimer"
        confirmColor="#D32F2F"
        cancelLabel="Annuler"
        icon="trash-2"
        onConfirm={doRemoveMassEntry}
        onCancel={() => setRemoveMassIdx(null)}
      />
      <ConfirmSheet
        visible={removeAdminConfirm !== null}
        title="Retirer l'administrateur"
        message={removeAdminConfirm ? `Retirer ${removeAdminConfirm.displayName} des admins paroissiaux ?` : ""}
        confirmLabel="Retirer"
        confirmColor="#D32F2F"
        cancelLabel="Annuler"
        icon="user-minus"
        onConfirm={doRemoveParishAdmin}
        onCancel={() => setRemoveAdminConfirm(null)}
      />
      {/* Role picker modal */}
      <Modal
        visible={changeRoleTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setChangeRoleTarget(null)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}
          activeOpacity={1}
          onPress={() => setChangeRoleTarget(null)}
        >
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View style={{ backgroundColor: "#FFF8EC", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 8 }}>
              <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: "#111111", marginBottom: 4 }}>
                {changeRoleTarget ? `Rôle de ${changeRoleTarget.displayName}` : ""}
              </Text>
              {((isGlobalAdmin || isPriestRole)
                ? ROLE_OPTIONS
                : ROLE_OPTIONS.filter((r) => r !== "admin" && r !== "priest")
              ).map((r) => (
                <TouchableOpacity
                  key={r}
                  onPress={() => doChangeRole(r)}
                  activeOpacity={0.8}
                  style={{
                    paddingVertical: 14, paddingHorizontal: 16,
                    borderRadius: 12, borderWidth: 1,
                    borderColor: changeRoleTarget?.role === r ? "#C9A24A" : "#EADFCB",
                    backgroundColor: changeRoleTarget?.role === r ? "#C9A24A18" : "#FFFFFF",
                  }}
                >
                  <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#111111" }}>
                    {ROLE_LABELS[r]}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                onPress={() => setChangeRoleTarget(null)}
                activeOpacity={0.8}
                style={{ paddingVertical: 14, alignItems: "center", marginTop: 4 }}
              >
                <Text style={{ fontSize: 15, fontFamily: "Inter_500Medium", color: "#666666" }}>Annuler</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: CREAM },

  // Hero
  hero: { backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderBottomColor: BORDER, overflow: "hidden" },
  heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "transparent" },
  heroContent: { padding: 20, gap: 4, zIndex: 1 },
  heroName: { fontSize: 22, fontFamily: "Inter_700Bold", color: DARK, marginTop: 4 },
  heroCity: { fontSize: 13, fontFamily: "Inter_400Regular", color: MUTED },
  backBtn: {
    position: "absolute", top: 16, left: 16, zIndex: 2,
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: CREAM,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: BORDER,
  },
  logoWrap: {
    width: 62, height: 62, borderRadius: 16, overflow: "visible",
    marginBottom: 6, position: "relative",
  },
  logo: { width: 62, height: 62, borderRadius: 16 },
  logoPlaceholder: {
    width: 62, height: 62, borderRadius: 16,
    backgroundColor: CREAM,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: BORDER,
  },
  logoEditBadge: {
    position: "absolute", bottom: -4, right: -4,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: "#fff", alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 3,
  },
  changeCoverBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  changeCoverText: { fontSize: 12, fontFamily: "Inter_500Medium", color: GOLD },

  // Stats
  statsRow: {
    flexDirection: "row", backgroundColor: "#fff",
    marginHorizontal: 16, marginTop: 16,
    borderRadius: 16, overflow: "hidden",
    shadowColor: BORDER, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.5, shadowRadius: 8, elevation: 2,
    borderWidth: 1, borderColor: BORDER,
  },
  statBox: {
    flex: 1, alignItems: "center", paddingVertical: 14, gap: 4,
    borderTopWidth: 3,
  },
  statValue: { fontSize: 20, fontFamily: "Inter_700Bold", color: DARK },
  statLabel: { fontSize: 10, fontFamily: "Inter_500Medium", color: "#7A7A8A", textAlign: "center" },

  // Cards
  card: {
    backgroundColor: "#fff",
    marginHorizontal: 16, marginTop: 14,
    borderRadius: 16, padding: 16,
    shadowColor: BORDER, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.5, shadowRadius: 8, elevation: 2,
    borderWidth: 1, borderColor: BORDER,
  },
  sectionHead: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", rowGap: 6, marginBottom: 14 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
  sectionActionWrap: { marginLeft: "auto" },
  sectionIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: GOLD + "18", alignItems: "center", justifyContent: "center" },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold", color: DARK },
  saveChip: { backgroundColor: GOLD, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  saveChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: DARK },
  editChip: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: CREAM, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: BORDER },
  editChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: DARK },
  enrichChip: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: GOLD + "14", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: GOLD + "50", minWidth: 36, justifyContent: "center" },
  divider: { height: 1, backgroundColor: "#F0EDE8", marginVertical: 2 },
  emptyRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14, justifyContent: "center" },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#9AA3B0" },

  // Info view
  infoGrid: { gap: 0 },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 10 },
  infoLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#9AA3B0", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 2 },
  infoValue: { fontSize: 14, fontFamily: "Inter_400Regular", color: DARK, lineHeight: 20 },

  // Edit form
  editForm: { gap: 0 },
  fieldLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#7A7A8A", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 6 },
  fieldInput: { borderWidth: 1.5, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontFamily: "Inter_400Regular", color: DARK },

  // Mass
  massRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  massTimeBox: { width: 52, height: 36, borderRadius: 8, backgroundColor: GOLD, alignItems: "center", justifyContent: "center" },
  massTime: { fontSize: 13, fontFamily: "Inter_700Bold", color: DARK },
  massType: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: DARK },
  massDay: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#7A7A8A" },
  helperText: { fontSize: 11, fontFamily: "Inter_400Regular", color: MUTED, lineHeight: 16, marginTop: 10 },

  // Content grid
  contentGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  contentCard: {
    width: "47%", backgroundColor: CREAM, borderRadius: 14, padding: 14,
    alignItems: "flex-start", gap: 6, position: "relative",
  },
  contentIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  contentBadge: { position: "absolute", top: 10, right: 10, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  contentBadgeText: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#fff" },
  contentLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: DARK },

  // Members
  memberRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  memberName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: DARK },
  memberEmail: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#7A7A8A" },
  roleBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16 },
  roleBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  // Invite
  inviteHint: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#7A7A8A", lineHeight: 19, marginBottom: 12 },
  inviteInput: { borderWidth: 1.5, borderColor: BORDER, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: "Inter_400Regular", color: DARK, marginBottom: 12 },
  inviteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: GOLD, borderRadius: 24, paddingVertical: 13 },

  // Parish admins
  adminRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: BORDER + "80" },
  adminAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: GOLD + "22", alignItems: "center", justifyContent: "center" },
  adminAvatarText: { fontSize: 15, fontFamily: "Inter_700Bold", color: GOLD },
  adminName: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: DARK },
  adminEmail: { fontSize: 11, fontFamily: "Inter_400Regular", color: MUTED },
  adminEmailErr: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#EF4444", marginBottom: 8, marginTop: -8 },
  claimsBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: GOLD + "22", borderRadius: 14, paddingVertical: 13, borderWidth: 1, borderColor: GOLD + "55" },
  inviteBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: DARK },

  // Import site officiel
  importWebBtn: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderWidth: 1.5, borderColor: GOLD + "55", borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 14,
    marginBottom: 14, backgroundColor: GOLD + "08",
  },
  importWebText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: GOLD },
  importWebHint: { fontSize: 11, fontFamily: "Inter_400Regular", color: MUTED, marginTop: 2 },
});
