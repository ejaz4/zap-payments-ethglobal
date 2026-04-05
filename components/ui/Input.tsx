import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAccentColor } from "@/store/appearance";
import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
    TextInput as RNTextInput,
    StyleSheet,
    Text,
    TextInputProps,
    TouchableOpacity,
    View,
} from "react-native";
import Animated, {
    interpolateColor,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from "react-native-reanimated";

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRightIconPress?: () => void;
  isPassword?: boolean;
}

export function Input({
  label,
  error,
  hint,
  leftIcon,
  rightIcon,
  onRightIconPress,
  isPassword = false,
  style,
  onFocus,
  onBlur,
  ...props
}: InputProps) {
  const accentColor = useAccentColor();
  const scheme = useColorScheme() ?? "dark";
  const isLight = scheme === "light";
  const [showPassword, setShowPassword] = useState(false);
  const focusProgress = useSharedValue(0);

  const iconColor = isLight ? "#64748B" : "#9CA3AF";
  const placeholderColor = isLight ? "#94A3B8" : "#6B7280";
  const labelColor = isLight ? "#334155" : "#E5E7EB";
  const inputBg = isLight ? "#FFFFFF" : "#1E2E29";
  const inputBorder = isLight ? "#D5E2DC" : "#374151";
  const inputText = isLight ? "#0F172A" : "#FFFFFF";
  const hintColor = isLight ? "#64748B" : "#6B7280";

  const animatedBorderStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      focusProgress.value,
      [0, 1],
      [inputBorder, accentColor],
    ),
  }));

  const handleFocus = (e: any) => {
    focusProgress.value = withTiming(1, { duration: 180 });
    onFocus?.(e);
  };

  const handleBlur = (e: any) => {
    focusProgress.value = withTiming(0, { duration: 180 });
    onBlur?.(e);
  };

  return (
    <View style={styles.container}>
      {label && <Text style={[styles.label, { color: labelColor }]}>{label}</Text>}

      <Animated.View
        style={[
          styles.inputContainer,
          { backgroundColor: inputBg },
          animatedBorderStyle,
          error && styles.inputError,
        ]}
      >
        {leftIcon && (
          <Ionicons
            name={leftIcon}
            size={20}
            color={iconColor}
            style={styles.leftIcon}
          />
        )}

        <RNTextInput
          style={[styles.input, { color: inputText }, style]}
          placeholderTextColor={placeholderColor}
          onFocus={handleFocus}
          onBlur={handleBlur}
          secureTextEntry={isPassword && !showPassword}
          {...props}
        />

        {isPassword && (
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
            <Ionicons
              name={showPassword ? "eye-off-outline" : "eye-outline"}
              size={20}
              color={iconColor}
            />
          </TouchableOpacity>
        )}

        {rightIcon && !isPassword && (
          <TouchableOpacity onPress={onRightIconPress}>
            <Ionicons name={rightIcon} size={20} color={iconColor} />
          </TouchableOpacity>
        )}
      </Animated.View>

      {error && <Text style={styles.error}>{error}</Text>}
      {hint && !error && <Text style={[styles.hint, { color: hintColor }]}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "transparent",
    paddingHorizontal: 16,
  },
  inputError: {
    borderColor: "#EF4444",
  },
  leftIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 14,
  },
  error: {
    color: "#EF4444",
    fontSize: 12,
    marginTop: 4,
  },
  hint: {
    fontSize: 12,
    marginTop: 4,
  },
});
