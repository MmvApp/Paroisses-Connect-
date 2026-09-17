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
  Alert,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
  RefreshControl,
  Switch,
  Dimensions,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { TimePickerField } from "@/components/ui/TimePickerField";
import * as Haptics from "expo-haptics";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/context/I18nContext";
import type { UserProfile } from "@/context/AuthContext";
import { useParishPermissions } from "@/hooks/useParishPermissions";
import { canDeletePublication } from "@/lib/publicationPermissions";
import { Avatar } from "@/components/ui/Avatar";
import { PublicationCard } from "@/components/ui/PublicationCard";
import { CompactFilterChip, CompactFilterRow } from "@/components/ui/CompactFilterRow";
import { PublicationPhotoPicker } from "@/components/ui/PublicationPhotoPicker";
import { normalizePublicationImageUrls, uploadPublicationImages } from "@/lib/publicationMedia";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { GuestBanner } from "@/components/ui/GuestBanner";
import { sendPushToParish } from "@/lib/pushNotifications";
import {
  normalizeMassSchedules,
  sortMassSchedules,
  type LegacyMassScheduleEntry,
  type MassScheduleEntry,
} from "@/lib/massSchedules";
import {
  EVENT_CATEGORIES,
  getMassScheduleAgendaCategory,
  normalizeEventCategory,
  type EventCategory,
} from "@/lib/eventCategories";

// ─── Palette ──────────────────────────────────────────────────────────────────
const NAVY  = "#C9A24A";
const DARK  = "#111111";
const MUTED_TEXT = "#666666";
const GOLD  = "#C9A24A";
const CREAM = "#FFF8EC";
const RED   = "#D32F2F";
const GREEN = "#16A34A";

const { width: SCREEN_W } = Dimensions.get("window");

// ─── Constants ────────────────────────────────────────────────────────────────
const FILTER_CATS = ["Tous", ...EVENT_CATEGORIES] as const;

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ParishEvent {
  id: string;
  title: string;
  description: string;
  date: { seconds: number } | null;
  startTime: string;
  endTime: string;
  location: string;
  address?: string;
  category: EventCategory | string;
  imageUrl?: string | null;
  imageUrls?: string[];
  maxParticipants?: number | null;
  participants: string[];
  participantCount: number;
  createdAt: { seconds: number } | null;
  authorId: string;
  authorName: string;
  parishId?: string | null;
  parishName?: string;
  isPinned?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isSameDay(d1: Date, d2: Date) {
  return d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();
}

function eventBadges(ev: ParishEvent) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today.getTime() + 86400000);
  const evDate = ev.date ? new Date(ev.date.seconds * 1000) : null;
  const createdAt = ev.createdAt ? new Date(ev.createdAt.seconds * 1000) : null;

  return {
    isToday:    evDate ? isSameDay(evDate, today) : false,
    isTomorrow: evDate ? isSameDay(evDate, tomorrow) : false,
    isNew:      createdAt ? (now.getTime() - createdAt.getTime()) < 86400000 : false,
    isFull:     !!ev.maxParticipants && ev.participantCount >= ev.maxParticipants,
  };
}

function fmtDate(seconds: number) {
  const d = new Date(seconds * 1000);
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function fmtShortDate(seconds: number) {
  const d = new Date(seconds * 1000);
  return {
    day:   d.getDate().toString().padStart(2, "0"),
    month: d.toLocaleDateString("fr-FR", { month: "short" }).toUpperCase(),
    year:  d.getFullYear().toString(),
    dow:   d.toLocaleDateString("fr-FR", { weekday: "short" }).toUpperCase(),
  };
}

function dateToYMD(d: Date) {
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
}

// ════════════════════════════════════════════════════════════════════════════
//  DATE PICKER FIELD (cross-platform)
// ════════════════════════════════════════════════════════════════════════════
function DatePickerField({
  label,
  date,
  onChange,
}: {
  label: string;
  date: Date;
  onChange: (d: Date) => void;
}) {
  const [show, setShow] = useState(false);

  const handleChange = (_: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === "android") setShow(false);
    if (selected) onChange(selected);
  };

  if (Platform.OS === "web") {
    return (
      <View style={fp.wrapper}>
        <Text style={fp.label}>{label}</Text>
        <TextInput
          style={fp.webInput}
          value={dateToYMD(date)}
          onChangeText={(v) => {
            const d = new Date(v);
            if (!isNaN(d.getTime())) onChange(d);
          }}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#9AA3B0"
        />
      </View>
    );
  }

  return (
    <View style={fp.wrapper}>
      <Text style={fp.label}>{label}</Text>
      <TouchableOpacity style={fp.btn} onPress={() => setShow(true)} activeOpacity={0.8}>
        <Feather name="calendar" size={16} color={GOLD} />
        <Text style={fp.btnText}>
          {date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "long", year: "numeric" })}
        </Text>
        <Feather name="chevron-down" size={16} color="#9AA3B0" />
      </TouchableOpacity>
      {show && (
        Platform.OS === "ios" ? (
          <Modal transparent animationType="slide">
            <View style={fp.pickerModal}>
              <View style={fp.pickerSheet}>
                <View style={fp.pickerHeader}>
                  <Text style={fp.pickerTitle}>{label}</Text>
                  <TouchableOpacity onPress={() => setShow(false)}>
                    <Text style={fp.pickerDone}>Valider</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={date}
                  mode="date"
                  display="spinner"
                  locale="fr-FR"
                  onChange={handleChange}
                  minimumDate={new Date()}
                />
              </View>
            </View>
          </Modal>
        ) : (
          <DateTimePicker
            value={date}
            mode="date"
            display="default"
            locale="fr-FR"
            onChange={handleChange}
            minimumDate={new Date()}
          />
        )
      )}
    </View>
  );
}

