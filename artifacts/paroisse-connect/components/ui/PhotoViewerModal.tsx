import React, { useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "@/components/ui/Avatar";

export interface PhotoViewerModalProps {
  visible: boolean;
  photoURL?: string | null;
  name?: string;
  onClose: () => void;
}

export function PhotoViewerModal({
  visible,
  photoURL,
  name,
  onClose,
}: PhotoViewerModalProps) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();

  const scale    = useSharedValue(1);
  const savedSc  = useSharedValue(1);
  const tx       = useSharedValue(0);
  const ty       = useSharedValue(0);
  const savedTx  = useSharedValue(0);
  const savedTy  = useSharedValue(0);

  // Reset transforms whenever the modal opens
  useEffect(() => {
    if (visible) {
      scale.value  = 1;  savedSc.value = 1;
      tx.value     = 0;  savedTx.value = 0;
      ty.value     = 0;  savedTy.value = 0;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // ── Gestures ─────────────────────────────────────────────────────────────────

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(1, Math.min(savedSc.value * e.scale, 5));
    })
    .onEnd(() => {
      if (scale.value < 1) {
        scale.value = withSpring(1);
        savedSc.value = 1;
      } else {
        savedSc.value = scale.value;
      }
    });

  const pan = Gesture.Pan()
    .averageTouches(true)
    .onUpdate((e) => {
      tx.value = savedTx.value + e.translationX;
      ty.value = savedTy.value + e.translationY;
    })
    .onEnd(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      "worklet";
      scale.value   = withSpring(1);
      savedSc.value = 1;
      tx.value      = withSpring(0);
      ty.value      = withSpring(0);
      savedTx.value = 0;
      savedTy.value = 0;
    });

  // Race: double-tap resets; otherwise pinch+pan work simultaneously
  const all = Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, pan));

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  // ─────────────────────────────────────────────────────────────────────────────

  if (!photoURL && !name) return null;

  const headerH = Math.max(insets.top, 20) + 52;
  const initialsSize = Math.min(windowWidth * 0.82, 340);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={pv.root}>
          {/* Tap dark background → close */}
          <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />

          {/* Header — name + close button */}
          <View style={[pv.header, { paddingTop: Math.max(insets.top, 16) }]}>
            <Text style={pv.name} numberOfLines={1}>{name ?? ""}</Text>
            <TouchableOpacity
              style={pv.closeBtn}
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Feather name="x" size={22} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Photo — centered below header, pinch/pan/double-tap */}
          <View
            style={[
              StyleSheet.absoluteFillObject,
              { justifyContent: "center", alignItems: "center", paddingTop: headerH },
            ]}
          >
            <GestureDetector gesture={all}>
              <Animated.View style={[pv.imgWrap, animStyle]}>
                {photoURL ? (
                  <Image
                    source={{ uri: photoURL }}
                    style={pv.img}
                    contentFit="contain"
                    cachePolicy="none"
                  />
                ) : (
                  <Avatar name={name ?? "?"} size={initialsSize} />
                )}
              </Animated.View>
            </GestureDetector>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const pv = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.93)",
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    zIndex: 10,
  },
  name: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
    marginRight: 10,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  imgWrap: {
    width: "88%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  img: {
    width: "100%",
    height: "100%",
  },
});
