import { useCallback } from "react";
import { Alert } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/context/AuthContext";

export function useRequireAuth() {
  const { user } = useAuth();

  const requireAuth = useCallback(
    (action?: () => void) => {
      if (user) {
        action?.();
      } else {
        Alert.alert(
          "Connexion requise",
          "Connectez-vous ou créez un compte pour utiliser cette fonctionnalité.",
          [
            { text: "Se connecter", onPress: () => router.push("/(auth)/login") },
            { text: "Créer un compte", onPress: () => router.push("/(auth)/register") },
            { text: "Annuler", style: "cancel" },
          ]
        );
      }
    },
    [user]
  );

  return { requireAuth, isGuest: !user };
}
