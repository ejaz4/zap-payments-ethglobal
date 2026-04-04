import { ChainId, EthersClient } from "@/app/profiles/client";
import { Button } from "@/components/ui";
import { PaymentRequestService } from "@/services/payment-request";
import { BalanceService } from "@/services/wallet";
import { ZapContractService } from "@/services/zap-contract";
import { usePaymentRequestStore } from "@/store/payment-request";
import { Transaction, useWalletStore } from "@/store/wallet";
import { useZapContractStore } from "@/store/zap-contract";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

export default function PaymentRequestStatusScreen() {
  const router = useRouter();
  const {
    activeRequest,
    setActiveRequest,
    updateActiveRequestStatus,
    settings,
  } = usePaymentRequestStore();
  const addTransaction = useWalletStore((s) => s.addTransaction);
  const selectedAccount = useWalletStore(
    (s) => s.accounts[s.selectedAccountIndex],
  );
  const { getContract } = useZapContractStore();

  // Polling state
  const [isPolling, setIsPolling] = useState(true);
  const [isCancelling, setIsCancelling] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useSharedValue(1);

  // Get network config
  const networkConfig = activeRequest
    ? EthersClient.getNetworkConfig(activeRequest.chainId as ChainId)
    : null;

  // Start pulse animation for pending state
  useEffect(() => {
    if (activeRequest?.status === "pending") {
      pulseAnim.value = withRepeat(
        withTiming(1.2, { duration: 1000 }),
        -1,
        true,
      );
    }
  }, [activeRequest?.status]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseAnim.value }],
  }));

  // Poll for payment status
  const checkPaymentStatus = useCallback(async () => {
    // Only poll if there's an active request with a txHash (meaning it was posted to blockchain)
    if (
      !activeRequest ||
      !activeRequest.txHash ||
      activeRequest.status !== "pending"
    ) {
      return;
    }

    try {
      const service = new PaymentRequestService(
        activeRequest.contractAddress,
        activeRequest.chainId as ChainId,
      );

      const contractTx = await service.getActiveTransaction();

      if (contractTx) {
        if (contractTx.paid) {
          // Payment confirmed on blockchain!
          console.log(
            "[PaymentStatus] Payment confirmed on blockchain:",
            contractTx,
          );

          // Update status - this automatically adds to history
          updateActiveRequestStatus("paid", {
            paidBy: contractTx.payer,
          });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setIsPolling(false);

          // Add to transaction history as a receive
          if (selectedAccount) {
            const tx: Transaction = {
              hash:
                activeRequest.txHash || `payment-request-${activeRequest.id}`,
              from: contractTx.payer,
              to: selectedAccount.address,
              value: activeRequest.amount,
              chainId: activeRequest.chainId as ChainId,
              timestamp: Date.now(),
              status: "confirmed",
              type: "receive",
              tokenSymbol: activeRequest.tokenSymbol,
              paymentMethod: "tap-to-pay",
              merchantName: activeRequest.merchantName,
              merchantLocation: activeRequest.merchantLocation,
              description: activeRequest.description,
              itemizedList: activeRequest.itemizedList.map((item) => ({
                name: item.name,
                price: item.price,
                quantity: item.quantity,
              })),
              contractAddress: activeRequest.contractAddress,
            };
            addTransaction(selectedAccount.address, tx);

            // Check if auto-withdraw is enabled and perform withdraw in background
            const contract = getContract(
              selectedAccount.address,
              activeRequest.chainId as ChainId,
            );
            if (contract?.autoWithdraw) {
              console.log(
                "[PaymentStatus] Auto-withdraw enabled, navigating to home and withdrawing in background",
              );

              // Navigate to home immediately
              setActiveRequest(null);
              router.replace("/(tabs)");

              // Perform withdraw in background with a small delay to let home screen mount
              setTimeout(async () => {
                try {
                  const result = await ZapContractService.withdrawNative(
                    contract.address,
                    selectedAccount.address,
                    activeRequest.chainId as ChainId,
                  );
                  console.log("[PaymentStatus] Auto-withdraw result:", result);

                  if (result.success) {
                    // Refresh balances after successful withdraw
                    await BalanceService.forceRefreshBalances();
                  }
                } catch (err) {
                  console.error("[PaymentStatus] Auto-withdraw failed:", err);
                  // Don't alert - funds are safe in contract and can be manually withdrawn
                }
              }, 500);

              return; // Don't continue - we've already navigated
            }
          }
        } else if (contractTx.cancelled) {
          console.log(
            "[PaymentStatus] Transaction was cancelled on blockchain",
          );
          // Update status - this automatically adds to history
          updateActiveRequestStatus("cancelled");
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          setIsPolling(false);
        }
      } else {
        // No active transaction on contract - it may have been cleared
        console.log("[PaymentStatus] No active transaction on contract");
      }
    } catch (err) {
      console.error("[PaymentStatus] Poll error:", err);
    }
  }, [
    activeRequest,
    updateActiveRequestStatus,
    selectedAccount,
    addTransaction,
  ]);

  // Check if request has timed out (inline to avoid stale function reference)
  const checkIfTimedOut = useCallback(() => {
    if (!activeRequest || settings.autoCancelTimeoutMinutes === 0) {
      return false;
    }
    const timeoutMs = settings.autoCancelTimeoutMinutes * 60 * 1000;
    return Date.now() - activeRequest.createdAt > timeoutMs;
  }, [activeRequest, settings.autoCancelTimeoutMinutes]);

  // Auto-cancel handler for timeouts - defined before useEffect that uses it
  const handleAutoCancel = useCallback(async () => {
    if (!activeRequest || !selectedAccount) return;

    setIsPolling(false);
    setIsCancelling(true);

    try {
      const service = new PaymentRequestService(
        activeRequest.contractAddress,
        activeRequest.chainId as ChainId,
      );

      await service.cancelPaymentRequest(selectedAccount.address);

      updateActiveRequestStatus("cancelled");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

      Alert.alert(
        "Request Timed Out",
        `The payment request was automatically cancelled after ${settings.autoCancelTimeoutMinutes} minutes.`,
      );
    } catch (err) {
      console.error("[PaymentStatus] Auto-cancel failed:", err);
      // Still mark as cancelled locally
      updateActiveRequestStatus("cancelled");
    } finally {
      setIsCancelling(false);
    }
  }, [
    activeRequest,
    selectedAccount,
    updateActiveRequestStatus,
    settings.autoCancelTimeoutMinutes,
  ]);

  // Start polling - only when there's a txHash (blockchain confirmation)
  useEffect(() => {
    // Only start polling if we have an active pending request with a txHash
    if (
      !isPolling ||
      !activeRequest?.txHash ||
      activeRequest?.status !== "pending"
    ) {
      return;
    }

    // Check if request has timed out
    if (checkIfTimedOut()) {
      console.log("[PaymentStatus] Request timed out, auto-cancelling...");
      handleAutoCancel();
      return;
    }

    // Initial check
    checkPaymentStatus();

    // Set up polling interval using settings
    const intervalMs = settings.pollingIntervalSeconds * 1000;
    pollIntervalRef.current = setInterval(() => {
      // Check timeout on each poll
      if (checkIfTimedOut()) {
        console.log(
          "[PaymentStatus] Request timed out during polling, auto-cancelling...",
        );
        handleAutoCancel();
        return;
      }
      checkPaymentStatus();
    }, intervalMs);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [
    isPolling,
    activeRequest?.txHash,
    activeRequest?.status,
    checkPaymentStatus,
    settings.pollingIntervalSeconds,
    checkIfTimedOut,
    handleAutoCancel,
  ]);

  // Handle cancel - calls contract to cancel
  const handleCancel = useCallback(() => {
    Alert.alert(
      "Cancel Request",
      "Are you sure you want to cancel this payment request? This will call the smart contract to cancel.",
      [
        { text: "No", style: "cancel" },
        {
          text: "Yes",
          style: "destructive",
          onPress: async () => {
            if (!activeRequest || !selectedAccount) return;

            setIsCancelling(true);
            setIsPolling(false);

            try {
              const service = new PaymentRequestService(
                activeRequest.contractAddress,
                activeRequest.chainId as ChainId,
              );

              await service.cancelPaymentRequest(selectedAccount.address);

              // Update status - this automatically adds to history
              updateActiveRequestStatus("cancelled");
              Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Warning,
              );
            } catch (err: any) {
              console.error("[PaymentStatus] Cancel failed:", err);
              Alert.alert(
                "Cancel Failed",
                err?.message ||
                  "Failed to cancel payment request on blockchain",
              );
              // Resume polling if cancel failed
              setIsPolling(true);
            } finally {
              setIsCancelling(false);
            }
          },
        },
      ],
    );
  }, [activeRequest, selectedAccount, updateActiveRequestStatus]);

  // Handle done
  const handleDone = useCallback(() => {
    setActiveRequest(null);
    router.replace("/(tabs)");
  }, [setActiveRequest, router]);

  // Handle create new
  const handleCreateNew = useCallback(() => {
    setActiveRequest(null);
    router.replace("/receive/request");
  }, [setActiveRequest, router]);

  if (!activeRequest) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Ionicons name="receipt-outline" size={64} color="#6B7280" />
          <Text style={styles.emptyTitle}>No Active Request</Text>
          <Text style={styles.emptyText}>
            Create a payment request to get started
          </Text>
          <View style={styles.emptyActions}>
            <Button
              title="Create Request"
              onPress={() => router.replace("/receive/request")}
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const getStatusIcon = () => {
    switch (activeRequest.status) {
      case "pending":
        return "time-outline";
      case "paid":
        return "checkmark-circle";
      case "cancelled":
        return "close-circle";
      default:
        return "help-circle-outline";
    }
  };

  const getStatusColor = () => {
    switch (activeRequest.status) {
      case "pending":
        return "#F59E0B";
      case "paid":
        return "#10B981";
      case "cancelled":
        return "#EF4444";
      default:
        return "#6B7280";
    }
  };

  const getStatusText = () => {
    switch (activeRequest.status) {
      case "pending":
        return "Awaiting Payment";
      case "paid":
        return "Payment Received!";
      case "cancelled":
        return "Cancelled";
      default:
        return "Unknown";
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payment Status</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content}>
        {/* Status Card */}
        <Animated.View
          entering={FadeInDown.duration(400)}
          style={styles.statusCard}
        >
          <Animated.View
            style={[
              styles.statusIconContainer,
              { backgroundColor: getStatusColor() + "20" },
              activeRequest.status === "pending" && pulseStyle,
            ]}
          >
            {activeRequest.status === "pending" ? (
              <ActivityIndicator size="large" color={getStatusColor()} />
            ) : (
              <Ionicons
                name={getStatusIcon()}
                size={48}
                color={getStatusColor()}
              />
            )}
          </Animated.View>

          <Text style={[styles.statusText, { color: getStatusColor() }]}>
            {getStatusText()}
          </Text>

          <Text style={styles.amount}>
            {activeRequest.amount} {activeRequest.tokenSymbol}
          </Text>

          <Text style={styles.merchantName}>{activeRequest.merchantName}</Text>
          <Text style={styles.merchantLocation}>
            {activeRequest.merchantLocation}
          </Text>
        </Animated.View>

        {/* QR Code for scanning - only show when pending */}
        {activeRequest.status === "pending" && (
          <Animated.View entering={FadeIn.delay(150)} style={styles.qrSection}>
            <Text style={styles.sectionTitle}>Scan to Pay</Text>
            <View style={styles.qrContainer}>
              <QRCode
                value={JSON.stringify({
                  chainId: activeRequest.chainId.toString(),
                  address: activeRequest.contractAddress,
                  network: "ethereum",
                })}
                size={160}
                backgroundColor="#FFFFFF"
                color="#000000"
              />
            </View>
            <Text style={styles.qrHint}>
              Customer can scan this QR code with Zap Pay
            </Text>
          </Animated.View>
        )}

        {/* Description */}
        {activeRequest.description && (
          <Animated.View entering={FadeIn.delay(200)} style={styles.section}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.descriptionText}>
              {activeRequest.description}
            </Text>
          </Animated.View>
        )}

        {/* Itemized List */}
        {activeRequest.itemizedList.length > 0 && (
          <Animated.View entering={FadeIn.delay(300)} style={styles.section}>
            <Text style={styles.sectionTitle}>Items</Text>
            <View style={styles.itemsTable}>
              <View style={styles.itemsHeader}>
                <Text style={styles.itemsHeaderText}>Item</Text>
                <Text style={styles.itemsHeaderQty}>Qty</Text>
                <Text style={styles.itemsHeaderPrice}>Price</Text>
              </View>
              {activeRequest.itemizedList.map((item, index) => (
                <View key={index} style={styles.itemRow}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemQty}>{item.quantity}</Text>
                  <Text style={styles.itemPrice}>{item.price}</Text>
                </View>
              ))}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>
                  {activeRequest.amount} {activeRequest.tokenSymbol}
                </Text>
              </View>
            </View>
          </Animated.View>
        )}

        {/* Contract Info */}
        <Animated.View entering={FadeIn.delay(400)} style={styles.section}>
          <Text style={styles.sectionTitle}>Details</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Contract</Text>
            <Text style={styles.detailValue}>
              {activeRequest.contractAddress.slice(0, 10)}...
              {activeRequest.contractAddress.slice(-8)}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Network</Text>
            <Text style={styles.detailValue}>
              {networkConfig?.name || `Chain ${activeRequest.chainId}`}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Created</Text>
            <Text style={styles.detailValue}>
              {new Date(activeRequest.createdAt).toLocaleString()}
            </Text>
          </View>
          {activeRequest.paidAt && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Paid At</Text>
              <Text style={styles.detailValue}>
                {new Date(activeRequest.paidAt).toLocaleString()}
              </Text>
            </View>
          )}
          {activeRequest.paidBy && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Paid By</Text>
              <Text style={styles.detailValue}>
                {activeRequest.paidBy.slice(0, 10)}...
                {activeRequest.paidBy.slice(-8)}
              </Text>
            </View>
          )}
        </Animated.View>
      </ScrollView>

      {/* Actions */}
      <Animated.View entering={FadeInUp.delay(500)} style={styles.footer}>
        {activeRequest.status === "pending" ? (
          <Button
            title="Cancel Request"
            variant="outline"
            onPress={handleCancel}
          />
        ) : (
          <View style={styles.footerActions}>
            <Button title="Done" onPress={handleDone} style={{ flex: 1 }} />
            <Button
              title="New Request"
              variant="outline"
              onPress={handleCreateNew}
              style={{ flex: 1 }}
            />
          </View>
        )}
      </Animated.View>
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
    padding: 16,
  },
  statusCard: {
    backgroundColor: "#1E2E29",
    borderRadius: 24,
    padding: 32,
    alignItems: "center",
    marginBottom: 16,
  },
  statusIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  statusText: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 16,
  },
  amount: {
    color: "#FFFFFF",
    fontSize: 36,
    fontWeight: "700",
    marginBottom: 8,
  },
  merchantName: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 4,
  },
  merchantLocation: {
    color: "#9CA3AF",
    fontSize: 14,
  },
  qrSection: {
    backgroundColor: "#1E2E29",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    alignItems: "center",
  },
  qrContainer: {
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    marginVertical: 12,
  },
  qrHint: {
    color: "#9CA3AF",
    fontSize: 13,
    textAlign: "center",
  },
  section: {
    backgroundColor: "#1E2E29",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    color: "#9CA3AF",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 12,
  },
  descriptionText: {
    color: "#FFFFFF",
    fontSize: 16,
    lineHeight: 24,
  },
  itemsTable: {
    backgroundColor: "#0F1512",
    borderRadius: 12,
    overflow: "hidden",
  },
  itemsHeader: {
    flexDirection: "row",
    backgroundColor: "#374151",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  itemsHeaderText: {
    flex: 2,
    color: "#9CA3AF",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  itemsHeaderQty: {
    width: 50,
    color: "#9CA3AF",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    textAlign: "center",
  },
  itemsHeaderPrice: {
    width: 80,
    color: "#9CA3AF",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    textAlign: "right",
  },
  itemRow: {
    flexDirection: "row",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
  },
  itemName: {
    flex: 2,
    color: "#FFFFFF",
    fontSize: 14,
  },
  itemQty: {
    width: 50,
    color: "#9CA3AF",
    fontSize: 14,
    textAlign: "center",
  },
  itemPrice: {
    width: 80,
    color: "#FFFFFF",
    fontSize: 14,
    textAlign: "right",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 12,
    backgroundColor: "#1E2E29",
  },
  totalLabel: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  totalValue: {
    color: "#10B981",
    fontSize: 16,
    fontWeight: "700",
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
  },
  detailLabel: {
    color: "#9CA3AF",
    fontSize: 14,
  },
  detailValue: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "monospace",
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#1E2E29",
  },
  footerActions: {
    flexDirection: "row",
    gap: 12,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  emptyTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "600",
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    color: "#6B7280",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 24,
  },
  emptyActions: {
    width: "100%",
    maxWidth: 300,
  },
});
