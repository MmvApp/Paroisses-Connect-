import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Image } from "expo-image";

interface AvatarProps {
  name: string;
  size?: number;
  photoURL?: string | null;
  /** Called when the avatar is tapped, with or without a profile photo. */
  onPress?: () => void;
}

function getInitials(name: string) {
  const parts = name.trim().split(" ");
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function hashColor(name: string, palette: string[]) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return palette[Math.abs(hash) % palette.length];
}

const PALETTE = [
  "#C9A24A",
  "#7C3AED",
  "#2d6a4f",
  "#0891B2",
  "#D97706",
  "#E53935",
];

export function Avatar({ name, size = 40, photoURL, onPress }: AvatarProps) {
  const [imgError, setImgError] = useState(false);

  // Reset the error flag whenever the URL changes so a freshly-uploaded photo
  // is always attempted even if the previous URL had failed.
  useEffect(() => {
    setImgError(false);
  }, [photoURL]);

  if (photoURL && !imgError) {
    const img = (
      <Image
        source={{ uri: photoURL }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
        }}
        contentFit="cover"
        cachePolicy="none"
        transition={200}
        onLoad={() => console.log("[avatar] onLoad OK, url:", photoURL?.slice(0, 80))}
        onError={(e) => {
          console.error("[avatar] onError — image non chargée:", e, "url:", photoURL?.slice(0, 80));
          setImgError(true);
        }}
      />
    );

    if (onPress) {
      return (
        <TouchableOpacity
          onPress={onPress}
          activeOpacity={0.75}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          {img}
        </TouchableOpacity>
      );
    }
    return img;
  }

  const bg       = hashColor(name, PALETTE);
  const initials = getInitials(name);

  const initialsAvatar = (
    <View
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
        },
      ]}
    >
      <Text style={[styles.initials, { fontSize: size * 0.36, color: "#fff" }]}>
        {initials}
      </Text>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.75}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        accessibilityRole="button"
        accessibilityLabel={`Ouvrir la photo de profil de ${name}`}
      >
        {initialsAvatar}
      </TouchableOpacity>
    );
  }

  return initialsAvatar;
}

const styles = StyleSheet.create({
  circle:   { alignItems: "center", justifyContent: "center" },
  initials: { fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },
});
