import { EthersClient } from "@/app/profiles/client";
import { Button } from "@/components/ui";
import { ZapContractService } from "@/services/zap-contract";
import { tintedBackground, useAccentColor } from "@/store/appearance";
import { useSelectedAccount, useWalletStore } from "@/store/wallet";
import { useZapContractStore } from "@/store/zap-contract";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type DeploymentState = "ready" | "deploying" | "success" | "error";

export default function DeployZapContractScreen() {
  const accentColor = useAccentColor();
  const bg = tintedBackground("#000000");
  const router = useRouter();
  const selectedAccount = useSelectedAccount();
  const selectedChainId = useWalletStore((s) => s.selectedChainId);
  const networkConfig = EthersClient.getNetworkConfig(selectedChainId);

  // Store
  const { setContract } = useZapContractStore();

  // Deployment state
  const [deployState, setDeployState] = useState<DeploymentState>("ready");
  const [deployedAddress, setDeployedAddress] = useState("");
  const [deployTxHash, setDeployTxHash] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [autoWithdraw, setAutoWithdraw] = useState(true); // Default to enabled

  const handleDeploy = async () => {
    if (!selectedAccount) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setDeployState("deploying");
    setErrorMessage("");

    try {
      const result = await ZapContractService.deployContract(
        selectedAccount.address,
        selectedChainId,
      );

      if (result.success && result.contractAddress) {
        // Save to store with autoWithdraw setting
        setContract({
          address: result.contractAddress,
          chainId: selectedChainId,
          ownerAddress: selectedAccount.address,
          deployedAt: Date.now(),
          deployTxHash: result.txHash,
          isManual: false,
          autoWithdraw,
        });

        setDeployedAddress(result.contractAddress);
        setDeployTxHash(result.txHash || "");
        setDeployState("success");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        setErrorMessage(result.error || "Deployment failed");
        setDeployState("error");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } catch (error: any) {
      setErrorMessage(error.message || "Unexpected error during deployment");
      setDeployState("error");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleRetry = () => {
    setDeployState("ready");
    setErrorMessage("");
  };

  const handleDone = () => {
    router.back();
    router.back(); // Go back to settings
  };

  const copyAddress = async () => {
    if (deployedAddress) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await Clipboard.setStringAsync(deployedAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 14)}...${address.slice(-12)}`;
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
        <TouchableOpacity
          onPress={() => router.back()}
          disabled={deployState === "deploying"}
        >
          <Ionicons
            name="arrow-back"
            size={24}
            color={deployState === "deploying" ? "#6B7280" : "#FFFFFF"}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Deploy Contract</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
      >
        {/* Network info */}
        <View style={styles.networkBadge}>
          <View style={styles.networkDot} />
          <Text style={styles.networkName}>
            {networkConfig?.name || "Unknown Network"}
          </Text>
        </View>

        {/* Ready State */}
        {deployState === "ready" && (
          <>
            <View style={styles.iconContainer}>
              <Ionicons name="rocket-outline" size={64} color={accentColor} />
            </View>

            <Text style={styles.title}>Deploy Your Zap Contract</Text>

            <Text style={styles.description}>
              This will deploy a new Zap Payment Terminal contract to{" "}
              {networkConfig?.name || "the blockchain"}. The contract will be
              owned by your wallet and allow you to receive NFC payments.
            </Text>

            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Owner Address</Text>
                <Text style={styles.infoValue}>
                  {selectedAccount.address.slice(0, 8)}...
                  {selectedAccount.address.slice(-6)}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Network</Text>
                <Text style={styles.infoValue}>
                  {networkConfig?.name || "Unknown"}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Gas Token</Text>
                <Text style={styles.infoValue}>
                  {networkConfig?.nativeCurrency.symbol || "ETH"}
                </Text>
              </View>
            </View>

            {/* Auto-withdraw toggle */}
            <View style={styles.settingCard}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Auto-Withdraw</Text>
                <Text style={styles.settingDescription}>
                  When enabled, payments are automatically sent to your wallet.
                  When disabled, funds stay in the contract until you withdraw.
                </Text>
              </View>
              <Switch
                value={autoWithdraw}
                onValueChange={setAutoWithdraw}
                trackColor={{ false: "#3F3F46", true: accentColor }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={styles.warningCard}>
              <Ionicons name="warning-outline" size={24} color="#F59E0B" />
              <Text style={styles.warningText}>
                Deploying a contract requires gas fees. Make sure you have
                enough {networkConfig?.nativeCurrency.symbol || "ETH"} in your
                wallet.
              </Text>
            </View>

            <Button
              title="Deploy Contract"
              onPress={handleDeploy}
              style={styles.deployButton}
            />
          </>
        )}

        {/* Deploying State */}
        {deployState === "deploying" && (
          <View style={styles.statusContainer}>
            <ActivityIndicator size="large" color={accentColor} />
            <Text style={styles.statusTitle}>Deploying Contract...</Text>
            <Text style={styles.statusDescription}>
              Please wait while your contract is being deployed to the
              blockchain. This may take a few moments.
            </Text>

            <View style={styles.stepsContainer}>
              <View style={styles.step}>
                <View style={styles.stepIconDone}>
                  <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                </View>
                <Text style={styles.stepTextDone}>Creating transaction</Text>
              </View>
              <View style={styles.step}>
                <View style={styles.stepIconActive}>
                  <ActivityIndicator size="small" color={accentColor} />
                </View>
                <Text style={styles.stepTextActive}>
                  Waiting for confirmation
                </Text>
              </View>
              <View style={styles.step}>
                <View style={styles.stepIconPending} />
                <Text style={styles.stepTextPending}>Contract deployed</Text>
              </View>
            </View>
          </View>
        )}

        {/* Success State */}
        {deployState === "success" && (
          <View style={styles.statusContainer}>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark-circle" size={80} color="#10B981" />
            </View>

            <Text style={styles.statusTitle}>Contract Deployed!</Text>
            <Text style={styles.statusDescription}>
              Your Zap Payment Terminal contract has been successfully deployed.
            </Text>

            <View style={styles.resultCard}>
              <Text style={styles.resultLabel}>Contract Address</Text>
              <TouchableOpacity style={styles.addressRow} onPress={copyAddress}>
                <Text style={styles.resultAddress}>
                  {formatAddress(deployedAddress)}
                </Text>
                <Ionicons
                  name={copied ? "checkmark" : "copy-outline"}
                  size={20}
                  color="#6B7280"
                />
              </TouchableOpacity>
            </View>

            {deployTxHash && (
              <View style={styles.txHashContainer}>
                <Text style={styles.txHashLabel}>Transaction Hash</Text>
                <Text style={styles.txHash}>
                  {deployTxHash.slice(0, 20)}...{deployTxHash.slice(-10)}
                </Text>
              </View>
            )}

            <Button
              title="Done"
              onPress={handleDone}
              style={styles.doneButton}
            />
          </View>
        )}

        {/* Error State */}
        {deployState === "error" && (
          <View style={styles.statusContainer}>
            <View style={styles.errorIcon}>
              <Ionicons name="close-circle" size={80} color="#EF4444" />
            </View>

            <Text style={styles.statusTitle}>Deployment Failed</Text>
            <Text style={styles.statusDescription}>{errorMessage}</Text>

            <View style={styles.errorActions}>
              <Button
                title="Try Again"
                onPress={handleRetry}
                style={styles.retryButton}
              />
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => router.back()}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
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
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
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
    alignSelf: "center",
    marginBottom: 24,
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
  iconContainer: {
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 12,
  },
  description: {
    color: "#9CA3AF",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  infoCard: {
    backgroundColor: "#1E2E29",
    borderRadius: 16,
    padding: 16,
    gap: 12,
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  infoLabel: {
    color: "#6B7280",
    fontSize: 14,
  },
  infoValue: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
  },
  warningCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#F59E0B20",
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  warningText: {
    flex: 1,
    color: "#F59E0B",
    fontSize: 13,
    lineHeight: 18,
  },
  deployButton: {
    marginTop: 8,
  },
  statusContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  statusTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "700",
    marginTop: 24,
    marginBottom: 12,
    textAlign: "center",
  },
  statusDescription: {
    color: "#9CA3AF",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 24,
  },
  stepsContainer: {
    marginTop: 40,
    gap: 16,
  },
  step: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  stepIconDone: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#10B981",
    alignItems: "center",
    justifyContent: "center",
  },
  stepIconActive: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#1E2E29",
    alignItems: "center",
    justifyContent: "center",
  },
  stepIconPending: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#374151",
  },
  stepTextDone: {
    color: "#10B981",
    fontSize: 14,
    fontWeight: "500",
  },
  stepTextActive: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
  },
  stepTextPending: {
    color: "#6B7280",
    fontSize: 14,
  },
  successIcon: {
    marginBottom: 8,
  },
  resultCard: {
    backgroundColor: "#1E2E29",
    borderRadius: 16,
    padding: 16,
    width: "100%",
    marginTop: 24,
  },
  resultLabel: {
    color: "#6B7280",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#0F1512",
    padding: 12,
    borderRadius: 12,
  },
  resultAddress: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "monospace",
  },
  txHashContainer: {
    marginTop: 16,
    alignItems: "center",
  },
  txHashLabel: {
    color: "#6B7280",
    fontSize: 12,
    marginBottom: 4,
  },
  txHash: {
    color: "#9CA3AF",
    fontSize: 12,
    fontFamily: "monospace",
  },
  doneButton: {
    width: "100%",
    marginTop: 32,
  },
  errorIcon: {
    marginBottom: 8,
  },
  errorActions: {
    width: "100%",
    marginTop: 32,
    gap: 12,
  },
  retryButton: {
    width: "100%",
  },
  cancelButton: {
    padding: 16,
    alignItems: "center",
  },
  cancelButtonText: {
    color: "#6B7280",
    fontSize: 16,
    fontWeight: "500",
  },
  settingCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1E2E29",
    borderRadius: 16,
    padding: 16,
    marginTop: 24,
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingLabel: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  settingDescription: {
    color: "#9CA3AF",
    fontSize: 13,
    lineHeight: 18,
  },
});