const fp = StyleSheet.create({
  wrapper: { marginBottom: 14 },
  label: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#7A7A8A", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 },
  btn: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1.5, borderColor: "#E5E0D8", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13 },
  btnText: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium", color: DARK },
  webInput: { borderWidth: 1.5, borderColor: "#E5E0D8", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: "Inter_500Medium", color: DARK },
  pickerModal: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  pickerSheet: { backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 20 },
  pickerHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#F0EDE8" },
  pickerTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: DARK },
  pickerDone: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: GOLD },
});

// ════════════════════════════════════════════════════════════════════════════
//  EVENT FORM MODAL  (create + edit)
// ════════════════════════════════════════════════════════════════════════════
interface EventFormProps {
  visible: boolean;
  onClose: () => void;
  existing?: ParishEvent | null;
}

function EventFormModal({ visible, onClose, existing }: EventFormProps) {
  const { user, profile } = useAuth();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { canManage: isPrivileged } = useParishPermissions();
  const isEdit = !!existing;

  const [title, setTitle]         = useState("");
  const [description, setDesc]    = useState("");
  const [eventDate, setEventDate] = useState(new Date());
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime]     = useState("12:00");
  const [location, setLocation]   = useState("");
  const [address, setAddress]     = useState("");
  const [category, setCategory]   = useState<EventCategory>("Messe");
  const [maxPart, setMaxPart]     = useState("");
  const [imageUris, setImageUris] = useState<string[]>([]);
  const [existingImageUrls, setExistingImageUrls] = useState<string[]>([]);
  const [isPinned, setIsPinned]   = useState(false);
  const [posting, setPosting]     = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors]       = useState<Record<string, string>>({});

  // Pre-fill when editing
  useEffect(() => {
    if (!visible) return;
    if (existing) {
      setTitle(existing.title);
      setDesc(existing.description);
      setEventDate(existing.date ? new Date(existing.date.seconds * 1000) : new Date());
      setStartTime(existing.startTime ?? "10:00");
      setEndTime(existing.endTime ?? "12:00");
      setLocation(existing.location);
      setAddress(existing.address ?? "");
      setCategory((existing.category as EventCategory) ?? "Messe");
      setMaxPart(existing.maxParticipants ? String(existing.maxParticipants) : "");
      setExistingImageUrls(normalizePublicationImageUrls(existing));
      setIsPinned(existing.isPinned ?? false);
      setImageUris([]);
    } else {
      setTitle(""); setDesc(""); setEventDate(new Date());
      setStartTime("10:00"); setEndTime("12:00");
      setLocation(""); setAddress(""); setCategory("Messe");
      setMaxPart(""); setImageUris([]); setExistingImageUrls([]);
      setIsPinned(false);
    }
    setErrors({});
    setPosting(false);
  }, [visible, existing]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = "Titre requis.";
    if (!description.trim()) e.description = "Description requise.";
    if (!location.trim()) e.location = "Lieu requis.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setPosting(true);
    try {
      let imageUrls = [...existingImageUrls];
      if (imageUris.length > 0) {
        setUploading(true);
        try {
          imageUrls = [
            ...imageUrls,
            ...(await uploadPublicationImages(imageUris, "events")),
          ].slice(0, 2);
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

      const payload = {
        title: title.trim(),
        description: description.trim(),
        date: eventDate,
        startTime: startTime.trim(),
        endTime: endTime.trim(),
        location: location.trim(),
        address: address.trim() || null,
        category,
        imageUrls,
        imageUrl: imageUrls[0] ?? null,
        maxParticipants: maxPart.trim() ? parseInt(maxPart, 10) : null,
        isPinned,
        parishName: profile?.parishName ?? null,
        authorName: profile?.displayName ?? "Anonyme",
          parishId: profile?.parishId ?? profile?.priestParishId ?? null,
      };

      if (isEdit && existing) {
        await updateDoc(doc(db, "events", existing.id), payload);
      } else {
        const eventRef = await addDoc(collection(db, "events"), {
          ...payload,
          authorId: user?.uid,
          participants: [],
          participantCount: 0,
          createdAt: serverTimestamp(),
        });
        // Notification push aux membres de la paroisse (fire-and-forget)
        if (profile?.parishId) {
          void sendPushToParish(
            profile.parishId,
            `📅 ${title.trim()}`,
            location.trim() || "Nouvel événement",
             { screen: "/(tabs)/events", eventId: eventRef.id },
            "events",
            user?.uid
          );
        }
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    } catch {
      Alert.alert("Erreur", "Impossible de sauvegarder l'événement.");
      setPosting(false);
    }
  };

  const canSubmit = title.trim() && description.trim() && location.trim() && !posting;
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: "#fff" }} behavior={Platform.OS === "ios" ? "padding" : "height"}>

        {/* Header */}
        <View style={[ef.header, { paddingTop: insets.top + 4 }]}>
          <TouchableOpacity onPress={onClose} style={{ padding: 6 }}>
            <Feather name="x" size={22} color={DARK} />
          </TouchableOpacity>
          <Text style={ef.headerTitle}>{isEdit ? "Modifier l'événement" : "Nouvel événement"}</Text>
          <TouchableOpacity
            style={[ef.saveBtn, !canSubmit && { opacity: 0.45 }]}
            onPress={handleSubmit}
            disabled={!canSubmit}
            activeOpacity={0.8}
          >
            {posting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={ef.saveBtnText}>{isEdit ? "Enregistrer" : "Publier"}</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={[ef.body, { paddingBottom: insets.bottom + 50 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <PublicationPhotoPicker
            localUris={imageUris}
            existingUrls={existingImageUrls}
            onLocalUrisChange={setImageUris}
            onExistingUrlsChange={setExistingImageUrls}
            disabled={posting}
            uploading={uploading}
          />

          {/* Titre */}
          <Text style={ef.label}>Titre *</Text>
          <TextInput
            style={[ef.input, errors.title ? ef.inputErr : null]}
            value={title}
            onChangeText={(v) => { setTitle(v); if (v.trim()) setErrors((e) => ({ ...e, title: "" })); }}
            placeholder="Nom de l'événement…"
            placeholderTextColor="#9AA3B0"
            maxLength={120}
          />
          {errors.title ? <Text style={ef.errText}>{errors.title}</Text> : null}

          {/* Description */}
          <Text style={ef.label}>Description *</Text>
          <TextInput
            style={[ef.textarea, errors.description ? ef.inputErr : null]}
            value={description}
            onChangeText={(v) => { setDesc(v); if (v.trim()) setErrors((e) => ({ ...e, description: "" })); }}
            placeholder="Décrivez l'événement…"
            placeholderTextColor="#9AA3B0"
            multiline
            textAlignVertical="top"
          />
          {errors.description ? <Text style={ef.errText}>{errors.description}</Text> : null}

          {/* Date */}
          <DatePickerField label="Date *" date={eventDate} onChange={setEventDate} />

          {/* Horaires */}
          <View style={ef.timeRow}>
            <TimePickerField
              label="Heure de début"
              value={startTime}
              onChange={setStartTime}
              placeholder="10:00"
              containerStyle={{ flex: 1, marginBottom: 0 }}
            />
            <View style={ef.timeSep}><Text style={ef.timeSepText}>→</Text></View>
            <TimePickerField
              label="Heure de fin"
              value={endTime}
              onChange={setEndTime}
              placeholder="12:00"
              containerStyle={{ flex: 1, marginBottom: 0 }}
            />
          </View>

          {/* Lieu */}
          <Text style={ef.label}>Lieu *</Text>
          <TextInput
            style={[ef.input, errors.location ? ef.inputErr : null]}
            value={location}
            onChangeText={(v) => { setLocation(v); if (v.trim()) setErrors((e) => ({ ...e, location: "" })); }}
            placeholder="Église Saint-Pierre…"
            placeholderTextColor="#9AA3B0"
          />
          {errors.location ? <Text style={ef.errText}>{errors.location}</Text> : null}

          {/* Adresse */}
          <Text style={ef.label}>Adresse</Text>
          <TextInput
            style={ef.input}
            value={address}
            onChangeText={setAddress}
            placeholder="12 rue de la Paix, 75001 Paris"
            placeholderTextColor="#9AA3B0"
          />

          {/* Catégorie */}
          <Text style={ef.label}>Catégorie</Text>
          <CompactFilterRow style={{ marginBottom: 16 }}>
            {EVENT_CATEGORIES.map((cat) => (
              <CompactFilterChip
                key={cat}
                 label={t(cat)}
                onPress={() => setCategory(cat)}
                style={[ef.chip, { backgroundColor: category === cat ? NAVY : "#FFF8EC" }]}
                textStyle={[ef.chipText, { color: category === cat ? "#111111" : "#666666" }]}
              />
            ))}
          </CompactFilterRow>

          {/* Max participants */}
          <Text style={ef.label}>Nombre maximum de participants (optionnel)</Text>
          <TextInput
            style={ef.input}
            value={maxPart}
            onChangeText={setMaxPart}
            placeholder="Illimité si vide…"
            placeholderTextColor="#9AA3B0"
            keyboardType="number-pad"
          />

          {/* Options (admin/priest) */}
          {isPrivileged && (
            <View style={ef.optCard}>
              <View style={ef.optRow}>
                <View style={ef.optLeft}>
                  <View style={[ef.optIcon, { backgroundColor: GOLD + "22" }]}>
                    <Feather name="bookmark" size={15} color={GOLD} />
                  </View>
                  <View>
                    <Text style={ef.optLabel}>Épingler cet événement</Text>
                    <Text style={ef.optHint}>Il apparaîtra en haut du fil</Text>
                  </View>
                </View>
                <Switch
                  value={isPinned}
                  onValueChange={setIsPinned}
                  trackColor={{ false: "#E0E0E0", true: GOLD + "88" }}
                  thumbColor={isPinned ? GOLD : "#fff"}
                />
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const ef = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: "#F0EDE8", backgroundColor: "#fff",
  },
  headerTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: DARK },
  saveBtn: { backgroundColor: NAVY, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, minWidth: 90, alignItems: "center" },
  saveBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#111111" },
  body: { paddingHorizontal: 20, paddingTop: 20 },
  label: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#7A7A8A", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 },
  input: { borderWidth: 1.5, borderColor: "#E5E0D8", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: "Inter_400Regular", color: DARK, marginBottom: 14 },
  textarea: { borderWidth: 1.5, borderColor: "#E5E0D8", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: "Inter_400Regular", color: "#3A4A60", minHeight: 110, marginBottom: 14, lineHeight: 22 },
  inputErr: { borderColor: "#dc2626" },
  errText: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#dc2626", marginBottom: 8, marginTop: -10 },
  timeRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  timeSep: { paddingTop: 32 },
  timeSepText: { fontSize: 18, color: "#9AA3B0" },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, marginRight: 8 },
  chipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  imgPicker: { borderWidth: 2, borderColor: "#E5E0D8", borderStyle: "dashed", borderRadius: 14, paddingVertical: 28, alignItems: "center", gap: 8, backgroundColor: "#FAFAFA", marginBottom: 16 },
  imgPickerLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#7A7A8A" },
  imgPickerHint: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#9AA3B0" },
  imgWrap: { borderRadius: 14, overflow: "hidden", marginBottom: 16 },
  imgPreview: { width: "100%", height: 180 },
  removeImg: { position: "absolute", top: 10, right: 10, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 16, width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  optCard: { borderWidth: 1.5, borderColor: "#E5E0D8", borderRadius: 14, overflow: "hidden", marginTop: 4 },
  optRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 14 },
  optLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  optIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  optLabel: { fontSize: 14, fontFamily: "Inter_500Medium", color: DARK },
  optHint: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#9AA3B0", marginTop: 1 },
});

// ════════════════════════════════════════════════════════════════════════════
//  EVENT CARD
// ════════════════════════════════════════════════════════════════════════════
export function EventCard({
  item,
  index,
  currentUid,
  currentRole,
  currentParishId,
  isPrivileged,
  isAuthor,
  onEdit,
}: {
  item: ParishEvent;
  index: number;
  currentUid: string | undefined;
  currentRole: UserProfile["role"] | undefined;
  currentParishId: string | null | undefined;
  isPrivileged: boolean;
  isAuthor: boolean;
  onEdit: (ev: ParishEvent) => void;
}) {
  const badges = eventBadges(item);
  const isParticipating = currentUid ? (item.participants ?? []).includes(currentUid) : false;
  const isFull = !!item.maxParticipants && item.participantCount >= item.maxParticipants;
  const canAct = isPrivileged || isAuthor;
  const canDelete = canDeletePublication(
    { userId: currentUid, role: currentRole, parishId: currentParishId },
    item,
  );


  const dateInfo = item.date ? fmtShortDate(item.date.seconds) : null;

  const handleParticipate = async () => {
    if (!currentUid || (isFull && !isParticipating)) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await updateDoc(doc(db, "events", item.id), {
      participants: isParticipating ? arrayRemove(currentUid) : arrayUnion(currentUid),
      participantCount: increment(isParticipating ? -1 : 1),
    });
  };

  const [showActionsSheet, setShowActionsSheet] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const { requireAuth } = useRequireAuth();

  React.useEffect(() => {
    if (!showActionsSheet) setConfirmingDelete(false);
  }, [showActionsSheet]);

  const handleMoreOptions = () => {
    if (canAct || isPrivileged) setShowActionsSheet(true);
  };

  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 6) * 50).duration(360)} style={ec.wrapper}>
      {item.isPinned && (
        <View style={ec.pinnedBanner}>
          <Feather name="bookmark" size={11} color={GOLD} />
          <Text style={ec.pinnedText}>Épinglé</Text>
        </View>
      )}

      <PublicationCard
        imageUrls={normalizePublicationImageUrls(item)}
        category={item.category}
        badges={[
          ...(badges.isToday ? [{ label: "AUJOURD'HUI", color: NAVY }] : []),
          ...(badges.isTomorrow ? [{ label: "DEMAIN", color: "#7C3AED" }] : []),
          ...(badges.isNew ? [{ label: "NOUVEAU", color: GREEN }] : []),
          ...(badges.isFull ? [{ label: "COMPLET", color: RED }] : []),
        ]}
        timeLabel={item.date ? fmtDate(item.date.seconds) : "Date à confirmer"}
        title={item.title}
        body={item.description}
        authorName={item.authorName || item.parishName || ""}
        topRight={
          canAct ? (
            <TouchableOpacity
              onPress={handleMoreOptions}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ backgroundColor: "rgba(0,0,0,0.35)", borderRadius: 14, padding: 4 }}
            >
              <Feather name="more-horizontal" size={18} color="#fff" />
            </TouchableOpacity>
          ) : undefined
        }
        style={item.isPinned ? { borderTopLeftRadius: 0, borderTopRightRadius: 0 } : undefined}
        footer={
          <View style={{ gap: 8 }}>
            <View style={ec.metaRow}>
              <Feather name="clock" size={13} color={GOLD} />
              <Text style={ec.metaText}>
                {item.date ? fmtDate(item.date.seconds) : "Date à confirmer"}
                {item.startTime ? `  ·  ${item.startTime}${item.endTime ? ` – ${item.endTime}` : ""}` : ""}
              </Text>
            </View>
            <View style={ec.metaRow}>
              <Feather name="map-pin" size={13} color={GOLD} />
              <Text style={ec.metaText} numberOfLines={1}>
                {item.location}{item.address ? `, ${item.address}` : ""}
              </Text>
            </View>
            <View style={ec.participantsRow}>
              <View style={ec.participantsLeft}>
                <Feather name="users" size={14} color={GOLD} />
                <Text style={ec.participantsText}>
                  <Text style={{ fontFamily: "Inter_700Bold" }}>{item.participantCount}</Text>
                  {item.maxParticipants ? ` / ${item.maxParticipants} participants` : " participant(s)"}
                </Text>
              </View>
              {item.participantCount > 0 && (
                <Text style={ec.participantsHint}>{item.participantCount > 1 ? "Rejoignez-les !" : "Soyez le 2e !"}</Text>
              )}
            </View>
            <TouchableOpacity
              style={[ec.participateBtn, isParticipating && ec.participateBtnActive, isFull && !isParticipating && ec.participateBtnFull]}
              onPress={() => requireAuth(handleParticipate)}
              disabled={isFull && !isParticipating}
              activeOpacity={0.82}
            >
              <Feather name={isParticipating ? "check-circle" : isFull ? "x-circle" : "user-plus"} size={16} color={isParticipating ? GREEN : isFull ? "#9AA3B0" : "#fff"} />
              <Text style={[ec.participateBtnText, isParticipating && { color: GREEN }, isFull && !isParticipating && { color: "#9AA3B0" }]}>
                {isParticipating ? "Je participe déjà ✓" : isFull ? "Complet" : "Je participe"}
              </Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* ── Actions sheet (⋯ menu) — sans Alert.alert, fonctionne iOS/Android/Web ── */}
      <Modal
        visible={showActionsSheet}
        animationType="slide"
        transparent
        presentationStyle="overFullScreen"
        onRequestClose={() => setShowActionsSheet(false)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }}
          activeOpacity={1}
          onPress={() => setShowActionsSheet(false)}
        />
        <View style={ec.actionsSheet}>
          <View style={ec.actionsHandle} />

          {confirmingDelete ? (
            <>
              <View style={ec.confirmHeader}>
                <Feather name="alert-triangle" size={17} color="#D32F2F" />
              <Text style={ec.confirmTitle}>Voulez-vous vraiment supprimer cette publication ?</Text>
              </View>
              <Text style={ec.confirmSub}>« {item.title} » sera définitivement supprimé.</Text>
              <TouchableOpacity
                style={[ec.actionItem, { backgroundColor: "#D32F2F", borderRadius: 12, justifyContent: "center" }]}
                onPress={async () => {
                  setShowActionsSheet(false);
                  try { await deleteDoc(doc(db, "events", item.id)); }
                  catch { Alert.alert("Erreur", "Impossible de supprimer. Réessayez."); }
                }}
                activeOpacity={0.8}
              >
                <Feather name="trash-2" size={18} color="#fff" />
                <Text style={[ec.actionLabel, { color: "#fff" }]}>Oui, supprimer définitivement</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[ec.actionItem, { backgroundColor: "#F3F4F6", borderRadius: 12, justifyContent: "center" }]}
                onPress={() => setConfirmingDelete(false)}
                activeOpacity={0.8}
              >
                <Text style={[ec.actionLabel, { color: "#111" }]}>Annuler</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {isPrivileged && (
                <TouchableOpacity
                  style={ec.actionItem}
                  onPress={() => {
                    setShowActionsSheet(false);
                    updateDoc(doc(db, "events", item.id), { isPinned: !item.isPinned });
                  }}
                  activeOpacity={0.75}
                >
                  <Feather name="bookmark" size={19} color="#C9A24A" />
                  <Text style={[ec.actionLabel, { color: "#C9A24A" }]}>
                    {item.isPinned ? "Désépingler" : "Épingler"}
                  </Text>
                </TouchableOpacity>
              )}
              {canAct && (
                <TouchableOpacity
                  style={ec.actionItem}
                  onPress={() => { setShowActionsSheet(false); setTimeout(() => onEdit(item), 250); }}
                  activeOpacity={0.75}
                >
                  <Feather name="edit-2" size={19} color="#111" />
                  <Text style={ec.actionLabel}>Modifier</Text>
                </TouchableOpacity>
              )}
              {canDelete && (
                <TouchableOpacity
                  style={ec.actionItem}
                  onPress={() => setConfirmingDelete(true)}
                  activeOpacity={0.75}
                >
                  <Feather name="trash-2" size={19} color="#D32F2F" />
                  <Text style={[ec.actionLabel, { color: "#D32F2F" }]}>Supprimer</Text>
                </TouchableOpacity>
              )}
              <View style={{ height: 8 }} />
              <TouchableOpacity
                style={[ec.actionItem, { justifyContent: "center" }]}
                onPress={() => setShowActionsSheet(false)}
                activeOpacity={0.75}
              >
                <Text style={ec.cancelLabel}>Annuler</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </Modal>
    </Animated.View>
  );
}

