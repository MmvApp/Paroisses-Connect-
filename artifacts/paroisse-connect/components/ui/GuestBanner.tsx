import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";

const GOLD  = "#C9A24A";
const DARK  = "#111111";
const CREAM = "#FFF8EC";

export function GuestBanner() {
  return (
    <View style={s.banner}>
      <Feather name="eye" size={13} color={GOLD} />
      <Text style={s.label}>Mode visiteur</Text>
      <View style={s.buttons}>
        <TouchableOpacity style={s.btnLogin} onPress={() => router.push("/(auth)/login")} activeOpacity={0.85}>
          <Text style={s.btnLoginText}>Se connecter</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.btnRegister} onPress={() => router.push("/(auth)/register")} activeOpacity={0.85}>
          <Text style={s.btnRegisterText}>Créer un compte</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: CREAM,
    borderBottomWidth: 1,
    borderBottomColor: "#EADFCB",
    flexWrap: "wrap",
  },
  label: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: DARK,
    flex: 1,
  },
  buttons: {
    flexDirection: "row",
    gap: 8,
  },
  btnLogin: {
    backgroundColor: GOLD,
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  btnLoginText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  btnRegister: {
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: GOLD,
  },
  btnRegisterText: {
    color: GOLD,
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
});
