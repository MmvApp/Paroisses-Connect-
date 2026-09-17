import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import Constants from "expo-constants";

const firebaseConfig = {
  apiKey: "AIzaSyClDXYo3nFV8tO2OiEMJRKu9RHwJfxgk0g",
  authDomain: "paroisse-connect.firebaseapp.com",
  projectId: "paroisse-connect",
  storageBucket: "paroisse-connect.firebasestorage.app",
  messagingSenderId: "369294801640",
  appId: "1:369294801640:web:1a5831544ea2bf3732a75d",
};

const canonicalUrl =
  Constants.expoConfig?.extra?.canonicalUrl ??
  "https://parish-connect-chat--mvira891.replit.app";

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const passwordResetUrl = `${canonicalUrl}/reset-password`;
export default app;
