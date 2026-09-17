import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
  type ViewStyle,
} from "react-native";
import {
  collection,
  query,
  orderBy,
  where,
  onSnapshot,
  addDoc,
  doc,
  runTransaction,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { router, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";
import { PublicationCard } from "@/components/ui/PublicationCard";
import { PublicationPhotoPicker } from "@/components/ui/PublicationPhotoPicker";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { GuestBanner } from "@/components/ui/GuestBanner";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/context/I18nContext";
import { useColors } from "@/hooks/useColors";
import { ConfirmSheet } from "@/components/ConfirmSheet";
import { canDeletePublication } from "@/lib/publicationPermissions";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { sendPushToParish, sendPushToUsers } from "@/lib/pushNotifications";
import { subscribeToParishCollection } from "@/lib/subscribeParishCollection";
import { ensureConversation } from "@/lib/conversations";
import { normalizePublicationImageUrls, uploadPublicationImages } from "@/lib/publicationMedia";

const GOLD   = "#C9A24A";
const DARK   = "#111111";
const CREAM  = "#FFF8EC";
const MUTED  = "#666666";
const BORDER = "#EADFCB";

const TAB_BAR_HEIGHT = (Platform.select({ web: 84, default: 62 }) ?? 62);

type RideType = "offer" | "request";
type RideRequestStatus = "pending" | "accepted" | "refused";

interface Ride {
  id: string;
  type: RideType;
  authorId: string;
  authorName: string;
  authorPhotoURL?: string | null;
  parishId?: string | null;
  location: string;
  event: string;
  time: string;
  seats: number;
  seatsAvailable: number;
  createdAt: { seconds: number } | null;
  imageUrls?: string[];
  imageUrl?: string | null;
}

interface RideRequest {
  id: string;
  rideId: string;
  driverId: string;
  driverName: string;
  driverPhotoURL?: string | null;
  passengerId: string;
  passengerName: string;
  passengerPhotoURL?: string | null;
  status: RideRequestStatus;
  createdAt: { seconds: number } | null;
}

function formatDate(seconds: number) {
  return new Date(seconds * 1000).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
  });
}

