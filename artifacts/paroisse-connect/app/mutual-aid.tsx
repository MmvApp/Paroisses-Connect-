import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
} from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { useColors } from "@/hooks/useColors";
import { useLocalSearchParams } from "expo-router";
import { Card } from "@/components/ui/Card";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import Animated, { FadeInDown } from "react-native-reanimated";
import { PublicationCard } from "@/components/ui/PublicationCard";
import { PublicationPhotoPicker } from "@/components/ui/PublicationPhotoPicker";
import { Avatar } from "@/components/ui/Avatar";
import { sendPushToUsers } from "@/lib/pushNotifications";
import { ensureConversation } from "@/lib/conversations";
import type { MutualAidInterest, MutualAidKind, MutualAidPublication } from "@/lib/mutualAid";
import { normalizePublicationImageUrls, uploadPublicationImages } from "@/lib/publicationMedia";

const GOLD   = "#C9A24A";
const DARK   = "#111111";
const CREAM  = "#FFF8EC";
const BORDER = "#EADFCB";
const MUTED  = "#666666";
const RED    = "#EF4444";

interface ServiceItem {
  icon: string;
  title: string;
  desc: string;
  tag: string;
  fullDesc: string;
}

const SERVICES: ServiceItem[] = [
  {
    icon: "package",
    title: "Collecte alimentaire",
    tag: "Propositions & demandes",
    desc: "Mettre en relation les personnes qui proposent ou recherchent des denrées et un coup de main pour les courses.",
    fullDesc:
      "Cette catégorie permet aux paroissiens et bénévoles de publier une proposition ou une demande autour des denrées alimentaires et des courses.\n\nLes utilisateurs indiquent eux-mêmes ce qu'ils peuvent partager ou ce dont ils ont besoin.",
  },
  {
    icon: "tool",
    title: "Bricolage solidaire",
    tag: "Propositions & demandes",
    desc: "Échanger un coup de main pour de petites réparations, du montage ou des travaux du quotidien.",
    fullDesc:
      "Cette catégorie met en relation les personnes qui proposent leurs compétences et celles qui recherchent un coup de main pour un petit travail.\n\nDécrivez simplement ce que vous pouvez faire ou le besoin que vous souhaitez partager.",
  },
  {
    icon: "truck",
    title: "Aide aux déménagements",
    tag: "Propositions & demandes",
    desc: "Trouver ou proposer de l'aide pour porter, transporter ou organiser un déménagement.",
    fullDesc:
      "Cette catégorie permet de publier une proposition ou une demande liée à un déménagement.\n\nPrécisez le type de coup de main recherché ou les disponibilités que vous pouvez proposer.",
  },
  {
    icon: "book",
    title: "Soutien scolaire",
    tag: "Propositions & demandes",
    desc: "Mettre en relation les personnes qui proposent ou recherchent un accompagnement scolaire.",
    fullDesc:
      "Cette catégorie permet de partager une proposition ou une demande de soutien scolaire.\n\nIndiquez le niveau, la matière et les disponibilités afin de faciliter la mise en relation.",
  },
  {
    icon: "phone",
    title: "Écoute téléphonique",
    tag: "Propositions & demandes",
    desc: "Partager une disponibilité pour écouter ou demander un échange avec bienveillance.",
    fullDesc:
      "Cette catégorie permet de publier une proposition d'écoute ou une demande d'échange.\n\nNe publiez pas de coordonnées dans le message public : elles seront partagées uniquement dans le cadre prévu pour la mise en relation.",
  },
  {
    icon: "gift",
    title: "Vestiaire solidaire",
    tag: "Propositions & demandes",
    desc: "Proposer ou rechercher des vêtements propres et en bon état, pour adultes ou enfants.",
    fullDesc:
      "Cette catégorie permet de publier une proposition ou une demande de vêtements de seconde main.\n\nPrécisez les tailles, le type de vêtements et les modalités de remise que vous souhaitez proposer.",
  },
];

