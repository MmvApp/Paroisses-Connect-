import React, { forwardRef, useState } from "react";
import {
  TextInput,
  TextInputProps,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
}

export const Input = forwardRef<TextInput, InputProps>(
  ({ label, error, leftIcon, secureTextEntry, style, ...props }, ref) => {
    const colors = useColors();
    const [focused, setFocused] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    return (
      <View style={styles.wrapper}>
        {label && (
          <Text style={[styles.label, { color: colors.mutedForeground }]}>
            {label}
          </Text>
        )}
        <View
          style={[
            styles.container,
            {
              borderColor: error
                ? colors.destructive
                : focused
                ? colors.primary
                : colors.border,
              borderRadius: colors.radius,
              backgroundColor: colors.card,
            },
          ]}
        >
          {leftIcon && <View style={styles.leftIcon}>{leftIcon}</View>}
          <TextInput
            ref={ref}
            style={[
              styles.input,
              {
                color: colors.foreground,
                fontFamily: "Inter_400Regular",
              },
              leftIcon ? styles.inputWithIcon : undefined,
              secureTextEntry ? styles.inputWithRight : undefined,
              style,
            ]}
            placeholderTextColor={colors.mutedForeground}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            secureTextEntry={secureTextEntry && !showPassword}
            {...props}
          />
          {secureTextEntry && (
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowPassword((v) => !v)}
            >
              <Feather
                name={showPassword ? "eye-off" : "eye"}
                size={18}
                color={colors.mutedForeground}
              />
            </TouchableOpacity>
          )}
        </View>
        {error && (
          <Text style={[styles.error, { color: colors.destructive }]}>
            {error}
          </Text>
        )}
      </View>
    );
  }
);

Input.displayName = "Input";

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 16,
  },
  label: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    minHeight: 52,
  },
  input: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 17,
  },
  inputWithIcon: {
    paddingLeft: 8,
  },
  inputWithRight: {
    paddingRight: 44,
  },
  leftIcon: {
    paddingLeft: 14,
  },
  eyeBtn: {
    padding: 14,
    position: "absolute",
    right: 0,
  },
  error: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
  },
});
