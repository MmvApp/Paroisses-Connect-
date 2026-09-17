import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const BG    = "#FFFFFF";
const CREAM = "#FFF8EC";
const GOLD  = "#C9A24A";
const DARK  = "#111111";
const MUTED = "#666666";

interface LoadingScreenProps {
  message?: string;
}

export function LoadingScreen({ message = "Chargement en cours…" }: LoadingScreenProps) {
  const insets = useSafeAreaInsets();
  const pulse = useRef(new Animated.Value(0.7)).current;
  const dot1  = useRef(new Animated.Value(0)).current;
  const dot2  = useRef(new Animated.Value(0)).current;
  const dot3  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1,   duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(pulse, { toValue: 0.7, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    ).start();

    const dotAnim = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: -6, duration: 300, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
          Animated.timing(dot, { toValue: 0,  duration: 300, useNativeDriver: true, easing: Easing.in(Easing.ease) }),
          Animated.delay(600),
        ])
      );

    dotAnim(dot1, 0).start();
    dotAnim(dot2, 150).start();
    dotAnim(dot3, 300).start();
  }, [pulse, dot1, dot2, dot3]);

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Animated.View style={[styles.ring, { opacity: pulse, transform: [{ scale: pulse }] }]} />

      <View style={styles.crossWrap}>
        <Text style={styles.cross}>✝</Text>
      </View>

      <Text style={styles.appName}>Paroisse Connect</Text>
      <Text style={styles.message}>{message}</Text>

      <View style={styles.dotRow}>
        {[dot1, dot2, dot3].map((dot, i) => (
          <Animated.View key={i} style={[styles.dot, { transform: [{ translateY: dot }] }]} />
        ))}
      </View>
    </View>
  );
}

const SYS = Platform.select({ ios: "System", android: "Roboto", default: "sans-serif" });

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  ring: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    borderColor: GOLD + "66",
  },
  crossWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: GOLD + "18",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: GOLD + "44",
  },
  cross:   { fontSize: 36, color: GOLD },
  appName: { marginTop: 10, fontSize: 22, fontWeight: "700", color: DARK, letterSpacing: 0.5, fontFamily: SYS },
  message: { fontSize: 13, color: MUTED, fontFamily: SYS, letterSpacing: 0.3 },
  dotRow:  { flexDirection: "row", gap: 8, marginTop: 6 },
  dot:     { width: 6, height: 6, borderRadius: 3, backgroundColor: GOLD },
});
