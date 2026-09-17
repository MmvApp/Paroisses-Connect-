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

export default function RegisterScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { signUp } = useAuth();
  const { t } = useI18n();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [globalError, setGlobalError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Le prénom et nom sont requis";
    if (!email.trim()) e.email = "L'email est requis";
    else if (!/\S+@\S+\.\S+/.test(email.trim())) e.email = "Email invalide";
    if (!password) e.password = "Le mot de passe est requis";
    else if (password.length < 6) e.password = "Minimum 6 caractères";
    if (!confirm) e.confirm = "Veuillez confirmer votre mot de passe";
    else if (password !== confirm)
      e.confirm = "Les mots de passe ne correspondent pas";
    setFieldErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleRegister = async () => {
    setGlobalError("");
    if (!validate()) return;
    setLoading(true);
    try {
      await signUp(email.trim(), password, name.trim());
      // onAuthStateChanged in AuthContext will handle navigation
    } catch (err: unknown) {
      console.error("[Register] signUp error:", err);
      setGlobalError(firebaseErrorMessage(err));
    } finally {
      setLoading(false);
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
          <View style={[styles.iconBadge, { backgroundColor: colors.accent }]}>
            <Feather name="user-plus" size={28} color="#fff" />
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Rejoindre la paroisse
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Créez votre compte pour accéder à la communauté
          </Text>
        </View>

        {/* Global Firebase error banner */}
        {globalError !== "" && (
          <View
            style={[
              styles.errorBanner,
              { backgroundColor: colors.destructive + "18", borderColor: colors.destructive + "44" },
            ]}
          >
            <Feather name="alert-circle" size={16} color={colors.destructive} />
            <Text style={[styles.errorBannerText, { color: colors.destructive }]}>
              {globalError}
            </Text>
          </View>
        )}

        {/* Form */}
        <View>
          <Input
            label="Prénom et Nom"
            value={name}
            onChangeText={(v) => {
              setName(v);
              if (fieldErrors.name) setFieldErrors((e) => ({ ...e, name: "" }));
            }}
            placeholder="Marie Dupont"
            autoCapitalize="words"
            returnKeyType="next"
            onSubmitEditing={() => emailRef.current?.focus()}
            error={fieldErrors.name}
            leftIcon={
              <Feather name="user" size={18} color={colors.mutedForeground} />
            }
          />

          <Input
            ref={emailRef}
            label="Email"
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              if (fieldErrors.email) setFieldErrors((e) => ({ ...e, email: "" }));
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
            placeholder="Minimum 6 caractères"
            secureTextEntry
            returnKeyType="next"
            onSubmitEditing={() => confirmRef.current?.focus()}
            error={fieldErrors.password}
            leftIcon={
              <Feather name="lock" size={18} color={colors.mutedForeground} />
            }
          />

          <Input
            ref={confirmRef}
            label="Confirmer le mot de passe"
            value={confirm}
            onChangeText={(v) => {
              setConfirm(v);
              if (fieldErrors.confirm)
                setFieldErrors((e) => ({ ...e, confirm: "" }));
            }}
            placeholder="Répétez votre mot de passe"
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleRegister}
            error={fieldErrors.confirm}
            leftIcon={
              <Feather name="lock" size={18} color={colors.mutedForeground} />
            }
          />

          <Button
            title="Créer mon compte"
            onPress={handleRegister}
            loading={loading}
          />
        </View>

        <TouchableOpacity
          style={styles.loginLink}
          onPress={() => router.replace("/(auth)/login")}
        >
          <Text style={[styles.linkText, { color: colors.mutedForeground }]}>
            {t("Déjà membre ?")}{" "}
            <Text
              style={{
                color: colors.primary,
                fontFamily: "Inter_600SemiBold",
              }}
            >
              Se connecter
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  title: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    marginBottom: 8,
    letterSpacing: -0.5,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
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
  loginLink: { marginTop: 24, alignItems: "center" },
  linkText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});
