/**
 * NFC Indicator Component
 * Shows current NFC status with animated indicator
 */

import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

export type NfcStatus =
  | "unavailable"
  | "disabled"
  | "ready"
  | "scanning"
  | "error";

interface NfcIndicatorProps {
  status: NfcStatus;
  isScanning: boolean;
  onPress?: () => void;
  size?: "small" | "medium" | "large";
  showLabel?: boolean;
}

const SIZE_CONFIG = {
  small: { icon: 20, container: 36, ring: 44, fontSize: 10 },
  medium: { icon: 28, container: 48, ring: 60, fontSize: 12 },
  large: { icon: 40, container: 72, ring: 88, fontSize: 14 },
};

export function NfcIndicator({
  status,
  isScanning,
  onPress,
  size = "medium",
  showLabel = true,
}: NfcIndicatorProps) {
  const config = SIZE_CONFIG[size];

  // Pulse animation for scanning state
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.6);

  React.useEffect(() => {
    if (isScanning) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.4, { duration: 800, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: 800, easing: Easing.in(Easing.ease) }),
        ),
        -1,
        false,
      );
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0, { duration: 800 }),
          withTiming(0.6, { duration: 800 }),
        ),
        -1,
        false,
      );
    } else {
      pulseScale.value = withSpring(1);
      pulseOpacity.value = withSpring(0);
    }
  }, [isScanning]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  const getStatusColor = (): string => {
    switch (status) {
      case "scanning":
        return "#10B981"; // green
      case "ready":
        return "#569F8C"; // blue
      case "disabled":
        return "#F59E0B"; // yellow
      case "error":
        return "#EF4444"; // red
      case "unavailable":
      default:
        return "#6B7280"; // gray
    }
  };

  const getStatusLabel = (): string => {
    switch (status) {
      case "scanning":
        return "Ready to Tap";
      case "ready":
        return "NFC Ready";
      case "disabled":
        return "NFC Off";
      case "error":
        return "NFC Error";
      case "unavailable":
      default:
        return "No NFC";
    }
  };

  const getStatusIcon = (): keyof typeof Ionicons.glyphMap => {
    switch (status) {
      case "scanning":
        return "radio-outline";
      case "ready":
        return "radio-outline";
      case "disabled":
        return "radio-outline";
      case "error":
        return "alert-circle-outline";
      case "unavailable":
      default:
        return "close-circle-outline";
    }
  };

  const color = getStatusColor();

  const content = (
    <View style={styles.wrapper}>
      <View
        style={[
          styles.container,
          { width: config.container, height: config.container },
        ]}
      >
        {/* Pulse ring for scanning */}
        {isScanning && (
          <Animated.View
            style={[
              styles.pulseRing,
              {
                width: config.ring,
                height: config.ring,
                borderRadius: config.ring / 2,
                borderColor: color,
              },
              pulseStyle,
            ]}
          />
        )}

        {/* Main icon container */}
        <View
          style={[
            styles.iconContainer,
            {
              width: config.container,
              height: config.container,
              borderRadius: config.container / 2,
              borderColor: color,
              backgroundColor: isScanning ? `${color}15` : "transparent",
            },
          ]}
        >
          <Ionicons name={getStatusIcon()} size={config.icon} color={color} />
        </View>
      </View>

      {showLabel && (
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(200)}
        >
          <Text style={[styles.label, { fontSize: config.fontSize, color }]}>
            {getStatusLabel()}
          </Text>
        </Animated.View>
      )}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

/**
 * Compact NFC status badge for headers
 */
export function NfcBadge({
  status,
  isScanning,
  onPress,
}: {
  status: NfcStatus;
  isScanning: boolean;
  onPress?: () => void;
}) {
  const getConfig = () => {
    switch (status) {
      case "scanning":
        return { color: "#10B981", bg: "#10B98120", text: "Scanning" };
      case "ready":
        return { color: "#569F8C", bg: "#569F8C20", text: "Ready" };
      case "disabled":
        return { color: "#F59E0B", bg: "#F59E0B20", text: "Off" };
      case "error":
        return { color: "#EF4444", bg: "#EF444420", text: "Error" };
      default:
        return { color: "#6B7280", bg: "#6B728020", text: "N/A" };
    }
  };

  const config = getConfig();

  // Pulse animation
  const opacity = useSharedValue(1);

  React.useEffect(() => {
    if (isScanning) {
      opacity.value = withRepeat(
        withSequence(
          withTiming(0.5, { duration: 600 }),
          withTiming(1, { duration: 600 }),
        ),
        -1,
        false,
      );
    } else {
      opacity.value = withSpring(1);
    }
  }, [isScanning]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const content = (
    <Animated.View
      style={[
        styles.badge,
        { backgroundColor: config.bg, borderColor: config.color },
        isScanning && animatedStyle,
      ]}
    >
      <Ionicons name="radio-outline" size={14} color={config.color} />
      <Text style={[styles.badgeText, { color: config.color }]}>
        {config.text}
      </Text>
    </Animated.View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

/**
 * Full-screen NFC scanning overlay
 */
export function NfcScanOverlay({
  visible,
  onCancel,
  message = "Hold your device near the NFC tag",
}: {
  visible: boolean;
  onCancel: () => void;
  message?: string;
}) {
  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      style={styles.overlay}
    >
      <View style={styles.overlayContent}>
        <NfcIndicator
          status="scanning"
          isScanning={true}
          size="large"
          showLabel={false}
        />

        <Text style={styles.overlayTitle}>Scanning for NFC</Text>
        <Text style={styles.overlayMessage}>{message}</Text>

        <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    gap: 8,
  },
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  pulseRing: {
    position: "absolute",
    borderWidth: 2,
  },
  iconContainer: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  label: {
    fontWeight: "600",
    textAlign: "center",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  overlayContent: {
    alignItems: "center",
    padding: 32,
    gap: 24,
  },
  overlayTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#FFFFFF",
    marginTop: 16,
  },
  overlayMessage: {
    fontSize: 16,
    color: "#9CA3AF",
    textAlign: "center",
    lineHeight: 24,
  },
  cancelButton: {
    marginTop: 24,
    paddingHorizontal: 32,
    paddingVertical: 12,
    backgroundColor: "#374151",
    borderRadius: 12,
  },
  cancelButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});

export default NfcIndicator;
