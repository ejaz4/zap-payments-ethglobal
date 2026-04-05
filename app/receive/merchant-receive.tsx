/**
 * Merchant Receive Screen
 *
 * Allows a merchant to:
 * 1. Specify desired settlement amount + token (e.g. 50 USDC)
 * 2. Set acceptance tolerance (slippage)
 * 3. Listen for incoming ERC-20 transfers
 * 4. If received token differs from settlement token, auto-swap via Uniswap
 * 5. Validate that received/swapped amount meets the requested amount
 *
 * Ported from smart-swap-hub MerchantTab for React Native.
 */

import { useNfc } from "@/app/nfc/context";
import { ChainId, EthersClient } from "@/app/profiles/client";
import { formatUnits } from "ethers";
import { DEFAULT_TOKENS, TokenInfo } from "@/config/tokens";
import {
    NATIVE_TOKEN_ADDRESS,
    SLIPPAGE_PRESETS,
} from "@/config/uniswap";
import { useErc20Listener } from "@/hooks/use-erc20-listener";
import { useSwapExecution } from "@/hooks/use-swap-execution";
import { useUniswapQuote } from "@/hooks/use-uniswap-quote";
import { BalanceService } from "@/services/wallet";
import {
    tintedBackground,
    useAccentColor,
} from "@/store/appearance";
import { useSelectedAccount, useWalletStore } from "@/store/wallet";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    Vibration,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// HCE is Android-only
let HCESession: any = null;
let NFCTagType4: any = null;
let NFCTagType4NDEFContentType: any = null;
try {
  if (Platform.OS === "android") {
    const hce = require("react-native-hce");
    HCESession = hce.HCESession;
    NFCTagType4 = hce.NFCTagType4;
    NFCTagType4NDEFContentType = hce.NFCTagType4NDEFContentType;
  }
} catch (e) {
  console.warn("[MerchantReceive] react-native-hce not available:", e);
}

type RequestState = "setup" | "listening" | "received";

interface SettleToken {
  symbol: string;
  address: string;
  decimals: number;
  name: string;
}

/** Build stable settlement token options for a chain */
function getStableTokens(chainId: ChainId): SettleToken[] {
  const stableSymbols = ["USDC", "USDT", "DAI", "BUSD"];
  const network = EthersClient.getNetworkConfig(chainId);

  // Native token
  const native: SettleToken = {
    symbol: network?.nativeCurrency.symbol || "ETH",
    address: NATIVE_TOKEN_ADDRESS,
    decimals: network?.nativeCurrency.decimals || 18,
    name: `${network?.nativeCurrency.symbol || "ETH"} (Native)`,
  };

  // Stable ERC20s from default token list
  const erc20s: SettleToken[] = (DEFAULT_TOKENS[chainId] || [])
    .filter((t: TokenInfo) => stableSymbols.includes(t.symbol.replace(".e", "")))
    .map((t: TokenInfo) => ({
      symbol: t.symbol,
      address: t.address,
      decimals: t.decimals,
      name: t.name,
    }));

  // All ERC20s as fallback
  const rest: SettleToken[] = (DEFAULT_TOKENS[chainId] || [])
    .filter((t: TokenInfo) => !stableSymbols.includes(t.symbol.replace(".e", "")))
    .map((t: TokenInfo) => ({
      symbol: t.symbol,
      address: t.address,
      decimals: t.decimals,
      name: t.name,
    }));

  return [...erc20s, native, ...rest];
}

