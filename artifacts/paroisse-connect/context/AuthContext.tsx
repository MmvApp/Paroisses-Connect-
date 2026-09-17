import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from "react";
import {
  User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from "firebase/auth";
import type { ActionCodeSettings } from "firebase/auth";
import { collection, doc, setDoc, updateDoc, serverTimestamp, onSnapshot } from "firebase/firestore";
import { auth, db, passwordResetUrl } from "@/lib/firebase";

const AUTH_TIMEOUT_MS = 8000;

export interface NotifPrefs {
  master: boolean;
  messages: boolean;
  prayers: boolean;
  events: boolean;
  announcements: boolean;
  publications: boolean;
  covoiturage: boolean;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  role: "member" | "admin" | "priest" | "super_admin";
  photoURL?: string | null;
  parishId?: string;
  parishName?: string;
  priestParishId?: string;
  priestParishName?: string;
  createdAt?: unknown;
  expoPushToken?: string | null;
  notifPrefs?: NotifPrefs;
}

export interface PublicUserProfile {
  uid: string;
  displayName: string;
  photoURL?: string | null;
}

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  userDirectory: Record<string, PublicUserProfile>;
  loading: boolean;
  authError: string | null;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logOut: () => Promise<void>;
  updateParish: (parishId: string, parishName: string) => Promise<void>;
  updatePhotoURL: (url: string) => Promise<void>;
  updateDisplayName: (displayName: string) => Promise<void>;
  retryAuth: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [userDirectory, setUserDirectory] = useState<Record<string, PublicUserProfile>>({});
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const retryAuth = useCallback(() => {
    setAuthError(null);
    setLoading(true);
    setRetryKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let profileUnsub: (() => void) | null = null;
    let didResolve = false;

    const timeout = setTimeout(() => {
      if (!didResolve) {
        setAuthError("Impossible de se connecter au serveur. Vérifiez votre connexion internet et réessayez.");
        setLoading(false);
      }
    }, AUTH_TIMEOUT_MS);

    const authUnsub = onAuthStateChanged(
      auth,
      (firebaseUser) => {
        didResolve = true;
        clearTimeout(timeout);
        setUser(firebaseUser);
        setAuthError(null);

        if (profileUnsub) { profileUnsub(); profileUnsub = null; }

        if (firebaseUser) {
          const ref = doc(db, "users", firebaseUser.uid);
          profileUnsub = onSnapshot(
            ref,
            (snap) => {
              if (snap.exists()) {
                setProfile(snap.data() as UserProfile);
              }
              setLoading(false);
            },
            () => {
              setLoading(false);
            }
          );
        } else {
          setProfile(null);
          setLoading(false);
        }
      },
      (error) => {
        clearTimeout(timeout);
        const msg = (error as { code?: string })?.code?.includes("network")
          ? "Erreur réseau. Vérifiez votre connexion internet."
          : "Erreur d'authentification. Réessayez.";
        setAuthError(msg);
        setLoading(false);
      }
    );

    return () => {
      clearTimeout(timeout);
      authUnsub();
      if (profileUnsub) profileUnsub();
    };
  }, [retryKey]);

  // Names and photos are public profile data used throughout social features.
  // Keeping this small UID-indexed directory live lets old denormalized content
  // display the current name without rewriting or deleting historical data.
  useEffect(() => {
    if (!user) {
      setUserDirectory({});
      return;
    }

    const unsubscribe = onSnapshot(
      collection(db, "users"),
      (snap) => {
        const next: Record<string, PublicUserProfile> = {};
        snap.docs.forEach((profileDoc) => {
          const data = profileDoc.data();
          if (typeof data.displayName !== "string" || !data.displayName.trim()) return;
          next[profileDoc.id] = {
            uid: profileDoc.id,
            displayName: data.displayName,
            photoURL: typeof data.photoURL === "string" ? data.photoURL : null,
          };
        });
        setUserDirectory(next);
      },
      (error) => {
        console.error("[auth] user directory listener error:", error);
        setUserDirectory({});
      },
    );

    return unsubscribe;
  }, [user]);

  const signUp = useCallback(
    async (email: string, password: string, displayName: string) => {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName });
      const profileData: UserProfile = {
        uid: cred.user.uid,
        displayName,
        email,
        role: "member",
        createdAt: serverTimestamp(),
      };
      await setDoc(doc(db, "users", cred.user.uid), profileData);
      setProfile(profileData);
    },
    []
  );

  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    auth.languageCode = "fr";
    const actionCodeSettings: ActionCodeSettings = {
      url: passwordResetUrl,
      handleCodeInApp: false,
    };
    await sendPasswordResetEmail(auth, email.trim(), actionCodeSettings);
  }, []);

  const logOut = useCallback(async () => {
    console.log("[logout] started");

    // 0. Supprime le token push pour ne plus recevoir de notifications
    const currentUser = user;
    if (currentUser) {
      try {
        await updateDoc(doc(db, "users", currentUser.uid), { expoPushToken: null });
      } catch { /* non-critique */ }
    }

    // 1. Clear React state immediately
    setUser(null);
    setProfile(null);
    console.log("[logout] react state cleared");

    // 2. Firebase signOut — clears IndexedDB (web) / AsyncStorage (native).
    //    Errors are NOT swallowed: let them bubble to the caller.
    await signOut(auth);
    console.log("[logout] firebase signOut success");

    // 3. Belt-and-suspenders: wipe all web storage so no stale token survives.
    if (typeof window !== "undefined") {
      try { localStorage.clear(); } catch { /* ignore */ }
      try { sessionStorage.clear(); } catch { /* ignore */ }
      console.log("[logout] web storage cleared");
    }

    // 4. On native, clear AsyncStorage (Firebase uses it for token persistence).
    if (typeof window === "undefined") {
      try {
        const AS = (await import("@react-native-async-storage/async-storage")).default;
        await AS.clear();
        console.log("[logout] AsyncStorage cleared");
      } catch { /* ignore if not available */ }
    }
  }, []);

  const updateParish = useCallback(
    async (parishId: string, parishName: string) => {
      if (!user) return;
      await updateDoc(doc(db, "users", user.uid), { parishId, parishName });
      setProfile((prev) => (prev ? { ...prev, parishId, parishName } : prev));
    },
    [user]
  );

  const updatePhotoURL = useCallback(
    async (url: string) => {
      if (!user) return;
      await updateDoc(doc(db, "users", user.uid), { photoURL: url });
      await updateProfile(user, { photoURL: url });
      setProfile((prev) => (prev ? { ...prev, photoURL: url } : prev));
    },
    [user]
  );

  const updateDisplayName = useCallback(
    async (displayName: string) => {
      if (!user) throw new Error("Utilisateur non connecté.");
      const normalizedName = displayName.trim();
      if (!normalizedName) throw new Error("Le nom affiché est obligatoire.");
      if (normalizedName.length > 80) throw new Error("Le nom affiché doit contenir au maximum 80 caractères.");

      // The UID, email and role are never part of this update.
      await updateProfile(user, { displayName: normalizedName });
      await updateDoc(doc(db, "users", user.uid), { displayName: normalizedName });
      setProfile((prev) => (prev ? { ...prev, displayName: normalizedName } : prev));
    },
    [user]
  );

  const value = useMemo(
    () => ({
      user, profile, userDirectory, loading, authError,
      signUp, signIn, resetPassword, logOut, updateParish, updatePhotoURL, updateDisplayName, retryAuth,
    }),
    [user, profile, userDirectory, loading, authError, signUp, signIn, resetPassword, logOut, updateParish, updatePhotoURL, updateDisplayName, retryAuth]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function firebaseErrorMessage(err: unknown): string {
  const code =
    (err as { code?: string })?.code ??
    (err instanceof Error ? err.message : "");
  if (code.includes("email-already-in-use"))
    return "Cette adresse e-mail est déjà utilisée.";
  if (code.includes("invalid-email")) return "L'adresse e-mail est invalide.";
  if (code.includes("weak-password"))
    return "Le mot de passe est trop faible (minimum 6 caractères).";
  if (code.includes("invalid-credential") || code.includes("wrong-password"))
    return "Email ou mot de passe incorrect.";
  if (code.includes("user-not-found"))
    return "Aucun compte trouvé avec cet email.";
  if (code.includes("too-many-requests"))
    return "Trop de tentatives. Réessayez dans quelques minutes.";
  if (code.includes("expired-action-code"))
    return "Ce lien a expiré. Demandez un nouvel e-mail de réinitialisation.";
  if (code.includes("invalid-action-code"))
    return "Ce lien de réinitialisation est invalide ou a déjà été utilisé.";
  if (code.includes("network-request-failed"))
    return "Erreur réseau. Vérifiez votre connexion internet.";
  if (code.includes("api-key-not-valid") || code.includes("invalid-api-key"))
    return "Configuration Firebase invalide. Contactez l'administrateur.";
  return err instanceof Error ? err.message : "Une erreur est survenue. Réessayez.";
}
