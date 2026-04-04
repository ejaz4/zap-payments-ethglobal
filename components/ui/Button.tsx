import { Colors } from "@/constants/theme";
import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  TouchableOpacityProps,
  ViewStyle,
} from "react-native";

interface ButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: "primary" | "secondary" | "outline" | "ghost";
  size?: "small" | "medium" | "large";
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
}

export function Button({
  title,
  variant = "primary",
  size = "medium",
  loading = false,
  disabled = false,
  fullWidth = true,
  style,
  ...props
}: ButtonProps) {
  const buttonStyles: ViewStyle[] = [
    styles.base,
    styles[variant],
    styles[`${size}Button`],
    fullWidth && styles.fullWidth,
    (disabled || loading) && styles.disabled,
  ].filter(Boolean) as ViewStyle[];

  const textStyles: TextStyle[] = [
    styles.text,
    styles[`${variant}Text`],
    styles[`${size}Text`],
  ].filter(Boolean) as TextStyle[];

  return (
    <TouchableOpacity
      style={[buttonStyles, style]}
      disabled={disabled || loading}
      activeOpacity={0.7}
      {...props}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === "primary" ? "#fff" : Colors.dark.tint}
        />
      ) : (
        <Text style={textStyles}>{title}</Text>
      )}
    </TouchableOpacity>
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
