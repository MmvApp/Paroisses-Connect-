import React, { useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth, firebaseErrorMessage } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { useI18n } from "@/context/I18nContext";

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { signIn, resetPassword } = useAuth();
  const { t } = useI18n();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [globalError, setGlobalError] = useState("");
  const [globalSuccess, setGlobalSuccess] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const passwordRef = useRef<TextInput>(null);

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!email.trim()) e.email = "L'email est requis";
    else if (!/\S+@\S+\.\S+/.test(email.trim())) e.email = "Email invalide";
    if (!password) e.password = "Le mot de passe est requis";
    setFieldErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleLogin = async () => {
    setGlobalError("");
    setGlobalSuccess("");
    if (!validate()) return;
    setLoading(true);
    try {
      await signIn(email.trim(), password);
    } catch (err: unknown) {
      console.error("[Login] signIn error:", err);
      setGlobalError(firebaseErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setGlobalError("");
    setGlobalSuccess("");
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setFieldErrors((current) => ({
        ...current,
        email: "Entrez votre adresse e-mail pour réinitialiser votre mot de passe",
      }));
      return;
    }
    if (!/\S+@\S+\.\S+/.test(normalizedEmail)) {
      setFieldErrors((current) => ({ ...current, email: "Email invalide" }));
      return;
    }

    setResetLoading(true);
    try {
      await resetPassword(normalizedEmail);
      setGlobalSuccess(
        "E-mail envoyé. Consultez votre boîte mail pour réinitialiser votre mot de passe."
      );
    } catch (err: unknown) {
      console.error("[Login] password reset error:", err);
      setGlobalError(firebaseErrorMessage(err));
    } finally {
      setResetLoading(false);
    }
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
        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.iconBadge, { backgroundColor: colors.primary }]}>
            <Feather name="heart" size={28} color="#fff" />
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Paroisse Connect
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Connectez-vous à votre communauté
          </Text>
        </View>

        {/* Global Firebase error banner */}
        {globalError !== "" && (
          <View
            style={[
              styles.errorBanner,
              {
                backgroundColor: colors.destructive + "18",
                borderColor: colors.destructive + "44",
              },
            ]}
          >
            <Feather name="alert-circle" size={16} color={colors.destructive} />
            <Text
              style={[styles.errorBannerText, { color: colors.destructive }]}
            >
              {globalError}
            </Text>
          </View>
        )}

        {globalSuccess !== "" && (
          <View
            style={[
              styles.errorBanner,
              {
                backgroundColor: colors.primary + "18",
                borderColor: colors.primary + "44",
              },
            ]}
          >
            <Feather name="check-circle" size={16} color={colors.primary} />
            <Text style={[styles.errorBannerText, { color: colors.foreground }]}>
              {globalSuccess}
            </Text>
          </View>
        )}

        {/* Form */}
        <View>
          <Input
            label="Email"
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              if (fieldErrors.email)
                setFieldErrors((e) => ({ ...e, email: "" }));
            }}
            placeholder="votre@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            error={fieldErrors.email}
            leftIcon={
              <Feather name="mail" size={18} color={colors.mutedForeground} />
            }
          />

          <Input
            ref={passwordRef}
            label="Mot de passe"
            value={password}
            onChangeText={(v) => {
              setPassword(v);
              if (fieldErrors.password)
                setFieldErrors((e) => ({ ...e, password: "" }));
            }}
            placeholder="••••••••"
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleLogin}
            error={fieldErrors.password}
            leftIcon={
              <Feather name="lock" size={18} color={colors.mutedForeground} />
            }
          />

          <TouchableOpacity
            style={styles.forgotPasswordLink}
            onPress={handleForgotPassword}
            disabled={loading || resetLoading}
          >
            <Text style={[styles.forgotPasswordText, { color: colors.primary }]}>
              {resetLoading ? t("Envoi en cours…") : t("Mot de passe oublié ?")}
            </Text>
          </TouchableOpacity>

          <Button title="Se connecter" onPress={handleLogin} loading={loading} />
        </View>

        <TouchableOpacity
          style={styles.registerLink}
          onPress={() => router.replace("/(auth)/register")}
        >
          <Text style={[styles.linkText, { color: colors.mutedForeground }]}>
            {t("Pas encore membre ?")}{" "}
            <Text
              style={{
                color: colors.primary,
                fontFamily: "Inter_600SemiBold",
              }}
            >
              Créer un compte
            </Text>
          </Text>
        </TouchableOpacity>
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
    shadowColor: "#8B1A1A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    lineHeight: 20,
  },
  forgotPasswordLink: {
    alignSelf: "flex-end",
    marginTop: -6,
    marginBottom: 16,
    paddingVertical: 4,
  },
  forgotPasswordText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  registerLink: { marginTop: 24, alignItems: "center" },
  linkText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});
