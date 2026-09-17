import { Feather } from "@expo/vector-icons";
import { Text, TouchableOpacity, View } from "react-native";

interface NotificationBellProps {
  count: number;
  onPress: () => void;
  color?: string;
}

export function NotificationBell({ count, onPress, color = "#111111" }: NotificationBellProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{ padding: 10, minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `${count} notifications non lues` : "Notifications"}
    >
      <Feather name="bell" size={21} color={color} />
      {count > 0 && (
        <View
          style={{
            position: "absolute",
            top: -1,
            right: -4,
             minWidth: 22,
             height: 22,
            paddingHorizontal: 4,
             borderRadius: 11,
            backgroundColor: "#E74C3C",
            borderWidth: 1,
            borderColor: "#fff",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: "#fff", fontSize: 14, lineHeight: 16, fontWeight: "700" }}>
            {count}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}