import React from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Feather } from "@expo/vector-icons";

const GOLD = "#C9A24A";
const DARK = "#111111";
const BORDER = "#E5E0D8";
const MUTED = "#7A7A8A";

interface PublicationPhotoPickerProps {
  localUris: string[];
  existingUrls?: string[];
  onLocalUrisChange: (uris: string[]) => void;
  onExistingUrlsChange?: (urls: string[]) => void;
  disabled?: boolean;
  uploading?: boolean;
}

export function PublicationPhotoPicker({
  localUris,
  existingUrls = [],
  onLocalUrisChange,
  onExistingUrlsChange,
  disabled = false,
  uploading = false,
}: PublicationPhotoPickerProps) {
  const total = existingUrls.length + localUris.length;

  const pickImages = async () => {
    if (disabled || total >= 2) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission requise", "Autorisez l'accès à la galerie pour ajouter une photo.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsMultipleSelection: true,
      selectionLimit: 2 - total,
      quality: 0.82,
    });
    if (!result.canceled && result.assets.length > 0) {
      onLocalUrisChange([
        ...localUris,
        ...result.assets.slice(0, 2 - total).map((asset) => asset.uri),
      ]);
    }
  };

  const removeExisting = (index: number) => {
    onExistingUrlsChange?.(existingUrls.filter((_, currentIndex) => currentIndex !== index));
  };

  const removeLocal = (index: number) => {
    onLocalUrisChange(localUris.filter((_, currentIndex) => currentIndex !== index));
  };

  return (
    <View style={styles.root}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>Photos (optionnelles)</Text>
        <Text style={styles.counter}>{total}/2</Text>
      </View>
      <Text style={styles.hint}>Ajoutez jusqu’à 2 photos. Elles seront affichées en haut de la publication.</Text>

      {total > 0 ? (
        <View style={styles.previewRow}>
          {existingUrls.map((uri, index) => (
            <View key={`existing-${uri}-${index}`} style={styles.previewWrap}>
              <Image source={uri} style={styles.preview} contentFit="cover" />
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => removeExisting(index)}
                disabled={disabled || uploading}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Feather name="x" size={14} color="#fff" />
              </TouchableOpacity>
            </View>
          ))}
          {localUris.map((uri, index) => (
            <View key={`local-${uri}-${index}`} style={styles.previewWrap}>
              <Image source={uri} style={styles.preview} contentFit="cover" />
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => removeLocal(index)}
                disabled={disabled || uploading}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Feather name="x" size={14} color="#fff" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : null}

      {total < 2 ? (
        <TouchableOpacity
          style={[styles.addButton, total > 0 && styles.addButtonCompact, disabled && styles.disabled]}
          onPress={pickImages}
          disabled={disabled}
          activeOpacity={0.8}
        >
          {uploading ? (
            <ActivityIndicator size="small" color={GOLD} />
          ) : (
            <Feather name="camera" size={total > 0 ? 18 : 26} color={GOLD} />
          )}
          <Text style={styles.addLabel}>{uploading ? "Envoi…" : total > 0 ? "Ajouter une autre photo" : "Ajouter des photos"}</Text>
          {total === 0 ? <Text style={styles.addHint}>JPG, PNG ou HEIC</Text> : null}
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { marginBottom: 18 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  counter: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: GOLD },
  hint: { fontSize: 12, fontFamily: "Inter_400Regular", color: MUTED, lineHeight: 17, marginBottom: 10 },
  previewRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  previewWrap: { flex: 1, height: 130, borderRadius: 12, overflow: "hidden", backgroundColor: "#F7F5F0" },
  preview: { width: "100%", height: "100%" },
  removeButton: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.58)",
  },
  addButton: {
    minHeight: 112,
    borderWidth: 2,
    borderColor: BORDER,
    borderStyle: "dashed",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: "#FAFAFA",
  },
  addButtonCompact: { minHeight: 48, flexDirection: "row", borderWidth: 1.5, gap: 8 },
  addLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: MUTED },
  addHint: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#9AA3B0" },
  disabled: { opacity: 0.55 },
});