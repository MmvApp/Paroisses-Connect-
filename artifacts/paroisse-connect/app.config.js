/** @type {import('expo/config').ExpoConfig} */
const CANONICAL_URL = "https://parish-connect-chat--mvira891.replit.app";
const TITLE        = "Paroisse Connect – Application des paroisses catholiques";
const DESCRIPTION  = "Paroisse Connect est l'application des paroisses catholiques en France. Horaires des messes, annonces, intentions de prière, groupes, événements, covoiturage et vie paroissiale.";

const config = {
  name: "Paroisse Connect",
  slug: "paroisse-connect",
  owner: "mmvplume99",
  version: "1.0.2",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "paroisse-connect",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  splash: {
    image: "./assets/images/icon.png",
    resizeMode: "contain",
    backgroundColor: "#8B1A1A",
  },
  ios: {
    bundleIdentifier: "com.paroisseconnect.app",
    buildNumber: "1",
    supportsTablet: false,
    infoPlist: {
      NSPhotoLibraryUsageDescription:
        "Paroisse Connect souhaite accéder à vos photos pour votre photo de profil et les publications.",
      NSCameraUsageDescription:
        "Paroisse Connect souhaite utiliser votre appareil photo pour votre photo de profil.",
      NSLocationWhenInUseUsageDescription:
        "Paroisse Connect utilise votre position pour afficher les paroisses à proximité.",
    },
  },
  android: {
    package: "com.paroisseconnect.app",
    versionCode: 4,
    adaptiveIcon: {
      foregroundImage: "./assets/images/icon.png",
      backgroundColor: "#8B1A1A",
    },
    permissions: [
      "android.permission.INTERNET",
      "android.permission.CAMERA",
      "android.permission.READ_MEDIA_IMAGES",
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.ACCESS_FINE_LOCATION",
      "android.permission.ACCESS_COARSE_LOCATION",
    ],
  },
  web: {
    favicon: "./assets/images/icon.png",
    lang: "fr",
    title: TITLE,
    description: DESCRIPTION,
    themeColor: "#C9A24A",
    backgroundColor: "#FFFFFF",
    meta: {
      "google-site-verification": "g9W2pNz0ASFGeTOa-nsvTEZhIw-dOG0G84rEvECUeSE",
      "application-name":    "Paroisse Connect",
      "author":              "Paroisse Connect",
      "robots":              "index, follow",
      "googlebot":           "index, follow",
      "og:type":             "website",
      "og:url":              CANONICAL_URL,
      "og:title":            TITLE,
      "og:description":      DESCRIPTION,
      "og:locale":           "fr_FR",
      "og:site_name":        "Paroisse Connect",
      "twitter:card":        "summary_large_image",
      "twitter:title":       TITLE,
      "twitter:description": DESCRIPTION,
    },
  },
  plugins: [
    ["expo-router", { origin: "https://replit.com/" }],
    "expo-font",
    "expo-web-browser",
    "expo-splash-screen",
    "@react-native-community/datetimepicker",
    [
      "expo-image-picker",
      {
        photosPermission: "Paroisse Connect souhaite accéder à vos photos pour votre photo de profil.",
        cameraPermission: "Paroisse Connect souhaite utiliser votre appareil photo pour votre photo de profil.",
      },
    ],
    [
      "expo-location",
      {
        locationWhenInUsePermission: "Paroisse Connect utilise votre position pour afficher les paroisses à proximité.",
      },
    ],
    [
      "expo-notifications",
      {
        icon: "./assets/images/icon.png",
        color: "#C9A24A",
        androidMode: "default",
        androidCollapsedTitle: "Paroisse Connect",
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    canonicalUrl: CANONICAL_URL,
    firebaseApiKey: "AIzaSyClDXYo3nFV8tO2OiEMJRKu9RHwJfxgk0g",
    firebaseAuthDomain: "paroisse-connect.firebaseapp.com",
    firebaseProjectId: "paroisse-connect",
    firebaseStorageBucket: "paroisse-connect.firebasestorage.app",
    firebaseMessagingSenderId: "369294801640",
    firebaseAppId: "1:369294801640:web:1a5831544ea2bf3732a75d",
    eas: {
      projectId: "dea9c92e-beec-4ea0-99b7-90df33863875",
    },
  },
};

module.exports = { expo: config };
