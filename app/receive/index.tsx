import { EthersClient } from "@/app/profiles/client";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { tintedBackground, useAccentColor } from "@/store/appearance";
import { useSelectedAccount, useWalletStore } from "@/store/wallet";
import { useZapContractStore } from "@/store/zap-contract";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ReceiveOptionsScreen() {
  const accentColor = useAccentColor();
  const scheme = useColorScheme() ?? "dark";
  const isLight = scheme === "light";
  const bg = tintedBackground(accentColor);
  const textPrimary = isLight ? "#11181C" : "#FFFFFF";
  const textMuted = isLight ? "#64748B" : "#9CA3AF";
  const cardBg = isLight ? "#FFFFFF" : "#1E2E29";
  const cardBorder = isLight ? "#DCE8E2" : "transparent";
  const router = useRouter();
  const selectedAccount = useSelectedAccount();
  const selectedChainId = useWalletStore((s) => s.selectedChainId);
  const networkConfig = EthersClient.getNetworkConfig(selectedChainId);

  // Check for Zap Contract - subscribe to contracts state for reactivity
  const contracts = useZapContractStore((s) => s.contracts);
  const hasZapContract = React.useMemo(() => {
    if (!selectedAccount) return false;
    const key = `${selectedAccount.address.toLowerCase()}_${selectedChainId}`;
    return !!contracts[key]?.address;
  }, [selectedAccount, selectedChainId, contracts]);

  // Handle press on Zap-related options
  const handleZapOptionPress = (route: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (!hasZapContract) {
      // Redirect to setup
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
      <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: textMuted }]}>No wallet found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: textPrimary }]}>Receive</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        <Text style={[styles.subtitle, { color: textMuted }]}> 
          Choose how you want to receive funds on{" "}
          {networkConfig?.name || "Ethereum"}
        </Text>

        {/* Option 1: Show Address */}
        <TouchableOpacity
          style={[styles.optionCard, { backgroundColor: cardBg, borderWidth: isLight ? 1 : 0, borderColor: cardBorder }]}
          onPress={() => router.push("/receive/show-address")}
        >
          <View style={[styles.optionIconContainer, { backgroundColor: accentColor + "20" }]}>
            <Ionicons name="qr-code-outline" size={32} color={accentColor} />
          </View>
          <View style={styles.optionContent}>
            <Text style={[styles.optionTitle, { color: textPrimary }]}>Show Address</Text>
            <Text style={[styles.optionDescription, { color: textMuted }]}> 
              Display your wallet address and QR code for someone to send you
              funds directly
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#6B7280" />
        </TouchableOpacity>

        {/* Option 2: Payment Request */}
        <TouchableOpacity
          style={[styles.optionCard, { backgroundColor: cardBg, borderWidth: isLight ? 1 : 0, borderColor: cardBorder }]}
          onPress={() => handleZapOptionPress("/receive/request")}
        >
          <View
            style={[
              styles.optionIconContainer,
              { backgroundColor: "#10B98120" },
            ]}
          >
            <Ionicons name="receipt-outline" size={32} color="#10B981" />
          </View>
          <View style={styles.optionContent}>
            <View style={styles.optionTitleRow}>
              <Text style={[styles.optionTitle, { color: textPrimary }]}>Payment Request</Text>
              {!hasZapContract && (
                <View style={styles.setupBadge}>
                  <Text style={styles.setupBadgeText}>Setup Required</Text>
                </View>
              )}
            </View>
            <Text style={[styles.optionDescription, { color: textMuted }]}> 
              Create a payment request with a specific amount, description, and
              itemized list
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#6B7280" />
        </TouchableOpacity>

        {/* Option 3: Zap Terminal */}
        <TouchableOpacity
          style={[styles.optionCard, { backgroundColor: cardBg, borderWidth: isLight ? 1 : 0, borderColor: cardBorder }]}
          onPress={() => handleZapOptionPress("/receive/terminal")}
        >
          <View
            style={[
              styles.optionIconContainer,
              { backgroundColor: "#8B5CF620" },
            ]}
          >
            <Ionicons name="hardware-chip-outline" size={32} color="#8B5CF6" />
          </View>
          <View style={styles.optionContent}>
            <View style={styles.optionTitleRow}>
              <Text style={[styles.optionTitle, { color: textPrimary }]}>Zap Terminal</Text>
              {!hasZapContract && (
                <View style={styles.setupBadge}>
                  <Text style={styles.setupBadgeText}>Setup Required</Text>
                </View>
              )}
            </View>
            <Text style={[styles.optionDescription, { color: textMuted }]}> 
              Send payment request to an external Zap Terminal device for
              customer-facing display
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#6B7280" />
        </TouchableOpacity>

        {/* Option 4: Zap Pay (HCE) */}
        <TouchableOpacity
          style={[styles.optionCard, { backgroundColor: cardBg, borderWidth: isLight ? 1 : 0, borderColor: cardBorder }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push("/receive/zap-pay" as any);
          }}
        >
          <View
            style={[
              styles.optionIconContainer,
              { backgroundColor: "#10B98120" },
            ]}
          >
            <Ionicons name="radio-outline" size={32} color="#10B981" />
          </View>
          <View style={styles.optionContent}>
            <View style={styles.optionTitleRow}>
              <Text style={[styles.optionTitle, { color: textPrimary }]}>Zap Pay</Text>
              <View style={styles.newBadge}>
                <Text style={styles.newBadgeText}>NFC</Text>
              </View>
            </View>
            <Text style={[styles.optionDescription, { color: textMuted }]}> 
              Broadcast your address via NFC — let someone tap their phone to
              pay you instantly
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#6B7280" />
        </TouchableOpacity>

        {/* Zap Contract Setup Link */}
        <TouchableOpacity
          style={styles.setupLink}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/settings/zap-contract" as any);
          }}
        >
          <Ionicons name="settings-outline" size={18} color={accentColor} />
          <Text style={[styles.setupLinkText, { color: accentColor }]}>
            {hasZapContract ? "Manage Zap Contract" : "Set Up Zap Contract"}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={accentColor} />
        </TouchableOpacity>

        {/* Info Box */}
        <View style={styles.infoBox}>
          <Ionicons
            name="information-circle-outline"
            size={20}
            color={accentColor}
          />
          <Text style={[styles.infoText, { color: accentColor }]}>
            Payment Request and Zap Terminal require a deployed smart contract.
            Go to Settings → Zap Contract to set one up.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F1512",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1E2E29",
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },
  content: {
    flex: 1,
    padding: 24,
  },
  subtitle: {
    color: "#9CA3AF",
    fontSize: 16,
    marginBottom: 24,
    lineHeight: 24,
  },
  optionCard: {
    flexDirection: "row",
    alignItems: "center",
    // backgroundColor: "#1E2E29",
    backgroundColor: "#1E2E29",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    gap: 16,
  },
  optionIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: "#569F8C20",
    alignItems: "center",
    justifyContent: "center",
  },
  optionContent: {
    flex: 1,
  },
  optionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  optionTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },
  optionDescription: {
    color: "#9CA3AF",
    fontSize: 14,
    lineHeight: 20,
  },
  setupBadge: {
    backgroundColor: "#F59E0B20",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  setupBadgeText: {
    color: "#F59E0B",
    fontSize: 10,
    fontWeight: "600",
  },
  newBadge: {
    backgroundColor: "#10B98120",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  newBadgeText: {
    color: "#10B981",
    fontSize: 10,
    fontWeight: "600",
  },
  setupLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 12,
    marginTop: 8,
  },
  setupLinkText: {
    color: "#569F8C",
    fontSize: 14,
    fontWeight: "600",
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "rgba(14, 118, 253, 0.1)",
    padding: 16,
    borderRadius: 12,
    gap: 12,
    marginTop: 16,
  },
  infoText: {
    flex: 1,
    color: "#569F8C",
    fontSize: 14,
    lineHeight: 20,
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
