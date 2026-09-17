import { useNavigation } from "expo-router";
import { useEffect, type RefObject } from "react";

type ScrollTarget = {
  scrollTo: (options: { y: number; animated?: boolean }) => void;
} | {
  scrollToOffset: (options: { offset: number; animated?: boolean }) => void;
};

export function useTabScrollToTop(ref: RefObject<ScrollTarget | null>) {
  const navigation = useNavigation();

  useEffect(() => {
    const addTabPressListener = navigation.addListener as unknown as (
      eventName: "tabPress",
      listener: (event: { defaultPrevented?: boolean }) => void,
    ) => () => void;
    const unsubscribe = addTabPressListener("tabPress", (event) => {
      if (!navigation.isFocused() || event.defaultPrevented) return;

      const scrollTarget = ref.current;
      if (!scrollTarget) return;

      if ("scrollToOffset" in scrollTarget) {
        scrollTarget.scrollToOffset({ offset: 0, animated: true });
      } else {
        scrollTarget.scrollTo({ y: 0, animated: true });
      }
    });

    return unsubscribe;
  }, [navigation, ref]);
}