export default function CovoiturageScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const { user, profile, userDirectory } = useAuth();
  const { t: translate } = useI18n();
  const params = useLocalSearchParams<{ rideId?: string; requestId?: string }>();
  const { requireAuth } = useRequireAuth();

  const [tab, setTab]         = useState<RideType>("offer");
  const [rides, setRides]     = useState<Ride[]>([]);
  const [passengerRequests, setPassengerRequests] = useState<Record<string, RideRequest>>({});
  const [driverRequests, setDriverRequests] = useState<RideRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [location, setLocation]   = useState("");
  const [event, setEvent]         = useState("");
  const [time, setTime]           = useState("");
  const [seats, setSeats]         = useState("1");
  const [imageUris, setImageUris] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting]     = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmSheet, setConfirmSheet] = useState<{
    title: string;
    message?: string;
    confirmLabel: string;
    confirmColor: string;
    action: () => Promise<void>;
  } | null>(null);
  const feedRef = useRef<FlatList<Ride>>(null);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 700);
  }, []);

  useEffect(() => {
    const currentParishId = profile?.parishId ?? profile?.priestParishId ?? null;
    setLoading(true);
    if (!user || !currentParishId) {
      setRides([]);
      setLoading(false);
      return;
    }

    return subscribeToParishCollection(
      "rides",
      currentParishId,
      (docs) => {
        setRides(
          docs.map((d) => ({
            id: d.id,
            ...d.data(),
            authorName: userDirectory[d.data().authorId]?.displayName ?? d.data().authorName ?? "Anonyme",
            authorPhotoURL: userDirectory[d.data().authorId]?.photoURL ?? d.data().authorPhotoURL ?? null,
            createdAt: d.data().createdAt ?? null,
          } as Ride)),
        );
        setLoading(false);
      },
      () => setLoading(false),
      user.uid,
    );
  }, [user, profile?.parishId, profile?.priestParishId, userDirectory]);

  useEffect(() => {
    if (!user) {
      setPassengerRequests({});
      setDriverRequests([]);
      return;
    }

    const passengerUnsub = onSnapshot(
      query(collection(db, "rideRequests"), where("passengerId", "==", user.uid)),
      (snap) => {
        const next: Record<string, RideRequest> = {};
        snap.docs.forEach((requestDoc) => {
          const data = requestDoc.data();
          if (typeof data.rideId !== "string") return;
          next[data.rideId] = {
            id: requestDoc.id,
            rideId: data.rideId,
            driverId: typeof data.driverId === "string" ? data.driverId : "",
            driverName: userDirectory[data.driverId]?.displayName ?? (typeof data.driverName === "string" ? data.driverName : "Conducteur"),
            driverPhotoURL: userDirectory[data.driverId]?.photoURL ?? (typeof data.driverPhotoURL === "string" ? data.driverPhotoURL : null),
            passengerId: user.uid,
            passengerName: userDirectory[user.uid]?.displayName ?? (typeof data.passengerName === "string" ? data.passengerName : "Passager"),
            passengerPhotoURL: userDirectory[user.uid]?.photoURL ?? (typeof data.passengerPhotoURL === "string" ? data.passengerPhotoURL : null),
            status: data.status === "accepted" || data.status === "refused" ? data.status : "pending",
            createdAt: data.createdAt ?? null,
          };
        });
        setPassengerRequests(next);
      },
      () => setPassengerRequests({}),
    );

    const driverUnsub = onSnapshot(
      query(collection(db, "rideRequests"), where("driverId", "==", user.uid)),
      (snap) => {
        setDriverRequests(
          snap.docs.map((requestDoc) => {
            const data = requestDoc.data();
            return {
              id: requestDoc.id,
              rideId: typeof data.rideId === "string" ? data.rideId : "",
              driverId: user.uid,
              driverName: userDirectory[user.uid]?.displayName ?? (typeof data.driverName === "string" ? data.driverName : "Conducteur"),
              driverPhotoURL: userDirectory[user.uid]?.photoURL ?? (typeof data.driverPhotoURL === "string" ? data.driverPhotoURL : null),
              passengerId: typeof data.passengerId === "string" ? data.passengerId : "",
              passengerName: userDirectory[data.passengerId]?.displayName ?? (typeof data.passengerName === "string" ? data.passengerName : "Passager"),
              passengerPhotoURL: userDirectory[data.passengerId]?.photoURL ?? (typeof data.passengerPhotoURL === "string" ? data.passengerPhotoURL : null),
              status: data.status === "accepted" || data.status === "refused" ? data.status : "pending",
              createdAt: data.createdAt ?? null,
            };
          }).filter((request) => request.rideId && request.passengerId),
        );
      },
      () => setDriverRequests([]),
    );

    return () => {
      passengerUnsub();
      driverUnsub();
    };
  }, [user, userDirectory]);

  const filtered = rides.filter((r) => r.type === tab);

  const openedNotification = useRef<string | null>(null);
  useEffect(() => {
    const targetRideId = typeof params.rideId === "string" ? params.rideId : undefined;
    if (!targetRideId) {
      openedNotification.current = null;
      return;
    }
    if (openedNotification.current === `${targetRideId}:${params.requestId ?? ""}`) return;
    const ride = rides.find((candidate) => candidate.id === targetRideId);
    if (!ride) return;
    if (ride.type !== tab) {
      setTab(ride.type);
      return;
    }
    const index = filtered.findIndex((candidate) => candidate.id === targetRideId);
    if (index < 0) return;
    openedNotification.current = `${targetRideId}:${params.requestId ?? ""}`;
    const timer = setTimeout(() => {
      feedRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.2 });
    }, 120);
    return () => clearTimeout(timer);
  }, [params.rideId, params.requestId, rides, tab, filtered]);

  const openModal = useCallback(() => {
    setLocation("");
    setEvent("");
    setTime("");
    setSeats("1");
    setImageUris([]);
    setShowModal(true);
  }, []);

  const closeModal = useCallback(() => {
    if (posting) return;
    setShowModal(false);
  }, [posting]);

  const handleSubmit = useCallback(async () => {
    if (!user) return;
    if (!location.trim() || !event.trim() || !time.trim()) {
      Alert.alert("Champs manquants", "Remplis le lieu, l'événement et l'heure.");
      return;
    }
    setPosting(true);
    try {
      const seatCount = Math.max(1, parseInt(seats, 10) || 1);
      setUploading(true);
      const imageUrls = imageUris.length > 0
        ? await uploadPublicationImages(imageUris, "rides")
        : [];
      setUploading(false);
      const rideRef = await addDoc(collection(db, "rides"), {
        type: tab,
        authorId: user.uid,
        authorName: profile?.displayName ?? "Anonyme",
        authorPhotoURL: profile?.photoURL ?? null,
          parishId: profile?.parishId ?? profile?.priestParishId ?? null,
        location: location.trim(),
        event: event.trim(),
        time: time.trim(),
        seats: seatCount,
        seatsAvailable: seatCount,
        imageUrls,
        imageUrl: imageUrls[0] ?? null,
        createdAt: serverTimestamp(),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Notifier les membres de la paroisse du nouveau trajet
      if (profile?.parishId) {
        void sendPushToParish(
          profile.parishId,
          tab === "offer" ? "🚗 Nouvelle offre de covoiturage" : "🚗 Demande de covoiturage",
          `${event.trim()} · ${location.trim()}`,
          { screen: "/(tabs)/covoiturage", rideId: rideRef.id },
          "covoiturage",
          user.uid
        );
      }
      setShowModal(false);
    } catch {
      Alert.alert("Erreur", "Impossible d'enregistrer. Réessayez.");
    } finally {
      setUploading(false);
      setPosting(false);
    }
  }, [user, profile, tab, location, event, time, seats, imageUris]);

  const requestSeat = useCallback(
    async (ride: Ride) => {
      if (!user) return;
      if (ride.seatsAvailable <= 0) {
        Alert.alert("Complet", "Il n'y a plus de places disponibles.");
        return;
      }
      if (passengerRequests[ride.id]) {
        Alert.alert("Demande déjà envoyée", "Tu as déjà une demande pour ce trajet.");
        return;
      }
      setConfirmSheet({
        title: "Demander une place",
        message: `Envoyer une demande au conducteur pour : ${ride.event} ?`,
        confirmLabel: "Confirmer",
        confirmColor: GOLD,
        action: async () => {
          const requestRef = doc(db, "rideRequests", `${ride.id}_${user.uid}`);
          await runTransaction(db, async (transaction) => {
            const existing = await transaction.get(requestRef);
            const currentRide = await transaction.get(doc(db, "rides", ride.id));
            if (existing.exists()) {
              throw new Error("request-already-exists");
            }
            if (!currentRide.exists() || (currentRide.data().seatsAvailable ?? 0) <= 0) {
              throw new Error("ride-full");
            }
            transaction.set(requestRef, {
              rideId: ride.id,
              driverId: ride.authorId,
              driverName: ride.authorName,
              driverPhotoURL: ride.authorPhotoURL ?? null,
              passengerId: user.uid,
              passengerName: profile?.displayName ?? user.displayName ?? "Anonyme",
              passengerPhotoURL: profile?.photoURL ?? null,
              parishId: ride.parishId ?? null,
              status: "pending",
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          void sendPushToUsers(
            [ride.authorId],
            "🚗 Nouvelle demande de covoiturage",
            `${profile?.displayName ?? user.displayName ?? "Un paroissien"} souhaite participer à ton trajet · ${ride.event}`,
            { screen: "/(tabs)/covoiturage", rideId: ride.id },
            "covoiturage",
          );
          Alert.alert("Demande envoyée", "Le conducteur va examiner ta demande.");
        },
      });
    },
    [user, profile, passengerRequests],
  );

  const openConversation = useCallback(
    async (targetUid: string, targetName: string, targetPhotoURL?: string | null) => {
      if (!user || !profile || targetUid === user.uid) return;
      try {
        const conversationId = await ensureConversation({
          currentUid: user.uid,
          currentName: profile.displayName,
          currentPhotoURL: profile.photoURL,
          targetUid,
          targetName,
          targetPhotoURL,
        });
        router.push(`/dm/${conversationId}`);
      } catch {
        Alert.alert("Erreur", "Impossible d'ouvrir la conversation. Réessayez.");
      }
    },
    [user, profile],
  );

  const decideRequest = useCallback(
    (request: RideRequest, status: Extract<RideRequestStatus, "accepted" | "refused">) => {
      const ride = rides.find((candidate) => candidate.id === request.rideId);
      if (!ride || ride.authorId !== user?.uid) return;

      setConfirmSheet({
        title: status === "accepted" ? "Accepter cette demande ?" : "Refuser cette demande ?",
        message: status === "accepted"
          ? `${request.passengerName} participera à ton trajet si une place est encore disponible.`
          : `${request.passengerName} sera informé du refus.`,
        confirmLabel: status === "accepted" ? "Accepter" : "Refuser",
        confirmColor: status === "accepted" ? GOLD : "#D32F2F",
        action: async () => {
          const requestRef = doc(db, "rideRequests", request.id);
          const rideRef = doc(db, "rides", request.rideId);
          await runTransaction(db, async (transaction) => {
            const [requestSnap, rideSnap] = await Promise.all([
              transaction.get(requestRef),
              transaction.get(rideRef),
            ]);
            if (!requestSnap.exists() || !rideSnap.exists()) {
              throw new Error("request-not-found");
            }
            const currentRequest = requestSnap.data();
            const currentRide = rideSnap.data();
            if (currentRequest.status !== "pending") {
              throw new Error("request-already-decided");
            }
            if (status === "accepted") {
              const available = Number(currentRide.seatsAvailable ?? 0);
              if (available <= 0) throw new Error("ride-full");
              transaction.update(rideRef, { seatsAvailable: available - 1 });
            }
            transaction.update(requestRef, {
              status,
              updatedAt: serverTimestamp(),
            });
          });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          let notificationScreen = "/(tabs)/covoiturage";
          if (status === "accepted" && user && profile) {
            try {
              const conversationId = await ensureConversation({
                currentUid: user.uid,
                currentName: profile.displayName,
                currentPhotoURL: profile.photoURL,
                targetUid: request.passengerId,
                targetName: request.passengerName,
                targetPhotoURL: request.passengerPhotoURL,
              });
              notificationScreen = `/dm/${conversationId}`;
            } catch {
              // The decision remains valid even if the conversation cannot be prepared.
            }
          }
          void sendPushToUsers(
            [request.passengerId],
            status === "accepted" ? "✅ Participation acceptée" : "Demande de covoiturage refusée",
            status === "accepted"
              ? `Ta participation au trajet « ${ride.event} » est confirmée.`
              : `Ta demande pour le trajet « ${ride.event} » a été refusée.`,
            { screen: notificationScreen, rideId: request.rideId, requestId: request.id },
            "covoiturage",
          );
          Alert.alert(
            status === "accepted" ? "Participation confirmée" : "Demande refusée",
            status === "accepted"
              ? `${request.passengerName} a été ajouté au trajet.`
              : `${request.passengerName} a été informé du refus.`,
          );
        },
      });
    },
    [rides, user],
  );

  const handleDelete = useCallback(
    async (ride: Ride) => {
      if (!canDeletePublication(
        {
          userId: user?.uid,
          role: profile?.role,
          parishId: profile?.parishId ?? profile?.priestParishId ?? null,
        },
        ride,
      )) return;
      setConfirmSheet({
        title: "Voulez-vous vraiment supprimer cette publication ?",
        message: "Cette action est irréversible.",
        confirmLabel: "Oui, supprimer",
        confirmColor: "#D32F2F",
        action: async () => {
          await deleteDoc(doc(db, "rides", ride.id));
        },
      });
    },
    [user],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: Ride; index: number }) => {
      const mine = item.authorId === user?.uid;
       const canDelete = canDeletePublication(
         {
           userId: user?.uid,
           role: profile?.role,
           parishId: profile?.parishId ?? profile?.priestParishId ?? null,
         },
         item,
       );
      const full = item.seatsAvailable <= 0 && item.type === "offer";
      const ownRequest = passengerRequests[item.id];
      const requestsForRide = driverRequests.filter((request) => request.rideId === item.id);
      return (
        <Animated.View entering={FadeInDown.delay(index * 40).duration(300)}>
          <PublicationCard
             imageUrls={normalizePublicationImageUrls(item)}
            category={item.type === "offer" ? "Offre de trajet" : "Demande de trajet"}
            categoryColor={item.type === "offer" ? "rgba(201,162,74,0.88)" : "rgba(107,114,128,0.82)"}
            timeLabel={item.createdAt ? formatDate(item.createdAt.seconds) : ""}
            title={item.event}
            body={item.location}
            authorName={item.authorName}
            authorPhotoURL={item.authorPhotoURL}
            style={{ marginBottom: 12 }}
            footer={
              <View style={{ gap: 8 }}>
                <View style={st.badgeRow}>
                  <View style={[st.badge, { backgroundColor: CREAM, borderColor: BORDER }]}>
                    <Feather name="clock" size={12} color={GOLD} />
                    <Text style={[st.badgeText, { color: GOLD }]}>{item.time}</Text>
                  </View>
                  {item.type === "offer" && (
                    <View style={[st.badge, { backgroundColor: full ? "#FEE2E2" : CREAM, borderColor: full ? "#FECACA" : BORDER }]}>
                      <Feather name="users" size={12} color={full ? "#DC2626" : GOLD} />
                      <Text style={[st.badgeText, { color: full ? "#DC2626" : GOLD }]}>
                        {full ? "Complet" : `${item.seatsAvailable} place${item.seatsAvailable > 1 ? "s" : ""}`}
                      </Text>
                    </View>
                  )}
                  {canDelete && (
                    <TouchableOpacity onPress={() => handleDelete(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginLeft: "auto" }}>
                      <Feather name="trash-2" size={15} color={colors.destructive} />
                    </TouchableOpacity>
                  )}
                </View>
                {item.type === "offer" && !mine && !ownRequest && !full && (
                  <TouchableOpacity style={[st.actionBtn, { backgroundColor: GOLD }]} onPress={() => requireAuth(() => requestSeat(item))} activeOpacity={0.85}>
                     <Feather name="user-plus" size={15} color={DARK} />
                     <Text style={st.actionBtnText}>Demander une place</Text>
                  </TouchableOpacity>
                )}
                {item.type === "offer" && !mine && ownRequest && (
                  <>
                    <View style={[st.requestStatus, ownRequest.status === "accepted" && st.requestStatusAccepted, ownRequest.status === "refused" && st.requestStatusRefused]}>
                      <Feather
                        name={ownRequest.status === "accepted" ? "check-circle" : ownRequest.status === "refused" ? "x-circle" : "clock"}
                        size={15}
                        color={ownRequest.status === "accepted" ? "#15803D" : ownRequest.status === "refused" ? "#B91C1C" : GOLD}
                      />
                      <Text style={[st.requestStatusText, { color: ownRequest.status === "accepted" ? "#15803D" : ownRequest.status === "refused" ? "#B91C1C" : GOLD }]}>
                        {ownRequest.status === "accepted" ? "Participation acceptée" : ownRequest.status === "refused" ? "Demande refusée" : "Demande en attente"}
                      </Text>
                    </View>
                    {ownRequest.status === "accepted" && (
                      <TouchableOpacity
                        style={[st.actionBtn, { backgroundColor: GOLD }]}
                        onPress={() => openConversation(item.authorId, item.authorName, item.authorPhotoURL)}
                        activeOpacity={0.85}
                      >
                        <Feather name="message-circle" size={15} color={DARK} />
                        <Text style={st.actionBtnText}>Ouvrir la conversation</Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}
                {!mine && (
                  <TouchableOpacity
                    style={[st.actionBtn, { backgroundColor: colors.secondary, borderWidth: 1, borderColor: BORDER }]}
                    onPress={() => requireAuth(() => openConversation(item.authorId, item.authorName, item.authorPhotoURL))}
                    activeOpacity={0.85}
                  >
                    <Feather name="message-circle" size={15} color={GOLD} />
                    <Text style={[st.actionBtnText, { color: colors.foreground }]}>Contacter</Text>
                  </TouchableOpacity>
                )}
                {item.type === "offer" && mine && requestsForRide.length > 0 && (
                  <View style={st.driverRequests}>
                    <Text style={[st.driverRequestsTitle, { color: colors.foreground }]}>
                      Demandes de participation ({requestsForRide.length})
                    </Text>
                    {requestsForRide.map((request) => (
                      <View key={request.id} style={st.driverRequestRow}>
                        <View style={st.driverRequestInfo}>
                          <Avatar name={request.passengerName} size={30} />
                          <View style={{ flex: 1 }}>
                            <Text style={[st.driverRequestName, { color: colors.foreground }]}>{request.passengerName}</Text>
                            <Text style={[st.driverRequestStatus, { color: request.status === "accepted" ? "#15803D" : request.status === "refused" ? "#B91C1C" : GOLD }]}>
                              {request.status === "accepted" ? "Acceptée" : request.status === "refused" ? "Refusée" : "En attente"}
                            </Text>
                          </View>
                        </View>
                        {request.status === "pending" && (
                          <View style={st.requestActions}>
                            <TouchableOpacity
                              style={[st.requestAction, st.requestAccept]}
                              onPress={() => decideRequest(request, "accepted")}
                              accessibilityLabel={`Accepter la demande de ${request.passengerName}`}
                            >
                              <Feather name="check" size={16} color="#166534" />
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[st.requestAction, st.requestRefuse]}
                              onPress={() => decideRequest(request, "refused")}
                              accessibilityLabel={`Refuser la demande de ${request.passengerName}`}
                            >
                              <Feather name="x" size={16} color="#B91C1C" />
                            </TouchableOpacity>
                          </View>
                        )}
                        {request.status === "accepted" && (
                          <TouchableOpacity
                            style={[st.requestAction, { backgroundColor: CREAM, borderColor: BORDER }]}
                            onPress={() => openConversation(request.passengerId, request.passengerName, request.passengerPhotoURL)}
                            accessibilityLabel={`Ouvrir la conversation avec ${request.passengerName}`}
                          >
                            <Feather name="message-circle" size={16} color={GOLD} />
                          </TouchableOpacity>
                        )}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            }
          />
        </Animated.View>
      );
    },
    [user, profile, colors, requireAuth, requestSeat, handleDelete, passengerRequests, driverRequests, decideRequest, openConversation],
  );

  const canSubmit = location.trim() && event.trim() && time.trim() && !posting;

  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      {!user && <GuestBanner />}
      {/* ── Tabs ── */}
      <View style={[st.tabBar, { borderBottomColor: BORDER }]}>
        {(["offer", "request"] as RideType[]).map((rideType) => {
          const active = tab === rideType;
          return (
            <TouchableOpacity
              key={rideType}
              style={[
                st.tabBtn,
                { borderBottomColor: active ? GOLD : "transparent" },
              ]}
              onPress={() => setTab(rideType)}
              activeOpacity={0.8}
            >
              <Text style={[st.tabLabel, { color: active ? GOLD : colors.mutedForeground }]}>
                {rideType === "offer" ? translate("Offres de trajet") : translate("Demandes de trajet")}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Feed ── */}
      {loading ? (
        <View style={st.center}>
          <ActivityIndicator size="large" color={GOLD} />
        </View>
      ) : (
        <FlatList
          ref={feedRef}
          data={filtered}
          keyExtractor={(r) => r.id}
          renderItem={renderItem}
          contentContainerStyle={[
            st.listContent,
            { paddingBottom: TAB_BAR_HEIGHT + 80 },
          ]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#C9A24A" colors={["#C9A24A"]} />
          }
          ListEmptyComponent={
            <View style={st.empty}>
              <Feather name="navigation" size={52} color={BORDER} />
              <Text style={[st.emptyTitle, { color: colors.foreground }]}>
                {tab === "offer" ? translate("Aucune offre de trajet") : translate("Aucune demande de trajet")}
              </Text>
              <Text style={[st.emptyText, { color: colors.mutedForeground }]}>
                {tab === "offer"
                  ? translate("Soyez le premier à proposer un covoiturage !")
                  : translate("Aucune demande pour l'instant.")}
              </Text>
              {!!user && (
                <TouchableOpacity
                  style={[st.emptyBtn, { backgroundColor: GOLD }]}
                  onPress={openModal}
                  activeOpacity={0.85}
                >
                  <Feather name="plus" size={16} color={DARK} />
                  <Text style={st.emptyBtnText}>
                    {tab === "offer" ? translate("Proposer un trajet") : translate("Publier une demande")}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* ── FAB — cross-platform ── */}
      {(
        <View
          style={[st.fabWrapper, { bottom: TAB_BAR_HEIGHT + 10 }]}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            style={[st.fab, { backgroundColor: GOLD }]}
            onPress={() => requireAuth(openModal)}
            activeOpacity={0.85}
          >
            <Feather name="plus" size={28} color={DARK} />
          </TouchableOpacity>
        </View>
      )}

      {/* ── Form modal ── */}
      <Modal
        visible={showModal}
        animationType="slide"
        transparent
        presentationStyle="overFullScreen"
        onRequestClose={closeModal}
      >
        <KeyboardAvoidingView
          style={st.overlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeModal} />
          <View
            style={[
              st.sheet,
              { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 },
            ]}
          >
            <View style={[st.handle, { backgroundColor: BORDER }]} />

            <View style={st.sheetHeader}>
              <Text style={[st.sheetTitle, { color: colors.foreground }]}>
                {tab === "offer" ? "Proposer un trajet" : "Demander un trajet"}
              </Text>
              <TouchableOpacity onPress={closeModal} disabled={posting}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {/* Lieu */}
            <View style={[st.inputRow, { backgroundColor: colors.secondary, borderColor: BORDER }]}>
              <Feather name="map-pin" size={15} color={MUTED} />
              <TextInput
                style={[st.inputText, { color: colors.foreground }]}
                placeholder="Lieu de départ"
                placeholderTextColor={colors.mutedForeground}
                value={location}
                onChangeText={setLocation}
                returnKeyType="next"
              />
            </View>

            {/* Événement */}
            <View style={[st.inputRow, { backgroundColor: colors.secondary, borderColor: BORDER }]}>
              <Feather name="calendar" size={15} color={MUTED} />
              <TextInput
                style={[st.inputText, { color: colors.foreground }]}
                placeholder="Messe ou événement concerné"
                placeholderTextColor={colors.mutedForeground}
                value={event}
                onChangeText={setEvent}
                returnKeyType="next"
              />
            </View>

            {/* Heure */}
            <View style={[st.inputRow, { backgroundColor: colors.secondary, borderColor: BORDER }]}>
              <Feather name="clock" size={15} color={MUTED} />
              <TextInput
                style={[st.inputText, { color: colors.foreground }]}
                placeholder="Heure de départ (ex. 10h00)"
                placeholderTextColor={colors.mutedForeground}
                value={time}
                onChangeText={setTime}
                returnKeyType={tab === "offer" ? "next" : "done"}
              />
            </View>

            {/* Places (offres uniquement) */}
            {tab === "offer" && (
              <View
                style={[st.inputRow, { backgroundColor: colors.secondary, borderColor: BORDER }]}
              >
                <Feather name="users" size={15} color={MUTED} />
                <TextInput
                  style={[st.inputText, { color: colors.foreground }]}
                  placeholder="Nombre de places disponibles"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="numeric"
                  value={seats}
                  onChangeText={setSeats}
                  returnKeyType="done"
                />
              </View>
            )}

            <PublicationPhotoPicker
              localUris={imageUris}
              onLocalUrisChange={setImageUris}
              disabled={posting}
              uploading={uploading}
            />

            {/* Bouton publier */}
            <TouchableOpacity
              style={[st.submitBtn, { backgroundColor: canSubmit ? GOLD : BORDER }]}
              onPress={handleSubmit}
              disabled={!canSubmit}
              activeOpacity={0.85}
            >
              {posting ? (
                <ActivityIndicator size="small" color={DARK} />
              ) : (
                <Text style={[st.submitBtnText, { color: DARK }]}>
                  {tab === "offer" ? "Proposer le trajet" : "Publier la demande"}
                </Text>
              )}
            </TouchableOpacity>
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
    </View>
  );
}

const st = StyleSheet.create({
  root:      { flex: 1, minWidth: 0, overflow: "hidden" },
  center:    { flex: 1, alignItems: "center", justifyContent: "center" },

  // Tabs
  tabBar:  { flexDirection: "row", borderBottomWidth: 1 },
  tabBtn:  { flex: 1, paddingVertical: 14, alignItems: "center", borderBottomWidth: 2.5 },
  tabLabel:{ fontSize: 14, fontFamily: "Inter_600SemiBold" },

  // List
  listContent: { padding: 16 },
  empty:       { alignItems: "center", paddingTop: 72, paddingHorizontal: 36, gap: 12 },
  emptyTitle:  { fontSize: 17, fontFamily: "Inter_700Bold", textAlign: "center" },
  emptyText:   { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 21 },
  emptyBtn:    {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 24, paddingVertical: 14, borderRadius: 26, marginTop: 8,
  },
  emptyBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: DARK },

  // Card internals
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
  authorName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  dateText:   { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  detailRow:  { flexDirection: "row", alignItems: "center", gap: 8 },
  detailText: { fontSize: 14, fontFamily: "Inter_400Regular", flex: 1 },
  badgeRow:   { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  badge:      {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1,
  },
  badgeText:  { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  actionBtn:  {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 12, borderRadius: 12, marginTop: 4,
  },
  actionBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: DARK },
  requestStatus: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 12,
    backgroundColor: "#FFF8EC", borderWidth: 1, borderColor: BORDER, marginTop: 4,
  },
  requestStatusAccepted: { backgroundColor: "#F0FDF4", borderColor: "#BBF7D0" },
  requestStatusRefused: { backgroundColor: "#FEF2F2", borderColor: "#FECACA" },
  requestStatusText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  driverRequests: {
    gap: 8, marginTop: 4, padding: 12, borderRadius: 14,
    backgroundColor: "#FFFCF5", borderWidth: 1, borderColor: BORDER,
  },
  driverRequestsTitle: { fontSize: 13, fontFamily: "Inter_700Bold" },
  driverRequestRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    gap: 8, paddingTop: 4,
  },
  driverRequestInfo: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  driverRequestName: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  driverRequestStatus: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  requestActions: { flexDirection: "row", gap: 7 },
  requestAction: {
    width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center",
    borderWidth: 1,
  },
  requestAccept: { backgroundColor: "#F0FDF4", borderColor: "#BBF7D0" },
  requestRefuse: { backgroundColor: "#FEF2F2", borderColor: "#FECACA" },

  // FAB
  fabWrapper: { position: "absolute", right: 20, zIndex: 999 },
  fab: {
    width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22, shadowRadius: 8, elevation: 6,
  },

  // Modal
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  handle:  { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  sheet:   {
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 20, paddingTop: 14, gap: 12,
  },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sheetTitle:  { fontSize: 18, fontFamily: "Inter_700Bold" },
  inputRow:    {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12,
  },
  inputText:   { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  submitBtn:   { alignItems: "center", justifyContent: "center", paddingVertical: 16, borderRadius: 14 },
  submitBtnText: { fontSize: 16, fontFamily: "Inter_700Bold" },
});
