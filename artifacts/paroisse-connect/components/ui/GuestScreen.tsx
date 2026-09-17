import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";

const GOLD  = "#C9A24A";
const DARK  = "#111111";
const CREAM = "#FFF8EC";

interface GuestScreenProps {
  icon?: string;
  title?: string;
  message?: string;
  footer?: React.ReactNode;
}

export function GuestScreen({
  icon    = "lock",
  title   = "Connexion requise",
  message = "Connectez-vous ou créez un compte pour accéder à cette section.",
  footer,
}: GuestScreenProps) {
  return (
    <View style={s.container}>
      <View style={s.iconWrap}>
        <Feather name={icon as never} size={36} color={GOLD} />
      </View>
      <Text style={s.title}>{title}</Text>
      <Text style={s.message}>{message}</Text>
      <TouchableOpacity style={s.btnPrimary} onPress={() => router.push("/(auth)/login")} activeOpacity={0.85}>
        <Text style={s.btnPrimaryText}>Se connecter</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.btnSecondary} onPress={() => router.push("/(auth)/register")} activeOpacity={0.85}>
        <Text style={s.btnSecondaryText}>Créer un compte</Text>
      </TouchableOpacity>
      {footer}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    padding: 36,
    gap: 16,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: CREAM,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: DARK,
    textAlign: "center",
  },
  message: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#666",
    textAlign: "center",
    lineHeight: 21,
    maxWidth: 300,
  },
  btnPrimary: {
    backgroundColor: GOLD,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignItems: "center",
    width: "100%",
    maxWidth: 300,
    minWidth: 0,
    marginTop: 8,
  },
  btnPrimaryText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  btnSecondary: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignItems: "center",
    width: "100%",
    maxWidth: 300,
    minWidth: 0,
    borderWidth: 1.5,
    borderColor: GOLD,
  },
  btnSecondaryText: {
    color: GOLD,
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
});
