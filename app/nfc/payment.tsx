/**
 * NFC Payment Screen
 * Handles payment after NFC tag is scanned
 * Reads active transaction from smart contract and allows payment
 */

import { tintedBackground, useAccentColor } from "@/store/appearance";
import { Ionicons } from "@expo/vector-icons";
import { formatUnits } from "ethers";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
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
import Animated, { FadeIn, SlideInUp, ZoomIn } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import {
    ActiveTransaction,
    PaymentTerminalService,
} from "@/services/payment-terminal";
import { TransactionService } from "@/services/wallet";

import { ChainId, DEFAULT_NETWORKS } from "@/app/profiles/client";
import { Button } from "@/components/ui";
import { useFiatValue } from "@/hooks/use-fiat-value";
import {
    useNativeBalance,
    useSelectedAccount,
    useWalletStore,
} from "@/store/wallet";

type PaymentStatus =
  | "loading"
  | "preview"
  | "confirming"
  | "sending"
  | "success"
  | "error"
  | "already-paid";

/**
 * Parse itemized list from JSON string
 */
const parseItemizedList = (
  itemizedList: string,
): { name: string; price: string; quantity?: number }[] => {
  try {
    return JSON.parse(itemizedList);
  } catch {
    return [];
  }
};

export default function NfcPaymentScreen() {
  const accentColor = useAccentColor();
  const bg = tintedBackground("#000000");
  const router = useRouter();
  const params = useLocalSearchParams<{
    address: string;
    chainId: string;
    amount: string;
    message: string;
    autopay: string;
    autopayLimit: string;
  }>();

  const selectedAccount = useSelectedAccount();
  const storeChainId = useWalletStore((s) => s.selectedChainId);

  // Parse params
  const contractAddress =
    (params.address as `0x${string}`) || ("" as `0x${string}`);
  const chainId = params.chainId
    ? (parseInt(params.chainId) as ChainId)
    : storeChainId;

  // Use the payment chain's balance, not the globally selected chain
  const nativeBalance = useNativeBalance(undefined, chainId);
  const requestedAmount = params.amount || "";
  const autopayParam = params.autopay === "true";
  const autopayLimit = params.autopayLimit ? parseFloat(params.autopayLimit) : null;

  // State
  const [status, setStatus] = useState<PaymentStatus>("loading");
  const [activeTransaction, setActiveTransaction] =
    useState<ActiveTransaction | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [merchantInfoExpanded, setMerchantInfoExpanded] = useState(false);

  // Ref to control polling - only poll in certain states
  const shouldPollRef = React.useRef(true);

  const networkConfig = DEFAULT_NETWORKS[chainId];
  const symbol = networkConfig?.nativeCurrency.symbol || "CHZ";
  const decimals = networkConfig?.nativeCurrency.decimals || 18;

  // Get amount from contract or params
  const amount = activeTransaction
    ? formatUnits(activeTransaction.amount, decimals)
    : requestedAmount;
  const fiatAmount = useFiatValue(amount, chainId);

  // Validate address
  const isValidAddress =
    contractAddress &&
    contractAddress.startsWith("0x") &&
    contractAddress.length === 42;

  // Check if user has sufficient balance
  const hasSufficientBalance =
    parseFloat(nativeBalance) >= parseFloat(amount || "0");

  // Format address for display
  const formatAddress = (addr: string) => {
    if (!addr) return "";
    return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
  };

  // Create payment terminal service for this contract/chain
  const paymentService = React.useMemo(() => {
    if (!isValidAddress) return null;
    return new PaymentTerminalService(contractAddress, chainId);
  }, [contractAddress, chainId, isValidAddress]);

  // Load active transaction from smart contract
  useEffect(() => {
    if (!isValidAddress || !paymentService) {
      setLoadError("Invalid contract address");
      setStatus("error");
      return;
    }

    const loadActiveTransaction = async () => {
      try {
        console.log(
          "[NfcPayment] Loading active transaction from:",
          contractAddress,
        );

        const txData = await paymentService.getActiveTransaction();

        console.log("[NfcPayment] Active transaction result:", txData);

        if (!txData) {
          setLoadError("No active payment request at this terminal");
          setStatus("error");
          return;
        }

        console.log("[NfcPayment] Parsed transaction:", {
          id: txData.id.toString(),
          amount: formatUnits(txData.amount, decimals),
          paid: txData.paid,
          cancelled: txData.cancelled,
          merchantName: txData.merchantName,
          description: txData.description,
        });

        setActiveTransaction(txData);

        // Check if already paid
        if (txData.paid) {
          setStatus("already-paid");
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        } else if (txData.cancelled) {
          setLoadError("This transaction has been cancelled");
          setStatus("error");
        } else if (txData.id === 0n || txData.amount === 0n) {
          setLoadError("No active payment request at this terminal");
          setStatus("error");
        } else {
          setStatus("preview");
        }
      } catch (err: any) {
        console.error("[NfcPayment] Error loading transaction:", err);
        setLoadError("Failed to load payment details from contract");
        setStatus("error");
      }
    };

    loadActiveTransaction();

    // Poll for updates every 2 seconds, but only when in appropriate states
    const interval = setInterval(() => {
      if (shouldPollRef.current) {
        loadActiveTransaction();
      }
    }, 2000);

    return () => {
      shouldPollRef.current = false;
      clearInterval(interval);
    };
  }, [contractAddress, isValidAddress, decimals, paymentService]);

  // Stop polling when status changes to terminal states
  useEffect(() => {
    // Only poll in loading or preview states
    // Once sending starts, we don't poll anymore to avoid "already-paid" flash
    const shouldPoll = status === "loading" || status === "preview";
    shouldPollRef.current = shouldPoll;
    console.log("[NfcPayment] Polling enabled:", shouldPoll, "Status:", status);
  }, [status]);

  const autoPayFiredRef = useRef(false);

  const handleConfirm = useCallback(async () => {
    if (
      !selectedAccount ||
      !isValidAddress ||
      !activeTransaction ||
      !paymentService
    )
      return;

    if (!hasSufficientBalance) {
      Alert.alert(
        "Insufficient Balance",
        `You don't have enough ${symbol} to complete this transaction.`,
      );
      return;
    }

    // Stop polling immediately
    shouldPollRef.current = false;

    setStatus("sending");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      console.log("[NfcPayment] Paying with account:", selectedAccount.address);
      console.log("[NfcPayment] Amount:", activeTransaction.amount.toString());
      console.log(
        "[NfcPayment] Token contract:",
        activeTransaction.requestedTokenContract,
      );

      // Pay using ethers.js via PaymentTerminalService
      // The service automatically handles native vs ERC20 based on requestedTokenContract
      const { hash } = await paymentService.payActiveTransaction(
        selectedAccount.address,
        activeTransaction.amount,
        activeTransaction.requestedTokenContract,
      );
      console.log("[NfcPayment] Transaction hash:", hash);

      setTxHash(hash);

      // Save transaction to history with NFC payment details
      const store = useWalletStore.getState();
      const txRecord = {
        hash,
        from: selectedAccount.address,
        to: contractAddress,
        value: amount,
        chainId,
        timestamp: Date.now(),
        status: "pending" as const,
        type: "send" as const,
        tokenSymbol: symbol,
        paymentMethod: "tap-to-pay" as const,
        merchantName: activeTransaction.merchantName || undefined,
        merchantLocation: activeTransaction.merchantLocation || undefined,
        description: activeTransaction.description || undefined,
        itemizedList: parseItemizedList(activeTransaction.itemizedList),
        contractAddress,
      };
      store.addTransaction(selectedAccount.address, txRecord);
      store.addPendingTransaction(txRecord);
      console.log("[NfcPayment] Transaction saved to history");

      // Show confirming state while we wait
      setStatus("confirming");

      // Wait for confirmation, then show success
      try {
        await TransactionService.watchTransaction(hash, chainId);
        console.log("[NfcPayment] Transaction confirmed on chain!");

        setStatus("success");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        // Auto-close after showing success
        setTimeout(() => {
          router.replace("/(tabs)");
        }, 2500);
      } catch (confirmErr) {
        console.warn("[NfcPayment] Confirmation watch failed:", confirmErr);
        // Still show success since tx was submitted - just couldn't confirm
        setStatus("success");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        setTimeout(() => {
          router.replace("/(tabs)");
        }, 2500);
      }
    } catch (err: any) {
      console.error("[NfcPayment] Error:", err);

      // Check for specific error types
      if (err.message?.includes("insufficient funds")) {
        setError("Insufficient funds for transaction");
      } else {
        setError(err?.shortMessage || err?.message || "Transaction failed");
      }
      setStatus("error");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [
    selectedAccount,
    isValidAddress,
    activeTransaction,
    hasSufficientBalance,
    contractAddress,
    symbol,
    router,
    paymentService,
    amount,
    chainId,
  ]);

  // Auto-pay: as soon as the contract tx loads (status → "preview"), fire
  // immediately if the amount is within the limit — no confirmation screen shown.
  useEffect(() => {
    if (!autopayParam || autoPayFiredRef.current) return;
    if (status !== "preview") return;
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) return;
    if (autopayLimit === null || amountNum <= autopayLimit) {
      console.log("[NfcPayment] Auto-pay firing:", amountNum, "limit:", autopayLimit);
      autoPayFiredRef.current = true;
      handleConfirm();
    }
  }, [status, amount, autopayParam, autopayLimit, handleConfirm]);

  const handleCancel = () => {
    router.back();
  };

  const handleRetry = () => {
    setStatus("preview");
    setError(null);
    setTxHash(null);
  };

  // Render based on status
  if (status === "loading") {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
        <View style={styles.resultContainer}>
          <ActivityIndicator size="large" color={accentColor} />
          <Text style={styles.sendingText}>Loading Payment Details...</Text>
          <Text style={styles.sendingSubtext}>Reading from smart contract</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (status === "already-paid") {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
        <View style={styles.resultContainer}>
          <Animated.View
            entering={ZoomIn.duration(300)}
            style={styles.warningIconContainer}
          >
            <Ionicons name="hand-left" size={80} color="#F59E0B" />
          </Animated.View>

          <Animated.Text
            entering={FadeIn.delay(200)}
            style={styles.warningTitle}
          >
            Already Paid
          </Animated.Text>

          <Animated.Text
            entering={FadeIn.delay(300)}
            style={styles.warningMessage}
          >
            This transaction has already been paid
          </Animated.Text>

          {activeTransaction && (
            <Animated.View
              entering={FadeIn.delay(400)}
              style={styles.paidDetailsCard}
            >
              <View style={styles.paidDetailRow}>
                <Text style={styles.paidDetailLabel}>Amount</Text>
                <Text style={styles.paidDetailValue}>
                  {formatUnits(activeTransaction.amount, decimals)} {symbol}
                </Text>
              </View>
              {activeTransaction.merchantName && (
                <View style={styles.paidDetailRow}>
                  <Text style={styles.paidDetailLabel}>Merchant</Text>
                  <Text style={styles.paidDetailValue}>
                    {activeTransaction.merchantName}
                  </Text>
                </View>
              )}
              {activeTransaction.payer &&
                activeTransaction.payer !==
                  "0x0000000000000000000000000000000000000000" && (
                  <View style={styles.paidDetailRow}>
                    <Text style={styles.paidDetailLabel}>Paid by</Text>
                    <Text style={styles.paidDetailValue}>
                      {formatAddress(activeTransaction.payer)}
                    </Text>
                  </View>
                )}
            </Animated.View>
          )}

          <Animated.View
            entering={FadeIn.delay(500)}
            style={styles.errorActions}
          >
            <TouchableOpacity style={styles.cancelLink} onPress={handleCancel}>
              <Text style={styles.cancelLinkText}>Go Back</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </SafeAreaView>
    );
  }

  if (status === "confirming") {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
        <View style={styles.resultContainer}>
          <Animated.View
            entering={ZoomIn.duration(300)}
            style={styles.confirmingIcon}
          >
            <ActivityIndicator size="large" color={accentColor} />
          </Animated.View>

          <Animated.Text
            entering={FadeIn.delay(200)}
            style={[styles.confirmingTitle, { color: accentColor }]}
          >
            Confirming Payment...
          </Animated.Text>

          <Animated.View
            entering={FadeIn.delay(300)}
            style={styles.successDetails}
          >
            <Text style={styles.successAmount}>
              {amount} {symbol}
            </Text>
            {activeTransaction?.merchantName && (
              <Text style={styles.successTo}>
                to {activeTransaction.merchantName}
              </Text>
            )}
          </Animated.View>

          {txHash && (
            <Animated.View
              entering={FadeIn.delay(400)}
              style={styles.txHashContainer}
            >
              <Text style={styles.txHashLabel}>Transaction Hash</Text>
              <Text style={styles.txHash}>{formatAddress(txHash)}</Text>
            </Animated.View>
          )}

          <Animated.View
            entering={SlideInUp.delay(500)}
            style={styles.autoCloseText}
          >
            <Text style={styles.autoCloseLabel}>
              Waiting for blockchain confirmation...
            </Text>
          </Animated.View>
        </View>
      </SafeAreaView>
    );
  }

  if (status === "success") {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
        <View style={styles.resultContainer}>
          <Animated.View
            entering={ZoomIn.duration(300)}
            style={styles.successIcon}
          >
            <Ionicons name="checkmark-circle" size={100} color="#10B981" />
          </Animated.View>

          <Animated.Text
            entering={FadeIn.delay(200)}
            style={styles.successTitle}
          >
            Payment Sent!
          </Animated.Text>

          <Animated.View
            entering={FadeIn.delay(300)}
            style={styles.successDetails}
          >
            <Text style={styles.successAmount}>
              {amount} {symbol}
            </Text>
            {activeTransaction?.merchantName && (
              <Text style={styles.successTo}>
                to {activeTransaction.merchantName}
              </Text>
            )}
          </Animated.View>

          {txHash && (
            <Animated.View
              entering={FadeIn.delay(400)}
              style={styles.txHashContainer}
            >
              <Text style={styles.txHashLabel}>Transaction Hash</Text>
              <Text style={styles.txHash}>{formatAddress(txHash)}</Text>
            </Animated.View>
          )}

          <Animated.View
            entering={SlideInUp.delay(500)}
            style={styles.autoCloseText}
          >
            <Text style={styles.autoCloseLabel}>Returning to wallet...</Text>
          </Animated.View>
        </View>
      </SafeAreaView>
    );
  }

  if (status === "error") {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
        <View style={styles.resultContainer}>
          <Animated.View
            entering={ZoomIn.duration(300)}
            style={styles.errorIcon}
          >
            <Ionicons name="close-circle" size={100} color="#EF4444" />
          </Animated.View>

          <Animated.Text entering={FadeIn.delay(200)} style={styles.errorTitle}>
            Payment Failed
          </Animated.Text>

          <Animated.Text
            entering={FadeIn.delay(300)}
            style={styles.errorMessage}
          >
            {loadError || error || "Transaction could not be completed"}
          </Animated.Text>

          <Animated.View
            entering={FadeIn.delay(400)}
            style={styles.errorActions}
          >
            <Button title="Try Again" onPress={handleRetry} />
            <TouchableOpacity style={styles.cancelLink} onPress={handleCancel}>
              <Text style={styles.cancelLinkText}>Cancel</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </SafeAreaView>
    );
  }

  if (status === "sending") {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
        <View style={styles.resultContainer}>
          <ActivityIndicator size="large" color={accentColor} />
          <Text style={styles.sendingText}>Sending Payment...</Text>
          <Text style={styles.sendingSubtext}>
            Please wait while the transaction is being processed
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Preview/Confirm state
  const items = activeTransaction
    ? parseItemizedList(activeTransaction.itemizedList)
    : [];

  // Check if there's any merchant info to show
  const hasMerchantInfo =
    activeTransaction &&
    (activeTransaction.merchantName ||
      activeTransaction.description ||
      items.length > 0);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleCancel} style={styles.closeButton}>
          <Ionicons name="close" size={28} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payment Request</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
      >
        {/* NFC Success Badge */}
        <Animated.View entering={FadeIn.duration(300)} style={styles.nfcBadge}>
          <Ionicons name="radio" size={20} color="#10B981" />
          <Text style={styles.nfcBadgeText}>Tag Read Successfully</Text>
        </Animated.View>

        {/* Collapsible Merchant Info Section */}
        {hasMerchantInfo && (
          <Animated.View entering={SlideInUp.delay(100)}>
            <TouchableOpacity
              style={styles.collapsibleHeader}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setMerchantInfoExpanded(!merchantInfoExpanded);
              }}
            >
              <View style={styles.collapsibleHeaderLeft}>
                <Ionicons name="storefront-outline" size={18} color="#9CA3AF" />
                <Text style={styles.collapsibleHeaderText}>
                  {activeTransaction?.merchantName || "Details"}
                </Text>
              </View>
              <Ionicons
                name={merchantInfoExpanded ? "chevron-up" : "chevron-down"}
                size={20}
                color="#9CA3AF"
              />
            </TouchableOpacity>

            {merchantInfoExpanded && (
              <>
                {/* Merchant Card */}
                {activeTransaction?.merchantName && (
                  <View style={styles.card}>
                    <Text style={styles.cardLabel}>Merchant</Text>
                    <View style={styles.merchantRow}>
                      <View style={[styles.merchantIcon, { backgroundColor: accentColor + "20" }]}>
                        <Ionicons name="storefront" size={24} color={accentColor} />
                      </View>
                      <View style={styles.merchantInfo}>
                        <Text style={styles.merchantName}>
                          {activeTransaction.merchantName}
                        </Text>
                        {activeTransaction.merchantLocation && (
                          <Text style={styles.merchantLocation}>
                            {activeTransaction.merchantLocation}
                          </Text>
                        )}
                      </View>
                    </View>
                  </View>
                )}

                {/* Description Card */}
                {activeTransaction?.description && (
                  <View style={[styles.card, { marginTop: 12 }]}>
                    <Text style={styles.cardLabel}>Description</Text>
                    <Text style={styles.descriptionText}>
                      {activeTransaction.description}
                    </Text>
                  </View>
                )}

                {/* Itemized List */}
                {items.length > 0 && (
                  <View style={[styles.card, { marginTop: 12 }]}>
                    <Text style={styles.cardLabel}>Items</Text>
                    {items.map((item, index) => (
                      <View key={index} style={styles.itemRow}>
                        <Text style={styles.itemName}>
                          {item.quantity ? `${item.quantity}x ` : ""}
                          {item.name}
                        </Text>
                        <Text style={styles.itemPrice}>{item.price}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}
          </Animated.View>
        )}

        {/* Amount Card */}
        <Animated.View
          entering={SlideInUp.delay(hasMerchantInfo ? 200 : 100)}
          style={styles.card}
        >
          <Text style={styles.cardLabel}>Total Amount</Text>
          <View style={styles.amountContainer}>
            <Text style={styles.amountValue}>
              {amount || "0"} {symbol}
            </Text>
            {fiatAmount && (
              <Text style={styles.amountFiat}>≈ {fiatAmount}</Text>
            )}
            {!hasSufficientBalance && amount && (
              <View style={styles.insufficientBadge}>
                <Ionicons name="warning" size={14} color="#F59E0B" />
                <Text style={styles.insufficientText}>
                  Insufficient balance
                </Text>
              </View>
            )}
          </View>
          <View style={styles.balanceRow}>
            <Text style={styles.balanceLabel}>Available:</Text>
            <Text style={styles.balanceValue}>
              {parseFloat(nativeBalance).toFixed(6)} {symbol}
            </Text>
          </View>
        </Animated.View>

        {/* Network Info */}
        <Animated.View
          entering={SlideInUp.delay(hasMerchantInfo ? 250 : 150)}
          style={styles.card}
        >
          <Text style={styles.cardLabel}>Network</Text>
          <View style={styles.networkRow}>
            <Text style={styles.networkName}>
              {networkConfig?.name || "Unknown Network"}
            </Text>
            <Text style={styles.contractAddress}>
              {formatAddress(contractAddress)}
            </Text>
          </View>
        </Animated.View>
      </ScrollView>

      {/* Action Buttons */}
      <View style={styles.footer}>
        <Button
          title={`Pay ${amount || "0"} ${symbol}`}
          onPress={handleConfirm}
          disabled={
            !isValidAddress ||
            !hasSufficientBalance ||
            !amount ||
            !activeTransaction
          }
        />
        <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1E2E29",
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    gap: 16,
  },
  nfcBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#10B98120",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 24,
    alignSelf: "center",
  },
  nfcBadgeText: {
    color: "#10B981",
    fontSize: 14,
    fontWeight: "600",
  },
  collapsibleHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1E2E29",
    borderRadius: 12,
    padding: 14,
    marginBottom: 4,
  },
  collapsibleHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  collapsibleHeaderText: {
    color: "#9CA3AF",
    fontSize: 14,
    fontWeight: "500",
  },
  card: {
    backgroundColor: "#1E2E29",
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  cardLabel: {
    color: "#9CA3AF",
    fontSize: 12,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  recipientRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  recipientIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#569F8C20",
    alignItems: "center",
    justifyContent: "center",
  },
  recipientInfo: {
    flex: 1,
  },
  recipientAddress: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    fontFamily: "monospace",
  },
  recipientNetwork: {
    color: "#9CA3AF",
    fontSize: 13,
    marginTop: 2,
  },
  amountContainer: {
    gap: 8,
  },
  amountValue: {
    color: "#FFFFFF",
    fontSize: 32,
    fontWeight: "700",
  },
  amountFiat: {
    color: "#9CA3AF",
    fontSize: 15,
    marginTop: 4,
  },
  insufficientBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  insufficientText: {
    color: "#F59E0B",
    fontSize: 13,
  },
  balanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#374151",
  },
  balanceLabel: {
    color: "#9CA3AF",
    fontSize: 14,
  },
  balanceValue: {
    color: "#D1D5DB",
    fontSize: 14,
    fontWeight: "500",
  },
  messageText: {
    color: "#D1D5DB",
    fontSize: 15,
    lineHeight: 22,
  },
  warningCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#EF444420",
    borderRadius: 12,
    padding: 16,
  },
  warningText: {
    flex: 1,
    color: "#EF4444",
    fontSize: 14,
    lineHeight: 20,
  },
  footer: {
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#1E2E29",
  },
  cancelButton: {
    paddingVertical: 12,
    alignItems: "center",
  },
  cancelButtonText: {
    color: "#9CA3AF",
    fontSize: 16,
    fontWeight: "500",
  },
  // Result states
  resultContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 16,
  },
  confirmingIcon: {
    width: 100,
    height: 100,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmingTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#569F8C",
    marginTop: 16,
  },
  successIcon: {},
  successTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#10B981",
    marginTop: 16,
  },
  successDetails: {
    alignItems: "center",
    gap: 4,
  },
  successAmount: {
    fontSize: 24,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  successTo: {
    fontSize: 16,
    color: "#9CA3AF",
  },
  txHashContainer: {
    alignItems: "center",
    marginTop: 24,
    padding: 16,
    backgroundColor: "#1E2E29",
    borderRadius: 12,
  },
  txHashLabel: {
    fontSize: 12,
    color: "#6B7280",
    marginBottom: 4,
  },
  txHash: {
    fontSize: 14,
    color: "#D1D5DB",
    fontFamily: "monospace",
  },
  autoCloseText: {
    marginTop: 32,
  },
  autoCloseLabel: {
    color: "#6B7280",
    fontSize: 14,
  },
  errorIcon: {},
  errorTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#EF4444",
    marginTop: 16,
  },
  errorMessage: {
    fontSize: 16,
    color: "#9CA3AF",
    textAlign: "center",
    lineHeight: 24,
  },
  errorActions: {
    marginTop: 32,
    gap: 16,
    width: "100%",
  },
  cancelLink: {
    alignItems: "center",
    paddingVertical: 12,
  },
  cancelLinkText: {
    color: "#9CA3AF",
    fontSize: 16,
  },
  sendingText: {
    fontSize: 20,
    fontWeight: "600",
    color: "#FFFFFF",
    marginTop: 24,
  },
  sendingSubtext: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
    marginTop: 8,
  },
  // Merchant styles
  merchantRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  merchantIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#569F8C20",
    alignItems: "center",
    justifyContent: "center",
  },
  merchantInfo: {
    flex: 1,
  },
  merchantName: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },
  merchantLocation: {
    color: "#9CA3AF",
    fontSize: 14,
    marginTop: 2,
  },
  // Description styles
  descriptionText: {
    color: "#D1D5DB",
    fontSize: 15,
    lineHeight: 22,
  },
  // Item list styles
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
  },
  itemName: {
    color: "#D1D5DB",
    fontSize: 15,
    flex: 1,
  },
  itemPrice: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "500",
  },
  // Network styles
  networkRow: {
    gap: 4,
  },
  networkName: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "500",
  },
  contractAddress: {
    color: "#6B7280",
    fontSize: 13,
    fontFamily: "monospace",
  },
  // Already paid styles
  warningIconContainer: {
    padding: 16,
  },
  warningTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#F59E0B",
    marginTop: 16,
  },
  warningMessage: {
    fontSize: 16,
    color: "#9CA3AF",
    textAlign: "center",
    lineHeight: 24,
  },
  paidDetailsCard: {
    backgroundColor: "#1E2E29",
    borderRadius: 16,
    padding: 16,
    gap: 12,
    marginTop: 24,
    width: "100%",
  },
  paidDetailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  paidDetailLabel: {
    color: "#9CA3AF",
    fontSize: 14,
  },
  paidDetailValue: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
  },
});