const ec = StyleSheet.create({
  // Actions sheet styles
  actionsSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    paddingHorizontal: 16,
    paddingBottom: 28,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 12,
  },
  actionsHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: "#DADDE3", alignSelf: "center", marginBottom: 14,
  },
  actionItem: {
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingVertical: 15, paddingHorizontal: 6,
    borderBottomWidth: 1, borderBottomColor: "#F3F4F6",
  },
  actionLabel: { fontSize: 16, fontFamily: "Inter_500Medium", color: "#111" },
  cancelLabel: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#7A7A8A" },
  confirmHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 8, paddingBottom: 4 },
  confirmTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#D32F2F" },
  confirmSub: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#7A7A8A", marginBottom: 16, paddingHorizontal: 2 },

  wrapper: { marginBottom: 14 },
  pinnedBanner: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: GOLD + "18", paddingHorizontal: 14, paddingVertical: 6, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  pinnedText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: GOLD },
  card: { width: "100%", maxWidth: "100%", minWidth: 0, backgroundColor: "#fff", borderRadius: 16, shadowColor: "#EADFCB", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.5, shadowRadius: 10, elevation: 3, overflow: "hidden", borderWidth: 1, borderColor: "#EADFCB" },
  cardPinned: { borderTopLeftRadius: 0, borderTopRightRadius: 0, borderWidth: 1.5, borderTopWidth: 0, borderColor: GOLD + "40" },

  // Image header
  imgWrap: { width: "100%", maxWidth: "100%", minWidth: 0, height: 200, position: "relative" },
  img: { width: "100%", maxWidth: "100%", height: "100%" },
  imgOverlay: { position: "absolute", bottom: 0, left: 0, right: 0, height: 80, backgroundColor: "rgba(0,0,0,0.35)" },
  imgDateBox: { position: "absolute", bottom: 14, left: 14, backgroundColor: GOLD, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, alignItems: "center" },
  imgDateDay: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#fff", lineHeight: 26 },
  imgDateMonth: { fontSize: 10, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.85)", letterSpacing: 0.5 },
  imgMoreBtn: { position: "absolute", top: 12, right: 12, backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 16, width: 34, height: 34, alignItems: "center", justifyContent: "center" },

  // Text-only header
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, paddingBottom: 8, minWidth: 0, borderBottomWidth: 1, borderBottomColor: "#F5F3EF" },
  dateBox: { width: 54, flexShrink: 0, alignItems: "center", backgroundColor: NAVY, borderRadius: 12, paddingVertical: 8 },
  dateDay: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#111111", lineHeight: 26 },
  dateMonth: { fontSize: 10, fontFamily: "Inter_700Bold", color: GOLD, letterSpacing: 0.5 },
  dateYear: { fontSize: 10, fontFamily: "Inter_400Regular", color: "#666666" },
  parishRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 2, minWidth: 0 },
  parishName: { fontSize: 12, fontFamily: "Inter_500Medium", color: GOLD, flexShrink: 1 },
  categoryText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: DARK },

  // Body
  body: { padding: 16, gap: 0, minWidth: 0 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeText: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#111111", letterSpacing: 0.4 },
  title: { fontSize: 18, fontFamily: "Inter_700Bold", color: DARK, lineHeight: 25, marginBottom: 10 },
  metaRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 6 },
  metaText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium", color: "#4B5563", lineHeight: 18 },
  description: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#374151", lineHeight: 21, marginTop: 8, marginBottom: 4 },
  readMore: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: GOLD, marginBottom: 4 },

  // Participants
  participantsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, marginBottom: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#F3F4F6" },
  participantsLeft: { flexDirection: "row", alignItems: "center", gap: 7 },
  participantsText: { fontSize: 13, fontFamily: "Inter_400Regular", color: MUTED_TEXT },
  participantsHint: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#9AA3B0" },

  // Button
  participateBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: NAVY, borderRadius: 24,
    paddingVertical: 13, paddingHorizontal: 20,
    shadowColor: "#EADFCB", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.5, shadowRadius: 8, elevation: 3,
  },
  participateBtnActive: { backgroundColor: GREEN + "18", borderWidth: 1.5, borderColor: GREEN + "44", shadowOpacity: 0 },
  participateBtnFull: { backgroundColor: "#F3F4F6", shadowOpacity: 0 },
  participateBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#111111" },
});

