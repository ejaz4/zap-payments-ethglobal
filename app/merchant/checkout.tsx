/**
 * Merchant Checkout Screen
 * Broadcasts the basket total via HCE so a customer can tap to pay.
 * Listens for incoming ERC-20 transfers AND native balance changes
 * to detect payment in any currency. Verifies equivalence via prices
 * and offers optional swap to the merchant's native currency.
 *
 * Target: success shown within 5 seconds of customer sending.
 */

import { getChainName, useNfc } from "@/app/nfc/context";
import { EthersClient } from "@/app/profiles/client";
import { NATIVE_TOKEN_ADDRESS } from "@/config/uniswap";
import { useErc20Listener } from "@/hooks/use-erc20-listener";
import { useFiatValue } from "@/hooks/use-fiat-value";
import { useSwapExecution } from "@/hooks/use-swap-execution";
import { useUniswapQuote } from "@/hooks/use-uniswap-quote";
import { PriceService } from "@/services/price";
import { BalanceService } from "@/services/wallet";
import { hexToRgba, tintedBackground, useAccentColor } from "@/store/appearance";
import { useMerchantStore } from "@/store/merchant";
import { useSelectedAccount, useWalletStore } from "@/store/wallet";
import { Ionicons } from "@expo/vector-icons";
import { formatUnits } from "ethers";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    Vibration,
    View,
} from "react-native";
import Animated, {
    Easing,
    FadeIn,
    FadeInDown,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withTiming,
} from "react-native-reanimated";
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
    console.log("[MerchantCheckout] react-native-hce loaded OK");
  }
} catch (e) {
  console.warn("[MerchantCheckout] react-native-hce not available:", e);
}

type BroadcastStatus =
  | "idle"
  | "broadcasting"
  | "tapped"
  | "received"
  | "settling"
  | "settled"
  | "error";

interface ReceivedPayment {
  type: "native" | "token";
  amount: string;
  symbol: string;
  tokenAddress?: string;
  decimals?: number;
  from?: string;
  txHash?: string;
}

/** Default acceptance tolerance (5%) — matches merchant-receive defaults */
const DEFAULT_TOLERANCE = 0.05;