function ServiceTile({
  service,
  index,
  onPress,
}: {
  service: ServiceItem;
  index: number;
  onPress: () => void;
}) {
  const colors = useColors();
  const { width: screenWidth } = useWindowDimensions();
  const tileSize = (screenWidth - 32 - 16) / 3;

  return (
    <Animated.View entering={FadeInDown.delay(index * 40).duration(360)} style={{ width: tileSize }}>
      <TouchableOpacity
        style={[
          s.categoryTile,
          {
            backgroundColor: colors.card,
            borderColor: BORDER,
            shadowColor: "#EADFCB",
          },
        ]}
        onPress={onPress}
        activeOpacity={0.78}
      >
        <View style={[s.categoryTileIcon, { backgroundColor: GOLD + "18" }]}>
          <Feather name={service.icon as never} size={22} color={GOLD} />
        </View>
        <Text style={[s.categoryTileLabel, { color: colors.foreground }]} numberOfLines={2}>
          {service.title}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Offer modal ──────────────────────────────────────────────────────────────

interface OfferForm {
  type: string;
  message: string;
  availability: string;
}

function OfferModal({ visible, onClose, defaultName, defaultType, authorId, authorPhotoURL, parishId }: {
  visible: boolean;
  onClose: () => void;
  defaultName: string;
  defaultType: string;
  authorId?: string;
  authorPhotoURL?: string | null;
  parishId?: string;
}) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<"form" | "success">("form");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<OfferForm>({
    type: defaultType, message: "", availability: "",
  });
  const [errors, setErrors] = useState<Partial<OfferForm>>({});
  const [imageUris, setImageUris] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (visible) {
      setForm({ type: defaultType, message: "", availability: "" });
      setErrors({});
      setImageUris([]);
      setStep("form");
    }
  }, [visible, defaultName, defaultType]);

  const validate = () => {
    const e: Partial<OfferForm> = {};
    if (!form.type.trim())         e.type         = "Champ requis";
    if (!form.message.trim())      e.message      = "Champ requis";
    if (!form.availability.trim()) e.availability = "Champ requis";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSend = async () => {
    if (!validate()) return;
    if (!authorId) {
      setErrors({ message: "Connectez-vous pour proposer votre aide." });
      return;
    }
    setSaving(true);
    try {
      setUploading(true);
      const imageUrls = imageUris.length > 0
        ? await uploadPublicationImages(imageUris, "mutual-aid")
        : [];
      setUploading(false);
      const publicRef = doc(collection(db, "mutualAidOffers"));
      await setDoc(publicRef, {
        publicVersion: 2,
        authorId,
        authorName: defaultName,
        authorPhotoURL: authorPhotoURL ?? null,
        parishId: parishId ?? null,
        category: form.type.trim(),
        type: form.type.trim(),
        message: form.message.trim(),
        availability: form.availability.trim(),
        imageUrls,
        imageUrl: imageUrls[0] ?? null,
        status: "open",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setStep("success");
    } catch {
      setErrors({ message: "Erreur réseau, réessayez." });
    } finally {
      setUploading(false);
      setSaving(false);
    }
  };

  const handleClose = () => {
    setStep("form");
    setForm({ type: defaultType, message: "", availability: "" });
    setErrors({});
    setImageUris([]);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: "#FFFFFF" }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* Header */}
        <View style={[m.header, { paddingTop: insets.top + 12, borderBottomColor: BORDER }]}>
          <TouchableOpacity onPress={handleClose} style={m.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Feather name="arrow-left" size={22} color={DARK} />
          </TouchableOpacity>
          <Text style={m.headerTitle}>Proposer mon aide</Text>
          <View style={{ width: 38 }} />
        </View>

        {step === "success" ? (
          <View style={m.successWrap}>
            <View style={[m.successIcon, { backgroundColor: GOLD + "22" }]}>
              <Feather name="check-circle" size={36} color={GOLD} />
            </View>
            <Text style={m.successTitle}>Merci pour votre générosité !</Text>
            <Text style={m.successSub}>
              Votre proposition d'aide a été publiée. Les personnes intéressées pourront vous contacter via Paroisse Connect.
            </Text>
            <TouchableOpacity style={[m.submitBtn, { backgroundColor: GOLD, marginTop: 32 }]} onPress={handleClose}>
              <Text style={[m.submitText, { color: DARK }]}>Fermer</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView contentContainerStyle={[m.formScroll, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
            <Text style={m.formIntro}>
              Publiez votre proposition pour la partager avec les paroissiens et bénévoles intéressés.
            </Text>

            <Field label="Catégorie d'aide" placeholder="Ex. Bricolage, soutien scolaire, transport…" value={form.type}
              onChangeText={(v) => setForm((f) => ({ ...f, type: v }))} error={errors.type} />
            <Field label="Message" placeholder="Décrivez le type d'aide que vous pouvez apporter…" value={form.message}
              onChangeText={(v) => setForm((f) => ({ ...f, message: v }))} error={errors.message}
              multiline />
            <Field label="Disponibilités" placeholder="Ex. Week-ends, mercredis après-midi, soirées…" value={form.availability}
              onChangeText={(v) => setForm((f) => ({ ...f, availability: v }))} error={errors.availability} />
            <PublicationPhotoPicker
              localUris={imageUris}
              onLocalUrisChange={setImageUris}
              disabled={saving}
              uploading={uploading}
            />

            <TouchableOpacity
              style={[m.submitBtn, { backgroundColor: GOLD, opacity: saving ? 0.7 : 1 }]}
              onPress={handleSend}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator color={DARK} size="small" />
                : <Text style={[m.submitText, { color: DARK }]}>Envoyer</Text>}
            </TouchableOpacity>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Service detail + request modal ──────────────────────────────────────────

interface RequestForm {
  message: string;
}

function ServiceModal({ service, onClose, onOffer, defaultName, authorId, authorPhotoURL, parishId }: {
  service: ServiceItem | null;
  onClose: () => void;
  onOffer: () => void;
  defaultName: string;
  authorId?: string;
  authorPhotoURL?: string | null;
  parishId?: string;
}) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<"detail" | "form" | "success">("detail");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<RequestForm>({ message: "" });
  const [errors, setErrors] = useState<Partial<RequestForm>>({});
  const [imageUris, setImageUris] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const validate = () => {
    const e: Partial<RequestForm> = {};
    if (!form.message.trim()) e.message = "Champ requis";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSend = async () => {
    if (!validate()) return;
    if (!authorId) {
      setErrors({ message: "Connectez-vous pour publier une demande d'aide." });
      return;
    }
    setSaving(true);
    try {
      setUploading(true);
      const imageUrls = imageUris.length > 0
        ? await uploadPublicationImages(imageUris, "mutual-aid")
        : [];
      setUploading(false);
      const publicRef = doc(collection(db, "mutualAidRequests"));
      await setDoc(publicRef, {
        publicVersion: 2,
        authorId,
        authorName: defaultName,
        authorPhotoURL: authorPhotoURL ?? null,
        parishId: parishId ?? null,
        category: service?.title ?? "",
        serviceTitle: service?.title ?? "",
        message: form.message.trim(),
        imageUrls,
        imageUrl: imageUrls[0] ?? null,
        status: "open",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setStep("success");
    } catch {
      setErrors({ message: "Erreur réseau, réessayez." });
    } finally {
      setUploading(false);
      setSaving(false);
    }
  };

  const handleClose = () => {
    setStep("detail");
    setForm({ message: "" });
    setErrors({});
    setImageUris([]);
    onClose();
  };

  const goBack = () => {
    if (step === "form") { setStep("detail"); setErrors({}); }
    else handleClose();
  };

  return (
    <Modal visible={service !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={goBack}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: "#FFFFFF" }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* Header */}
        <View style={[m.header, { paddingTop: insets.top + 12, borderBottomColor: BORDER }]}>
          <TouchableOpacity onPress={goBack} style={m.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Feather name="arrow-left" size={22} color={DARK} />
          </TouchableOpacity>
          <Text style={m.headerTitle} numberOfLines={1}>
            {step === "form" ? "Demander de l’aide" : step === "success" ? "Confirmation" : service?.title ?? ""}
          </Text>
          <View style={{ width: 38 }} />
        </View>

        {step === "success" ? (
          <View style={m.successWrap}>
            <View style={[m.successIcon, { backgroundColor: GOLD + "22" }]}>
              <Feather name="check-circle" size={36} color={GOLD} />
            </View>
            <Text style={m.successTitle}>Demande envoyée !</Text>
            <Text style={m.successSub}>
              Votre demande d'aide a été publiée. Les personnes intéressées pourront vous contacter via Paroisse Connect.
            </Text>
            <TouchableOpacity style={[m.submitBtn, { backgroundColor: GOLD, marginTop: 32 }]} onPress={handleClose}>
              <Text style={[m.submitText, { color: DARK }]}>Fermer</Text>
            </TouchableOpacity>
          </View>
        ) : step === "form" ? (
          <ScrollView contentContainerStyle={[m.formScroll, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
            <Text style={m.formIntro}>
              Publiez votre demande dans la catégorie «{service?.title}». Les paroissiens et bénévoles intéressés pourront vous contacter.
            </Text>
            <Field label="Message" placeholder="Décrivez votre situation et votre besoin…" value={form.message}
              onChangeText={(v) => setForm((f) => ({ ...f, message: v }))} error={errors.message}
              multiline />
            <PublicationPhotoPicker
              localUris={imageUris}
              onLocalUrisChange={setImageUris}
              disabled={saving}
              uploading={uploading}
            />
            <TouchableOpacity
              style={[m.submitBtn, { backgroundColor: GOLD, opacity: saving ? 0.7 : 1 }]}
              onPress={handleSend}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator color={DARK} size="small" />
                : <Text style={[m.submitText, { color: DARK }]}>Envoyer</Text>}
            </TouchableOpacity>
          </ScrollView>
        ) : (
          /* Detail view */
          <ScrollView contentContainerStyle={[m.formScroll, { paddingBottom: insets.bottom + 32 }]}>
            {/* Service hero */}
            <View style={[m.detailHero, { backgroundColor: CREAM, borderColor: BORDER }]}>
              <View style={[m.detailIconCircle, { backgroundColor: GOLD + "22" }]}>
                <Feather name={(service?.icon ?? "help-circle") as never} size={28} color={GOLD} />
              </View>
              <View style={[m.tag, { backgroundColor: GOLD + "22", borderColor: GOLD + "44" }]}>
                <Text style={m.tagText}>{service?.tag}</Text>
              </View>
            </View>

            {/* Full description */}
            <Text style={m.detailTitle}>{service?.title}</Text>
            {(service?.fullDesc ?? "").split("\n\n").map((para, i) => (
              <Text key={i} style={m.detailPara}>{para}</Text>
            ))}

            <TouchableOpacity
              style={[m.submitBtn, { backgroundColor: GOLD, marginTop: 24 }]}
              onPress={() => { setForm({ message: "" }); setStep("form"); }}
              activeOpacity={0.85}
            >
              <Text style={[m.submitText, { color: DARK }]}>Demander de l’aide</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[m.secondaryBtn, { borderColor: BORDER }]}
              onPress={onOffer}
              activeOpacity={0.85}
            >
              <Feather name="plus-circle" size={16} color={DARK} />
              <Text style={m.secondaryBtnText}>Proposer mon aide</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Shared Field component ───────────────────────────────────────────────────

function Field({
  label, placeholder, value, onChangeText, error, multiline, keyboardType,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
  error?: string;
  multiline?: boolean;
  keyboardType?: "default" | "phone-pad" | "email-address";
}) {
  return (
    <View style={m.fieldWrap}>
      <Text style={m.fieldLabel}>{label}</Text>
      <TextInput
        style={[m.fieldInput, multiline && m.fieldMultiline, error ? { borderColor: RED } : null]}
        placeholder={placeholder}
        placeholderTextColor="#9AA3B0"
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        numberOfLines={multiline ? 4 : 1}
        keyboardType={keyboardType ?? "default"}
        returnKeyType={multiline ? "default" : "next"}
        autoCapitalize="sentences"
      />
      {error ? <Text style={m.fieldError}>{error}</Text> : null}
    </View>
  );
}

function aidInterestLabel(kind: MutualAidKind): string {
  return kind === "offer" ? "Je suis intéressé(e)" : "Proposer mon aide";
}

function aidStatusLabel(status: MutualAidInterest["status"]): string {
  if (status === "accepted") return "Contact accepté";
  if (status === "refused") return "Demande refusée";
  return "Intérêt envoyé";
}

function AidDetailModal({
  publication,
  interests,
  currentUid,
  onClose,
  onContact,
  onProfile,
  onInterest,
  onDecision,
}: {
  publication: MutualAidPublication | null;
  interests: MutualAidInterest[];
  currentUid?: string;
  onClose: () => void;
  onContact: (publication: MutualAidPublication) => void;
  onProfile: (uid: string) => void;
  onInterest: (publication: MutualAidPublication) => void;
  onDecision: (interest: MutualAidInterest, status: "accepted" | "refused") => void;
}) {
  const insets = useSafeAreaInsets();
  const isOwner = !!publication && publication.authorId === currentUid;
  const ownInterest = publication
    ? interests.find((interest) =>
        interest.targetType === publication.kind &&
        interest.targetId === publication.id &&
        interest.interestedUid === currentUid)
    : undefined;
  const incoming = publication
    ? interests.filter((interest) =>
        interest.targetType === publication.kind &&
        interest.targetId === publication.id &&
        interest.targetAuthorId === currentUid)
    : [];

  return (
    <Modal visible={!!publication} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={a.modalRoot}>
        <View style={[a.modalHeader, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity onPress={onClose} style={a.modalBack}>
            <Feather name="arrow-left" size={22} color={DARK} />
          </TouchableOpacity>
          <Text style={a.modalTitle} numberOfLines={1}>Publication d'entraide</Text>
          <View style={{ width: 38 }} />
        </View>
        {publication && (
          <ScrollView contentContainerStyle={[a.modalContent, { paddingBottom: insets.bottom + 28 }]}>
            <View style={[a.authorPanel, { backgroundColor: CREAM, borderColor: BORDER }]}>
              <Avatar
                name={publication.authorName}
                photoURL={publication.authorPhotoURL}
                size={52}
                onPress={() => onProfile(publication.authorId)}
              />
              <View style={{ flex: 1 }}>
                <TouchableOpacity onPress={() => onProfile(publication.authorId)} activeOpacity={0.7}>
                  <Text style={a.authorName}>{publication.authorName}</Text>
                </TouchableOpacity>
                <Text style={a.authorRole}>
                  {publication.kind === "offer" ? "Propose son aide" : "Recherche de l'aide"}
                </Text>
              </View>
            </View>
            <Text style={a.kindLabel}>
              {publication.kind === "offer" ? "PROPOSITION D'AIDE" : "DEMANDE D'AIDE"}
            </Text>
            <Text style={a.title}>{publication.title}</Text>
            <Text style={a.body}>{publication.body}</Text>
            {publication.availability ? (
              <View style={[a.infoBox, { borderColor: BORDER, backgroundColor: "#FFFCF5" }]}>
                <Feather name="clock" size={16} color={GOLD} />
                <View style={{ flex: 1 }}>
                  <Text style={a.infoLabel}>Disponibilités</Text>
                  <Text style={a.infoText}>{publication.availability}</Text>
                </View>
              </View>
            ) : null}

            {!isOwner && currentUid ? (
              <View style={a.actions}>
                {ownInterest ? (
                  <>
                    <View style={[a.statusBox, ownInterest.status === "accepted" && a.statusAccepted, ownInterest.status === "refused" && a.statusRefused]}>
                      <Feather
                        name={ownInterest.status === "accepted" ? "check-circle" : ownInterest.status === "refused" ? "x-circle" : "clock"}
                        size={16}
                        color={ownInterest.status === "accepted" ? "#15803D" : ownInterest.status === "refused" ? "#B91C1C" : GOLD}
                      />
                      <Text style={[a.statusText, { color: ownInterest.status === "accepted" ? "#15803D" : ownInterest.status === "refused" ? "#B91C1C" : GOLD }]}>
                        {aidStatusLabel(ownInterest.status)}
                      </Text>
                    </View>
                    <TouchableOpacity style={[a.secondaryBtn, { borderColor: BORDER }]} onPress={() => onContact(publication)}>
                      <Feather name="message-square" size={16} color={DARK} />
                      <Text style={[a.secondaryBtnText, { color: DARK }]}>Ouvrir la conversation</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity style={[a.primaryBtn, { backgroundColor: GOLD }]} onPress={() => onInterest(publication)}>
                    <Feather name="message-circle" size={16} color={DARK} />
                    <Text style={a.primaryBtnText}>{aidInterestLabel(publication.kind)}</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : null}

            {isOwner && incoming.length > 0 ? (
              <View style={a.incomingBox}>
                <Text style={a.incomingTitle}>Personnes intéressées ({incoming.length})</Text>
                {incoming.map((interest) => (
                  <View key={interest.id} style={a.incomingRow}>
                    <Avatar name={interest.interestedName} photoURL={interest.interestedPhotoURL} size={34} />
                    <View style={{ flex: 1 }}>
                      <Text style={a.incomingName}>{interest.interestedName}</Text>
                      <Text style={a.incomingStatus}>{aidStatusLabel(interest.status)}</Text>
                    </View>
                    {interest.status === "pending" ? (
                      <View style={a.decisionRow}>
                        <TouchableOpacity style={[a.decisionBtn, a.acceptBtn]} onPress={() => onDecision(interest, "accepted")}>
                          <Feather name="check" size={15} color="#166534" />
                        </TouchableOpacity>
                        <TouchableOpacity style={[a.decisionBtn, a.refuseBtn]} onPress={() => onDecision(interest, "refused")}>
                          <Feather name="x" size={15} color="#B91C1C" />
                        </TouchableOpacity>
                      </View>
                    ) : interest.status === "accepted" ? (
                      <TouchableOpacity onPress={() => onContact({
                        ...publication,
                        authorId: interest.interestedUid,
                        authorName: interest.interestedName,
                        authorPhotoURL: interest.interestedPhotoURL,
                      })}>
                        <Feather name="message-circle" size={19} color={GOLD} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

function normalizeAidPublication(
  id: string,
  data: Record<string, unknown>,
  kind: MutualAidKind,
): MutualAidPublication | null {
  if (typeof data.authorId !== "string" || typeof data.authorName !== "string") return null;
  const category = typeof data.category === "string" && data.category
    ? data.category
    : typeof data.serviceTitle === "string" && data.serviceTitle
      ? data.serviceTitle
      : typeof data.type === "string" && data.type
        ? data.type
        : undefined;
  const title = kind === "offer"
    ? `Aide proposée : ${category ?? "Aide bénévole"}`
    : (category ?? "Demande d'aide");
  return {
    id,
    kind,
    authorId: data.authorId,
    authorName: data.authorName,
    authorPhotoURL: typeof data.authorPhotoURL === "string" ? data.authorPhotoURL : null,
    parishId: typeof data.parishId === "string" ? data.parishId : null,
    title,
    body: typeof data.message === "string" ? data.message : "",
    availability: typeof data.availability === "string" ? data.availability : undefined,
    category,
    serviceTitle: category,
    status: data.status === "closed" ? "closed" : "open",
    imageUrls: normalizePublicationImageUrls(data),
    createdAt: data.createdAt && typeof data.createdAt === "object" && "seconds" in data.createdAt
      ? { seconds: Number((data.createdAt as { seconds: unknown }).seconds) || 0 }
      : null,
  };
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function MutualAidScreen() {
  const colors   = useColors();
  const insets   = useSafeAreaInsets();
  const { user, profile, userDirectory } = useAuth();
  const params = useLocalSearchParams<{ publicationId?: string; interestId?: string }>();

  const defaultName = profile?.displayName ?? "";
  const parishId = profile?.parishId ?? profile?.priestParishId ?? null;

  const [selectedService, setSelectedService] = useState<ServiceItem | null>(null);
  const [showOffer,       setShowOffer]        = useState<string | null>(null);
  const [publications, setPublications] = useState<MutualAidPublication[]>([]);
  const [interests, setInterests] = useState<Record<string, MutualAidInterest>>({});
  const [selectedPublication, setSelectedPublication] = useState<MutualAidPublication | null>(null);
  const openedNotification = useRef<string | null>(null);

  useEffect(() => {
    if (!parishId) {
      setPublications([]);
      return;
    }
    const next = new Map<string, MutualAidPublication>();
    const emit = () => {
      setPublications([...next.values()].filter((publication) => publication.status === "open"));
    };
    const unsubOffers = onSnapshot(
      query(collection(db, "mutualAidOffers"), where("parishId", "==", parishId), where("publicVersion", "==", 2)),
      (snap) => {
        [...next.keys()].filter((key) => key.startsWith("offer:")).forEach((key) => next.delete(key));
        snap.docs.forEach((item) => {
          const publication = normalizeAidPublication(item.id, item.data(), "offer");
          if (publication) {
            next.set(`offer:${item.id}`, {
              ...publication,
              authorName: userDirectory[publication.authorId]?.displayName ?? publication.authorName,
              authorPhotoURL: userDirectory[publication.authorId]?.photoURL ?? publication.authorPhotoURL,
            });
          }
        });
        emit();
      },
      () => emit(),
    );
    const unsubRequests = onSnapshot(
      query(collection(db, "mutualAidRequests"), where("parishId", "==", parishId), where("publicVersion", "==", 2)),
      (snap) => {
        [...next.keys()].filter((key) => key.startsWith("request:")).forEach((key) => next.delete(key));
        snap.docs.forEach((item) => {
          const publication = normalizeAidPublication(item.id, item.data(), "request");
          if (publication) {
            next.set(`request:${item.id}`, {
              ...publication,
              authorName: userDirectory[publication.authorId]?.displayName ?? publication.authorName,
              authorPhotoURL: userDirectory[publication.authorId]?.photoURL ?? publication.authorPhotoURL,
            });
          }
        });
        emit();
      },
      () => emit(),
    );
    return () => {
      unsubOffers();
      unsubRequests();
    };
  }, [parishId, userDirectory]);

  useEffect(() => {
    const publicationId = typeof params.publicationId === "string" ? params.publicationId : undefined;
    if (!publicationId) {
      openedNotification.current = null;
      return;
    }
    if (openedNotification.current === `${publicationId}:${params.interestId ?? ""}`) return;
    const publication = publications.find((item) => item.id === publicationId);
    if (!publication) return;
    openedNotification.current = `${publicationId}:${params.interestId ?? ""}`;
    setSelectedPublication(publication);
  }, [params.publicationId, params.interestId, publications]);

  useEffect(() => {
    if (!user) {
      setInterests({});
      return;
    }
    const next = new Map<string, MutualAidInterest>();
    const emit = () => setInterests(Object.fromEntries(next.entries()));
    const listen = (field: "interestedUid" | "targetAuthorId") => onSnapshot(
      query(collection(db, "mutualAidInterests"), where(field, "==", user.uid)),
      (snap) => {
        snap.docs.forEach((item) => {
          const data = item.data();
          if (
            typeof data.targetType !== "string" ||
            typeof data.targetId !== "string" ||
            typeof data.targetAuthorId !== "string" ||
            typeof data.interestedUid !== "string"
          ) return;
          next.set(item.id, {
            id: item.id,
            targetType: data.targetType === "request" ? "request" : "offer",
            targetId: data.targetId,
            targetAuthorId: data.targetAuthorId,
            interestedUid: data.interestedUid,
            interestedName: userDirectory[data.interestedUid]?.displayName ?? (typeof data.interestedName === "string" ? data.interestedName : "Paroissien"),
            interestedPhotoURL: userDirectory[data.interestedUid]?.photoURL ?? (typeof data.interestedPhotoURL === "string" ? data.interestedPhotoURL : null),
            status: data.status === "accepted" || data.status === "refused" ? data.status : "pending",
            createdAt: data.createdAt && typeof data.createdAt === "object" && "seconds" in data.createdAt
              ? { seconds: Number((data.createdAt as { seconds: unknown }).seconds) || 0 }
              : null,
          });
        });
        emit();
      },
      () => emit(),
    );
    const outgoing = listen("interestedUid");
    const incoming = listen("targetAuthorId");
    return () => {
      outgoing();
      incoming();
    };
  }, [user, userDirectory]);

  const openConversation = useCallback(async (publication: MutualAidPublication) => {
    if (!user || !profile || publication.authorId === user.uid) return;
    try {
      const conversation = await ensureConversation({
        currentUid: user.uid,
        currentName: profile.displayName,
        currentPhotoURL: profile.photoURL,
        targetUid: publication.authorId,
        targetName: publication.authorName,
        targetPhotoURL: publication.authorPhotoURL,
      });
      setSelectedPublication(null);
      router.push(`/dm/${conversation}`);
    } catch {
      Alert.alert("Erreur", "Impossible d'ouvrir la conversation. Réessayez.");
    }
  }, [user, profile]);

  const openProfile = useCallback((uid: string) => {
    if (uid) router.push(`/profile/${uid}`);
  }, []);

  const createInterest = useCallback(async (publication: MutualAidPublication) => {
    if (!user || !profile || publication.authorId === user.uid) return;
    const interestId = `${publication.kind}_${publication.id}_${user.uid}`;
    const existing = interests[interestId];
    if (existing) {
      await openConversation(publication);
      return;
    }
    try {
      await setDoc(doc(db, "mutualAidInterests", interestId), {
        targetType: publication.kind,
        targetId: publication.id,
        targetAuthorId: publication.authorId,
        interestedUid: user.uid,
        interestedName: profile.displayName,
        interestedPhotoURL: profile.photoURL ?? null,
        parishId: publication.parishId ?? parishId,
        status: "pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      void sendPushToUsers(
        [publication.authorId],
        publication.kind === "offer" ? "Nouvel intérêt pour votre aide" : "Quelqu'un propose son aide",
        `${profile.displayName} souhaite échanger au sujet de votre publication.`,
        { screen: "/mutual-aid", publicationId: publication.id, interestId },
        "messages",
      );
      await openConversation(publication);
    } catch {
      Alert.alert("Erreur", "Impossible d'enregistrer votre intérêt. Réessayez.");
    }
  }, [user, profile, interests, parishId, openConversation]);

  const decideInterest = useCallback(async (interest: MutualAidInterest, status: "accepted" | "refused") => {
    if (!user || !profile || interest.targetAuthorId !== user.uid) return;
    let screen = "/mutual-aid";
    try {
      if (status === "accepted") {
        const conversation = await ensureConversation({
          currentUid: user.uid,
          currentName: profile.displayName,
          currentPhotoURL: profile.photoURL,
          targetUid: interest.interestedUid,
          targetName: interest.interestedName,
          targetPhotoURL: interest.interestedPhotoURL,
        });
        screen = `/dm/${conversation}`;
      }
      await updateDoc(doc(db, "mutualAidInterests", interest.id), {
        status,
        updatedAt: serverTimestamp(),
      });
      void sendPushToUsers(
        [interest.interestedUid],
        status === "accepted" ? "Votre intérêt a été accepté" : "Votre intérêt n'a pas été retenu",
        status === "accepted"
          ? `${profile.displayName} a accepté votre demande de contact.`
          : `${profile.displayName} a décliné cette demande de contact.`,
        { screen, interestId: interest.id },
        "messages",
      );
    } catch {
      Alert.alert("Erreur", "Impossible de traiter cette réponse. Réessayez.");
    }
  }, [user, profile]);

  const interestList = Object.values(interests);

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <View style={[s.header, { backgroundColor: "#FFFFFF", borderBottomColor: BORDER, paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="arrow-left" size={22} color={DARK} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: DARK }]}>Aide & Entraide</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[s.heroBanner, { backgroundColor: CREAM, borderColor: BORDER }]}>
          <View style={[s.heroIcon, { backgroundColor: GOLD + "18" }]}>
            <Feather name="help-circle" size={24} color={GOLD} />
          </View>
          <Text style={[s.heroTitle, { color: DARK }]}>Ensemble, on va plus loin</Text>
          <Text style={[s.heroSub, { color: colors.mutedForeground }]}>
            Paroisse Connect facilite l’entraide entre paroissiens, bénévoles et personnes ayant besoin d’un coup de main. Proposez votre aide ou publiez une demande près de chez vous.
          </Text>
        </View>

        <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>Catégories d’entraide</Text>
        <View style={s.categoryGrid}>
          {SERVICES.map((service, index) => (
            <ServiceTile
              key={service.title}
              service={service}
              index={index}
              onPress={() => setSelectedService(service)}
            />
          ))}
        </View>

        <Text style={[s.sectionLabel, s.publicationsSectionLabel, { color: colors.mutedForeground }]}>
          Propositions & demandes
        </Text>
        {publications.length === 0 ? (
          <View style={[s.emptyPublications, { backgroundColor: colors.card, borderColor: BORDER }]}>
            <Feather name="message-square" size={20} color={GOLD} />
            <Text style={[s.emptyPublicationsText, { color: colors.mutedForeground }]}>
              Aucune proposition ou demande pour le moment.
            </Text>
          </View>
        ) : (
          publications.map((publication, i) => {
            const ownInterest = interestList.find((interest) =>
              interest.targetType === publication.kind &&
              interest.targetId === publication.id &&
              interest.interestedUid === user?.uid);
            return (
              <Animated.View key={`${publication.kind}:${publication.id}`} entering={FadeInDown.delay(i * 60).duration(340)} style={{ marginBottom: 12 }}>
                <PublicationCard
                  imageUrls={publication.imageUrls}
                  category={publication.kind === "offer" ? "Proposition d'aide" : "Demande d'aide"}
                  categoryColor={publication.kind === "offer" ? "rgba(201,162,74,0.88)" : "rgba(107,114,128,0.82)"}
                  title={publication.title}
                  body={publication.body}
                  authorName={publication.authorName}
                  authorPhotoURL={publication.authorPhotoURL}
                  onAuthorAvatarPress={() => openProfile(publication.authorId)}
                  onAuthorPress={() => openProfile(publication.authorId)}
                  onPress={() => setSelectedPublication(publication)}
                  footer={
                    <View style={s.publicationFooter}>
                      <View style={s.publicationHint}>
                        <Feather name={ownInterest ? "check-circle" : "user"} size={14} color={ownInterest ? "#15803D" : GOLD} />
                        <Text style={[s.publicationHintText, { color: ownInterest ? "#15803D" : GOLD }]}>
                          {ownInterest ? aidStatusLabel(ownInterest.status) : "Voir le profil"}
                        </Text>
                      </View>
                      {user && publication.authorId !== user.uid ? (
                        <TouchableOpacity
                          style={[s.publicationAction, { backgroundColor: ownInterest ? CREAM : GOLD, borderColor: ownInterest ? BORDER : GOLD }]}
                          onPress={() => ownInterest ? openConversation(publication) : createInterest(publication)}
                          activeOpacity={0.85}
                        >
                          <Feather name="message-circle" size={14} color={DARK} />
                          <Text style={s.publicationActionText}>
                            {ownInterest ? "Ouvrir la conversation" : aidInterestLabel(publication.kind)}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  }
                />
              </Animated.View>
            );
          })
        )}

        <TouchableOpacity activeOpacity={0.85} onPress={() => setShowOffer("")}>
          <View style={[s.ctaBanner, { backgroundColor: GOLD }]}>
            <Feather name="plus-circle" size={20} color={DARK} />
            <Text style={[s.ctaText, { color: DARK }]}>Proposer mon aide</Text>
            <Feather name="chevron-right" size={18} color={DARK} />
          </View>
        </TouchableOpacity>
      </ScrollView>

      <OfferModal
        visible={showOffer !== null}
        onClose={() => setShowOffer(null)}
        defaultName={defaultName}
        defaultType={showOffer ?? ""}
        authorId={user?.uid}
        authorPhotoURL={profile?.photoURL}
        parishId={parishId ?? undefined}
      />
      <ServiceModal
        service={selectedService}
        onClose={() => setSelectedService(null)}
        onOffer={() => {
          const category = selectedService?.title ?? "";
          setSelectedService(null);
          setShowOffer(category);
        }}
        defaultName={defaultName}
        authorId={user?.uid}
        authorPhotoURL={profile?.photoURL}
        parishId={parishId ?? undefined}
      />
      <AidDetailModal
        publication={selectedPublication}
        interests={interestList}
        currentUid={user?.uid}
        onClose={() => setSelectedPublication(null)}
        onContact={openConversation}
        onProfile={openProfile}
        onInterest={createInterest}
        onDecision={decideInterest}
      />
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:          { flex: 1 },
  header:        { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1 },
  backBtn:       { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  headerTitle:   { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  content:       { padding: 16 },
  heroBanner:    { borderRadius: 14, padding: 20, alignItems: "center", marginBottom: 20, gap: 8, borderWidth: 1 },
  heroIcon:      { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  heroTitle:     { fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  heroSub:       { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  sectionLabel:  { fontSize: 12, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 },
  publicationsSectionLabel: { marginTop: 26 },
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  categoryTile: {
    minHeight: 122,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 5,
    borderRadius: 16,
    borderWidth: 1,
    gap: 9,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  categoryTileIcon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  categoryTileLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textAlign: "center", lineHeight: 15 },
  emptyPublications: {
    minHeight: 84,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    gap: 8,
  },
  emptyPublicationsText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18 },
  publicationFooter: { gap: 10 },
  publicationHint: { flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 2 },
  publicationHintText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  publicationAction: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  publicationActionText: { fontSize: 13, fontFamily: "Inter_700Bold", color: DARK },
  categoryActions: { flexDirection: "row", gap: 8 },
  categoryAction: { flex: 1, minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 10 },
  categoryActionText: { fontSize: 12, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  svcCard:       { flexDirection: "row", alignItems: "flex-start", gap: 14, padding: 14 },
  iconCircle:    { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", marginTop: 2 },
  svcInfo:       { flex: 1, gap: 5 },
  svcTop:        { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  svcTitle:      { fontSize: 14, fontFamily: "Inter_600SemiBold", flex: 1 },
  tag:           { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  tagText:       { fontSize: 10, fontFamily: "Inter_500Medium" },
  svcDesc:       { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  ctaBanner:     { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 12, padding: 16, marginTop: 4, marginBottom: 12 },
  ctaText:       { fontSize: 15, fontFamily: "Inter_600SemiBold", flex: 1, textAlign: "center" },
});

const m = StyleSheet.create({
  header:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1 },
  backBtn:     { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: DARK, flex: 1, textAlign: "center" },

  formScroll:  { padding: 20 },
  formIntro:   { fontSize: 13, fontFamily: "Inter_400Regular", color: MUTED, lineHeight: 20, marginBottom: 20 },

  fieldWrap:      { marginBottom: 16 },
  fieldLabel:     { fontSize: 13, fontFamily: "Inter_600SemiBold", color: DARK, marginBottom: 6 },
  fieldInput:     { borderWidth: 1.5, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, fontFamily: "Inter_400Regular", color: DARK, backgroundColor: "#FAFAFA" },
  fieldMultiline: { height: 100, textAlignVertical: "top", paddingTop: 11 },
  fieldError:     { fontSize: 11, fontFamily: "Inter_400Regular", color: RED, marginTop: 4 },

  submitBtn:  { borderRadius: 12, paddingVertical: 15, alignItems: "center", justifyContent: "center", marginTop: 8 },
  submitText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  secondaryBtn: { minHeight: 48, borderRadius: 12, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 10 },
  secondaryBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: DARK },

  successWrap:  { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  successIcon:  { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  successTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: DARK, textAlign: "center" },
  successSub:   { fontSize: 14, fontFamily: "Inter_400Regular", color: MUTED, textAlign: "center", lineHeight: 22 },

  detailHero:       { borderRadius: 14, padding: 24, alignItems: "center", marginBottom: 20, gap: 12, borderWidth: 1 },
  detailIconCircle: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  tag:              { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  tagText:          { fontSize: 11, fontFamily: "Inter_500Medium", color: GOLD },
  detailTitle:      { fontSize: 20, fontFamily: "Inter_700Bold", color: DARK, marginBottom: 12 },
  detailPara:       { fontSize: 14, fontFamily: "Inter_400Regular", color: MUTED, lineHeight: 22, marginBottom: 12 },
});

const a = StyleSheet.create({
  modalRoot: { flex: 1, backgroundColor: "#FFFFFF" },
  modalHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  modalBack: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  modalTitle: { flex: 1, textAlign: "center", fontSize: 18, fontFamily: "Inter_600SemiBold", color: DARK },
  modalContent: { padding: 20, gap: 14 },
  authorPanel: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  authorName: { fontSize: 16, fontFamily: "Inter_700Bold", color: DARK },
  authorRole: { fontSize: 13, fontFamily: "Inter_400Regular", color: MUTED, marginTop: 3 },
  kindLabel: { fontSize: 11, fontFamily: "Inter_700Bold", color: GOLD, letterSpacing: 0.8, marginTop: 4 },
  title: { fontSize: 22, lineHeight: 29, fontFamily: "Inter_700Bold", color: DARK },
  body: { fontSize: 15, lineHeight: 23, fontFamily: "Inter_400Regular", color: MUTED },
  infoBox: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 13, borderRadius: 12, borderWidth: 1 },
  infoLabel: { fontSize: 12, fontFamily: "Inter_700Bold", color: DARK },
  infoText: { fontSize: 13, fontFamily: "Inter_400Regular", color: MUTED, marginTop: 3, lineHeight: 19 },
  actions: { gap: 10, marginTop: 4 },
  primaryBtn: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, borderRadius: 12, paddingVertical: 14 },
  primaryBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: DARK },
  secondaryBtn: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, borderRadius: 12, paddingVertical: 13, borderWidth: 1.5 },
  secondaryBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  statusBox: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, borderRadius: 12, paddingVertical: 13, backgroundColor: CREAM, borderWidth: 1, borderColor: BORDER },
  statusAccepted: { backgroundColor: "#F0FDF4", borderColor: "#BBF7D0" },
  statusRefused: { backgroundColor: "#FEF2F2", borderColor: "#FECACA" },
  statusText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  incomingBox: { marginTop: 8, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: BORDER, backgroundColor: "#FFFCF5", gap: 12 },
  incomingTitle: { fontSize: 14, fontFamily: "Inter_700Bold", color: DARK },
  incomingRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  incomingName: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: DARK },
  incomingStatus: { fontSize: 12, fontFamily: "Inter_400Regular", color: MUTED, marginTop: 2 },
  decisionRow: { flexDirection: "row", gap: 6 },
  decisionBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  acceptBtn: { backgroundColor: "#F0FDF4", borderColor: "#BBF7D0" },
  refuseBtn: { backgroundColor: "#FEF2F2", borderColor: "#FECACA" },
});
