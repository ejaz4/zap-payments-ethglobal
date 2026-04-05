import { EthersClient } from "@/app/profiles/client";
import { isUniswapSupported } from "@/config/uniswap";
import { useAccentColor } from "@/store/appearance";
import { useSelectedAccount, useWalletStore } from "@/store/wallet";
import { useZapContractStore } from "@/store/zap-contract";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { MotiView } from "moti";
import React, { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface ReceiveOptionProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  onPress: () => void;
  iconColor?: string;
  delay?: number;
}

function ReceiveOption({
  icon,
  title,
  onPress,
  iconColor: iconColorProp,
  delay = 0,
}: ReceiveOptionProps) {
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

export default function ReceiveOptionsScreen() {
  const accentColor = useAccentColor();
  const router = useRouter();
  const selectedAccount = useSelectedAccount();
  const selectedChainId = useWalletStore((s) => s.selectedChainId);
  const networkConfig = EthersClient.getNetworkConfig(selectedChainId);

  // Check for Zap Contract
  const contracts = useZapContractStore((s) => s.contracts);
  const hasZapContract = React.useMemo(() => {
    if (!selectedAccount) return false;
    const key = `${selectedAccount.address.toLowerCase()}_${selectedChainId}`;
    return !!contracts[key]?.address;
  }, [selectedAccount, selectedChainId, contracts]);

  const handleZapOptionPress = (route: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (!hasZapContract) {
      Alert.alert(
        "Zap Contract Required",
        "You need to set up a Zap Contract to use this feature. Would you like to set one up now?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Set Up",
            onPress: () => router.push("/settings/zap-contract" as any),
          },
        ],
      );
      return;
    }

    router.push(route as any);
  };

  if (!selectedAccount) {
    return (
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <MotiView
          from={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ type: "timing", duration: 220 }}
          style={styles.backdrop}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => router.back()} />
        </MotiView>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No wallet found</Text>
        </View>
      </SafeAreaView>
    );
  }

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
          <Text style={styles.headerTitle}>Receive</Text>
          <TouchableOpacity
            onPress={closeModal}
            style={styles.closeButton}
          >
            <Ionicons name="close" size={20} color="#E5E7EB" />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <Text style={styles.sectionTitle}>Choose how to receive</Text>

          <View style={styles.optionsGrid}>

            <ReceiveOption
              icon="qr-code-outline"
              title="Show Address"
              onPress={() => router.push("/receive/show-address")}
              iconColor={accentColor}
              delay={100}
            />

            {/* <ReceiveOption
              icon="receipt-outline"
              title="Payment Request"
              onPress={() => handleZapOptionPress("/receive/request")}
              iconColor="#10B981"
              delay={200}
            />

            <ReceiveOption
              icon="hardware-chip-outline"
              title="Zap Terminal"
              onPress={() => handleZapOptionPress("/receive/terminal")}
              iconColor="#8B5CF6"
              delay={300}
            /> */}

            {isUniswapSupported(selectedChainId) && (
              <ReceiveOption
                icon="storefront-outline"
                title="Receive Anything"
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  router.push("/receive/merchant-receive" as any);
                }}
                iconColor="#FF007A"
                delay={400}
              />
            )}

            <ReceiveOption
              icon="radio-outline"
              title="Zap Pay"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                router.push("/receive/zap-pay" as any);
              }}
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
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  content: {
    padding: 16,
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
    flexWrap: "wrap",
    justifyContent: "space-around",
    alignItems: "flex-start",
  },
  optionContainer: {
    alignItems: "center",
    gap: 12,
    width: "50%",
    marginBottom: 24,
  },
  optionCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  optionLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFFFFF",
    textAlign: "center",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: "#6B7280",
    fontSize: 16,
  },
});