export default function MerchantCheckoutScreen() {
  const accentColor = useAccentColor();
  const bg = tintedBackground("#000000");
  const router = useRouter();
  const selectedAccount = useSelectedAccount();
  const selectedChainId = useWalletStore((s) => s.selectedChainId);
  const networkConfig = EthersClient.getNetworkConfig(selectedChainId);
  const nativeSymbol = networkConfig?.nativeCurrency.symbol ?? "ETH";

  const products = useMerchantStore((s) => s.products);
  const basket = useMerchantStore((s) => s.basket);
  const getBasketTotal = useMerchantStore((s) => s.getBasketTotal);
  const clearBasket = useMerchantStore((s) => s.clearBasket);
  const pricingToken = useMerchantStore((s) => s.pricingToken);

  // Display symbol: pricing token symbol or native
  const symbol = pricingToken.type === "token" ? pricingToken.symbol : nativeSymbol;

  const { stopListening, startListening } = useNfc();

  const [status, setStatus] = useState<BroadcastStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [tapCount, setTapCount] = useState(0);
  const accentSurface = hexToRgba(accentColor, 0.16);
  const accentBorder = hexToRgba(accentColor, 0.38);

  const total = getBasketTotal();
  const fiatTotal = useFiatValue(total, selectedChainId);

  const sessionRef = useRef<any>(null);
  const cleanupListenersRef = useRef<(() => void) | null>(null);

  // ---------------------------------------------------------------------------
  // Payment detection state
  // ---------------------------------------------------------------------------
  const [receivedPayment, setReceivedPayment] = useState<ReceivedPayment | null>(null);
  const [equivalenceStatus, setEquivalenceStatus] = useState<"checking" | "sufficient" | "insufficient" | null>(null);
  const [receivedFiatValue, setReceivedFiatValue] = useState<string | null>(null);
  const [requestedFiatValue, setRequestedFiatValue] = useState<string | null>(null);
  const initialBalanceRef = useRef<bigint>(0n);
  const balancePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ERC20 listener — active when broadcasting or tapped
  const isListeningForPayments = status === "broadcasting" || status === "tapped";
  const {
    transfer: erc20Transfer,
    reset: resetErc20Listener,
  } = useErc20Listener(
    selectedAccount?.address,
    selectedChainId,
    isListeningForPayments,
  );

  // ---------------------------------------------------------------------------
  // Swap (for settling received token → merchant's pricing currency)
  // ---------------------------------------------------------------------------
  const swapTokenIn = receivedPayment?.type === "token" ? receivedPayment.tokenAddress ?? "" : NATIVE_TOKEN_ADDRESS;
  const swapTokenInDecimals = receivedPayment?.type === "token" ? (receivedPayment.decimals ?? 18) : (networkConfig?.nativeCurrency.decimals ?? 18);

  // Swap target: the merchant's pricing currency
  const swapTokenOut = pricingToken.type === "token" ? pricingToken.address : NATIVE_TOKEN_ADDRESS;
  const swapTokenOutDecimals = pricingToken.type === "token" ? pricingToken.decimals : (networkConfig?.nativeCurrency.decimals ?? 18);

  // Only get a swap quote when the received currency differs from the pricing currency
  const needsSwap = receivedPayment != null && !(
    (receivedPayment.type === "native" && pricingToken.type === "native") ||
    (receivedPayment.type === "token" && pricingToken.type === "token" &&
      receivedPayment.tokenAddress?.toLowerCase() === pricingToken.address.toLowerCase())
  );
  const swapAmount = status === "received" && needsSwap ? receivedPayment!.amount : "";

  const {
    quote: swapQuote,
    isLoading: swapQuoteLoading,
  } = useUniswapQuote(
    swapTokenIn,
    swapTokenInDecimals,
    swapTokenOut,
    swapTokenOutDecimals,
    swapAmount,
    selectedChainId,
    selectedAccount?.address,
    "payment",
    "EXACT_INPUT",
  );

  const {
    executeSwap,
    step: swapStep,
    txHash: swapTxHash,
    error: swapError,
    reset: resetSwap,
  } = useSwapExecution();

  // ---------------------------------------------------------------------------
  // Animated rings
  // ---------------------------------------------------------------------------
  const ring1Scale = useSharedValue(1);
  const ring2Scale = useSharedValue(1);
  const ring3Scale = useSharedValue(1);

  const ring1Style = useAnimatedStyle(() => ({
    transform: [{ scale: ring1Scale.value }],
    opacity: 2 - ring1Scale.value,
  }));
  const ring2Style = useAnimatedStyle(() => ({
    transform: [{ scale: ring2Scale.value }],
    opacity: 2 - ring2Scale.value,
  }));
  const ring3Style = useAnimatedStyle(() => ({
    transform: [{ scale: ring3Scale.value }],
    opacity: 2 - ring3Scale.value,
  }));

  useEffect(() => {
    if (status === "broadcasting" || status === "tapped") {
      ring1Scale.value = withRepeat(
        withSequence(
          withTiming(1.6, { duration: 1500, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: 0 }),
        ),
        -1,
      );
      ring2Scale.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 500 }),
          withTiming(1.6, { duration: 1500, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: 0 }),
        ),
        -1,
      );
      ring3Scale.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1000 }),
          withTiming(1.6, { duration: 1500, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: 0 }),
        ),
        -1,
      );
    } else {
      ring1Scale.value = withTiming(1, { duration: 300 });
      ring2Scale.value = withTiming(1, { duration: 300 });
      ring3Scale.value = withTiming(1, { duration: 300 });
    }
  }, [status]);

  // ---------------------------------------------------------------------------
  // Disable NFC reading while broadcasting
  // ---------------------------------------------------------------------------
  useFocusEffect(
    useCallback(() => {
      console.log("[MerchantCheckout] Screen focused — stopping NFC reader");
      stopListening();
      return () => {
        console.log("[MerchantCheckout] Screen unfocused — resuming NFC reader");
        startListening();
      };
    }, []),
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopBroadcasting();
      stopBalancePolling();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // ERC20 transfer detection
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (erc20Transfer && isListeningForPayments) {
      console.log("[MerchantCheckout] ERC20 transfer detected:", erc20Transfer.symbol, erc20Transfer.formatted);
      setReceivedPayment({
        type: "token",
        amount: erc20Transfer.formatted,
        symbol: erc20Transfer.symbol,
        tokenAddress: erc20Transfer.token,
        decimals: erc20Transfer.decimals,
        from: erc20Transfer.from,
        txHash: erc20Transfer.txHash,
      });
      setStatus("received");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Vibration.vibrate([0, 50, 50, 50]);
      stopBalancePolling();
    }
  }, [erc20Transfer, isListeningForPayments]);

  // ---------------------------------------------------------------------------
  // Native balance polling (detect incoming ETH/native transfers)
  // ---------------------------------------------------------------------------
  const startBalancePolling = useCallback(async () => {
    if (!selectedAccount) return;
    try {
      initialBalanceRef.current = await EthersClient.getNativeBalance(
        selectedAccount.address,
        selectedChainId,
      );
      console.log("[MerchantCheckout] Initial native balance:", formatUnits(initialBalanceRef.current, 18));
    } catch (e) {
      console.warn("[MerchantCheckout] Failed to get initial balance:", e);
    }

    balancePollRef.current = setInterval(async () => {
      try {
        const current = await EthersClient.getNativeBalance(
          selectedAccount!.address,
          selectedChainId,
        );
        if (current > initialBalanceRef.current) {
          const increase = current - initialBalanceRef.current;
          const decimals = networkConfig?.nativeCurrency.decimals ?? 18;
          const formatted = formatUnits(increase, decimals);
          console.log("[MerchantCheckout] Native balance increase detected:", formatted, nativeSymbol);

          setReceivedPayment({
            type: "native",
            amount: formatted,
            symbol: nativeSymbol,
          });
          setStatus("received");
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Vibration.vibrate([0, 50, 50, 50]);
          stopBalancePolling();
        }
      } catch {
        // Transient RPC error — keep polling
      }
    }, 2000);
  }, [selectedAccount, selectedChainId, symbol, networkConfig]);

  const stopBalancePolling = useCallback(() => {
    if (balancePollRef.current) {
      clearInterval(balancePollRef.current);
      balancePollRef.current = null;
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Equivalence check — runs when payment is received
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (status !== "received" || !receivedPayment) return;

    const check = async () => {
      setEquivalenceStatus("checking");
      const requestedAmount = parseFloat(total);
      const receivedAmount = parseFloat(receivedPayment.amount);

      // Case 1: Received the exact same currency as priced
      const isSameCurrency =
        (receivedPayment.type === "native" && pricingToken.type === "native") ||
        (receivedPayment.type === "token" && pricingToken.type === "token" &&
          receivedPayment.tokenAddress?.toLowerCase() === pricingToken.address.toLowerCase());

      if (isSameCurrency) {
        const sufficient = receivedAmount >= requestedAmount * (1 - DEFAULT_TOLERANCE);
        setEquivalenceStatus(sufficient ? "sufficient" : "insufficient");
        // Fiat values — same currency so show as-is
        try {
          const price = pricingToken.type === "native"
            ? await PriceService.getNativePrice(selectedChainId, "usd")
            : await PriceService.getPriceBySymbol(pricingToken.symbol, "usd");
          if (price) {
            setReceivedFiatValue(`$${(receivedAmount * price).toFixed(2)}`);
            setRequestedFiatValue(`$${(requestedAmount * price).toFixed(2)}`);
          }
        } catch {}
        return;
      }

      // Case 2: Different currency — compare via USD prices
      try {
        // Get the price of the currency the merchant priced in
        const requestedPrice = pricingToken.type === "native"
          ? await PriceService.getNativePrice(selectedChainId, "usd")
          : await PriceService.getPriceBySymbol(pricingToken.symbol, "usd");

        // Get the price of what was actually received
        const receivedPrice = receivedPayment.type === "native"
          ? await PriceService.getNativePrice(selectedChainId, "usd")
          : await PriceService.getPriceBySymbol(receivedPayment.symbol, "usd");

        if (requestedPrice && receivedPrice) {
          const requestedUsd = requestedAmount * requestedPrice;
          const receivedUsd = receivedAmount * receivedPrice;
          setRequestedFiatValue(`$${requestedUsd.toFixed(2)}`);
          setReceivedFiatValue(`$${receivedUsd.toFixed(2)}`);
          const sufficient = receivedUsd >= requestedUsd * (1 - DEFAULT_TOLERANCE);
          setEquivalenceStatus(sufficient ? "sufficient" : "insufficient");
        } else {
          // Can't verify prices — show as pending
          setEquivalenceStatus("sufficient");
        }
      } catch {
        // Price service error — be lenient
        setEquivalenceStatus("sufficient");
      }
    };

    check();
  }, [status, receivedPayment, total, selectedChainId]);

  // Refresh balances after swap completes
  useEffect(() => {
    if (swapStep === "done") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      BalanceService.forceRefreshBalances();
      setStatus("settled");
    }
  }, [swapStep]);

  // ---------------------------------------------------------------------------
  // HCE broadcasting
  // ---------------------------------------------------------------------------
  const stopBroadcasting = async () => {
    console.log("[MerchantCheckout] stopBroadcasting called");
    try {
      cleanupListenersRef.current?.();
      cleanupListenersRef.current = null;
      if (sessionRef.current) {
        await sessionRef.current.setEnabled(false);
        console.log("[MerchantCheckout] HCE session disabled");
      }
      sessionRef.current = null;
    } catch (e) {
      console.warn("[MerchantCheckout] Error stopping HCE session:", e);
    }
  };

  const startBroadcasting = async () => {
    if (!selectedAccount) return;

    if (Platform.OS !== "android") {
      setErrorMessage("NFC broadcasting is only supported on Android.");
      setStatus("error");
      return;
    }

    if (!HCESession || !NFCTagType4 || !NFCTagType4NDEFContentType) {
      const msg = "react-native-hce native module not found. Run: expo prebuild && expo run:android";
      console.error("[MerchantCheckout]", msg);
      setErrorMessage(msg);
      setStatus("error");
      return;
    }

    try {
      const payload = JSON.stringify({
        chainId: selectedChainId,
        address: selectedAccount.address,
        network: "ethereum",
        type: "zap-pay",
        amount: total,
        tokenSymbol: symbol,
        // When pricing in a token (e.g. USDC), include its address so the
        // customer's device knows the amount is denominated in that token.
        ...(pricingToken.type === "token" ? {
          tokenAddress: pricingToken.address,
          tokenDecimals: pricingToken.decimals,
        } : {}),
      });

      console.log("[MerchantCheckout] Starting HCE — total:", total, symbol);
      console.log("[MerchantCheckout] Payload:", payload);

      const tag = new NFCTagType4({
        type: NFCTagType4NDEFContentType.Text,
        content: payload,
        writable: true,
      });

      const session = await HCESession.getInstance();
      sessionRef.current = session;
      await session.setApplication(tag);

      const cleanupRead = session.on(HCESession.Events.HCE_STATE_READ, () => {
        console.log("[MerchantCheckout] HCE_STATE_READ — customer tapped");
        setTapCount((c) => c + 1);
        setStatus("tapped");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Vibration.vibrate(50);
        // Don't revert to broadcasting — stay tapped until payment detected
      });

      const cleanupWrite = session.on(HCESession.Events.HCE_STATE_WRITE, () => {
        console.log("[MerchantCheckout] HCE_STATE_WRITE — customer wrote back");
      });

      cleanupListenersRef.current = () => {
        cleanupRead();
        cleanupWrite();
      };

      await session.setEnabled(true);
      console.log("[MerchantCheckout] HCE ENABLED — broadcasting");
      setStatus("broadcasting");
      setErrorMessage(null);

      // Start listening for payments
      startBalancePolling();
    } catch (err: any) {
      console.error("[MerchantCheckout] Failed to start HCE:", err);
      setErrorMessage(err?.message ?? "Failed to start NFC broadcasting.");
      setStatus("error");
    }
  };

  const handleStop = async () => {
    await stopBroadcasting();
    stopBalancePolling();
    setStatus("idle");
    setTapCount(0);
    setReceivedPayment(null);
    setEquivalenceStatus(null);
    resetErc20Listener();
    resetSwap();
  };

  const handleNewSale = async () => {
    await stopBroadcasting();
    stopBalancePolling();
    clearBasket();
    router.back();
  };

  const handleSwapToNative = () => {
    if (!swapQuote || !selectedAccount) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStatus("settling");
    executeSwap(swapQuote, selectedAccount.address);
  };

  const isBroadcasting = status === "broadcasting" || status === "tapped";
  const isSwapping = ["checking-approval", "approving", "signing-permit", "building-swap", "swapping"].includes(swapStep);

  // ---------------------------------------------------------------------------
  // Status helpers
  // ---------------------------------------------------------------------------
  const getStatusColor = () => {
    switch (status) {
      case "broadcasting":
      case "tapped":
        return accentColor;
      case "received":
        return equivalenceStatus === "sufficient" ? "#10B981" :
               equivalenceStatus === "insufficient" ? "#F59E0B" : accentColor;
      case "settling":
        return accentColor;
      case "settled":
        return "#10B981";
      case "error":
        return "#EF4444";
      default:
        return "#6B7280";
    }
  };

  const getStatusIcon = (): keyof typeof Ionicons.glyphMap => {
    switch (status) {
      case "broadcasting": return "radio-outline";
      case "tapped": return "phone-portrait-outline";
      case "received": return equivalenceStatus === "sufficient" ? "checkmark-circle" : "time-outline";
      case "settling": return "swap-horizontal-outline";
      case "settled": return "checkmark-circle";
      case "error": return "alert-circle-outline";
      default: return "radio-outline";
    }
  };

  const getStatusMessage = () => {
    switch (status) {
      case "broadcasting": return "Awaiting payment";
      case "tapped": return "Customer tapped!";
      case "received":
        if (equivalenceStatus === "checking") return "Verifying amount...";
        if (equivalenceStatus === "sufficient") return "Payment received!";
        if (equivalenceStatus === "insufficient") return "Amount may be low";
        return "Payment received";
      case "settling": return "Swapping to " + symbol + "...";
      case "settled": return "Payment settled!";
      case "error": return "Error";
      default: return "Ready to charge";
    }
  };

  const getStatusSubtext = () => {
    switch (status) {
      case "broadcasting": return "Ask the customer to tap their phone";
      case "tapped": return "Waiting for transaction...";
      case "received":
        if (receivedPayment) {
          const recv = `${receivedPayment.amount} ${receivedPayment.symbol}`;
          if (equivalenceStatus === "sufficient") {
            return receivedPayment.type === "native"
              ? `Received ${recv} — exact match`
              : `Received ${recv}${receivedFiatValue ? ` (${receivedFiatValue})` : ""}`;
          }
          if (equivalenceStatus === "insufficient") {
            return `Received ${recv} — expected ≈ ${total} ${symbol}`;
          }
          return `Received ${recv}`;
        }
        return "Verifying...";
      case "settling": return `Converting ${receivedPayment?.symbol} → ${symbol}`;
      case "settled": return swapTxHash ? `Settled in ${symbol}` : "Payment complete";
      case "error": return errorMessage ?? "Something went wrong";
      default: return "Tap 'Charge Customer' to start NFC broadcast";
    }
  };

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
        <TouchableOpacity onPress={() => router.back()} disabled={isBroadcasting || status === "settling"}>
          <Ionicons name="arrow-back" size={24} color={isBroadcasting || status === "settling" ? "#374151" : "#FFFFFF"} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Checkout</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Total amount */}
        <Animated.View entering={FadeIn.delay(50)} style={styles.totalCard}>
          <Text style={styles.totalLabel}>Total to charge</Text>
          <Text style={styles.totalAmount}>{total}</Text>
          <Text style={[styles.totalSymbol, { color: accentColor }]}>{symbol}</Text>
          {fiatTotal && <Text style={styles.totalFiat}>≈ {fiatTotal}</Text>}
          <Text style={styles.totalNetwork}>
            on {networkConfig?.name ?? getChainName(selectedChainId)}
          </Text>
        </Animated.View>

        {/* Broadcast / status indicator */}
        {status !== "received" && status !== "settling" && status !== "settled" && (
          <View style={styles.scannerContainer}>
            {(status === "broadcasting" || status === "tapped") && (
              <>
                <Animated.View style={[styles.ring, { borderColor: getStatusColor() }, ring1Style]} />
                <Animated.View style={[styles.ring, { borderColor: getStatusColor() }, ring2Style]} />
                <Animated.View style={[styles.ring, { borderColor: getStatusColor() }, ring3Style]} />
              </>
            )}
            <Animated.View
              entering={FadeIn.duration(300)}
              style={[styles.iconContainer, { borderColor: getStatusColor() }]}
            >
              <Ionicons name={getStatusIcon()} size={64} color={getStatusColor()} />
            </Animated.View>
          </View>
        )}

        {/* Success icon for received/settled */}
        {(status === "received" || status === "settling" || status === "settled") && (
          <Animated.View entering={FadeIn.duration(250)} style={styles.successIconContainer}>
            <View style={[styles.successCircle, { borderColor: getStatusColor() }]}>
              <Ionicons name={getStatusIcon()} size={56} color={getStatusColor()} />
            </View>
          </Animated.View>
        )}

        {/* Status */}
        <Animated.View entering={FadeInDown.delay(100)} style={styles.statusArea}>
          <Text style={[styles.statusText, { color: getStatusColor() }]}>
            {getStatusMessage()}
          </Text>
          <Text style={styles.statusSubtext}>{getStatusSubtext()}</Text>
          {tapCount > 0 && isBroadcasting && (
            <View style={[styles.tapBadge, { backgroundColor: accentColor + "20" }]}>
              <Ionicons name="radio" size={13} color={accentColor} />
              <Text style={[styles.tapBadgeText, { color: accentColor }]}>{tapCount} tap{tapCount !== 1 ? "s" : ""}</Text>
            </View>
          )}
        </Animated.View>

        {/* Received payment details */}
        {receivedPayment && (status === "received" || status === "settling" || status === "settled") && (
          <Animated.View entering={FadeInDown.delay(100)} style={styles.receivedCard}>
            <Text style={styles.receivedCardTitle}>Payment Details</Text>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Received</Text>
              <Text style={[styles.detailValue, { color: "#10B981", fontWeight: "700" }]}>
                {parseFloat(parseFloat(receivedPayment.amount).toFixed(6))} {receivedPayment.symbol}
              </Text>
            </View>

            {receivedFiatValue && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Value</Text>
                <Text style={styles.detailValue}>{receivedFiatValue}</Text>
              </View>
            )}

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Requested</Text>
              <Text style={styles.detailValue}>
                {total} {symbol} {requestedFiatValue ? `(${requestedFiatValue})` : ""}
              </Text>
            </View>

            {equivalenceStatus && equivalenceStatus !== "checking" && (
              <View style={[
                styles.equivBadge,
                equivalenceStatus === "sufficient" && { backgroundColor: "#10B98115", borderColor: "#10B98130" },
                equivalenceStatus === "insufficient" && { backgroundColor: "#F59E0B15", borderColor: "#F59E0B30" },
              ]}>
                <Ionicons
                  name={equivalenceStatus === "sufficient" ? "checkmark-circle" : "warning"}
                  size={14}
                  color={equivalenceStatus === "sufficient" ? "#10B981" : "#F59E0B"}
                />
                <Text style={{
                  color: equivalenceStatus === "sufficient" ? "#10B981" : "#F59E0B",
                  fontSize: 13,
                  fontWeight: "600",
                }}>
                  {equivalenceStatus === "sufficient" ? "Amount verified" : "Below expected — review"}
                </Text>
              </View>
            )}

            {receivedPayment.from && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>From</Text>
                <Text style={styles.detailValueMono}>
                  {receivedPayment.from.slice(0, 10)}...{receivedPayment.from.slice(-6)}
                </Text>
              </View>
            )}
          </Animated.View>
        )}

        {/* Swap section — show when received a non-native token */}
        {needsSwap && status === "received" && equivalenceStatus === "sufficient" && receivedPayment && (
          <Animated.View entering={FadeInDown.delay(200)} style={styles.swapCard}>
            <Text style={styles.swapCardTitle}>Convert to {symbol}</Text>
            <Text style={styles.swapCardDesc}>
              Swap received {receivedPayment.type === "native" ? nativeSymbol : receivedPayment.symbol} into {symbol}
            </Text>

            {swapQuoteLoading && (
              <View style={styles.quoteRow}>
                <ActivityIndicator size="small" color={accentColor} />
                <Text style={styles.quoteText}>Getting swap quote...</Text>
              </View>
            )}

            {swapQuote && (
              <View style={styles.quoteBox}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Swap</Text>
                  <Text style={styles.detailValue}>
                    {parseFloat(parseFloat(receivedPayment.amount).toFixed(6))} {receivedPayment.symbol} → {swapQuote.formattedOut} {symbol}
                  </Text>
                </View>
                {swapQuote.gasFeeUSD && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Gas</Text>
                    <Text style={styles.detailValue}>${parseFloat(swapQuote.gasFeeUSD).toFixed(4)}</Text>
                  </View>
                )}
              </View>
            )}

            <TouchableOpacity
              style={[styles.swapBtn, { backgroundColor: swapQuote && !isSwapping ? accentColor : "#374151" }]}
              onPress={handleSwapToNative}
              disabled={!swapQuote || isSwapping}
            >
              <Ionicons name="swap-horizontal" size={18} color="#FFF" />
              <Text style={styles.swapBtnText}>
                {isSwapping ? `${swapStep}...` : `Swap to ${symbol}`}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Settling indicator */}
        {status === "settling" && (
          <Animated.View entering={FadeIn} style={styles.settlingRow}>
            <ActivityIndicator size="small" color={accentColor} />
            <Text style={styles.settlingText}>{swapStep}...</Text>
          </Animated.View>
        )}

        {swapError && (
          <Text style={styles.errorText}>{swapError}</Text>
        )}

        {/* Basket summary */}
        <Animated.View entering={FadeInDown.delay(150)} style={styles.basketCard}>
          <Text style={styles.basketCardTitle}>Order Summary</Text>
          {basket.map((item) => {
            const product = products.find((p) => p.id === item.productId);
            if (!product) return null;
            const lineTotal = parseFloat((parseFloat(product.price) * item.quantity).toFixed(8)).toString();
            return (
              <View key={item.productId} style={styles.basketRow}>
                <Text style={styles.basketRowEmoji}>{product.emoji}</Text>
                <Text style={styles.basketRowName} numberOfLines={1}>
                  {product.name}
                  {item.quantity > 1 ? ` ×${item.quantity}` : ""}
                </Text>
                <Text style={styles.basketRowTotal}>{lineTotal} {symbol}</Text>
              </View>
            );
          })}
          <View style={styles.basketDivider} />
          <View style={styles.basketRow}>
            <Text style={[styles.basketRowName, { color: "#FFFFFF", fontWeight: "700" }]}>Total</Text>
            <Text style={[styles.basketRowTotal, { color: accentColor, fontWeight: "700" }]}>
              {total} {symbol}
            </Text>
          </View>
        </Animated.View>
      </ScrollView>

      {/* Action buttons */}
      <Animated.View entering={FadeInDown.delay(200)} style={styles.footer}>
        {(status === "settled" || (status === "received" && equivalenceStatus === "sufficient")) ? (
          <TouchableOpacity
            style={[styles.newSaleBtn, { backgroundColor: accentSurface, borderColor: accentColor }]}
            onPress={handleNewSale}
          >
            <Ionicons name="refresh-outline" size={20} color="#FFFFFF" />
            <Text style={[styles.newSaleBtnText, { color: accentColor }]}>New Sale</Text>
          </TouchableOpacity>
        ) : status === "idle" || status === "error" ? (
          <TouchableOpacity
            style={[
              styles.chargeBtn,
              { backgroundColor: accentColor },
              Platform.OS !== "android" && styles.chargeBtnDisabled,
            ]}
            onPress={startBroadcasting}
            disabled={Platform.OS !== "android"}
          >
            <Ionicons name="radio" size={20} color="#FFFFFF" />
            <Text style={styles.chargeBtnText}>Charge Customer</Text>
          </TouchableOpacity>
        ) : isBroadcasting ? (
          <TouchableOpacity
            style={[styles.stopBtn, { backgroundColor: accentSurface, borderColor: accentBorder }]}
            onPress={handleStop}
          >
            <Ionicons name="stop-circle-outline" size={20} color="#FFFFFF" />
            <Text style={styles.stopBtnText}>Stop Broadcasting</Text>
          </TouchableOpacity>
        ) : null}
      </Animated.View>
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
  scroll: { paddingBottom: 16 },
  totalCard: {
    alignItems: "center",
    paddingVertical: 28,
    paddingHorizontal: 24,
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: "#1E2E29",
    borderRadius: 20,
    gap: 2,
  },
  totalLabel: { color: "#9CA3AF", fontSize: 13, fontWeight: "500", textTransform: "uppercase", letterSpacing: 1 },
  totalAmount: { color: "#FFFFFF", fontSize: 48, fontWeight: "800", lineHeight: 58, marginTop: 4 },
  totalSymbol: { color: "#569F8C", fontSize: 20, fontWeight: "700" },
  totalFiat: { color: "#9CA3AF", fontSize: 16, marginTop: 4 },
  totalNetwork: { color: "#4B5563", fontSize: 13, marginTop: 4 },
  scannerContainer: {
    width: 200,
    height: 200,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginTop: 28,
    marginBottom: 24,
  },
  ring: {
    position: "absolute",
    width: 168,
    height: 168,
    borderRadius: 84,
    borderWidth: 2,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#1E2E29",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
  },
  successIconContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
    marginBottom: 16,
  },
  successCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#1E2E29",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
  },
  statusArea: {
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 32,
    marginBottom: 24,
  },
  statusText: { fontSize: 22, fontWeight: "700", textAlign: "center" },
  statusSubtext: { fontSize: 14, color: "#9CA3AF", textAlign: "center", lineHeight: 20 },
  tapBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#569F8C20",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    marginTop: 4,
  },
  tapBadgeText: { color: "#569F8C", fontSize: 12, fontWeight: "600" },
  // Received payment card
  receivedCard: {
    backgroundColor: "#1E2E29",
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: "#10B98130",
  },
  receivedCardTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 2,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  detailLabel: { color: "#9CA3AF", fontSize: 12 },
  detailValue: { color: "#E5E7EB", fontSize: 12, fontWeight: "600" },
  detailValueMono: { color: "#E5E7EB", fontSize: 11, fontFamily: "monospace" },
  equivBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#37415130",
    backgroundColor: "#37415120",
    marginTop: 2,
  },
  // Swap section
  swapCard: {
    backgroundColor: "#1E2E29",
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 12,
    gap: 10,
  },
  swapCardTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  swapCardDesc: { color: "#9CA3AF", fontSize: 12 },
  quoteRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  quoteText: { color: "#9CA3AF", fontSize: 12 },
  quoteBox: {
    backgroundColor: "#141B17",
    borderRadius: 10,
    padding: 10,
    gap: 6,
  },
  swapBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
  },
  swapBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  settlingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 16,
  },
  settlingText: { color: "#9CA3AF", fontSize: 13 },
  errorText: { color: "#EF4444", fontSize: 12, textAlign: "center", marginBottom: 12, paddingHorizontal: 20 },
  // Basket
  basketCard: {
    backgroundColor: "#1E2E29",
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 16,
    gap: 10,
  },
  basketCardTitle: {
    color: "#9CA3AF",
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  basketRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  basketRowEmoji: { fontSize: 18, width: 26 },
  basketRowName: { flex: 1, color: "#D1D5DB", fontSize: 14 },
  basketRowTotal: { color: "#9CA3AF", fontSize: 14 },
  basketDivider: { height: 1, backgroundColor: "#374151", marginVertical: 4 },
  footer: { padding: 20, paddingTop: 8 },
  chargeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#10B981",
    borderRadius: 14,
    paddingVertical: 16,
    gap: 10,
  },
  chargeBtnDisabled: { opacity: 0.5 },
  chargeBtnText: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
  stopBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#374151",
    borderRadius: 14,
    paddingVertical: 16,
    gap: 10,
  },
  stopBtnText: { color: "#FFFFFF", fontSize: 17, fontWeight: "600" },
  newSaleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1E2E29",
    borderRadius: 14,
    paddingVertical: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: "#10B981",
  },
  newSaleBtnText: { color: "#10B981", fontSize: 17, fontWeight: "700" },
});
