import { useAccentColor, tintedBackground } from "@/store/appearance";
import { EthersClient } from "@/app/profiles/client";
import { Button } from "@/components/ui";
import { ZapContractService } from "@/services/zap-contract";
import { useSelectedAccount, useWalletStore } from "@/store/wallet";
import { useZapContractStore } from "@/store/zap-contract";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ZapContractSettingsScreen() {
  const accentColor = useAccentColor();
  const bg = tintedBackground(accentColor);
  const router = useRouter();
  const selectedAccount = useSelectedAccount();
  const selectedChainId = useWalletStore((s) => s.selectedChainId);
  const networkConfig = EthersClient.getNetworkConfig(selectedChainId);

  // Store
  const {
    contracts,
    getContract,
    setContract,
    clearContract,
    updateContractSettings,
  } = useZapContractStore();

  // Get current contract for this wallet+chain
  const currentContract = selectedAccount
    ? getContract(selectedAccount.address, selectedChainId)
    : null;

  // UI state
  const [manualAddress, setManualAddress] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [txCount, setTxCount] = useState<bigint | null>(null);

  // Load transaction count if contract exists
  useEffect(() => {
    if (currentContract?.address) {
      ZapContractService.getTransactionCount(
        currentContract.address,
        selectedChainId,
      ).then(setTxCount);
    } else {
      setTxCount(null);
    }
  }, [currentContract?.address, selectedChainId]);

  const copyAddress = async () => {
    if (currentContract?.address) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await Clipboard.setStringAsync(currentContract.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 10)}...${address.slice(-8)}`;
  };

  const handleClearContract = () => {
    if (!selectedAccount) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      "Clear Zap Contract",
      "Are you sure you want to remove this contract? You can add it back later.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: () => {
            clearContract(selectedAccount.address, selectedChainId);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ],
    );
  };

  const handleDeployNew = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/settings/zap-contract/deploy" as any);
  };

  const handleSetManualAddress = useCallback(async () => {
    if (!selectedAccount || !manualAddress.trim()) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsVerifying(true);

    try {
      const result = await ZapContractService.verifyContract(
        manualAddress.trim(),
        selectedAccount.address,
        selectedChainId,
      );

      if (!result.isValid) {
        Alert.alert(
          "Invalid Contract",
          result.error || "Contract verification failed",
        );
        setIsVerifying(false);
        return;
      }

      if (!result.isOwner) {
        // Warn but still allow
        Alert.alert(
          "Ownership Warning",
          "You are not the owner of this contract. You may not be able to create payment requests. Continue anyway?",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Continue",
              onPress: () => {
                saveManualContract();
              },
            },
          ],
        );
        setIsVerifying(false);
        return;
      }

      saveManualContract();
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to verify contract");
    } finally {
      setIsVerifying(false);
    }
  }, [selectedAccount, manualAddress, selectedChainId]);

  const saveManualContract = () => {
    if (!selectedAccount) return;

    setContract({
      address: manualAddress.trim(),
      chainId: selectedChainId,
      ownerAddress: selectedAccount.address,
      deployedAt: Date.now(),
      isManual: true,
      autoWithdraw: false, // Default to false for manual contracts
    });

    setManualAddress("");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleToggleAutoWithdraw = (value: boolean) => {
    if (!selectedAccount) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateContractSettings(selectedAccount.address, selectedChainId, {
      autoWithdraw: value,
    });
  };

  if (!selectedAccount) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No wallet found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Zap Contract</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        style={styles.content}
        behavior="padding"
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Network info */}
          <View style={styles.networkBadge}>
            <View style={styles.networkDot} />
            <Text style={styles.networkName}>
              {networkConfig?.name || "Unknown Network"}
            </Text>
          </View>

          <Text style={styles.description}>
            The Zap Contract is your personal payment terminal on the
            blockchain. It allows you to receive payments via NFC tap-to-pay.
          </Text>

          {/* Current Contract Section */}
          {currentContract ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Current Contract</Text>

              <View style={styles.contractCard}>
                <View style={styles.contractHeader}>
                  <View style={styles.statusBadge}>
                    <View style={styles.statusDot} />
                    <Text style={styles.statusText}>Active</Text>
                  </View>
                  {currentContract.isManual && (
                    <View style={styles.manualBadge}>
                      <Text style={styles.manualBadgeText}>Manual</Text>
                    </View>
                  )}
                </View>

                <TouchableOpacity
                  style={styles.addressRow}
                  onPress={copyAddress}
                >
                  <Text style={styles.contractAddress}>
                    {formatAddress(currentContract.address)}
                  </Text>
                  <Ionicons
                    name={copied ? "checkmark" : "copy-outline"}
                    size={18}
                    color="#6B7280"
                  />
                </TouchableOpacity>

                {txCount !== null && (
                  <View style={styles.statRow}>
                    <Text style={styles.statLabel}>Transactions</Text>
                    <Text style={styles.statValue}>{txCount.toString()}</Text>
                  </View>
                )}

                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Deployed</Text>
                  <Text style={styles.statValue}>
                    {new Date(currentContract.deployedAt).toLocaleDateString()}
                  </Text>
                </View>

                {/* Auto-Withdraw Toggle */}
                <View style={styles.settingRow}>
                  <View style={styles.settingInfo}>
                    <Text style={styles.settingLabel}>Auto-Withdraw</Text>
                    <Text style={styles.settingDescription}>
                      Automatically transfer funds to your wallet after each
                      payment
                    </Text>
                  </View>
                  <Switch
                    value={currentContract.autoWithdraw ?? false}
                    onValueChange={handleToggleAutoWithdraw}
                    trackColor={{ false: "#374151", true: "#10B98150" }}
                    thumbColor={
                      currentContract.autoWithdraw ? "#10B981" : "#9CA3AF"
                    }
                  />
                </View>

                <View style={styles.contractActions}>
                  <TouchableOpacity
                    style={styles.clearButton}
                    onPress={handleClearContract}
                  >
                    <Ionicons name="trash-outline" size={18} color="#EF4444" />
                    <Text style={styles.clearButtonText}>Clear</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                style={styles.deployNewButton}
                onPress={handleDeployNew}
              >
                <Ionicons name="add-circle-outline" size={20} color={accentColor} />
                <Text style={[styles.deployNewText, { color: accentColor }]}>Deploy New Contract</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* No Contract - Setup Options */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Setup Required</Text>

                <View style={styles.setupCard}>
                  <Ionicons
                    name="hardware-chip-outline"
                    size={48}
                    color={accentColor}
                  />
                  <Text style={styles.setupTitle}>No Contract Found</Text>
                  <Text style={styles.setupDescription}>
                    Deploy a new contract or enter an existing contract address
                    to start accepting payments.
                  </Text>

                  <Button
                    title="Deploy New Contract"
                    onPress={handleDeployNew}
                    style={styles.deployButton}
                  />
                </View>
              </View>

              {/* Manual Entry */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  Or Enter Existing Contract
                </Text>

                <View style={styles.inputContainer}>
                  <TextInput
                    style={styles.input}
                    placeholder="Contract Address (0x...)"
                    placeholderTextColor="#6B7280"
                    value={manualAddress}
                    onChangeText={setManualAddress}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    style={[
                      styles.verifyButton,
                      { backgroundColor: accentColor },
                      (!manualAddress.trim() || isVerifying) &&
                        styles.verifyButtonDisabled,
                    ]}
                    onPress={handleSetManualAddress}
                    disabled={!manualAddress.trim() || isVerifying}
                  >
                    {isVerifying ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.verifyButtonText}>Verify & Add</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
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
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
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
  networkBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#1E2E29",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    alignSelf: "flex-start",
    marginBottom: 16,
  },
  networkDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#10B981",
  },
  networkName: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
  },
  description: {
    color: "#9CA3AF",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: "#9CA3AF",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 12,
  },
  contractCard: {
    backgroundColor: "#1E2E29",
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  contractHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#10B98120",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#10B981",
  },
  statusText: {
    color: "#10B981",
    fontSize: 12,
    fontWeight: "500",
  },
  manualBadge: {
    backgroundColor: "#F59E0B20",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  manualBadgeText: {
    color: "#F59E0B",
    fontSize: 12,
    fontWeight: "500",
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#0F1512",
    padding: 12,
    borderRadius: 12,
  },
  contractAddress: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statLabel: {
    color: "#6B7280",
    fontSize: 14,
  },
  statValue: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#0F1512",
    padding: 12,
    borderRadius: 12,
    marginTop: 4,
  },
  settingInfo: {
    flex: 1,
    marginRight: 12,
  },
  settingLabel: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 2,
  },
  settingDescription: {
    color: "#6B7280",
    fontSize: 12,
    lineHeight: 16,
  },
  contractActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 8,
  },
  clearButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  clearButtonText: {
    color: "#EF4444",
    fontSize: 14,
    fontWeight: "500",
  },
  deployNewButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 16,
    padding: 12,
  },
  deployNewText: {
    color: "#569F8C",
    fontSize: 14,
    fontWeight: "600",
  },
  setupCard: {
    backgroundColor: "#1E2E29",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    gap: 12,
  },
  setupTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },
  setupDescription: {
    color: "#9CA3AF",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  deployButton: {
    marginTop: 8,
    width: "100%",
  },
  inputContainer: {
    gap: 12,
  },
  input: {
    backgroundColor: "#1E2E29",
    borderRadius: 12,
    padding: 16,
    color: "#FFFFFF",
    fontSize: 14,
  },
  verifyButton: {
    backgroundColor: "#569F8C",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  verifyButtonDisabled: {
    opacity: 0.5,
  },
  verifyButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});
