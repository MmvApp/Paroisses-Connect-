import React, { useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
import { PhotoViewerModal } from "@/components/ui/PhotoViewerModal";

const BORDER = "#EADFCB";

interface PublicationMediaProps {
  imageUrls?: string[];
  authorName?: string;
}

export function PublicationMedia({ imageUrls = [], authorName = "Publication" }: PublicationMediaProps) {
  const urls = imageUrls.filter((url) => typeof url === "string" && url.trim()).slice(0, 2);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);

  if (urls.length === 0) return null;

  return (
    <>
      <View style={styles.container}>
        {urls.map((url) => (
          <TouchableOpacity
            key={url}
            style={[styles.imageButton, urls.length === 2 && styles.halfImage]}
            onPress={() => setSelectedUrl(url)}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel="Ouvrir la photo"
          >
            <Image source={{ uri: url }} style={styles.image} contentFit="cover" />
          </TouchableOpacity>
        ))}
      </View>
      <PhotoViewerModal
        visible={selectedUrl !== null}
        photoURL={selectedUrl}
        name={authorName}
        onClose={() => setSelectedUrl(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    height: 190,
    flexDirection: "row",
    gap: 2,
    overflow: "hidden",
    backgroundColor: "#F7F5F0",
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  imageButton: { flex: 1, minWidth: 0, maxWidth: "100%" },
  halfImage: { flexBasis: 0 },
  image: { width: "100%", maxWidth: "100%", height: "100%" },
});