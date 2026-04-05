/**
 * Zap Pay Receive Screen
 * Uses HCE (Host Card Emulation) to broadcast a payment request as NFC tag.
 * Another device running Zap Pay can tap this phone to pay the requested amount.
 *
 * After broadcast starts, listens for incoming on-chain transfers (ERC-20 + native
 * balance polling) to verify payment arrived. If the sender paid in a different
 * currency, offers an optional swap to the requested asset.
 */

import { getChainName, useNfc } from "@/app/nfc/context";
import { EthersClient } from "@/app/profiles/client";
import {
  NetworkSelector,
  SOLANA_NETWORKS,
  getNetworkMeta,
} from "@/components/ui/NetworkSelector";
import { TokenInfo } from "@/config/tokens";
import { NATIVE_TOKEN_ADDRESS } from "@/config/uniswap";
import { ApiProvider } from "@/crypto/provider/api";
import { useErc20Listener } from "@/hooks/use-erc20-listener";
import { useTokenPrice } from "@/hooks/use-prices";
import { useSwapExecution } from "@/hooks/use-swap-execution";
import { useUniswapQuote } from "@/hooks/use-uniswap-quote";
import { PriceService } from "@/services/price";
import { BalanceService } from "@/services/wallet";
import { tintedBackground, useAccentColor } from "@/store/appearance";
import { useSelectedCurrency } from "@/store/currency";
import { useProviderStore } from "@/store/provider";
import { useTokenStore } from "@/store/tokens";
import {
  getDynamicChainKey,
  getSolanaChainKey,
  useSelectedAccount,
  useWalletStore,
} from "@/store/wallet";
import { Ionicons } from "@expo/vector-icons";
import { formatUnits } from "ethers";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
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

// HCE is Android-only — guard the require so iOS doesn't crash at bundle time
let HCESession: any = null;
let NFCTagType4: any = null;
let NFCTagType4NDEFContentType: any = null;
try {
  if (Platform.OS === "android") {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const hce = require("react-native-hce");
    HCESession = hce.HCESession;
    NFCTagType4 = hce.NFCTagType4;
    NFCTagType4NDEFContentType = hce.NFCTagType4NDEFContentType;
    console.log("[ZapPayReceive] react-native-hce loaded OK");
  }
} catch (e) {
  console.warn("[ZapPayReceive] react-native-hce not available:", e);
}

type BroadcastStatus =
  | "idle"
  | "broadcasting"
  | "tapped"
  | "received"
  | "settling"
  | "settled"
  | "error";

type SelectedAsset =
  | { type: "native" }
  | { type: "token"; token: TokenInfo };

interface ReceivedPayment {
  type: "native" | "token";
  amount: string;
  symbol: string;
  tokenAddress?: string;
  decimals?: number;
  from?: string;
  txHash?: string;
}

const DEFAULT_TOLERANCE = 0.05;

const contactless = require("@/assets/images/contactless.png");

