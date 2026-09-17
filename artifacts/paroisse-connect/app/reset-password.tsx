import React, { useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  confirmPasswordReset,
  verifyPasswordResetCode,
} from "firebase/auth";

import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { auth } from "@/lib/firebase";
import { firebaseErrorMessage } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { useI18n } from "@/context/I18nContext";

type Status = "checking" | "ready" | "success" | "error";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default function ResetPasswordScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const params = useLocalSearchParams<{
    mode?: string | string[];
    oobCode?: string | string[];
  }>();
  const mode = firstParam(params.mode);
  const oobCode = firstParam(params.oobCode);
  const checkedCode = useRef<string | null>(null);

  const [status, setStatus] = useState<Status>("checking");
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [fieldError, setFieldError] = useState("");

  useEffect(() => {
    if (checkedCode.current === oobCode) return;
    checkedCode.current = oobCode;

    if (mode && mode !== "resetPassword") {
      setStatus("error");
      setError("Ce lien ne correspond pas à une réinitialisation de mot de passe.");
      return;
    }

    if (!oobCode) {
      setStatus("error");
      setError("Le lien de réinitialisation est incomplet ou invalide.");
      return;
    }

    verifyPasswordResetCode(auth, oobCode)
      .then((accountEmail) => {
        setEmail(accountEmail);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        setStatus("error");
        setError(firebaseErrorMessage(err));
      });
  }, [mode, oobCode]);

  const handleSubmit = async () => {
    setFieldError("");
    setError("");

    if (newPassword.length < 6) {
      setFieldError("Le nouveau mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    if (newPassword !== confirmation) {
      setFieldError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    if (!oobCode) {
      setError("Le lien de réinitialisation est invalide.");
      return;
    }

    setLoading(true);
    try {
      await confirmPasswordReset(auth, oobCode, newPassword);
      setStatus("success");
    } catch (err: unknown) {
      setError(firebaseErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const goToLogin = () => {
    router.replace("/(auth)/login");
  };

  return (
    <LinearGradient
      colors={[colors.background, colors.cream ?? colors.background]}
      style={styles.gradient}
    >
      <KeyboardAwareScrollViewCompat
        style={styles.scroll}
        contentContainerStyle={{
          paddingTop: insets.top + 20,
          paddingBottom: insets.bottom + 40,
          paddingHorizontal: 28,
        }}
        bottomOffset={20}
      >
        <View style={styles.header}>
          <View style={[styles.iconBadge, { backgroundColor: colors.primary }]}>
            <Feather
              name={status === "success" ? "check" : "lock"}
              size={28}
              color={colors.primaryForeground}
            />
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Réinitialiser mon mot de passe
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Paroisse Connect
          </Text>
        </View>

        {status === "checking" && (
          <View style={styles.messageBlock}>
            <Text style={[styles.message, { color: colors.mutedForeground }]}>
              Vérification de votre lien…
            </Text>
          </View>
        )}

        {status === "error" && (
          <View
            style={[
              styles.banner,
              {
                backgroundColor: colors.destructive + "18",
                borderColor: colors.destructive + "44",
              },
            ]}
          >
            <Feather name="alert-circle" size={18} color={colors.destructive} />
            <Text style={[styles.bannerText, { color: colors.destructive }]}>
              {t(error)}
            </Text>
          </View>
        )}

        {status === "ready" && (
          <View>
            <View
              style={[
                styles.accountCard,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.accountLabel, { color: colors.mutedForeground }]}>
                Compte concerné
              </Text>
              <Text style={[styles.accountEmail, { color: colors.foreground }]}>
                {email}
              </Text>
            </View>

            <Input
              label="Nouveau mot de passe"
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="••••••••"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              testID="reset-new-password"
              leftIcon={
                <Feather name="lock" size={18} color={colors.mutedForeground} />
              }
            />
            <Input
              label="Confirmer le mot de passe"
              value={confirmation}
              onChangeText={setConfirmation}
              placeholder="••••••••"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              testID="reset-confirm-password"
               error={t(fieldError)}
              leftIcon={
                <Feather name="check-circle" size={18} color={colors.mutedForeground} />
              }
            />

            {error !== "" && (
              <View
                style={[
                  styles.banner,
                  {
                    backgroundColor: colors.destructive + "18",
                    borderColor: colors.destructive + "44",
                  },
                ]}
              >
                <Feather name="alert-circle" size={18} color={colors.destructive} />
                <Text style={[styles.bannerText, { color: colors.destructive }]}>
                   {t(error)}
                </Text>
              </View>
            )}

            <Button
              title="Enregistrer le nouveau mot de passe"
              onPress={handleSubmit}
              loading={loading}
              testID="reset-submit"
            />
          </View>
        )}

        {status === "success" && (
          <View>
            <View
              style={[
                styles.banner,
                {
                  backgroundColor: colors.primary + "18",
                  borderColor: colors.primary + "44",
                },
              ]}
            >
              <Feather name="check-circle" size={18} color={colors.primary} />
              <Text style={[styles.bannerText, { color: colors.foreground }]}>
                Votre mot de passe a été modifié. Vous pouvez maintenant vous connecter
                avec votre nouveau mot de passe.
              </Text>
            </View>
            <Button
              title="Retour à Paroisse Connect"
              onPress={goToLogin}
              testID="reset-return-to-login"
            />
          </View>
        )}

        {status === "error" && (
          <Button
            title="Demander un nouveau lien"
            variant="outline"
            onPress={goToLogin}
            testID="reset-return-to-login"
          />
        )}
      </KeyboardAwareScrollViewCompat>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  scroll: { flex: 1 },
  header: { alignItems: "center", marginBottom: 28 },
  iconBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  messageBlock: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  message: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
  },
  bannerText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    lineHeight: 20,
  },
  accountCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 20,
  },
  accountLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginBottom: 5,
  },
  accountEmail: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});