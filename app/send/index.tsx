/**
 * Send Options Screen
 * Choose between regular send and Zap Pay (NFC)
 */

import { useAccentColor } from "@/store/appearance";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { MotiView } from "moti";
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface SendOptionProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  onPress: () => void;
  iconColor?: string;
  delay?: number;
}

function SendOption({
  icon,
  title,
  onPress,
  iconColor: iconColorProp,
  delay = 0,
}: SendOptionProps) {
  const defaultColor = useAccentColor();
  const iconColor = iconColorProp ?? defaultColor;
  return (
    <TouchableOpacity style={styles.optionContainer} onPress={onPress}>
      <MotiView
        from={{ opacity: 0, scale: 0.3 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{
          delay,
          type: "spring",
          damping: 11,
          stiffness: 200,
          mass: 0.6,
        }}
        style={[styles.optionCircle, { backgroundColor: iconColor + "20" }]}
      >
        <Ionicons name={icon} size={40} color={iconColor} />
      </MotiView>
      <MotiView
        from={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{
          delay: delay + 100,
          type: "timing",
          duration: 300,
        }}
      >
        <Text style={styles.optionLabel}>{title}</Text>
      </MotiView>
    </TouchableOpacity>
  );
}

export default function SendOptionsScreen() {
  const router = useRouter();
  const accentColor = useAccentColor();
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (isClosing) {
      const timer = setTimeout(() => router.back(), 300);
      return () => clearTimeout(timer);
    }
  }, [isClosing, router]);

  const closeModal = () => setIsClosing(true);

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <MotiView
        from={{ opacity: 0 }}
        animate={{ opacity: isClosing ? 0 : 1 }}
        transition={{ type: "timing", duration: 220 }}
        style={styles.backdrop}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={closeModal} />
      </MotiView>

      <MotiView
        from={{ opacity: 0, translateY: 180, scale: 0.96 }}
        animate={{
          opacity: isClosing ? 0 : 1,
          translateY: isClosing ? 200 : 0,
          scale: isClosing ? 0.96 : 1,
        }}
        transition={{
          type: "spring",
          damping: 14,
          stiffness: 165,
          mass: 0.82,
        }}
        style={styles.popup}
      >
        <View style={styles.grabber} />

        <View style={styles.header}>
          <Text style={styles.headerTitle}>Send</Text>
          <TouchableOpacity
            onPress={closeModal}
            style={styles.closeButton}
          >
            <Ionicons name="close" size={20} color="#E5E7EB" />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <Text style={styles.sectionTitle}>Choose how to send</Text>

          <View style={styles.optionsGrid}>
            <SendOption
              icon="paper-plane"
              title="Regular Send"
              onPress={() => router.push("/send/transfer" as any)}
              iconColor={accentColor}
              delay={100}
            />

            <SendOption
              icon="radio"
              title="Zap Pay"
              onPress={() => router.push("/nfc/scan" as any)}
              iconColor="#10B981"
              delay={200}
            />
          </View>
        </View>
      </MotiView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.58)",
  },
  popup: {
    backgroundColor: "#0F0F10",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: "#25262A",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
    shadowColor: "#000000",
    shadowOpacity: 0.4,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: -8 },
    elevation: 14,
  },
  grabber: {
    alignSelf: "center",
    width: 42,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#3B3B40",
    marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    marginBottom: 10,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#202126",
  },
  content: {
    padding: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#9CA3AF",
    marginBottom: 24,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  optionsGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "flex-start",
  },
  optionContainer: {
    alignItems: "center",
    gap: 12,
  },
  optionCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
    textAlign: "center",
    marginTop: 4,
  },
});