export default function ZapPayReceiveScreen() {
  const accentColor = useAccentColor();
  const bg = tintedBackground("#000000");
  const router = useRouter();
  const selectedAccount = useSelectedAccount();
  const selectedChainId = useWalletStore((s) => s.selectedChainId);
  const setSelectedChainId = useWalletStore((s) => s.setSelectedChainId);
  const getTokensForChain = useTokenStore((s) => s.getTokensForChain);
  const selectedApiNetworkId = useProviderStore((s) => s.selectedApiNetworkId);
  const isSolanaAccount = selectedAccount?.accountType === "solana" || selectedAccount?.accountType === "dynamic";
  const isDynamicAccount = selectedAccount?.accountType === "dynamic";
  const solanaNetworkName = isDynamicAccount
    ? "Solana Devnet"
    : (SOLANA_NETWORKS.find((n) => n.networkId === (selectedApiNetworkId ?? "dynamic-mainnet"))
        ?.displayName ?? "Solana");
  const networkConfig = EthersClient.getNetworkConfig(selectedChainId);
  const effectiveChainId = isSolanaAccount
    ? (isDynamicAccount
        ? getDynamicChainKey("sol-devnet")
        : getSolanaChainKey(selectedApiNetworkId ?? "dynamic-mainnet"))
    : selectedChainId;
  const payloadNetwork = isSolanaAccount ? "solana" : "ethereum";
  const nativeSymbol = isSolanaAccount
    ? "SOL"
    : (networkConfig?.nativeCurrency.symbol ?? "ETH");

  const [status, setStatus] = useState<BroadcastStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [tapCount, setTapCount] = useState(0);
  const [showChainPicker, setShowChainPicker] = useState(false);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<SelectedAsset>({ type: "native" });
  const [amount, setAmount] = useState("");
  const [amountError, setAmountError] = useState<string | null>(null);
  const currency = useSelectedCurrency();

  const availableTokens = useMemo(() => {
    if (isSolanaAccount) {
      return getTokensForChain(effectiveChainId);
    }
    return getTokensForChain(selectedChainId);
  }, [isSolanaAccount, getTokensForChain, selectedChainId, effectiveChainId]);

  const symbol = selectedAsset.type === "native" ? nativeSymbol : selectedAsset.token.symbol;
  const requestedTokenAddress = selectedAsset.type === "token" ? selectedAsset.token.address : undefined;
  const { price: unitPrice } = useTokenPrice(symbol, requestedTokenAddress, effectiveChainId);

  const fiatAmount = useMemo(() => {
    const num = parseFloat(amount || "0");
    if (!Number.isFinite(num) || !unitPrice) return null;
    return PriceService.formatValue(num * unitPrice, currency);
  }, [amount, unitPrice, currency]);

  const { stopListening, startListening } = useNfc();

  const sessionRef = useRef<any>(null);
  const cleanupListenersRef = useRef<(() => void) | null>(null);

  // ---------------------------------------------------------------------------
  // Payment detection
  // ---------------------------------------------------------------------------
  const [receivedPayment, setReceivedPayment] = useState<ReceivedPayment | null>(null);
  const [equivalenceStatus, setEquivalenceStatus] = useState<"checking" | "sufficient" | "insufficient" | null>(null);
  const [receivedFiatValue, setReceivedFiatValue] = useState<string | null>(null);
  const [requestedFiatValue, setRequestedFiatValue] = useState<string | null>(null);
  const initialBalanceRef = useRef<bigint>(0n);
  const balancePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ERC20 listener — active when broadcasting or tapped (EVM only)
  const isListeningForPayments = !isSolanaAccount && (status === "broadcasting" || status === "tapped");
  const {
    transfer: erc20Transfer,
    reset: resetErc20Listener,
  } = useErc20Listener(
    selectedAccount?.address,
    selectedChainId,
    isListeningForPayments,
  );

  // Swap: received token → requested asset
  const swapTokenIn = receivedPayment?.type === "token" ? receivedPayment.tokenAddress ?? "" : NATIVE_TOKEN_ADDRESS;
  const swapTokenInDecimals = receivedPayment?.type === "token" ? (receivedPayment.decimals ?? 18) : (networkConfig?.nativeCurrency.decimals ?? 18);
  const swapTokenOut = selectedAsset.type === "token" ? selectedAsset.token.address : NATIVE_TOKEN_ADDRESS;
  const swapTokenOutDecimals = selectedAsset.type === "token" ? selectedAsset.token.decimals : (networkConfig?.nativeCurrency.decimals ?? 18);

  const needsSwap = receivedPayment != null && !(
    (receivedPayment.type === "native" && selectedAsset.type === "native") ||
    (receivedPayment.type === "token" && selectedAsset.type === "token" &&
      receivedPayment.tokenAddress?.toLowerCase() === selectedAsset.token.address.toLowerCase())
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

  // Disable NFC reading while broadcasting
  useFocusEffect(
    useCallback(() => {
      console.log("[ZapPayReceive] Screen focused — stopping NFC reader");
      stopListening();
      return () => {
        console.log("[ZapPayReceive] Screen unfocused — resuming NFC reader");
        startListening();
      };
    }, []),
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopBroadcasting();
      stopBalancePolling();
      stopSolanaBalancePolling();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // ERC20 transfer detection
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (erc20Transfer && isListeningForPayments) {
      console.log("[ZapPayReceive] ERC20 transfer detected:", erc20Transfer.symbol, erc20Transfer.formatted);
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
  // Native balance polling (EVM)
  // ---------------------------------------------------------------------------
  const startBalancePolling = useCallback(async () => {
    if (!selectedAccount || isSolanaAccount) return;
    try {
      initialBalanceRef.current = await EthersClient.getNativeBalance(
        selectedAccount.address,
        selectedChainId,
      );
      console.log("[ZapPayReceive] Initial native balance:", formatUnits(initialBalanceRef.current, 18));
    } catch (e) {
      console.warn("[ZapPayReceive] Failed to get initial balance:", e);
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
          console.log("[ZapPayReceive] Native balance increase:", formatted, nativeSymbol);
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
  }, [selectedAccount, selectedChainId, isSolanaAccount, nativeSymbol, networkConfig]);

  // ---------------------------------------------------------------------------
  // Solana balance polling (native SOL + SPL tokens)
  // ---------------------------------------------------------------------------
  const initialSolBalanceRef = useRef<string>("0");
  const solanaPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startSolanaBalancePolling = useCallback(async () => {
    if (!selectedAccount || !isSolanaAccount) return;
    const networkId = selectedApiNetworkId ?? "dynamic-mainnet";
    const apiBaseUrl = useProviderStore.getState().getApiBaseUrl();
    if (!apiBaseUrl) return;

    const provider = new ApiProvider(apiBaseUrl);
    const isToken = selectedAsset.type === "token";
    const tokenRef = isToken ? selectedAsset.token.address : undefined;

    try {
      if (isToken && tokenRef) {
        const bal = await provider.getTokenBalance(selectedAccount.address, networkId, tokenRef);
        initialSolBalanceRef.current = bal.amount;
        console.log("[ZapPayReceive] Initial Solana token balance:", bal.amount, bal.symbol);
      } else {
        const bal = await provider.getNativeBalance(selectedAccount.address, networkId);
        initialSolBalanceRef.current = bal.amount;
        console.log("[ZapPayReceive] Initial SOL balance:", bal.amount);
      }
    } catch (e) {
      console.warn("[ZapPayReceive] Failed to get initial Solana balance:", e);
    }

    solanaPollRef.current = setInterval(async () => {
      try {
        let currentAmount: string;
        let currentSymbol: string;
        let currentDecimals: number;

        if (isToken && tokenRef) {
          const bal = await provider.getTokenBalance(selectedAccount.address, networkId, tokenRef);
          currentAmount = bal.amount;
          currentSymbol = bal.symbol;
          currentDecimals = bal.decimals;
        } else {
          const bal = await provider.getNativeBalance(selectedAccount.address, networkId);
          currentAmount = bal.amount;
          currentSymbol = bal.symbol;
          currentDecimals = bal.decimals;
        }

        const initial = parseFloat(initialSolBalanceRef.current);
        const current = parseFloat(currentAmount);
        if (current > initial) {
          const increase = current - initial;
          // Use enough decimal places for the asset
          const formatted = increase.toFixed(Math.min(currentDecimals, 9));
          console.log("[ZapPayReceive] Solana balance increase:", formatted, currentSymbol);
          setReceivedPayment({
            type: isToken ? "token" : "native",
            amount: formatted,
            symbol: currentSymbol,
            tokenAddress: tokenRef,
            decimals: currentDecimals,
          });
          setStatus("received");
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Vibration.vibrate([0, 50, 50, 50]);
          stopSolanaBalancePolling();
        }
      } catch {
        // Transient API error — keep polling
      }
    }, 1000);
  }, [selectedAccount, isSolanaAccount, selectedApiNetworkId, selectedAsset]);

  const stopSolanaBalancePolling = useCallback(() => {
    if (solanaPollRef.current) {
      clearInterval(solanaPollRef.current);
      solanaPollRef.current = null;
    }
  }, []);

  const stopBalancePolling = useCallback(() => {
    if (balancePollRef.current) {
      clearInterval(balancePollRef.current);
      balancePollRef.current = null;
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Equivalence check
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (status !== "received" || !receivedPayment) return;

    const check = async () => {
      setEquivalenceStatus("checking");
      const requestedAmount = parseFloat(amount);
      const receivedAmount = parseFloat(receivedPayment.amount);

      // Same currency?
      const isSameCurrency =
        (receivedPayment.type === "native" && selectedAsset.type === "native") ||
        (receivedPayment.type === "token" && selectedAsset.type === "token" &&
          receivedPayment.tokenAddress?.toLowerCase() === selectedAsset.token.address.toLowerCase());

      if (isSameCurrency) {
        const sufficient = receivedAmount >= requestedAmount * (1 - DEFAULT_TOLERANCE);
        setEquivalenceStatus(sufficient ? "sufficient" : "insufficient");
        try {
          const price = selectedAsset.type === "native"
            ? await PriceService.getNativePrice(selectedChainId, "usd")
            : await PriceService.getPriceBySymbol(symbol, "usd");
          if (price) {
            setReceivedFiatValue(`$${(receivedAmount * price).toFixed(2)}`);
            setRequestedFiatValue(`$${(requestedAmount * price).toFixed(2)}`);
          }
        } catch {}
        return;
      }

      // Different currency — compare via USD prices
      try {
        const requestedPrice = selectedAsset.type === "native"
          ? await PriceService.getNativePrice(selectedChainId, "usd")
          : await PriceService.getPriceBySymbol(symbol, "usd");

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
          setEquivalenceStatus("sufficient");
        }
      } catch {
        setEquivalenceStatus("sufficient");
      }
    };

    check();
  }, [status, receivedPayment, amount, selectedAsset, selectedChainId, symbol]);

  // Swap done
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
    console.log("[ZapPayReceive] stopBroadcasting called");
    try {
      cleanupListenersRef.current?.();
      cleanupListenersRef.current = null;
      if (sessionRef.current) {
        await sessionRef.current.setEnabled(false);
        console.log("[ZapPayReceive] HCE session disabled");
      }
      sessionRef.current = null;
    } catch (e) {
      console.warn("[ZapPayReceive] Error stopping HCE session:", e);
    }
  };

  const validateAmount = (value: string): boolean => {
    if (!value.trim()) {
      setAmountError("Amount is required");
      return false;
    }
    const num = parseFloat(value);
    if (isNaN(num) || num <= 0) {
      setAmountError("Enter a valid amount greater than 0");
      return false;
    }
    setAmountError(null);
    return true;
  };

  const startBroadcasting = async () => {
    if (!selectedAccount) return;
    if (!validateAmount(amount)) return;

    if (Platform.OS !== "android") {
      setErrorMessage("Zap Pay NFC broadcasting is only supported on Android.");
      setStatus("error");
      return;
    }

    if (!HCESession || !NFCTagType4 || !NFCTagType4NDEFContentType) {
      const msg = "react-native-hce native module not found. Run: expo prebuild && expo run:android";
      console.error("[ZapPayReceive]", msg);
      setErrorMessage(msg);
      setStatus("error");
      return;
    }

    try {
      const payload = JSON.stringify({
        chainId: effectiveChainId,
        address: selectedAccount.address,
        network: payloadNetwork,
        type: "zap-pay",
        amount: parseFloat(amount).toString(),
        assetType: selectedAsset.type,
        tokenAddress: selectedAsset.type === "token" ? selectedAsset.token.address : undefined,
        tokenSymbol: symbol,
        tokenDecimals: selectedAsset.type === "token" ? selectedAsset.token.decimals : undefined,
      });

      console.log("[ZapPayReceive] Starting HCE — amount:", amount, symbol);
      console.log("[ZapPayReceive] Payload:", payload);

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
          console.log("[ZapPayReceive] HCE_STATE_READ — tag was read by sender");
          setTapCount((c) => c + 1);
          setStatus("tapped");
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Vibration.vibrate(50);
          // Stay in tapped state until payment detected (don't revert to broadcasting)
        },
      );

      const cleanupWrite = session.on(
        HCESession.Events.HCE_STATE_WRITE,
        () => {
          console.log("[ZapPayReceive] HCE_STATE_WRITE — sender wrote back");
        },
      );

      cleanupListenersRef.current = () => {
        cleanupRead();
        cleanupWrite();
      };

      await session.setEnabled(true);
      console.log("[ZapPayReceive] HCE ENABLED — broadcasting");
      setStatus("broadcasting");
      setErrorMessage(null);

      // Start listening for on-chain payments
      if (isSolanaAccount) {
        startSolanaBalancePolling();
      } else {
        startBalancePolling();
      }
    } catch (err: any) {
      console.error("[ZapPayReceive] Failed to start HCE:", err);
      setErrorMessage(err?.message ?? "Failed to start NFC broadcasting.");
      setStatus("error");
    }
  };

  const handleStop = async () => {
    await stopBroadcasting();
    stopBalancePolling();
    stopSolanaBalancePolling();
    setStatus("idle");
    setTapCount(0);
    setReceivedPayment(null);
    setEquivalenceStatus(null);
    resetErc20Listener();
    resetSwap();
  };

  const handleStart = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    startBroadcasting();
  };

  const handleDone = async () => {
    await stopBroadcasting();
    stopBalancePolling();
    stopSolanaBalancePolling();
    router.back();
  };

  const handleSwap = () => {
    if (!swapQuote || !selectedAccount) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStatus("settling");
    executeSwap(swapQuote, selectedAccount.address);
  };

  const formatAddress = (addr: string) =>
    `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const isBroadcasting = status === "broadcasting" || status === "tapped";
  const isPaymentDone = status === "received" || status === "settling" || status === "settled";
  const isSwapping = ["checking-approval", "approving", "signing-permit", "building-swap", "swapping"].includes(swapStep);

  // ---------------------------------------------------------------------------
  // Status helpers
  // ---------------------------------------------------------------------------
  const getStatusColor = () => {
    switch (status) {
      case "broadcasting": return "#10B981";
      case "tapped": return accentColor;
      case "received":
        return equivalenceStatus === "sufficient" ? "#10B981" :
               equivalenceStatus === "insufficient" ? "#F59E0B" : accentColor;
      case "settling": return accentColor;
      case "settled": return "#10B981";
      case "error": return "#EF4444";
      default: return "#6B7280";
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
      case "broadcasting": return "Broadcasting...";
      case "tapped": return "Tap detected!";
      case "received":
        if (equivalenceStatus === "checking") return "Verifying amount...";
        if (equivalenceStatus === "sufficient") return "Payment received!";
        if (equivalenceStatus === "insufficient") return "Amount may be low";
        return "Payment received";
      case "settling": return `Swapping to ${symbol}...`;
      case "settled": return "Payment settled!";
      case "error": return "Error";
      default: return "Ready to receive";
    }
  };

  const getStatusSubtext = () => {
    switch (status) {
      case "broadcasting": return `Waiting for a tap — requesting ${amount} ${symbol}`;
      case "tapped": return "Waiting for transaction...";
      case "received":
        if (receivedPayment) {
          const recv = `${parseFloat(parseFloat(receivedPayment.amount).toFixed(6))} ${receivedPayment.symbol}`;
          if (equivalenceStatus === "sufficient") {
            return receivedPayment.type === "native" && selectedAsset.type === "native"
              ? `Received ${recv} — exact match`
              : `Received ${recv}${receivedFiatValue ? ` (${receivedFiatValue})` : ""}`;
          }
          if (equivalenceStatus === "insufficient") {
            return `Received ${recv} — expected ≈ ${amount} ${symbol}`;
          }
          return `Received ${recv}`;
        }
        return "Verifying...";
      case "settling": return `Converting ${receivedPayment?.symbol ?? "?"} → ${symbol}`;
      case "settled": return swapTxHash ? `Settled in ${symbol}` : "Payment complete";
      case "error": return errorMessage ?? "Something went wrong";
      default: return `Enter the ${symbol} amount you want to request, then tap Start`;
    }
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
    <LinearGradient
      colors={
        isBroadcasting
          ? [accentColor, "#000000"]
          : [bg, bg]
      }
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={[styles.container, { backgroundColor: !isBroadcasting ? bg : undefined }]}
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} disabled={status === "settling"}>
            <Ionicons name="arrow-back" size={24} color={status === "settling" ? "#374151" : "#FFFFFF"} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Zap Pay</Text>
          <View style={{ width: 24 }} />
        </View>

      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Network & asset selectors — only when idle */}
          {!isBroadcasting && !isPaymentDone && (
            <>
              <Animated.View entering={FadeIn.delay(100)}>
                <TouchableOpacity
                  style={styles.chainSelector}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setShowChainPicker(true);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.chainSelectorLeft}>
                    <Text style={styles.chainSelectorIcon}>
                      {isSolanaAccount ? "☀️" : getNetworkMeta(selectedChainId).icon}
                    </Text>
                    <View>
                      <Text style={styles.chainSelectorLabel}>Network</Text>
                      <Text style={styles.chainSelectorName}>
                        {isSolanaAccount
                          ? solanaNetworkName
                          : (networkConfig?.name ?? getChainName(selectedChainId))}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.chainSelectorRight}>
                    <Text style={styles.chainSelectorCurrency}>{symbol}</Text>
                    <Ionicons name="chevron-down" size={18} color="#6B7280" />
                  </View>
                </TouchableOpacity>
              </Animated.View>

              <Animated.View entering={FadeIn.delay(120)}>
                <TouchableOpacity
                  style={styles.chainSelector}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setShowAssetPicker(true);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.chainSelectorLeft}>
                    <View style={styles.assetDot}>
                      <Text style={styles.assetDotText}>{symbol.slice(0, 2)}</Text>
                    </View>
                    <View>
                      <Text style={styles.chainSelectorLabel}>Asset</Text>
                      <Text style={styles.chainSelectorName}>
                        {selectedAsset.type === "native" ? `${symbol} (Native)` : selectedAsset.token.name}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.chainSelectorRight}>
                    <Text style={styles.chainSelectorCurrency}>{symbol}</Text>
                    <Ionicons name="chevron-down" size={18} color="#6B7280" />
                  </View>
                </TouchableOpacity>
              </Animated.View>
            </>
          )}

          {/* Broadcast indicator */}
          {!isPaymentDone && (
            <View style={{ height: 120 }} />
          )}

          {/* Success icon for received/settled */}
          {isPaymentDone && (
            <Animated.View entering={FadeIn.duration(250)} style={styles.successArea}>
              <View style={[styles.successCircle, { borderColor: getStatusColor() }]}>
                <Ionicons name={getStatusIcon()} size={56} color={getStatusColor()} />
              </View>
            </Animated.View>
          )}

          {/* Status text */}
          <Animated.View entering={FadeInDown.delay(150)} style={styles.statusArea}>
            <Image source={contactless} />
            <Text style={[styles.statusText, { color: getStatusColor() }]}>
              {getStatusMessage()}
            </Text>
            <Text style={styles.statusSubtext}>{getStatusSubtext()}</Text>

            {tapCount > 0 && isBroadcasting && (
              <View style={[styles.tapBadge, { backgroundColor: accentColor + "20" }]}>
                <Ionicons name="radio" size={14} color={accentColor} />
                <Text style={[styles.tapBadgeText, { color: accentColor }]}>
                  {tapCount} tap{tapCount !== 1 ? "s" : ""} received
                </Text>
              </View>
            )}
          </Animated.View>

          {/* Received payment details */}
          {receivedPayment && isPaymentDone && (
            <Animated.View entering={FadeInDown.delay(100)} style={styles.receivedCard}>
              <Text style={styles.receivedTitle}>Payment Details</Text>

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
                  {amount} {symbol} {requestedFiatValue ? `(${requestedFiatValue})` : ""}
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

          {/* Swap section */}
          {needsSwap && status === "received" && equivalenceStatus === "sufficient" && receivedPayment && (
            <Animated.View entering={FadeInDown.delay(200)} style={styles.swapCard}>
              <Text style={styles.swapTitle}>Convert to {symbol}</Text>
              <Text style={styles.swapDesc}>
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
                onPress={handleSwap}
                disabled={!swapQuote || isSwapping}
              >
                <Ionicons name="swap-horizontal" size={18} color="#FFF" />
                <Text style={styles.swapBtnText}>
                  {isSwapping ? `${swapStep}...` : `Swap to ${symbol}`}
                </Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {status === "settling" && (
            <View style={styles.settlingRow}>
              <ActivityIndicator size="small" color={accentColor} />
              <Text style={styles.settlingText}>{swapStep}...</Text>
            </View>
          )}

          {swapError && <Text style={styles.errorText}>{swapError}</Text>}

          {/* Amount input — only when idle */}
          {!isBroadcasting && !isPaymentDone && (
            <Animated.View entering={FadeInDown.delay(200)} style={styles.amountCard}>
              <Text style={styles.amountLabel}>Amount to request ({symbol})</Text>
              <View style={[styles.amountInputRow, amountError ? styles.amountInputRowError : null]}>
                <Text style={styles.amountSymbol}>{symbol}</Text>
                <TextInput
                  style={styles.amountInput}
                  value={amount}
                  onChangeText={(v) => {
                    setAmount(v);
                    if (amountError) validateAmount(v);
                  }}
                  onBlur={() => validateAmount(amount)}
                  placeholder="0.00"
                  placeholderTextColor="#4B5563"
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                />
              </View>
              {amountError ? (
                <Text style={styles.amountErrorText}>{amountError}</Text>
              ) : fiatAmount ? (
                <Text style={styles.amountFiatEquiv}>≈ {fiatAmount}</Text>
              ) : null}
            </Animated.View>
          )}

          {/* Wallet info card */}
          {!isPaymentDone && (
            <Animated.View entering={FadeInDown.delay(250)} style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Ionicons name="wallet-outline" size={16} color="#9CA3AF" />
                <Text style={styles.infoLabel}>Receiving address</Text>
              </View>
              <Text style={styles.infoAddress}>
                {formatAddress(selectedAccount.address)}
              </Text>
              <Text style={styles.infoNetwork}>
                on {isSolanaAccount ? solanaNetworkName : (networkConfig?.name ?? "Ethereum")}
              </Text>

              {Platform.OS !== "android" && (
                <View style={styles.warningRow}>
                  <Ionicons name="warning-outline" size={14} color="#F59E0B" />
                  <Text style={styles.warningText}>
                    NFC broadcasting requires Android
                  </Text>
                </View>
              )}
            </Animated.View>
          )}
        </ScrollView>

        {/* Action button */}
        <Animated.View entering={FadeInDown.delay(300)} style={styles.footer}>
          {isPaymentDone && (status === "received" || status === "settled") ? (
            <TouchableOpacity style={styles.primaryButton} onPress={handleDone}>
              <Ionicons name="checkmark" size={20} color="#FFFFFF" />
              <Text style={styles.primaryButtonText}>Done</Text>
            </TouchableOpacity>
          ) : !isBroadcasting && !isPaymentDone ? (
            <TouchableOpacity
              style={[
                styles.primaryButton,
                (Platform.OS !== "android" || !amount.trim()) && styles.primaryButtonDisabled,
              ]}
              onPress={handleStart}
              disabled={Platform.OS !== "android"}
            >
              <Ionicons name="radio" size={20} color="#FFFFFF" />
              <Text style={styles.primaryButtonText}>Start Broadcasting</Text>
            </TouchableOpacity>
          ) : isBroadcasting ? (
            <TouchableOpacity style={styles.stopButton} onPress={handleStop}>
              <Ionicons name="stop-circle-outline" size={20} color="#FFFFFF" />
              <Text style={styles.stopButtonText}>Stop Broadcasting</Text>
            </TouchableOpacity>
          ) : null}
        </Animated.View>
      </KeyboardAvoidingView>

      <NetworkSelector
        visible={showChainPicker}
        selectedChainId={selectedChainId}
        onSelect={(chainId) => {
          setSelectedChainId(chainId);
          setSelectedAsset({ type: "native" });
        }}
        onClose={() => setShowChainPicker(false)}
      />

      <Modal
        visible={showAssetPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAssetPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Asset</Text>
              <TouchableOpacity onPress={() => setShowAssetPicker(false)}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <FlatList
              data={[
                { type: "native" as const, symbol: nativeSymbol, name: `${nativeSymbol} (Native)` },
                ...availableTokens.map((token) => ({
                  type: "token" as const,
                  token,
                  symbol: token.symbol,
                  name: token.name,
                })),
              ]}
              keyExtractor={(item) =>
                item.type === "native" ? "native" : item.token.address.toLowerCase()
              }
              renderItem={({ item }) => {
                const isSelected =
                  (item.type === "native" && selectedAsset.type === "native") ||
                  (item.type === "token" &&
                    selectedAsset.type === "token" &&
                    selectedAsset.token.address.toLowerCase() === item.token.address.toLowerCase());

                return (
                  <TouchableOpacity
                    style={[styles.assetItem, isSelected && styles.assetItemSelected]}
                    onPress={() => {
                      setSelectedAsset(item.type === "native" ? { type: "native" } : { type: "token", token: item.token });
                      setShowAssetPicker(false);
                    }}
                  >
                    <View style={styles.assetItemIcon}>
                      <Text style={styles.assetItemIconText}>{item.symbol.slice(0, 2)}</Text>
                    </View>
                    <View style={styles.assetItemInfo}>
                      <Text style={styles.assetItemSymbol}>{item.symbol}</Text>
                      <Text style={styles.assetItemName}>{item.name}</Text>
                    </View>
                    {isSelected && <Ionicons name="checkmark-circle" size={20} color="#10B981" />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F1512" },
  flex: { flex: 1 },
  scrollContent: { paddingBottom: 16 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1E2E29",
  },
  headerTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "600" },
  chainSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#1E2E29",
    marginHorizontal: 24,
    marginTop: 16,
    borderRadius: 14,
  },
  chainSelectorLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  chainSelectorIcon: { fontSize: 18 },
  chainSelectorLabel: {
    color: "#9CA3AF",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  chainSelectorName: { fontSize: 14, color: "#FFFFFF", fontWeight: "600" },
  chainSelectorRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  chainSelectorCurrency: { color: "#D1D5DB", fontSize: 13, fontWeight: "600" },
  assetDot: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: "#111827",
    alignItems: "center", justifyContent: "center",
  },
  assetDotText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
  scannerContainer: {
    width: 220, height: 220,
    alignItems: "center", justifyContent: "center",
    alignSelf: "center",
    marginTop: 24, marginBottom: 32,
  },
  ring: {
    position: "absolute",
    width: 180, height: 180,
    borderRadius: 90, borderWidth: 2,
  },
  iconContainer: {
    width: 130, height: 130, borderRadius: 65,
    backgroundColor: "#1E2E29",
    alignItems: "center", justifyContent: "center",
    borderWidth: 3,
  },
  successArea: {
    alignItems: "center", justifyContent: "center",
    marginTop: 24, marginBottom: 16,
  },
  successCircle: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: "#1E2E29",
    alignItems: "center", justifyContent: "center",
    borderWidth: 3,
  },
  statusArea: {
    alignItems: "center", gap: 10,
    paddingHorizontal: 32, marginBottom: 24,
  },
  statusText: { fontSize: 22, fontWeight: "700", textAlign: "center" },
  statusSubtext: { fontSize: 15, color: "#9CA3AF", textAlign: "center", lineHeight: 22 },
  tapBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#569F8C20",
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 12, marginTop: 4,
  },
  tapBadgeText: { color: "#569F8C", fontSize: 13, fontWeight: "600" },
  // Received payment card
  receivedCard: {
    backgroundColor: "#1E2E29", borderRadius: 16,
    padding: 16, marginHorizontal: 24, marginBottom: 12,
    gap: 10, borderWidth: 1, borderColor: "#10B98130",
  },
  receivedTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "700", marginBottom: 2 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  detailLabel: { color: "#9CA3AF", fontSize: 12 },
  detailValue: { color: "#E5E7EB", fontSize: 12, fontWeight: "600" },
  detailValueMono: { color: "#E5E7EB", fontSize: 11, fontFamily: "monospace" },
  equivBadge: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12,
    borderWidth: 1, borderColor: "#37415130", backgroundColor: "#37415120",
    marginTop: 2,
  },
  // Swap section
  swapCard: {
    backgroundColor: "#1E2E29", borderRadius: 16,
    padding: 16, marginHorizontal: 24, marginBottom: 12, gap: 10,
  },
  swapTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  swapDesc: { color: "#9CA3AF", fontSize: 12 },
  quoteRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  quoteText: { color: "#9CA3AF", fontSize: 12 },
  quoteBox: {
    backgroundColor: "#141B17", borderRadius: 10, padding: 10, gap: 6,
  },
  swapBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    borderRadius: 12, paddingVertical: 14, gap: 8,
  },
  swapBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  settlingRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, marginBottom: 16,
  },
  settlingText: { color: "#9CA3AF", fontSize: 13 },
  errorText: { color: "#EF4444", fontSize: 12, textAlign: "center", marginBottom: 12, paddingHorizontal: 24 },
  // Amount input
  amountCard: {
    backgroundColor: "#1E2E29", borderRadius: 16,
    padding: 16, marginHorizontal: 24, marginBottom: 16, gap: 10,
  },
  amountLabel: {
    color: "#9CA3AF", fontSize: 12, fontWeight: "500",
    textTransform: "uppercase", letterSpacing: 0.5,
  },
  amountInputRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#0F1512", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 4,
    borderWidth: 1, borderColor: "#374151", gap: 8,
  },
  amountInputRowError: { borderColor: "#EF4444" },
  amountSymbol: { color: "#9CA3AF", fontSize: 16, fontWeight: "600", minWidth: 40 },
  amountInput: {
    flex: 1, color: "#FFFFFF", fontSize: 24, fontWeight: "700", paddingVertical: 12,
  },
  amountErrorText: { color: "#EF4444", fontSize: 13, marginTop: -4 },
  amountFiatEquiv: { color: "#9CA3AF", fontSize: 13, marginTop: 4, textAlign: "center" },
  // Info card
  infoCard: {
    backgroundColor: "#1E2E29", borderRadius: 16,
    padding: 16, marginHorizontal: 24, marginBottom: 16, gap: 4,
  },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  infoLabel: {
    color: "#9CA3AF", fontSize: 12, fontWeight: "500",
    textTransform: "uppercase", letterSpacing: 0.5,
  },
  infoAddress: { color: "#FFFFFF", fontSize: 16, fontWeight: "600", fontFamily: "monospace" },
  infoNetwork: { color: "#6B7280", fontSize: 13 },
  warningRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#374151",
  },
  warningText: { color: "#F59E0B", fontSize: 13 },
  footer: { padding: 24, paddingTop: 8 },
  primaryButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: "#10B981", borderRadius: 14, paddingVertical: 16, gap: 10,
  },
  primaryButtonDisabled: { opacity: 0.5 },
  primaryButtonText: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
  stopButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: "#374151", borderRadius: 14, paddingVertical: 16, gap: 10,
  },
  stopButtonText: { color: "#FFFFFF", fontSize: 17, fontWeight: "600" },
  emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { color: "#6B7280", fontSize: 16 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalContent: {
    backgroundColor: "#0F1512", borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: "75%", paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: "#1E2E29",
  },
  modalTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "700" },
  assetItem: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: "#1E2E29",
  },
  assetItemSelected: { backgroundColor: "#1A2520" },
  assetItemIcon: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: "#1F2937",
    alignItems: "center", justifyContent: "center",
  },
  assetItemIconText: { color: "#FFFFFF", fontWeight: "700", fontSize: 12 },
  assetItemInfo: { flex: 1 },
  assetItemSymbol: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  assetItemName: { color: "#9CA3AF", fontSize: 13, marginTop: 2 },
});