export default function MerchantReceiveScreen() {
  const accentColor = useAccentColor();
  const bg = tintedBackground("#000000");
  const router = useRouter();
  const selectedAccount = useSelectedAccount();
  const selectedChainId = useWalletStore((s) => s.selectedChainId);
  const networkConfig = EthersClient.getNetworkConfig(selectedChainId);

  const [state, setState] = useState<RequestState>("setup");
  const [requestAmount, setRequestAmount] = useState("");
  const [tolerance, setTolerance] = useState(5);
  const [showTokenPicker, setShowTokenPicker] = useState(false);
  const [tapCount, setTapCount] = useState(0);

  // NFC HCE broadcasting
  const { stopListening, startListening } = useNfc();
  const sessionRef = useRef<any>(null);
  const cleanupListenersRef = useRef<(() => void) | null>(null);

  // Settlement token
  const tokenOptions = useMemo(() => getStableTokens(selectedChainId), [selectedChainId]);
  const [settleToken, setSettleToken] = useState<SettleToken>(tokenOptions[0]);

  // Reset on chain change
  useEffect(() => {
    const opts = getStableTokens(selectedChainId);
    setSettleToken(opts[0]);
    handleReset();
  }, [selectedChainId]);

  // ERC20 transfer listener
  const {
    transfer: erc20Transfer,
    reset: resetListener,
  } = useErc20Listener(
    selectedAccount?.address,
    selectedChainId,
    state === "listening",
  );

  // Native balance polling — detect native ETH/MATIC/etc. transfers
  const initialBalanceRef = useRef<bigint>(0n);
  const balancePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [nativeTransfer, setNativeTransfer] = useState<{
    formatted: string;
    symbol: string;
    decimals: number;
  } | null>(null);

  const nativeSymbol = networkConfig?.nativeCurrency.symbol ?? "ETH";
  const nativeDecimals = networkConfig?.nativeCurrency.decimals ?? 18;

  const startBalancePolling = useCallback(async () => {
    if (!selectedAccount) return;
    try {
      initialBalanceRef.current = await EthersClient.getNativeBalance(
        selectedAccount.address,
        selectedChainId,
      );
    } catch (e) {
      console.warn("[MerchantReceive] Failed to get initial balance:", e);
    }

    balancePollRef.current = setInterval(async () => {
      try {
        const current = await EthersClient.getNativeBalance(
          selectedAccount!.address,
          selectedChainId,
        );
        if (current > initialBalanceRef.current) {
          const increase = current - initialBalanceRef.current;
          const formatted = formatUnits(increase, nativeDecimals);
          console.log("[MerchantReceive] Native balance increase:", formatted, nativeSymbol);
          setNativeTransfer({ formatted, symbol: nativeSymbol, decimals: nativeDecimals });
          stopBalancePolling();
        }
      } catch {
        // Transient RPC error — keep polling
      }
    }, 2000);
  }, [selectedAccount, selectedChainId, nativeSymbol, nativeDecimals]);

  const stopBalancePolling = useCallback(() => {
    if (balancePollRef.current) {
      clearInterval(balancePollRef.current);
      balancePollRef.current = null;
    }
  }, []);

  // Unified transfer — whichever arrives first (ERC20 or native)
  const transfer = useMemo(() => {
    if (erc20Transfer) return erc20Transfer;
    if (nativeTransfer) return {
      token: NATIVE_TOKEN_ADDRESS,
      from: "unknown",
      formatted: nativeTransfer.formatted,
      raw: "0",
      symbol: nativeTransfer.symbol,
      decimals: nativeTransfer.decimals,
      txHash: "",
    };
    return null;
  }, [erc20Transfer, nativeTransfer]);

  // Move to received state when any transfer arrives
  useEffect(() => {
    if (transfer && state === "listening") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Vibration.vibrate([0, 50, 50, 50]);
      stopBalancePolling();
      stopBroadcasting();
      setState("received");
    }
  }, [transfer, state]);

  // Determine if received token matches settlement token
  const isSameToken = useMemo(() => {
    if (!transfer) return false;
    return settleToken.address.toLowerCase() === transfer.token.toLowerCase();
  }, [transfer, settleToken]);

  // Quote: swap received token -> settlement token (EXACT_INPUT)
  const quoteAmount =
    state === "received" && transfer && !isSameToken ? transfer.formatted : "";

  const {
    quote: swapQuote,
    isLoading: quoteLoading,
    error: quoteError,
  } = useUniswapQuote(
    transfer?.token || NATIVE_TOKEN_ADDRESS,
    transfer?.decimals || 18,
    settleToken.address,
    settleToken.decimals,
    quoteAmount,
    selectedChainId,
    selectedAccount?.address,
    "auto",
    "EXACT_INPUT",
  );

  // Swap execution
  const {
    executeSwap,
    step: swapStep,
    txHash,
    error: swapError,
    reset: resetSwap,
  } = useSwapExecution();

  // Check if received amount meets requirement
  const tolerancePct = tolerance / 100;
  const requestedNum = parseFloat(requestAmount) || 0;
  const minAcceptable = requestedNum * (1 - tolerancePct);

  const amountStatus: "sufficient" | "insufficient" | "pending" = useMemo(() => {
    if (state !== "received" || requestedNum <= 0) return "pending";
    if (isSameToken) {
      const receivedNum = parseFloat(transfer?.formatted || "0");
      return receivedNum >= minAcceptable ? "sufficient" : "insufficient";
    }
    if (swapQuote) {
      const outputNum = parseFloat(swapQuote.formattedOut);
      return outputNum >= minAcceptable ? "sufficient" : "insufficient";
    }
    return "pending";
  }, [state, isSameToken, transfer, swapQuote, requestedNum, minAcceptable]);

  // Auto-swap: execute as soon as a valid quote arrives for a different token
  const autoSwapFiredRef = useRef(false);
  useEffect(() => {
    if (
      state === "received" &&
      !isSameToken &&
      swapQuote &&
      selectedAccount &&
      swapStep === "idle" &&
      !autoSwapFiredRef.current
    ) {
      autoSwapFiredRef.current = true;
      console.log("[MerchantReceive] Auto-swap: executing swap", swapQuote.formattedIn, "→", swapQuote.formattedOut);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      executeSwap(swapQuote, selectedAccount.address);
    }
  }, [state, isSameToken, swapQuote, selectedAccount, swapStep, executeSwap]);

  const gasUsd = swapQuote?.gasFeeUSD
    ? `$${parseFloat(swapQuote.gasFeeUSD).toFixed(4)}`
    : null;

  // ---------------------------------------------------------------------------
  // HCE NFC broadcasting
  // ---------------------------------------------------------------------------
  const stopBroadcasting = useCallback(async () => {
    try {
      cleanupListenersRef.current?.();
      cleanupListenersRef.current = null;
      if (sessionRef.current) {
        await sessionRef.current.setEnabled(false);
      }
      sessionRef.current = null;
    } catch (e) {
      console.warn("[MerchantReceive] Error stopping HCE:", e);
    }
  }, []);

  const startBroadcasting = useCallback(async () => {
    if (!selectedAccount || Platform.OS !== "android") return;
    if (!HCESession || !NFCTagType4 || !NFCTagType4NDEFContentType) return;

    try {
      const payload = JSON.stringify({
        chainId: selectedChainId,
        address: selectedAccount.address,
        network: "ethereum",
        type: "receive-anything",
        amount: parseFloat(requestAmount).toString(),
        settleTokenAddress: settleToken.address,
        settleTokenSymbol: settleToken.symbol,
        settleTokenDecimals: settleToken.decimals,
      });

      console.log("[MerchantReceive] HCE payload:", payload);

      const tag = new NFCTagType4({
        type: NFCTagType4NDEFContentType.Text,
        content: payload,
        writable: true,
      });

      const session = await HCESession.getInstance();
      sessionRef.current = session;
      await session.setApplication(tag);

      const cleanupRead = session.on(
        HCESession.Events.HCE_STATE_READ,
        () => {
          console.log("[MerchantReceive] HCE tag read by sender");
          setTapCount((c: number) => c + 1);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Vibration.vibrate(50);
        },
      );

      cleanupListenersRef.current = cleanupRead;
      await session.setEnabled(true);
      console.log("[MerchantReceive] HCE broadcasting started");
    } catch (e) {
      console.warn("[MerchantReceive] Failed to start HCE:", e);
    }
  }, [selectedAccount, selectedChainId, requestAmount, settleToken]);

  // Disable NFC reading while broadcasting (avoid reading our own tag)
  useFocusEffect(
    useCallback(() => {
      if (state === "listening") {
        stopListening();
      }
      return () => {
        startListening();
      };
    }, [state, stopListening, startListening]),
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => { stopBroadcasting(); stopBalancePolling(); };
  }, [stopBroadcasting, stopBalancePolling]);

  const handleStartListening = async () => {
    if (!requestAmount || parseFloat(requestAmount) <= 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setState("listening");
    await startBroadcasting();
    startBalancePolling();
  };

  const handleExecuteSwap = () => {
    if (!swapQuote || !selectedAccount) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    executeSwap(swapQuote, selectedAccount.address);
  };

  // Refresh balances after swap
  useEffect(() => {
    if (swapStep === "done") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      BalanceService.forceRefreshBalances();
    }
  }, [swapStep]);

  const handleReset = useCallback(async () => {
    await stopBroadcasting();
    stopBalancePolling();
    autoSwapFiredRef.current = false;
    setState("setup");
    setRequestAmount("");
    setTapCount(0);
    setNativeTransfer(null);
    resetListener();
    resetSwap();
  }, [resetListener, resetSwap, stopBroadcasting, stopBalancePolling]);

  const isSwapping = ["checking-approval", "approving", "signing-permit", "building-swap", "swapping"].includes(swapStep);
  const explorerUrl = networkConfig?.blockExplorerUrl;

  if (!selectedAccount) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
        <View style={styles.center}>
          <Text style={styles.emptyText}>No wallet found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Merchant Receive</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
        {/* ─── SETUP ─── */}
        {state === "setup" && (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Create Payment Request</Text>
              <Text style={styles.cardDesc}>
                Specify the amount you want to receive and the settlement token.
                Any incoming ERC-20 transfer will be auto-detected. If it's a
                different token, you can swap it via Uniswap.
              </Text>

              {/* Amount + token */}
              <Text style={styles.label}>Request Amount</Text>
              <View style={styles.amountRow}>
                <TextInput
                  style={styles.amountInput}
                  value={requestAmount}
                  onChangeText={setRequestAmount}
                  placeholder="0.00"
                  placeholderTextColor="#6B7280"
                  keyboardType="decimal-pad"
                />
                <TouchableOpacity
                  style={styles.tokenPill}
                  onPress={() => setShowTokenPicker(true)}
                >
                  <Text style={styles.tokenPillText}>{settleToken.symbol}</Text>
                  <Ionicons name="chevron-down" size={14} color="#9CA3AF" />
                </TouchableOpacity>
              </View>

              {/* Tolerance */}
              <Text style={[styles.label, { marginTop: 16 }]}>Acceptance tolerance</Text>
              <View style={styles.toleranceRow}>
                {SLIPPAGE_PRESETS.map((pct) => (
                  <TouchableOpacity
                    key={pct}
                    style={[styles.toleranceBtn, tolerance === pct && { backgroundColor: accentColor }]}
                    onPress={() => setTolerance(pct)}
                  >
                    <Text style={[styles.toleranceBtnText, tolerance === pct && { color: "#FFF" }]}>{pct}%</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: requestAmount ? accentColor : "#374151" }]}
              onPress={handleStartListening}
              disabled={!requestAmount || parseFloat(requestAmount) <= 0}
            >
              <Ionicons name="radio" size={18} color="#FFF" />
              <Text style={styles.primaryBtnText}>Start Listening</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ─── LISTENING ─── */}
        {state === "listening" && (
          <>
            <View style={[styles.card, styles.listeningCard]}>
              <View style={styles.listeningHeader}>
                <ActivityIndicator size="small" color={accentColor} />
                <Text style={styles.listeningTitle}>
                  {Platform.OS === "android" ? "Broadcasting via NFC..." : "Listening for incoming transfers..."}
                </Text>
              </View>
              <Text style={styles.listeningDesc}>
                {Platform.OS === "android"
                  ? "Hold another device near to share your payment request. Any incoming token transfer will be captured."
                  : "Waiting for any ERC-20 token to be sent to your wallet. The first incoming transfer will be captured."}
              </Text>
              {tapCount > 0 && (
                <View style={styles.tapBadge}>
                  <Ionicons name="phone-portrait-outline" size={14} color={accentColor} />
                  <Text style={styles.tapBadgeText}>{tapCount} tap{tapCount !== 1 ? "s" : ""} detected</Text>
                </View>
              )}

              <View style={styles.listeningDetails}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Requesting</Text>
                  <Text style={styles.detailValue}>{requestAmount} {settleToken.symbol}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Tolerance</Text>
                  <Text style={styles.detailValue}>{tolerance}%</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Min acceptable</Text>
                  <Text style={styles.detailValue}>{minAcceptable.toFixed(2)} {settleToken.symbol}</Text>
                </View>
              </View>

              {/* Show receiving address */}
              <View style={styles.addressBox}>
                <Text style={styles.addressLabel}>Send payment to:</Text>
                <Text style={styles.addressText} selectable>{selectedAccount.address}</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.secondaryBtn} onPress={handleReset}>
              <Text style={styles.secondaryBtnText}>Cancel</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ─── RECEIVED ─── */}
        {state === "received" && transfer && (
          <>
            {/* Transfer details */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Payment Received</Text>
              <View style={styles.transferDetails}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Received</Text>
                  <Text style={[styles.detailValue, { fontWeight: "700" }]}>
                    {transfer.formatted} {transfer.symbol}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>From</Text>
                  <Text style={styles.detailValueMono}>
                    {transfer.from.slice(0, 10)}...{transfer.from.slice(-6)}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Token</Text>
                  <Text style={styles.detailValueMono}>
                    {transfer.token.slice(0, 10)}...{transfer.token.slice(-6)}
                  </Text>
                </View>
                {explorerUrl && (
                  <Text style={styles.explorerLink}>
                    {explorerUrl}/tx/{transfer.txHash.slice(0, 16)}...
                  </Text>
                )}
              </View>
            </View>

            {/* Amount status badge */}
            <View style={[
              styles.statusBadge,
              amountStatus === "sufficient" && styles.statusSufficient,
              amountStatus === "insufficient" && styles.statusInsufficient,
            ]}>
              <Text style={[
                styles.statusBadgeText,
                amountStatus === "sufficient" && { color: "#10B981" },
                amountStatus === "insufficient" && { color: "#EF4444" },
              ]}>
                {amountStatus === "sufficient" && "Right amount received"}
                {amountStatus === "insufficient" && `Insufficient — need >= ${minAcceptable.toFixed(2)} ${settleToken.symbol}`}
                {amountStatus === "pending" && "Calculating..."}
              </Text>
            </View>

            {/* Swap section (different token received) */}
            {!isSameToken && (
              <View style={styles.card}>
                <Text style={styles.swapNotice}>
                  Received <Text style={{ color: "#FFF", fontWeight: "600" }}>{transfer.symbol}</Text> but you want{" "}
                  <Text style={{ color: "#FFF", fontWeight: "600" }}>{settleToken.symbol}</Text>. Swap below:
                </Text>

                {quoteLoading && (
                  <View style={styles.quoteLoadingRow}>
                    <ActivityIndicator size="small" color={accentColor} />
                    <Text style={styles.quoteLoadingText}>Getting swap quote...</Text>
                  </View>
                )}

                {quoteError && <Text style={styles.errorText}>{quoteError}</Text>}

                {swapQuote && (
                  <View style={styles.swapQuoteBox}>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Swap</Text>
                      <Text style={styles.detailValue}>
                        {transfer.formatted} {transfer.symbol} {'→'} {swapQuote.formattedOut} {settleToken.symbol}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Routing</Text>
                      <Text style={styles.detailValue}>{swapQuote.routing}</Text>
                    </View>
                    {gasUsd && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Gas</Text>
                        <Text style={styles.detailValue}>{gasUsd}</Text>
                      </View>
                    )}
                  </View>
                )}

                {/* Swap step indicator */}
                {swapStep !== "idle" && swapStep !== "done" && (
                  <View style={styles.swapStepRow}>
                    <ActivityIndicator size="small" color={accentColor} />
                    <Text style={styles.swapStepText}>{swapStep}...</Text>
                  </View>
                )}
                {swapError && <Text style={styles.errorText}>{swapError}</Text>}
                {swapStep === "done" && txHash && (
                  <View style={styles.successRow}>
                    <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                    <Text style={styles.successText}>
                      Swap complete! Tx: {txHash.slice(0, 10)}...
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: swapQuote && !isSwapping ? accentColor : "#374151" }]}
                  onPress={handleExecuteSwap}
                  disabled={!swapQuote || isSwapping || swapStep === "done"}
                >
                  <Text style={styles.primaryBtnText}>
                    {swapStep === "done"
                      ? "Settled!"
                      : quoteLoading
                      ? "Getting Quote..."
                      : swapQuote
                      ? `Swap ${transfer.symbol} → ${settleToken.symbol}`
                      : "No Quote Available"}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Same token — no swap needed */}
            {isSameToken && amountStatus === "sufficient" && (
              <View style={styles.settledBadge}>
                <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                <Text style={styles.settledText}>Payment settled — no swap needed</Text>
              </View>
            )}

            <TouchableOpacity style={styles.secondaryBtn} onPress={handleReset}>
              <Text style={styles.secondaryBtnText}>New Request</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* Token Picker Modal */}
      <Modal
        visible={showTokenPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTokenPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Settlement Token</Text>
              <TouchableOpacity onPress={() => setShowTokenPicker(false)}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalList}>
              {tokenOptions.map((token, i) => (
                <TouchableOpacity
                  key={`${token.address}_${i}`}
                  style={[
                    styles.modalOption,
                    settleToken.address === token.address && { borderColor: accentColor, borderWidth: 1 },
                  ]}
                  onPress={() => {
                    setSettleToken(token);
                    setShowTokenPicker(false);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalOptionSymbol}>{token.symbol}</Text>
                    <Text style={styles.modalOptionName}>{token.name}</Text>
                  </View>
                  {settleToken.address === token.address && (
                    <Ionicons name="checkmark" size={18} color={accentColor} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F1512" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { color: "#6B7280", fontSize: 16 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1E2E29",
  },
  headerTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "700" },
  content: { flex: 1 },
  contentInner: { padding: 20, paddingBottom: 40 },
  card: {
    backgroundColor: "#1E2E29",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  cardTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  cardDesc: { color: "#9CA3AF", fontSize: 13, lineHeight: 20 },
  label: { color: "#9CA3AF", fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#141B17",
    borderRadius: 12,
    padding: 12,
    marginTop: 6,
  },
  amountInput: { flex: 1, color: "#FFFFFF", fontSize: 24, fontWeight: "700" },
  tokenPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#374151",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  tokenPillText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  toleranceRow: { flexDirection: "row", gap: 8, marginTop: 6 },
  toleranceBtn: { flex: 1, backgroundColor: "#141B17", borderRadius: 8, paddingVertical: 8, alignItems: "center" },
  toleranceBtnText: { color: "#9CA3AF", fontSize: 13, fontWeight: "600" },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    paddingVertical: 16,
    marginBottom: 16,
  },
  primaryBtnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  secondaryBtn: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    paddingVertical: 14,
    backgroundColor: "#374151",
    marginBottom: 16,
  },
  secondaryBtnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
  // Listening
  listeningCard: { borderColor: "#3B82F630", borderWidth: 1 },
  listeningHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  listeningTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  listeningDesc: { color: "#9CA3AF", fontSize: 12, lineHeight: 18 },
  listeningDetails: { backgroundColor: "#141B17", borderRadius: 10, padding: 10, gap: 6 },
  addressBox: { backgroundColor: "#141B17", borderRadius: 10, padding: 10, gap: 4 },
  addressLabel: { color: "#9CA3AF", fontSize: 11 },
  addressText: { color: "#FFFFFF", fontSize: 12, fontFamily: "monospace" },
  // Received
  transferDetails: { gap: 8 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  detailLabel: { color: "#9CA3AF", fontSize: 12 },
  detailValue: { color: "#E5E7EB", fontSize: 12, fontWeight: "600" },
  detailValueMono: { color: "#E5E7EB", fontSize: 11, fontFamily: "monospace" },
  explorerLink: { color: "#3B82F6", fontSize: 11, marginTop: 4 },
  statusBadge: {
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
    marginBottom: 16,
    backgroundColor: "#374151",
  },
  statusSufficient: { backgroundColor: "#10B98115", borderWidth: 1, borderColor: "#10B98130" },
  statusInsufficient: { backgroundColor: "#EF444415", borderWidth: 1, borderColor: "#EF444430" },
  statusBadgeText: { color: "#9CA3AF", fontSize: 13, fontWeight: "600" },
  swapNotice: { color: "#9CA3AF", fontSize: 12, lineHeight: 18 },
  quoteLoadingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  quoteLoadingText: { color: "#9CA3AF", fontSize: 12 },
  errorText: { color: "#EF4444", fontSize: 12 },
  swapQuoteBox: { backgroundColor: "#141B17", borderRadius: 10, padding: 10, gap: 6 },
  swapStepRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  swapStepText: { color: "#9CA3AF", fontSize: 12 },
  successRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  successText: { color: "#10B981", fontSize: 12, fontWeight: "600" },
  settledBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 14,
    marginBottom: 16,
  },
  settledText: { color: "#10B981", fontSize: 14, fontWeight: "600" },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: "#1A2421", borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "60%" },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1E2E29",
  },
  modalTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "600" },
  modalList: { padding: 16 },
  modalOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: "#0F1512",
  },
  modalOptionSymbol: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
  modalOptionName: { color: "#9CA3AF", fontSize: 12, marginTop: 2 },
  tapBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#141B17", borderRadius: 8, padding: 8, marginTop: 4 },
  tapBadgeText: { color: "#D1D5DB", fontSize: 12, fontWeight: "600" },
});
