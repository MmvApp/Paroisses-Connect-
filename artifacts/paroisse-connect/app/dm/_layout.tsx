import { Stack } from "expo-router";
import { useColors } from "@/hooks/useColors";

export default function DmLayout() {
  const colors = useColors();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.foreground,
        headerTitleStyle: { fontFamily: "Inter_600SemiBold", fontSize: 17 },
        headerBackTitle: "Retour",
        animation: "slide_from_right",
      }}
    />
  );
}
