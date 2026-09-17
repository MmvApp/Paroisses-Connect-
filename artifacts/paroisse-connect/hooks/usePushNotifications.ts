/**
 * usePushNotifications
 * Demande les permissions, enregistre le token Expo dans Firestore,
 * et configure les écouteurs de notifications (foreground + tap).
 *
 * Sur le web : demande la permission Notification du navigateur et affiche
 * des notifications navigateur quand de nouveaux items arrivent dans Firestore
 * et que la page n'est pas au premier plan.
 */

import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  limit,
} from "firebase/firestore";
import { router } from "expo-router";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";

// Comportement en premier plan : afficher l'alerte + son + badge
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export function usePushNotifications() {
  const { user } = useAuth();
  const responseListener = useRef<Notifications.EventSubscription | null>(null);
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);

  // ── Web : permission navigateur + listener Firestore → Notification API ────
  useEffect(() => {
    if (Platform.OS !== "web" || !user) return;

    // Demander la permission navigateur (une fois, sans bloquer)
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }

    const initialLoad = { done: false };

    // Écouter les nouvelles notifications dans Firestore
    const unsub = onSnapshot(
      query(
        collection(db, "notifications", user.uid, "items"),
        where("read", "==", false),
        orderBy("createdAt", "desc"),
        limit(5)
      ),
      (snap) => {
        // Ignorer le snapshot initial (évite de notifier les anciennes notifs)
        if (!initialLoad.done) {
          initialLoad.done = true;
          return;
        }
        snap.docChanges().forEach((change) => {
          if (change.type !== "added") return;
          const notif = change.doc.data() as {
            title?: string;
            body?: string;
            data?: Record<string, string>;
          };
          // Afficher une notification navigateur si la page n'est pas visible
          if (
            typeof Notification !== "undefined" &&
            Notification.permission === "granted" &&
            typeof document !== "undefined" &&
            document.visibilityState !== "visible"
          ) {
            try {
              const n = new Notification(notif.title ?? "Paroisse Connect", {
                body: notif.body ?? "",
                icon: "/favicon.ico",
                tag: change.doc.id,
              });
              // Tap → naviguer vers l'écran source
              n.onclick = () => {
                if (notif.data?.screen) {
                  try {
                    router.push(notif.data.screen as never);
                  } catch {
                    // Navigation échouée
                  }
                }
                // Marquer comme lu
                void updateDoc(
                  doc(db, "notifications", user.uid, "items", change.doc.id),
                  { read: true }
                );
              };
            } catch {
              // Notification API non disponible
            }
          }
        });
      },
      () => {} // Erreur non-critique
    );

    return () => unsub();
  }, [user]);

  // ── Natif (iOS / Android) ─────────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS === "web" || !user) return;

    let cancelled = false;

    const registerToken = async () => {
      try {
        // Demande ou vérifie les permissions
        const { status: existing } = await Notifications.getPermissionsAsync();
        let finalStatus = existing;
        if (existing !== "granted") {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        if (finalStatus !== "granted" || cancelled) return;

        // Canal Android obligatoire
        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("default", {
            name: "Paroisse Connect",
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: "#C9A24A",
            sound: "default",
          });
        }

        // Récupère le token Expo (nécessite le projectId EAS)
        const projectId =
          Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
        const { data: token } = await Notifications.getExpoPushTokenAsync(
          projectId ? { projectId } : undefined
        );

        if (cancelled || !token) return;

        // Sauvegarde le token dans Firestore
        await updateDoc(doc(db, "users", user.uid), { expoPushToken: token });
      } catch {
        // Non-critique : l'app fonctionne sans notifications
      }
    };

    void registerToken();

    // Écoute les taps sur les notifications (navigation)
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as Record<string, string>;
        if (data?.screen) {
          try {
            router.push(data.screen as never);
          } catch {
            // Navigation échouée
          }
        }
      }
    );

    // Écoute les notifications reçues au premier plan
    notificationListener.current = Notifications.addNotificationReceivedListener(() => {
      // Le badge et le son sont gérés par setNotificationHandler
    });

    return () => {
      cancelled = true;
      responseListener.current?.remove();
      notificationListener.current?.remove();
    };
  }, [user]);
}
