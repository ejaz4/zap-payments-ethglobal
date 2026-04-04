/**
 * Send Options Screen
 * Choose between regular send and Zap Pay (NFC)
 */

import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

interface SendOptionProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
  iconColor?: string;
  delay?: number;
}

function SendOption({
  icon,
  title,
  subtitle,
  onPress,
  iconColor = "#569F8C",
  delay = 0,
}: SendOptionProps) {
  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(400)}>
      <TouchableOpacity style={styles.optionCard} onPress={onPress}>
        <View
          style={[styles.optionIcon, { backgroundColor: iconColor + "20" }]}
        >
          <Ionicons name={icon} size={32} color={iconColor} />
        </View>
        <View style={styles.optionContent}>
          <Text style={styles.optionTitle}>{title}</Text>
          <Text style={styles.optionSubtitle}>{subtitle}</Text>
        </View>
        <Ionicons name="chevron-forward" size={24} color="#6B7280" />
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function SendOptionsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Send</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Options */}
      <Animated.View entering={FadeIn.delay(100)} style={styles.content}>
        <Text style={styles.sectionTitle}>Choose how to send</Text>

        <SendOption
          icon="paper-plane"
          title="Regular Send"
          subtitle="Send crypto to any wallet address"
          onPress={() => router.push("/send/transfer" as any)}
          iconColor="#569F8C"
          delay={100}
        />

        <SendOption
          icon="radio"
          title="Zap Pay"
          subtitle="Pay by tapping NFC or scanning QR code"
          onPress={() => router.push("/nfc/scan" as any)}
          iconColor="#10B981"
          delay={200}
        />
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A0A0A",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1F1F1F",
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  content: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#9CA3AF",
    marginBottom: 16,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  optionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1A1A",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#2A2A2A",
  },
  optionIcon: {
    width: 56,
    height: 56,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  optionContent: {
    flex: 1,
    marginLeft: 16,
  },
  optionTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  optionSubtitle: {
    fontSize: 14,
    color: "#9CA3AF",
  },
});
