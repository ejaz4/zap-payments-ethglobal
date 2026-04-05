import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAccentColor } from "@/store/appearance";
import * as Haptics from "expo-haptics";
import React from "react";
import {
    ActivityIndicator,
    GestureResponderEvent,
    StyleSheet,
    Text,
    TextStyle,
    TouchableOpacity,
    TouchableOpacityProps,
    ViewStyle,
} from "react-native";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from "react-native-reanimated";

interface ButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: "primary" | "secondary" | "outline" | "ghost";
  size?: "small" | "medium" | "large";
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
}

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export function Button({
  title,
  variant = "primary",
  size = "medium",
  loading = false,
  disabled = false,
  fullWidth = true,
  style,
  onPressIn,
  onPressOut,
  ...props
}: ButtonProps) {
  const accentColor = useAccentColor();
  const scheme = useColorScheme() ?? "dark";
  const isLight = scheme === "light";
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = (e: GestureResponderEvent) => {
    scale.value = withSpring(0.96, { damping: 20, stiffness: 400 });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPressIn?.(e);
  };

  const handlePressOut = (e: GestureResponderEvent) => {
    scale.value = withSpring(1, { damping: 20, stiffness: 400 });
    onPressOut?.(e);
  };

  const buttonStyles: ViewStyle[] = [
    styles.base,
    styles[variant],
    variant === "primary" && { backgroundColor: accentColor },
    variant === "secondary" && { backgroundColor: isLight ? "#E8F0EC" : "#1E2E29" },
    variant === "outline" && { borderColor: isLight ? "#CAD8D1" : "#374151" },
    styles[`${size}Button`],
    fullWidth && styles.fullWidth,
    (disabled || loading) && styles.disabled,
  ].filter(Boolean) as ViewStyle[];

  const textStyles: TextStyle[] = [
    styles.text,
    styles[`${variant}Text`],
    variant === "ghost" && { color: accentColor },
    variant === "secondary" && { color: isLight ? "#11181C" : "#FFFFFF" },
    variant === "outline" && { color: isLight ? "#11181C" : "#FFFFFF" },
    styles[`${size}Text`],
  ].filter(Boolean) as TextStyle[];

  return (
    <AnimatedTouchable
      style={[buttonStyles, style, animatedStyle]}
      disabled={disabled || loading}
      activeOpacity={1}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      {...props}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === "primary" ? "#fff" : Colors[scheme].tint}
        />
      ) : (
        <Text style={textStyles}>{title}</Text>
      )}
    </AnimatedTouchable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  fullWidth: {
    width: "100%",
  },

  // Variants
  primary: {
    backgroundColor: "#569F8C",
  },
  secondary: {
    backgroundColor: "#1E2E29",
  },
  outline: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#374151",
  },
  ghost: {
    backgroundColor: "transparent",
  },

  // Sizes
  smallButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  mediumButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  largeButton: {
    paddingVertical: 18,
    paddingHorizontal: 32,
  },

  // Disabled
  disabled: {
    opacity: 0.5,
  },

  // Text styles
  text: {
    fontWeight: "600",
  },
  primaryText: {
    color: "#FFFFFF",
  },
  secondaryText: {
    color: "#FFFFFF",
  },
  outlineText: {
    color: "#FFFFFF",
  },
  ghostText: {
    color: "#569F8C",
  },

  smallText: {
    fontSize: 14,
  },
  mediumText: {
    fontSize: 16,
  },
  largeText: {
    fontSize: 18,
  },
});
