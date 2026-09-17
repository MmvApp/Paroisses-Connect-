/**
 * pushNotifications.ts
 * Utilitaires pour envoyer des notifications push via l'API Expo
 * ET persister l'historique dans Firestore (notifications/{uid}/items).
 * Tous les appels sont fire-and-forget : les erreurs ne bloquent jamais l'UX.
 */

import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { Platform } from "react-native";
import { db } from "@/lib/firebase";

// ─── Types ────────────────────────────────────────────────────────────────────

export type NotifCategory =
  | "messages"
  | "prayers"
  | "events"
  | "announcements"
  | "publications"
  | "covoiturage";

interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound: "default";
  badge?: number;
}

interface UserNotifData {
  expoPushToken?: string | null;
  notifPrefs?: {
    master?: boolean;
    messages?: boolean;
    prayers?: boolean;
    events?: boolean;
    announcements?: boolean;
    publications?: boolean;
    covoiturage?: boolean;
  };
}

// ─── Helpers internes ─────────────────────────────────────────────────────────

/** Vérifie si un utilisateur a activé une catégorie de notification. */
function wantsNotif(data: UserNotifData, category: NotifCategory): boolean {
  const prefs = data.notifPrefs;
  if (prefs?.master === false) return false;
  if (prefs && prefs[category] === false) return false;
  return true; // actif par défaut si aucune préférence sauvegardée
}

/** Envoie un lot de messages à l'API Expo (max 100 par requête). */
async function sendChunked(messages: PushMessage[]): Promise<void> {
  if (messages.length === 0) return;
  const chunks: PushMessage[][] = [];
  for (let i = 0; i < messages.length; i += 100) {
    chunks.push(messages.slice(i, i + 100));
  }
  await Promise.allSettled(
    chunks.map((chunk) =>
      fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Accept-encoding": "gzip, deflate",
        },
        body: JSON.stringify(chunk),
      })
    )
  );
}

// ─── API publique ─────────────────────────────────────────────────────────────

/**
 * Persiste une notification dans Firestore (notifications/{uid}/items).
 * Appelé automatiquement par sendPushToUsers et sendPushToParish.
 * Peut aussi être appelé directement pour les notifications sans push.
 */
export async function saveNotification(
  uid: string,
  notif: {
    title: string;
    body: string;
    type: NotifCategory;
    data?: Record<string, unknown>;
    parishId?: string;
  }
): Promise<void> {
  try {
    await addDoc(collection(db, "notifications", uid, "items"), {
      title: notif.title,
      body: notif.body,
      type: notif.type,
      data: notif.data ?? {},
      parishId: notif.parishId ?? null,
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch {
    // Non-critique
  }
}

/**
 * Envoie une notification push à une liste d'utilisateurs (par UID).
 * Persiste aussi l'historique dans Firestore pour le feed in-app.
 * Fonctionne sur toutes les plateformes (le push Expo est natif uniquement).
 */
export async function sendPushToUsers(
  uids: string[],
  title: string,
  body: string,
  data: Record<string, unknown> = {},
  category: NotifCategory
): Promise<void> {
  if (uids.length === 0) return;
  try {
    const messages: PushMessage[] = [];
    await Promise.all(
      uids.map(async (uid) => {
        const snap = await getDoc(doc(db, "users", uid));
        if (!snap.exists()) return;
        const userData = snap.data() as UserNotifData;

        if (!wantsNotif(userData, category)) return;

        // Toujours sauvegarder dans Firestore (feed in-app, toutes plateformes)
        void saveNotification(uid, { title, body, type: category, data });

        // Push Expo (token natif uniquement)
        const token = userData.expoPushToken;
        if (token && token.startsWith("ExponentPushToken")) {
          messages.push({ to: token, title, body, data, sound: "default" });
        }
      })
    );
    // Expo push — uniquement sur natif
    if (Platform.OS !== "web" && messages.length > 0) {
      await sendChunked(messages);
    }
  } catch {
    // Les notifications sont non-critiques
  }
}

/**
 * Envoie une notification à tous les membres d'une paroisse.
 * Persiste l'historique dans Firestore pour chaque membre.
 * Fonctionne sur toutes les plateformes (le push Expo est natif uniquement).
 */
export async function sendPushToParish(
  parishId: string,
  title: string,
  body: string,
  data: Record<string, unknown> = {},
  category: NotifCategory,
  excludeUid?: string
): Promise<void> {
  if (!parishId) return;
  try {
    const snap = await getDocs(
      query(collection(db, "users"), where("parishId", "==", parishId))
    );
    const messages: PushMessage[] = [];
    await Promise.all(
      snap.docs.map(async (d) => {
        if (d.id === excludeUid) return;
        const userData = d.data() as UserNotifData;

        if (!wantsNotif(userData, category)) return;

        // Toujours sauvegarder dans Firestore (feed in-app, toutes plateformes)
        void saveNotification(d.id, {
          title,
          body,
          type: category,
          data,
          parishId,
        });

        // Push Expo (token natif uniquement)
        const token = userData.expoPushToken;
        if (token && token.startsWith("ExponentPushToken")) {
          messages.push({ to: token, title, body, data, sound: "default" });
        }
      })
    );
    // Expo push — uniquement sur natif
    if (Platform.OS !== "web" && messages.length > 0) {
      await sendChunked(messages);
    }
  } catch {
    // Les notifications sont non-critiques
  }
}
