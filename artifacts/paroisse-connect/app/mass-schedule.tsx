import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  SectionList,
} from "react-native";
import { TimePickerField } from "@/components/ui/TimePickerField";
import { CompactFilterChip, CompactFilterRow } from "@/components/ui/CompactFilterRow";
import { router, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/context/I18nContext";
import { useParishPermissions } from "@/hooks/useParishPermissions";
import { normalizeMassSchedule, type LegacyMassScheduleEntry } from "@/lib/massSchedules";
import {
  EVENT_CATEGORIES,
  normalizeEventCategory,
  type EventCategory,
} from "@/lib/eventCategories";

// ─── Palette ──────────────────────────────────────────────────────────────────
const GOLD   = "#C9A24A";
const DARK   = "#111111";
const CREAM  = "#FFF8EC";
const BORDER = "#EADFCB";
const MUTED  = "#666666";
const RED    = "#EF4444";
const GREEN  = "#16A34A";
const BG     = "#F9F6F0";

// ─── Constantes ───────────────────────────────────────────────────────────────
const JOURS = [
  "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche",
  "Jour de fête",
];
const JOUR_ORDER: Record<string, number> = {
  Lundi: 1, Mardi: 2, Mercredi: 3, Jeudi: 4, Vendredi: 5, Samedi: 6, Dimanche: 7, "Jour de fête": 8,
};

const TYPES = [
  { key: "messe",      label: "Messe",       icon: "sun"   },
  { key: "adoration",  label: "Adoration",   icon: "star"  },
  { key: "confession", label: "Confession",  icon: "heart" },
  { key: "permanence", label: "Permanence",  icon: "phone" },
  { key: "evenement",  label: "Événement",   icon: "calendar" },
] as const;
type TypeKey = typeof TYPES[number]["key"];

const RECURRENCES = [
  { key: "hebdomadaire", label: "Chaque semaine" },
  { key: "unique",       label: "Unique"         },
] as const;
type RecurrenceKey = typeof RECURRENCES[number]["key"];

const TYPE_COLOR: Record<TypeKey, string> = {
  messe:      GOLD,
  adoration:  "#7C3AED",
  confession: "#16A34A",
  permanence: "#2563EB",
  evenement:  "#EA580C",
};

function typeKeyFromStoredType(value: string): TypeKey {
  const normalized = value.trim().toLocaleLowerCase("fr-FR");
  return TYPES.find((type) =>
    type.key === normalized ||
    type.label.toLocaleLowerCase("fr-FR") === normalized
  )?.key ?? "messe";
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface MassSchedule {
  id: string;
  parishId: string;
  lieu: string;
  adresse: string;
  jour: string;       // conservé pour rétrocompatibilité
  jours?: string[];   // nouveau : plusieurs jours possibles
  heure: string;      // conservé pour rétrocompatibilité
  startTime?: string; // nouveau : heure de début
  endTime?: string;   // nouveau : heure de fin (optionnel)
  type: string;
  category?: EventCategory | string;
  recurrence: RecurrenceKey | string;
  dateSpeciale?: string;
  note?: string;
  createdAt?: unknown;
  legacy?: boolean;
}

// ─── Formulaire d'ajout/modification ─────────────────────────────────────────
interface FormState {
  lieu: string;
  adresse: string;
  jours: string[];   // multi-sélection
  heureDebut: string;
  heureFin: string;
  type: TypeKey;
  category: EventCategory | null;
  recurrence: RecurrenceKey;
  dateSpeciale: string;
  note: string;
}

const EMPTY_FORM: FormState = {
  lieu: "",
  adresse: "",
  jours: ["Dimanche"],
  heureDebut: "10:30",
  heureFin: "",
  type: "messe",
  category: null,
  recurrence: "hebdomadaire",
  dateSpeciale: "",
  note: "",
};

interface ScheduleModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (form: FormState) => Promise<void>;
  initial: MassSchedule | null;
}

function ScheduleModal({ visible, onClose, onSave, initial }: ScheduleModalProps) {
  const { t: translate } = useI18n();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (visible) {
      setError("");
      setSaving(false);
      if (initial) {
        const initialType = typeKeyFromStoredType(initial.type);
        setForm({
          lieu:         initial.lieu,
          adresse:      initial.adresse,
          jours:        initial.jours ?? [initial.jour],
          heureDebut:   initial.startTime ?? initial.heure,
          heureFin:     initial.endTime ?? "",
          type:         initialType,
          category:     initialType === "evenement" ? normalizeEventCategory(initial.category) : null,
          recurrence:   initial.recurrence === "unique" ? "unique" : "hebdomadaire",
          dateSpeciale: initial.dateSpeciale ?? "",
          note:         initial.note ?? "",
        });
      } else {
        setForm(EMPTY_FORM);
      }
    }
  }, [visible, initial]);

  const set = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: val }));

  const toggleJour = (jour: string) =>
    setForm((f) => ({
      ...f,
      jours: f.jours.includes(jour)
        ? f.jours.filter((j) => j !== jour)
        : [...f.jours, jour],
    }));

  const validate = () => {
    if (!form.lieu.trim()) return "Le nom de l'église est requis.";
    if (form.type === "evenement" && !form.category)
      return "Sélectionnez une catégorie pour cet événement.";
    if (form.recurrence === "hebdomadaire" && form.jours.length === 0)
      return "Sélectionnez au moins un jour.";
    if (!form.heureDebut.match(/^\d{2}:\d{2}$/))
      return "L'heure de début doit être au format HH:MM.";
    if (form.heureFin && !form.heureFin.match(/^\d{1,2}:\d{2}$/))
      return "L'heure de fin doit être au format HH:MM.";
    if (form.recurrence === "unique" && !/^\d{4}-\d{2}-\d{2}$/.test(form.dateSpeciale.trim()))
      return "La date doit être au format AAAA-MM-JJ.";
    return null;
  };

  const handleSave = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    setSaving(true);
    setError("");
    try {
      await onSave(form);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur. Réessayez.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={mo.overlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          style={mo.sheet}
          contentContainerStyle={{ paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* En-tête */}
          <View style={mo.header}>
            <Text style={mo.title}>{initial ? "Modifier l'horaire" : "Ajouter un horaire"}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={20} color={DARK} />
            </TouchableOpacity>
          </View>

          {error ? (
            <View style={mo.errorBox}>
              <Feather name="alert-circle" size={14} color={RED} />
              <Text style={mo.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Église / lieu */}
          <Text style={mo.label}>Église / Lieu *</Text>
          <TextInput
            style={mo.input}
            value={form.lieu}
            onChangeText={(v) => set("lieu", v)}
            placeholder="Ex: Église Saint-Martin"
            placeholderTextColor="#9AA3B0"
          />

          {/* Adresse */}
          <Text style={mo.label}>Adresse</Text>
          <TextInput
            style={mo.input}
            value={form.adresse}
            onChangeText={(v) => set("adresse", v)}
            placeholder="Ex: 5 place de l'église, 59000 Cambrai"
            placeholderTextColor="#9AA3B0"
          />

          {/* Jour de récurrence */}
          {form.recurrence === "hebdomadaire" && (
            <>
              <Text style={mo.label}>Jour récurrent * (plusieurs possibles)</Text>
              <View style={mo.joursGrid}>
                {JOURS.map((j) => {
                  const checked = form.jours.includes(j);
                  return (
                    <TouchableOpacity
                      key={j}
                      style={[mo.jourRow, checked && mo.jourRowActive]}
                      onPress={() => toggleJour(j)}
                      activeOpacity={0.75}
                    >
                      <View style={[mo.checkbox, checked && mo.checkboxChecked]}>
                        {checked && <Feather name="check" size={11} color="#fff" />}
                      </View>
                      <Text style={[mo.jourLabel, checked && mo.jourLabelActive]}>{translate(j)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {/* Heures */}
          <View style={mo.timeRow}>
            <TimePickerField
              label="Heure de début *"
              value={form.heureDebut}
              onChange={(v) => set("heureDebut", v)}
              placeholder="10:30"
              containerStyle={{ flex: 1, marginBottom: 0 }}
              accentColor={GOLD}
              borderColor={BORDER}
            />
            <View style={mo.timeSep} />
            <TimePickerField
              label="Heure de fin"
              value={form.heureFin}
              onChange={(v) => set("heureFin", v)}
              placeholder="11:30"
              containerStyle={{ flex: 1, marginBottom: 0 }}
              accentColor={GOLD}
              borderColor={BORDER}
            />
          </View>

          {/* Type */}
          <Text style={mo.label}>Type *</Text>
          <View style={mo.typeGrid}>
            {TYPES.map((t) => (
              <TouchableOpacity
                key={t.key}
                style={[
                  mo.typeChip,
                  form.type === t.key && { backgroundColor: TYPE_COLOR[t.key] + "22", borderColor: TYPE_COLOR[t.key] },
                ]}
                onPress={() => set("type", t.key)}
                activeOpacity={0.8}
              >
                <Feather name={t.icon as never} size={14} color={form.type === t.key ? TYPE_COLOR[t.key] : MUTED} />
                <Text style={[mo.typeChipText, form.type === t.key && { color: TYPE_COLOR[t.key], fontFamily: "Inter_600SemiBold" }]}>
                  {translate(t.label)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {form.type === "evenement" && (
            <>
              <Text style={mo.label}>Catégorie de l’événement *</Text>
              <CompactFilterRow style={{ marginBottom: 16 }}>
                {EVENT_CATEGORIES.filter((category) => category !== "Messe").map((category) => (
                  <CompactFilterChip
                    key={category}
                    label={translate(category)}
                    onPress={() => set("category", category)}
                    style={[
                      mo.typeChip,
                      form.category === category && {
                        backgroundColor: TYPE_COLOR.evenement + "22",
                        borderColor: TYPE_COLOR.evenement,
                      },
                    ]}
                    textStyle={[
                      mo.typeChipText,
                      form.category === category && {
                        color: TYPE_COLOR.evenement,
                        fontFamily: "Inter_600SemiBold",
                      },
                    ]}
                  />
                ))}
              </CompactFilterRow>
            </>
          )}

          {/* Récurrence */}
          <Text style={mo.label}>Récurrence *</Text>
          <View style={mo.recRow}>
            {RECURRENCES.map((r) => (
              <TouchableOpacity
                key={r.key}
                style={[mo.recChip, form.recurrence === r.key && mo.recChipActive]}
                onPress={() => set("recurrence", r.key)}
                activeOpacity={0.8}
              >
                <Text style={[mo.recChipText, form.recurrence === r.key && mo.recChipTextActive]}>
                  {translate(r.label)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Date spéciale (obligatoire si unique) */}
          {form.recurrence === "unique" && (
            <>
              <Text style={mo.label}>Date précise * (AAAA-MM-JJ)</Text>
              <TextInput
                style={mo.input}
                value={form.dateSpeciale}
                onChangeText={(v) => set("dateSpeciale", v)}
                placeholder="Ex: 2026-12-25"
                placeholderTextColor="#9AA3B0"
                keyboardType="numbers-and-punctuation"
              />
            </>
          )}

          {/* Note */}
          <Text style={mo.label}>Note (optionnel)</Text>
          <TextInput
            style={[mo.input, mo.textArea]}
            value={form.note}
            onChangeText={(v) => set("note", v)}
            placeholder="Précisions, intentions de messe…"
            placeholderTextColor="#9AA3B0"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          {/* Bouton enregistrer */}
          <TouchableOpacity
            style={[mo.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator size="small" color={DARK} />
              : <Text style={mo.saveBtnText}>{initial ? "Enregistrer les modifications" : "Ajouter l'horaire"}</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const mo = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: "92%",
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 18 },
  title:  { fontSize: 17, fontFamily: "Inter_700Bold", color: DARK },
  errorBox: { flexDirection: "row", alignItems: "flex-start", gap: 6, backgroundColor: RED + "10", borderRadius: 8, padding: 10, marginBottom: 12 },
  errorText:{ flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: RED },
  label: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: MUTED, textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 8 },
  input: {
    borderWidth: 1.5, borderColor: BORDER, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 14, fontFamily: "Inter_400Regular", color: DARK,
    marginBottom: 16,
  },
  textArea: { minHeight: 72 },
  joursGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  jourRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 10, borderWidth: 1.5, borderColor: BORDER,
    backgroundColor: CREAM, flexGrow: 1, flexBasis: "45%", minWidth: 0,
  },
  jourRowActive: { backgroundColor: GOLD + "14", borderColor: GOLD },
  checkbox: {
    width: 18, height: 18, borderRadius: 4,
    borderWidth: 1.5, borderColor: BORDER,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "#fff",
  },
  checkboxChecked: { backgroundColor: GOLD, borderColor: GOLD },
  jourLabel: { fontSize: 13, fontFamily: "Inter_500Medium", color: DARK },
  jourLabelActive: { color: GOLD, fontFamily: "Inter_600SemiBold" },
  timeRow: { flexDirection: "row", gap: 10, marginBottom: 0 },
  timeSep: { width: 10 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, marginRight: 8,
    backgroundColor: CREAM, borderWidth: 1, borderColor: BORDER,
  },
  chipActive: { backgroundColor: GOLD, borderColor: GOLD },
  chipText: { fontSize: 12, fontFamily: "Inter_500Medium", color: DARK },
  chipTextActive: { color: "#fff", fontFamily: "Inter_600SemiBold" },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  typeChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 12, borderWidth: 1.5, borderColor: BORDER, backgroundColor: CREAM,
  },
  typeChipText: { fontSize: 12, fontFamily: "Inter_500Medium", color: MUTED },
  recRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  recChip: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: BORDER, backgroundColor: CREAM },
  recChipActive: { backgroundColor: GOLD + "20", borderColor: GOLD },
  recChipText: { fontSize: 12, fontFamily: "Inter_500Medium", color: MUTED },
  recChipTextActive: { color: GOLD, fontFamily: "Inter_600SemiBold" },
  saveBtn: { backgroundColor: GOLD, borderRadius: 14, paddingVertical: 15, alignItems: "center", marginTop: 8 },
  saveBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: DARK },
});

// ─── Carte horaire ────────────────────────────────────────────────────────────
function ScheduleCard({
  item,
  canManage,
  onEdit,
  onDelete,
}: {
  item: MassSchedule;
  canManage: boolean;
  onEdit: (item: MassSchedule) => void;
  onDelete: (item: MassSchedule) => void;
}) {
  const typeInfo = TYPES.find((t) => t.key === item.type);
  const color    = TYPE_COLOR[item.type as TypeKey] ?? GOLD;
  const recLabel = RECURRENCES.find((r) => r.key === item.recurrence)?.label ?? item.recurrence;

  return (
    <View style={sc.card}>
      <View style={[sc.accent, { backgroundColor: color }]} />
      <View style={[sc.timeBubble, { backgroundColor: color + "18", borderColor: color + "44" }]}>
        <Text style={[sc.timeText, { color }]}>{item.startTime ?? item.heure}</Text>
        {(item.endTime) ? (
          <Text style={[sc.timeEnd, { color }]}>→ {item.endTime}</Text>
        ) : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
           <Feather name={(typeInfo?.icon ?? "calendar") as never} size={12} color={color} />
           <Text style={sc.typeLabel}>{typeInfo?.label ?? item.type}</Text>
          <View style={[sc.recPill, { backgroundColor: color + "14" }]}>
            <Text style={[sc.recText, { color }]}>{recLabel}</Text>
          </View>
        </View>
        {/* Affiche tous les jours si plusieurs */}
        {item.recurrence === "unique" ? (
          <Text style={sc.jours}>Date précise : {item.dateSpeciale}</Text>
        ) : (
          <Text style={sc.jours}>{(item.jours ?? [item.jour]).join(" · ")}</Text>
        )}
        <Text style={sc.lieu}>{item.lieu}</Text>
        {item.adresse ? <Text style={sc.adresse}>{item.adresse}</Text> : null}
        {item.dateSpeciale ? (
          <Text style={sc.dateSpec}>📅 {item.dateSpeciale}</Text>
        ) : null}
        {item.note ? <Text style={sc.note}>"{item.note}"</Text> : null}
      </View>
      {canManage && !item.legacy && (
        <View style={sc.actions}>
          <TouchableOpacity
            onPress={() => onEdit(item)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={[sc.actionBtn, { backgroundColor: GOLD + "18" }]}
          >
            <Feather name="edit-2" size={14} color={GOLD} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onDelete(item)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={[sc.actionBtn, { backgroundColor: RED + "14" }]}
          >
            <Feather name="trash-2" size={14} color={RED} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const sc = StyleSheet.create({
  card: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    minWidth: 0,
    backgroundColor: "#FFFFFF", borderRadius: 14,
    padding: 12, overflow: "hidden",
    borderWidth: 1, borderColor: BORDER,
    shadowColor: BORDER, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.4, shadowRadius: 4, elevation: 1,
  },
  accent: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
  timeBubble: {
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6,
    borderWidth: 1, minWidth: 56, flexShrink: 0, alignItems: "center",
  },
  timeText:  { fontSize: 15, fontFamily: "Inter_700Bold" },
  timeEnd:   { fontSize: 11, fontFamily: "Inter_500Medium", marginTop: 2 },
  jours:     { fontSize: 11, fontFamily: "Inter_600SemiBold", color: MUTED, marginTop: 1 },
  typeLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: DARK, flexShrink: 1 },
  recPill:   { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, flexShrink: 1, maxWidth: "100%" },
  recText:   { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  lieu:      { fontSize: 13, fontFamily: "Inter_500Medium", color: DARK, marginTop: 2 },
  adresse:   { fontSize: 11, fontFamily: "Inter_400Regular", color: MUTED },
  dateSpec:  { fontSize: 11, fontFamily: "Inter_500Medium", color: MUTED },
  note:      { fontSize: 11, fontFamily: "Inter_400Regular", color: MUTED, fontStyle: "italic" },
  actions:   { flexDirection: "column", gap: 6, alignSelf: "center" },
  actionBtn: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
});

// ─── Écran principal ──────────────────────────────────────────────────────────
export default function MassScheduleScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const { t: translate } = useI18n();
  const { parishId: requestedParishId } = useLocalSearchParams<{ parishId?: string }>();
  const { userParishId, canManage, loading: permLoading } = useParishPermissions(
    typeof requestedParishId === "string" ? requestedParishId : undefined,
  );
  const parishId = typeof requestedParishId === "string" ? requestedParishId : userParishId;

  const [schedules, setSchedules]     = useState<MassSchedule[]>([]);
  const [legacySchedules, setLegacySchedules] = useState<MassSchedule[]>([]);
  const [loading, setLoading]         = useState(true);
  const [modalVisible, setModal]      = useState(false);
  const [editing, setEditing]         = useState<MassSchedule | null>(null);
  const [activeFilter, setFilter]     = useState<TypeKey | null>(null);
  const [confirmItem, setConfirmItem] = useState<MassSchedule | null>(null);

  // ── Chargement temps réel ────────────────────────────────────────────────────
  useEffect(() => {
    if (!parishId) { setLoading(false); return; }

    const q = query(
      collection(db, "parishes", parishId, "massSchedules"),
      orderBy("jour"),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as MassSchedule));
        setSchedules(docs);
        setLoading(false);
      },
      () => setLoading(false),
    );
    const unsubParish = onSnapshot(
      doc(db, "parishes", parishId),
      (snap) => {
        const data = snap.data();
        const convert = (entry: LegacyMassScheduleEntry, index: number, prefix: string) => {
          const normalized = normalizeMassSchedule(entry, `${prefix}_${index}`);
          const days = normalized.mode === "specific"
            ? [normalized.day ?? "Dimanche"]
            : [normalized.day ?? "Dimanche"];
          return days.map((day, dayIndex) => {
            const itemId = `${prefix}_${index}_${dayIndex}`;
            return {
              id: itemId,
              parishId,
              lieu: normalized.location,
              adresse: normalized.address,
              jour: normalized.day ?? "Dimanche",
              jours: normalized.day ? [normalized.day] : [],
              heure: normalized.startTime,
              startTime: normalized.startTime,
              endTime: normalized.endTime,
              type: normalized.celebrationType,
              category: normalized.category,
              recurrence: normalized.mode === "specific" ? "unique" : "hebdomadaire",
              dateSpeciale: normalized.date,
              note: normalized.note,
              // Les tableaux du document paroisse (ancien format et imports)
              // sont conservés en lecture seule ; seuls les documents de la
              // sous-collection sont modifiables ici.
              legacy: true,
            } satisfies MassSchedule;
          });
        };
        const imported = (data?.massSchedules ?? []) as LegacyMassScheduleEntry[];
        const legacy = (data?.massSchedule ?? []) as LegacyMassScheduleEntry[];
        const converted = [
          ...imported.flatMap((entry, index) => convert(entry, index, "imported")),
          ...legacy.flatMap((entry, index) => {
            const days = entry.jours?.length ? entry.jours : [entry.day ?? "Dimanche"];
            return days.flatMap((day, dayIndex) => convert({ ...entry, day }, index * 10 + dayIndex, "legacy"));
          }),
        ];
        setLegacySchedules(converted);
      },
      () => setLegacySchedules([]),
    );
    return () => {
      unsub();
      unsubParish();
    };
  }, [parishId]);

  // ── Tri par jour + heure ─────────────────────────────────────────────────────
  const sorted = [...schedules, ...legacySchedules]
    .filter((s) => activeFilter === null || s.type === activeFilter)
    .sort((a, b) => {
      if (a.recurrence === "unique" || b.recurrence === "unique") {
        if (a.recurrence !== b.recurrence) return a.recurrence === "unique" ? -1 : 1;
        return `${a.dateSpeciale ?? ""}${a.startTime ?? a.heure}`.localeCompare(
          `${b.dateSpeciale ?? ""}${b.startTime ?? b.heure}`,
        );
      }
      const dayDiff = (JOUR_ORDER[a.jour] ?? 99) - (JOUR_ORDER[b.jour] ?? 99);
      return dayDiff !== 0 ? dayDiff : a.heure.localeCompare(b.heure);
    });

  // ── Sections par jour ────────────────────────────────────────────────────────
  // Un horaire multi-jours apparaît dans chaque section de ses jours
  const sections = JOURS.reduce<{ title: string; data: MassSchedule[] }[]>((acc, jour) => {
    const data = sorted.filter((s) => {
      const days = s.jours ?? [s.jour];
      return s.recurrence !== "unique" && days.includes(jour);
    });
    if (data.length > 0) acc.push({ title: jour, data });
    return acc;
  }, []);
  const specific = sorted.filter((s) => s.recurrence === "unique");
  if (specific.length > 0) sections.unshift({ title: "Dates précises", data: specific });

  // ── CRUD ─────────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async (form: FormState) => {
    if (!parishId) throw new Error("Paroisse introuvable.");
    const payload = {
      parishId,
      lieu:         form.lieu.trim(),
      adresse:      form.adresse.trim(),
      // rétrocompatibilité : jour = premier jour sélectionné, heure = heureDebut
      jour:         form.jours[0] ?? "Dimanche",
      heure:        form.heureDebut.trim(),
      // nouveaux champs
      jours:        form.jours,
      startTime:    form.heureDebut.trim(),
      endTime:      form.heureFin.trim() || null,
      type:         form.type,
      ...(form.type === "evenement" && form.category ? { category: form.category } : {}),
      recurrence:   form.recurrence,
      dateSpeciale: form.dateSpeciale.trim() || null,
      note:         form.note.trim() || null,
      updatedAt:    serverTimestamp(),
    };

    if (editing && !editing.legacy) {
      await updateDoc(doc(db, "parishes", parishId, "massSchedules", editing.id), payload);
    } else {
      await addDoc(collection(db, "parishes", parishId, "massSchedules"), {
        ...payload,
        createdAt: serverTimestamp(),
      });
    }
    setEditing(null);
  }, [parishId, editing]);

  const handleDelete = useCallback((item: MassSchedule) => {
    setConfirmItem(item);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!confirmItem || !parishId) return;
    if (confirmItem.legacy) {
      setConfirmItem(null);
      return;
    }
    try {
      await deleteDoc(doc(db, "parishes", parishId, "massSchedules", confirmItem.id));
    } catch {
      /* silent — user sees nothing deleted */
    } finally {
      setConfirmItem(null);
    }
  }, [confirmItem, parishId]);

  const openAdd = () => { setEditing(null); setModal(true); };
  const openEdit = (item: MassSchedule) => { setEditing(item); setModal(true); };

  // ── Chargement ───────────────────────────────────────────────────────────────
  if (permLoading || loading) {
    return (
      <View style={[s.root, { backgroundColor: BG }]}>
        <View style={[s.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Feather name="arrow-left" size={22} color={DARK} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Horaires des messes</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={s.center}><ActivityIndicator color={GOLD} /></View>
      </View>
    );
  }

  // ── Pas de paroisse ──────────────────────────────────────────────────────────
  if (!parishId) {
    return (
      <View style={[s.root, { backgroundColor: BG }]}>
        <View style={[s.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Feather name="arrow-left" size={22} color={DARK} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Horaires des messes</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={s.center}>
          <Feather name="map-pin" size={36} color={BORDER} />
          <Text style={s.emptyTitle}>Aucune paroisse</Text>
          <Text style={s.emptySub}>Rejoignez une paroisse pour consulter ses horaires.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.root, { backgroundColor: BG }]}>
      {/* En-tête */}
      <View style={[s.header, { backgroundColor: "#FFFFFF", borderBottomColor: BORDER, paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="arrow-left" size={22} color={DARK} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Horaires des messes</Text>
          {profile?.parishName ? (
            <Text style={s.headerSub}>{profile.parishName}</Text>
          ) : null}
        </View>
        {canManage && (
          <TouchableOpacity onPress={openAdd} style={s.addHeaderBtn} activeOpacity={0.85}>
            <Feather name="plus" size={18} color={DARK} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filtres par type */}
      <CompactFilterRow style={s.legend}>
        {/* Chip "Tout" */}
        <CompactFilterChip
          key="all"
          label="Tout"
          onPress={() => setFilter(null)}
          style={[
            s.legendChip,
            activeFilter === null
              ? { backgroundColor: GOLD, borderColor: GOLD }
              : { backgroundColor: CREAM, borderColor: BORDER },
          ]}
          textStyle={[s.legendText, { color: activeFilter === null ? DARK : MUTED }]}
          icon={<Feather name="grid" size={11} color={activeFilter === null ? DARK : MUTED} />}
        />

        {TYPES.map((t) => {
          const active = activeFilter === t.key;
          return (
            <CompactFilterChip
              key={t.key}
              label={translate(t.label)}
              onPress={() => setFilter(active ? null : t.key)}
              style={[
                s.legendChip,
                active
                  ? { backgroundColor: TYPE_COLOR[t.key], borderColor: TYPE_COLOR[t.key] }
                  : { backgroundColor: TYPE_COLOR[t.key] + "14", borderColor: TYPE_COLOR[t.key] + "44" },
              ]}
              textStyle={[s.legendText, { color: active ? "#fff" : TYPE_COLOR[t.key] }]}
              icon={<Feather name={t.icon as never} size={11} color={active ? "#fff" : TYPE_COLOR[t.key]} />}
            />
          );
        })}
      </CompactFilterRow>

      {/* Liste */}
      {sections.length === 0 ? (
        <View style={s.center}>
          <View style={[s.emptyIcon, { backgroundColor: GOLD + "14" }]}>
            <Feather name="clock" size={32} color={GOLD} />
          </View>
          <Text style={s.emptyTitle}>Aucun horaire publié</Text>
          <Text style={s.emptySub}>
            {canManage
              ? "Appuyez sur + pour ajouter le premier horaire de votre paroisse."
              : "Les horaires de votre paroisse n'ont pas encore été publiés."}
          </Text>
          {canManage && (
            <TouchableOpacity style={s.addEmptyBtn} onPress={openAdd} activeOpacity={0.85}>
              <Feather name="plus" size={16} color={DARK} />
              <Text style={s.addEmptyBtnText}>Ajouter un horaire</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>{section.title}</Text>
              <View style={s.sectionLine} />
            </View>
          )}
          renderItem={({ item }) => (
            <View style={{ marginBottom: 8 }}>
              <ScheduleCard
                item={item}
                canManage={canManage}
                onEdit={openEdit}
                onDelete={handleDelete}
              />
            </View>
          )}
        />
      )}

      {/* Bouton flottant pour canManage */}
      {canManage && sections.length > 0 && (
        <TouchableOpacity
          style={[s.fab, { bottom: insets.bottom + 20 }]}
          onPress={openAdd}
          activeOpacity={0.9}
        >
          <Feather name="plus" size={22} color={DARK} />
        </TouchableOpacity>
      )}

      {/* Info accès en lecture seule */}
      {!canManage && sections.length > 0 && (
        <View style={[s.readonlyBar, { paddingBottom: insets.bottom + 8 }]}>
          <Feather name="eye" size={13} color={GOLD} />
          <Text style={s.readonlyText}>Lecture seule — géré par le prêtre ou les admins de la paroisse</Text>
        </View>
      )}

      <ScheduleModal
        visible={modalVisible}
        onClose={() => { setModal(false); setEditing(null); }}
        onSave={handleSave}
        initial={editing}
      />

      {/* Modal confirmation suppression */}
      <Modal
        visible={confirmItem !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmItem(null)}
      >
        <View style={s.confirmOverlay}>
          <View style={s.confirmBox}>
            <View style={s.confirmIconWrap}>
              <Feather name="trash-2" size={24} color={RED} />
            </View>
            <Text style={s.confirmTitle}>Supprimer cet horaire ?</Text>
            {confirmItem && (
              <Text style={s.confirmSub}>
                {TYPES.find((t) => t.key === confirmItem.type)?.label ?? confirmItem.type}
                {" · "}
                {confirmItem.jour}
                {" à "}
                {confirmItem.heure}
                {"\n"}
                {confirmItem.lieu}
              </Text>
            )}
            <TouchableOpacity
              style={s.confirmDeleteBtn}
              onPress={confirmDelete}
              activeOpacity={0.85}
            >
              <Text style={s.confirmDeleteText}>Supprimer définitivement</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.confirmCancelBtn}
              onPress={() => setConfirmItem(null)}
              activeOpacity={0.75}
            >
              <Text style={s.confirmCancelText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles principaux ────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 1,
  },
  backBtn:    { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  headerTitle:{ flex: 1, fontSize: 17, fontFamily: "Inter_600SemiBold", color: DARK },
  headerSub:  { fontSize: 11, fontFamily: "Inter_400Regular", color: MUTED, marginTop: 1 },
  addHeaderBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: GOLD, alignItems: "center", justifyContent: "center",
  },
  legend:     { flexShrink: 0, borderBottomWidth: 1, borderBottomColor: BORDER },
  legendChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1,
  },
  legendText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8, marginBottom: 10 },
  sectionTitle:  { fontSize: 13, fontFamily: "Inter_700Bold", color: GOLD, textTransform: "uppercase", letterSpacing: 0.8 },
  sectionLine:   { flex: 1, height: 1, backgroundColor: BORDER },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 12 },
  emptyIcon: { width: 70, height: 70, borderRadius: 35, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: DARK },
  emptySub:   { fontSize: 13, fontFamily: "Inter_400Regular", color: MUTED, textAlign: "center", lineHeight: 20 },
  addEmptyBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: GOLD, borderRadius: 14,
    paddingHorizontal: 20, paddingVertical: 12, marginTop: 8,
  },
  addEmptyBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", color: DARK },
  fab: {
    position: "absolute", right: 20,
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: GOLD, alignItems: "center", justifyContent: "center",
    shadowColor: GOLD, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
  readonlyBar: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: CREAM, borderTopWidth: 1, borderTopColor: BORDER,
    paddingHorizontal: 16, paddingTop: 8,
  },
  readonlyText: { fontSize: 11, fontFamily: "Inter_400Regular", color: MUTED },

  // ── Confirm delete modal ────────────────────────────────────────────────────
  confirmOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center", justifyContent: "center",
    paddingHorizontal: 32,
  },
  confirmBox: {
    backgroundColor: "#fff", borderRadius: 20,
    paddingHorizontal: 24, paddingVertical: 28,
    alignItems: "center", gap: 10, width: "100%",
  },
  confirmIconWrap: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: RED + "12", alignItems: "center", justifyContent: "center",
    marginBottom: 4,
  },
  confirmTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: DARK, textAlign: "center" },
  confirmSub:   { fontSize: 13, fontFamily: "Inter_400Regular", color: MUTED, textAlign: "center", lineHeight: 20, marginBottom: 6 },
  confirmDeleteBtn: {
    backgroundColor: RED, borderRadius: 12,
    paddingVertical: 13, paddingHorizontal: 20,
    alignItems: "center", width: "100%",
  },
  confirmDeleteText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
  confirmCancelBtn: {
    paddingVertical: 10, paddingHorizontal: 20,
    alignItems: "center", width: "100%",
  },
  confirmCancelText: { fontSize: 14, fontFamily: "Inter_500Medium", color: MUTED },
});
