import type { ViewStyle } from "react-native";

/**
 * Shared viewport constraints used by the Home screen and all navigators.
 * Keeping this as a style object avoids per-page responsive implementations.
 */
export const responsiveRootStyle: ViewStyle = {
  flex: 1,
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  flexShrink: 1,
  overflow: "hidden",
};