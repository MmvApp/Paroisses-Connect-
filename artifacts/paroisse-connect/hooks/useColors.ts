import colors from "@/constants/colors";

/**
 * Returns the light design tokens. Dark mode is disabled — the app uses
 * a single clean light theme throughout.
 */
export function useColors() {
  return { ...colors.light, radius: colors.radius };
}
