import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

export interface ReactionBarProps {
  liked?: boolean;
  likeCount?: number;
  onLike?: () => void;
  prayed?: boolean;
  prayerCount?: number;
  onPray?: () => void;
  commentCount?: number;
  onComment?: () => void;
}

export function ReactionBar({
  liked = false,
  likeCount = 0,
  onLike,
  prayed = false,
  prayerCount = 0,
  onPray,
  commentCount = 0,
  onComment,
}: ReactionBarProps) {
  const colors = useColors();

  return (
    <View style={[styles.container, { borderTopColor: colors.border }]}>
      {onLike ? (
        <TouchableOpacity
          style={[
            styles.action,
            { backgroundColor: colors.secondary },
            liked && { backgroundColor: colors.primary + "18", borderColor: colors.primary },
          ]}
          onPress={onLike}
          activeOpacity={0.72}
          accessibilityRole="button"
          accessibilityLabel={liked ? "Retirer J’aime" : "J’aime"}
          testID="reaction-like"
        >
          <Text style={styles.emoji}>❤️</Text>
          <Text style={[styles.label, { color: liked ? colors.primary : colors.mutedForeground }]}>
            J’aime{likeCount > 0 ? ` ${likeCount}` : ""}
          </Text>
        </TouchableOpacity>
      ) : null}

      {onPray ? (
        <TouchableOpacity
          style={[
            styles.action,
            { backgroundColor: colors.secondary },
            prayed && { backgroundColor: colors.primary + "18", borderColor: colors.primary },
          ]}
          onPress={onPray}
          activeOpacity={0.72}
          accessibilityRole="button"
          accessibilityLabel={prayed ? "Retirer Je prie" : "Je prie"}
          testID="reaction-pray"
        >
          <Text style={styles.emoji}>🙏</Text>
          <Text style={[styles.label, { color: prayed ? colors.primary : colors.mutedForeground }]}>
            Je prie{prayerCount > 0 ? ` ${prayerCount}` : ""}
          </Text>
        </TouchableOpacity>
      ) : null}

      {onComment ? (
        <TouchableOpacity
          style={[styles.action, { backgroundColor: colors.secondary }]}
          onPress={onComment}
          activeOpacity={0.72}
          accessibilityRole="button"
          accessibilityLabel="Commenter"
          testID="reaction-comment"
        >
          <Feather name="message-circle" size={14} color={colors.mutedForeground} />
          <Text style={[styles.label, { color: colors.mutedForeground }]}>
            Commenter{commentCount > 0 ? ` ${commentCount}` : ""}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderTopWidth: 1,
    paddingTop: 9,
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "transparent",
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  emoji: {
    fontSize: 13,
    lineHeight: 16,
  },
  label: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
});