// ════════════════════════════════════════════════════════════════════════════
//  FILTER BAR
// ════════════════════════════════════════════════════════════════════════════
function FilterBar({ active, onChange }: { active: string; onChange: (c: string) => void }) {
  const { t } = useI18n();
  return (
    <CompactFilterRow style={{ backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#F0EDE8" }}>
      {FILTER_CATS.map((cat) => (
        <CompactFilterChip
          key={cat}
          label={t(cat)}
          onPress={() => onChange(cat)}
          style={{ backgroundColor: active === cat ? NAVY : "#FFF8EC" }}
          textStyle={{ color: active === cat ? "#111111" : "#666666" }}
        />
      ))}
    </CompactFilterRow>
  );
}

function MassScheduleAgenda({ schedules }: { schedules: MassScheduleEntry[] }) {
  if (schedules.length === 0) return null;
  const sorted = sortMassSchedules(schedules);

  return (
    <View style={agendaMass.wrap}>
      <View style={agendaMass.headingRow}>
        <View style={agendaMass.headingIcon}>
          <Feather name="clock" size={16} color={GOLD} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={agendaMass.heading}>Célébrations</Text>
          <Text style={agendaMass.subheading}>Horaires de la paroisse</Text>
        </View>
        <TouchableOpacity onPress={() => router.push("/mass-schedule")} activeOpacity={0.75}>
          <Text style={agendaMass.manage}>Voir tout</Text>
        </TouchableOpacity>
      </View>
      {sorted.map((schedule) => {
        const agendaCategory = getMassScheduleAgendaCategory({
          celebrationType: schedule.celebrationType,
          category: schedule.category,
        });
        const displayType = agendaCategory && normalizeEventCategory(schedule.celebrationType) === null
          ? agendaCategory
          : schedule.celebrationType;
        const dateLabel = schedule.mode === "specific" && schedule.date
          ? new Date(`${schedule.date}T12:00:00`).toLocaleDateString("fr-FR", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })
          : schedule.day ?? "Jour à préciser";
        return (
          <View key={schedule.id} style={agendaMass.card}>
            <View style={agendaMass.timeBox}>
              <Text style={agendaMass.time}>{schedule.startTime || "—"}</Text>
              {schedule.endTime ? <Text style={agendaMass.endTime}>→ {schedule.endTime}</Text> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={agendaMass.type}>{displayType}</Text>
              <Text style={agendaMass.date}>{dateLabel}</Text>
              <View style={agendaMass.locationRow}>
                <Feather name="map-pin" size={12} color={GOLD} />
                <Text style={agendaMass.location} numberOfLines={2}>
                  {schedule.location}
                  {schedule.address ? ` · ${schedule.address}` : ""}
                </Text>
              </View>
              {schedule.note ? <Text style={agendaMass.note}>{schedule.note}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const agendaMass = StyleSheet.create({
  wrap: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#EADFCB",
    padding: 12,
    marginBottom: 12,
  },
  headingRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  headingIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: GOLD + "18", alignItems: "center", justifyContent: "center" },
  heading: { fontSize: 15, fontFamily: "Inter_700Bold", color: DARK },
  subheading: { fontSize: 11, fontFamily: "Inter_400Regular", color: MUTED_TEXT, marginTop: 1 },
  manage: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: GOLD },
  card: { flexDirection: "row", gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: "#F0EDE8" },
  timeBox: { minWidth: 58, borderRadius: 9, backgroundColor: GOLD + "16", paddingVertical: 6, alignItems: "center", alignSelf: "flex-start" },
  time: { fontSize: 14, fontFamily: "Inter_700Bold", color: GOLD },
  endTime: { fontSize: 10, fontFamily: "Inter_500Medium", color: GOLD, marginTop: 2 },
  type: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: DARK },
  date: { fontSize: 11, fontFamily: "Inter_500Medium", color: MUTED_TEXT, marginTop: 2, textTransform: "capitalize" },
  locationRow: { flexDirection: "row", alignItems: "flex-start", gap: 4, marginTop: 4 },
  location: { flex: 1, fontSize: 11, lineHeight: 15, fontFamily: "Inter_500Medium", color: DARK },
  note: { fontSize: 11, fontFamily: "Inter_400Regular", color: MUTED_TEXT, fontStyle: "italic", marginTop: 3 },
});

// ════════════════════════════════════════════════════════════════════════════
//  MAIN SCREEN
// ════════════════════════════════════════════════════════════════════════════
export default function EventsScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const params = useLocalSearchParams<{ eventId?: string }>();
  const { canManage: isPrivileged } = useParishPermissions();
  const { requireAuth } = useRequireAuth();

  const [events, setEvents]           = useState<ParishEvent[]>([]);
  const [massSchedules, setMassSchedules] = useState<MassScheduleEntry[]>([]);
  const [activeCategory, setActiveCategory] = useState("Tous");
  const [refreshing, setRefreshing]   = useState(false);
  const [showForm, setShowForm]       = useState(false);
  const [editTarget, setEditTarget]   = useState<ParishEvent | null>(null);
  const feedRef = useRef<FlatList<ParishEvent>>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "events"), orderBy("date", "asc")),
      (snap) => setEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ParishEvent)))
    );
    return unsub;
  }, []);

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

  const filtered = (
    activeCategory === "Tous"
      ? [...events]
      : events.filter((e) => (normalizeEventCategory(e.category) ?? "Autre") === activeCategory)
  ).sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return 0;
  });
  const filteredMassSchedules = activeCategory === "Tous"
    ? massSchedules
    : massSchedules.filter((schedule) =>
        getMassScheduleAgendaCategory({
          celebrationType: schedule.celebrationType,
          category: schedule.category,
        }) === activeCategory
      );

  const openedNotification = useRef<string | null>(null);
  useEffect(() => {
    const eventId = typeof params.eventId === "string" ? params.eventId : undefined;
    if (!eventId) {
      openedNotification.current = null;
      return;
    }
    if (openedNotification.current === eventId) return;
    const index = filtered.findIndex((event) => event.id === eventId);
    if (index < 0) return;
    openedNotification.current = eventId;
    const timer = setTimeout(() => {
      feedRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.2 });
    }, 120);
    return () => clearTimeout(timer);
  }, [params.eventId, filtered]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 700);
  }, []);

  const openCreate = () => { setEditTarget(null); setShowForm(true); };
  const openEdit = (ev: ParishEvent) => { setEditTarget(ev); setShowForm(true); };

  return (
    <View style={ms.root}>
      {!user && <GuestBanner />}
      {/* Filter bar */}
      <Animated.View entering={FadeIn.duration(300)}>
        <FilterBar active={activeCategory} onChange={setActiveCategory} />
      </Animated.View>

      {/* List */}
      <FlatList
        ref={feedRef}
        data={filtered}
        keyExtractor={(e) => e.id}
        renderItem={({ item, index }) => (
          <EventCard
            item={item}
            index={index}
            currentUid={user?.uid}
            currentRole={profile?.role}
            currentParishId={profile?.parishId ?? profile?.priestParishId ?? null}
            isPrivileged={isPrivileged}
            isAuthor={item.authorId === user?.uid}
            onEdit={openEdit}
          />
        )}
        contentContainerStyle={{
          paddingTop: 12,
          paddingHorizontal: 12,
          paddingBottom: insets.bottom + 110,
        }}
        ListHeaderComponent={<MassScheduleAgenda schedules={filteredMassSchedules} />}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD} colors={[GOLD]} />
        }
        ListEmptyComponent={
            filteredMassSchedules.length > 0 ? null : <View style={ms.empty}>
            <View style={ms.emptyCircle}>
              <Feather name="calendar" size={42} color="#C5CDD8" />
            </View>
            <Text style={ms.emptyTitle}>{t("Aucun événement à venir")}</Text>
            <Text style={ms.emptySub}>
              {t("Créez des événements et invitez toute\nla communauté à y participer.")}
            </Text>
            <TouchableOpacity style={ms.emptyBtn} onPress={openCreate} activeOpacity={0.85}>
              <Feather name="plus" size={16} color="#fff" />
              <Text style={ms.emptyBtnText}>{t("Créer le premier événement")}</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* FAB — cross-platform: tab bar 84px web / 62px native */}
      {(filtered.length > 0 || filteredMassSchedules.length > 0) && (
        <View
          style={[ms.fabWrapper, { bottom: (Platform.select({ web: 84, default: 62 }) ?? 62) + 10 }]}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            style={ms.fab}
            onPress={() => requireAuth(openCreate)}
            activeOpacity={0.85}
          >
            <Feather name="plus" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      {/* Form modal */}
      <EventFormModal
        visible={showForm}
        onClose={() => { setShowForm(false); setEditTarget(null); }}
        existing={editTarget}
      />
    </View>
  );
}

const ms = StyleSheet.create({
  root: { flex: 1, minWidth: 0, backgroundColor: CREAM, overflow: "hidden" },
  empty: { alignItems: "center", paddingTop: 72, paddingHorizontal: 36, gap: 12 },
  emptyCircle: { width: 96, height: 96, borderRadius: 48, backgroundColor: "#FFF8EC", alignItems: "center", justifyContent: "center", marginBottom: 8 },
  emptyTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: DARK, textAlign: "center" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#7A7A8A", textAlign: "center", lineHeight: 21 },
  emptyBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: NAVY, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 26, marginTop: 8, shadowColor: "#EADFCB", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 10, elevation: 5 },
  emptyBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#111111" },
  fabWrapper: { position: "absolute", right: 18, zIndex: 999 },
  fab: { width: 56, height: 56, borderRadius: 28, backgroundColor: GOLD, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.22, shadowRadius: 10, elevation: 6 },
});
