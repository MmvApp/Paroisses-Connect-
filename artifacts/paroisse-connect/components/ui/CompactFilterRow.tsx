import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ScrollViewProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";

export const COMPACT_FILTER_HEIGHT = 64;

interface CompactFilterRowProps extends Pick<ScrollViewProps, "style" | "contentContainerStyle" | "testID"> {
  children: React.ReactNode;
}

export function CompactFilterRow({ children, style, contentContainerStyle, testID }: CompactFilterRowProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      bounces={false}
      directionalLockEnabled
      testID={testID}
      style={[styles.row, style]}
      contentContainerStyle={[styles.content, contentContainerStyle]}
    >
      {children}
    </ScrollView>
  );
}

interface CompactFilterChipProps {
  label: string;
  onPress: () => void;
  active?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
}

export function CompactFilterChip({
  label,
  onPress,
  active = false,
  icon,
  style,
  textStyle,
  accessibilityLabel,
}: CompactFilterChipProps) {
  return (
    <TouchableOpacity
      style={[styles.chip, style]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: active }}
    >
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text style={[styles.text, textStyle]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    height: COMPACT_FILTER_HEIGHT + 16,
    maxHeight: COMPACT_FILTER_HEIGHT + 16,
    flexGrow: 0,
    flexShrink: 0,
  },
  content: {
    minHeight: COMPACT_FILTER_HEIGHT + 16,
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  chip: {
    height: COMPACT_FILTER_HEIGHT,
    minHeight: COMPACT_FILTER_HEIGHT,
    maxHeight: COMPACT_FILTER_HEIGHT,
    flexGrow: 0,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  icon: { alignItems: "center", justifyContent: "center" },
  text: { fontSize: 13, fontFamily: "Inter_500Medium" },
});