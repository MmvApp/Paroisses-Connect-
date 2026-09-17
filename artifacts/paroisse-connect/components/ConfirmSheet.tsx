import React from "react";
import {
  Modal,
  Platform,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const DARK = "#111111";

type Props = {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  confirmColor?: string;
  cancelLabel?: string;
  icon?: React.ComponentProps<typeof Feather>["name"];
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
};

export function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel = "Confirmer",
  confirmColor = "#D32F2F",
  cancelLabel = "Annuler",
  icon = "alert-triangle",
  onConfirm,
  onCancel,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      presentationStyle={Platform.OS === "ios" ? "overFullScreen" : undefined}
      onRequestClose={onCancel}
    >
      <View style={s.container}>
      <TouchableOpacity
        style={s.overlay}
        activeOpacity={1}
        onPress={onCancel}
      />
      <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <View style={s.handle} />

        <View style={s.header}>
          <Feather name={icon} size={18} color={confirmColor} />
          <Text style={[s.title, { color: confirmColor }]}>{title}</Text>
        </View>

        {!!message && <Text style={s.message}>{message}</Text>}

        <TouchableOpacity
          style={[s.btn, { backgroundColor: confirmColor }]}
          onPress={onConfirm}
          activeOpacity={0.8}
        >
          <Text style={[s.btnText, { color: "#fff" }]}>{confirmLabel}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.btn, { backgroundColor: "#F3F4F6" }]}
          onPress={onCancel}
          activeOpacity={0.8}
        >
          <Text style={[s.btnText, { color: DARK }]}>{cancelLabel}</Text>
        </TouchableOpacity>
      </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, justifyContent: "flex-end" },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
    zIndex: 0,
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    paddingHorizontal: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 12,
    zIndex: 1,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#DADDE3",
    alignSelf: "center",
    marginBottom: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 6,
    paddingBottom: 4,
    paddingHorizontal: 2,
  },
  title: { fontSize: 17, fontFamily: "Inter_700Bold" },
  message: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#555",
    paddingHorizontal: 2,
    marginBottom: 8,
    lineHeight: 20,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 10,
  },
  btnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
