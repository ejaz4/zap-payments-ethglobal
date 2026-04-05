/**
 * Zap Pay Receive Screen
 * Uses HCE (Host Card Emulation) to broadcast a payment request as NFC tag.
 * Another device running Zap Pay can tap this phone to pay the requested amount.
 */

import { getChainName, useNfc } from "@/app/nfc/context";
import { EthersClient } from "@/app/profiles/client";
import {
    NetworkSelector,
    SOLANA_NETWORKS,
    getNetworkMeta,
} from "@/components/ui/NetworkSelector";
import { TokenInfo } from "@/config/tokens";
import { useTokenPrice } from "@/hooks/use-prices";
import { PriceService } from "@/services/price";
import { tintedBackground, useAccentColor } from "@/store/appearance";
import { useSelectedCurrency } from "@/store/currency";
import { useProviderStore } from "@/store/provider";
import { useTokenStore } from "@/store/tokens";
import {
    getSolanaChainKey,
    useSelectedAccount,
    useTokenBalances,
    useWalletStore,
} from "@/store/wallet";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    FlatList,
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
  | "confirmed"
  | "error";

type SelectedAsset =
  | { type: "native" }
  | { type: "token"; token: TokenInfo };

export default function ZapPayReceiveScreen() {
  const accentColor = useAccentColor();
  const bg = tintedBackground(accentColor);
  const router = useRouter();
  const selectedAccount = useSelectedAccount();
  const selectedChainId = useWalletStore((s) => s.selectedChainId);
  const setSelectedChainId = useWalletStore((s) => s.setSelectedChainId);
  const tokenBalances = useTokenBalances();
  const getTokensForChain = useTokenStore((s) => s.getTokensForChain);
  const selectedApiNetworkId = useProviderStore((s) => s.selectedApiNetworkId);
  const isSolanaAccount = selectedAccount?.accountType === "solana";
  const solanaNetworkName =
    SOLANA_NETWORKS.find((n) => n.networkId === (selectedApiNetworkId ?? "dynamic-mainnet"))
      ?.displayName ?? "Solana";
  const networkConfig = EthersClient.getNetworkConfig(selectedChainId);
  const effectiveChainId = isSolanaAccount
    ? getSolanaChainKey(selectedApiNetworkId ?? "dynamic-mainnet")
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
      return tokenBalances.map((tb) => ({
        address: tb.address,
        chainId: tb.chainId,
        decimals: tb.decimals,
        symbol: tb.symbol,
        name: tb.name,
      })) as TokenInfo[];
    }
    return getTokensForChain(selectedChainId);
  }, [isSolanaAccount, tokenBalances, getTokensForChain, selectedChainId]);

  const symbol = selectedAsset.type === "native" ? nativeSymbol : selectedAsset.token.symbol;
  const tokenAddress = selectedAsset.type === "token" ? selectedAsset.token.address : undefined;
  const { price: unitPrice } = useTokenPrice(symbol, tokenAddress, effectiveChainId);

  const fiatAmount = useMemo(() => {
    const num = parseFloat(amount || "0");
    if (!Number.isFinite(num) || !unitPrice) return null;
    return PriceService.formatValue(num * unitPrice, currency);
  }, [amount, unitPrice, currency]);

  const { stopListening, startListening } = useNfc();

  const sessionRef = useRef<any>(null);
  const cleanupListenersRef = useRef<(() => void) | null>(null);

  // Disable NFC reading while this screen is active — HCE and NFC reading
  // fight over the NFC hardware. Stop reading on focus, resume on blur/unmount.
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

  // Animated rings
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

  // Stop HCE session on unmount
  useEffect(() => {
    return () => {
      stopBroadcasting();
    };
  }, []);

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
    if (!selectedAccount) {
      console.warn("[ZapPayReceive] No selected account");
      return;
    }

    if (!validateAmount(amount)) return;

    if (Platform.OS !== "android") {
      setErrorMessage("Zap Pay NFC broadcasting is only supported on Android.");
      setStatus("error");
      return;
    }

    if (!HCESession || !NFCTagType4 || !NFCTagType4NDEFContentType) {
      const msg =
        "react-native-hce native module not found. Run: expo prebuild && expo run:android";
      console.error("[ZapPayReceive]", msg);
      setErrorMessage(msg);
      setStatus("error");
      return;
    }

    try {
      // Build the payment payload — same JSON format the NFC reader expects,
      // extended with type and amount so the sender's transfer screen pre-fills.
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

      console.log("[ZapPayReceive] Starting HCE session...");
      console.log("[ZapPayReceive] Chain ID:", effectiveChainId);
      console.log("[ZapPayReceive] Network:", payloadNetwork);
      console.log("[ZapPayReceive] Address:", selectedAccount.address);
      console.log("[ZapPayReceive] Amount:", amount, symbol);
      if (selectedAsset.type === "token") {
        console.log("[ZapPayReceive] Token:", selectedAsset.token.symbol, selectedAsset.token.address);
      }
      console.log("[ZapPayReceive] Full payload:", payload);

      const tag = new NFCTagType4({
        type: NFCTagType4NDEFContentType.Text,
        content: payload,
        writable: true, // allow sender to write tx hash back as confirmation
      });
      console.log("[ZapPayReceive] NFCTagType4 created");

      const session = await HCESession.getInstance();
      sessionRef.current = session;
      console.log("[ZapPayReceive] HCESession instance obtained:", session);

      await session.setApplication(tag);
      console.log("[ZapPayReceive] Application set on session");

      const cleanupRead = session.on(
        HCESession.Events.HCE_STATE_READ,
        () => {
          console.log("[ZapPayReceive] HCE_STATE_READ — tag was read by sender");
          setTapCount((c) => c + 1);
          setStatus("tapped");
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Vibration.vibrate(50);
          // Return to broadcasting after brief feedback
          setTimeout(() => setStatus("broadcasting"), 2000);
        },
      );

      const cleanupWrite = session.on(
        HCESession.Events.HCE_STATE_WRITE,
        () => {
          const written = sessionRef.current?.application?.content;
          console.log(
            "[ZapPayReceive] HCE_STATE_WRITE — sender wrote back:",
            written,
          );
          setStatus("confirmed");
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Vibration.vibrate([0, 50, 50, 50]);
        },
      );

      cleanupListenersRef.current = () => {
        console.log("[ZapPayReceive] Cleaning up HCE event listeners");
        cleanupRead();
        cleanupWrite();
      };

      await session.setEnabled(true);
      console.log("[ZapPayReceive] HCE session ENABLED — broadcasting started");
      setStatus("broadcasting");
      setErrorMessage(null);
    } catch (err: any) {
      console.error("[ZapPayReceive] Failed to start HCE session:", err);
      console.error("[ZapPayReceive] Error name:", err?.name);
      console.error("[ZapPayReceive] Error message:", err?.message);
      console.error("[ZapPayReceive] Error stack:", err?.stack);
      const msg =
        err?.message ||
        "Failed to start NFC broadcasting. Ensure NFC is enabled and the app was built with expo prebuild.";
      setErrorMessage(msg);
      setStatus("error");
    }
  };

  const handleStop = async () => {
    await stopBroadcasting();
    setStatus("idle");
    setTapCount(0);
  };

  const handleStart = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    startBroadcasting();
  };

  const formatAddress = (addr: string) =>
    `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const isBroadcasting =
    status === "broadcasting" || status === "tapped" || status === "confirmed";

  const getStatusColor = () => {
    switch (status) {
      case "broadcasting":
        return "#10B981";
      case "tapped":
        return accentColor;
      case "confirmed":
        return "#10B981";
      case "error":
        return "#EF4444";
      default:
        return "#6B7280";
    }
  };

  const getStatusIcon = (): keyof typeof Ionicons.glyphMap => {
    switch (status) {
      case "broadcasting":
        return "radio-outline";
      case "tapped":
        return "phone-portrait-outline";
      case "confirmed":
        return "checkmark-circle-outline";
      case "error":
        return "alert-circle-outline";
      default:
        return "radio-outline";
    }
  };

  const getStatusMessage = () => {
    switch (status) {
      case "broadcasting":
        return "Broadcasting...";
      case "tapped":
        return "Tap detected!";
      case "confirmed":
        return "Payment confirmed!";
      case "error":
        return "Error";
      default:
        return "Ready to receive";
    }
  };

  const getStatusSubtext = () => {
    switch (status) {
      case "broadcasting":
        return `Waiting for a tap — requesting ${amount} ${symbol}`;
      case "tapped":
        return "Someone read your Zap Pay tag";
      case "confirmed":
        return "The sender wrote back a transaction confirmation";
      case "error":
        return errorMessage ?? "Something went wrong";
      default:
        return `Enter the ${symbol} amount you want to request, then tap Start`;
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
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Zap Pay</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Network selector */}
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

          {/* Asset selector */}
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

          {/* Animated broadcast indicator */}
          <View style={styles.scannerContainer}>
            {(status === "broadcasting" || status === "tapped") && (
              <>
                <Animated.View
                  style={[
                    styles.ring,
                    { borderColor: getStatusColor() },
                    ring1Style,
                  ]}
                />
                <Animated.View
                  style={[
                    styles.ring,
                    { borderColor: getStatusColor() },
                    ring2Style,
                  ]}
                />
                <Animated.View
                  style={[
                    styles.ring,
                    { borderColor: getStatusColor() },
                    ring3Style,
                  ]}
                />
              </>
            )}

            <Animated.View
              entering={FadeIn.duration(300)}
              style={[styles.iconContainer, { borderColor: getStatusColor() }]}
            >
              <Ionicons
                name={getStatusIcon()}
                size={72}
                color={getStatusColor()}
              />
            </Animated.View>
          </View>

          {/* Status text */}
          <Animated.View
            entering={FadeInDown.delay(150)}
            style={styles.statusArea}
          >
            <Text style={[styles.statusText, { color: getStatusColor() }]}>
              {getStatusMessage()}
            </Text>
            <Text style={styles.statusSubtext}>{getStatusSubtext()}</Text>

            {tapCount > 0 && status !== "confirmed" && (
              <View style={[styles.tapBadge, { backgroundColor: accentColor + "20" }]}>
                <Ionicons name="radio" size={14} color={accentColor} />
                <Text style={[styles.tapBadgeText, { color: accentColor }]}>
                  {tapCount} tap{tapCount !== 1 ? "s" : ""} received
                </Text>
              </View>
            )}
          </Animated.View>

          {/* Amount input — only shown when not yet broadcasting */}
          {!isBroadcasting && (
            <Animated.View
              entering={FadeInDown.delay(200)}
              style={styles.amountCard}
            >
              <Text style={styles.amountLabel}>Amount to request ({symbol})</Text>
              <View
                style={[
                  styles.amountInputRow,
                  amountError ? styles.amountInputRowError : null,
                ]}
              >
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
                  editable={!isBroadcasting}
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
          <Animated.View
            entering={FadeInDown.delay(250)}
            style={styles.infoCard}
          >
            <View style={styles.infoRow}>
              <Ionicons name="wallet-outline" size={16} color="#9CA3AF" />
              <Text style={styles.infoLabel}>Receiving address</Text>
            </View>
            <Text style={styles.infoAddress}>
              {formatAddress(selectedAccount.address)}
            </Text>
            <Text style={styles.infoNetwork}>
              on {networkConfig?.name ?? "Ethereum"}
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
        </ScrollView>

        {/* Action button — pinned to bottom */}
        <Animated.View entering={FadeInDown.delay(300)} style={styles.footer}>
          {!isBroadcasting ? (
            <TouchableOpacity
              style={[
                styles.primaryButton,
                (Platform.OS !== "android" || !amount.trim()) &&
                  styles.primaryButtonDisabled,
              ]}
              onPress={handleStart}
              disabled={Platform.OS !== "android"}
            >
              <Ionicons name="radio" size={20} color="#FFFFFF" />
              <Text style={styles.primaryButtonText}>Start Broadcasting</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.stopButton} onPress={handleStop}>
              <Ionicons name="stop-circle-outline" size={20} color="#FFFFFF" />
              <Text style={styles.stopButtonText}>Stop Broadcasting</Text>
            </TouchableOpacity>
          )}
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F1512",
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 16,
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
  chainSelectorLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  chainSelectorIcon: {
    fontSize: 18,
  },
  chainSelectorLabel: {
    color: "#9CA3AF",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  chainSelectorName: {
    fontSize: 14,
    color: "#FFFFFF",
    fontWeight: "600",
  },
  chainSelectorRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chainSelectorCurrency: {
    color: "#D1D5DB",
    fontSize: 13,
    fontWeight: "600",
  },
  assetDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
  },
  assetDotText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  scannerContainer: {
    width: 220,
    height: 220,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginTop: 24,
    marginBottom: 32,
  },
  ring: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 2,
  },
  iconContainer: {
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: "#1E2E29",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
  },
  statusArea: {
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 32,
    marginBottom: 24,
  },
  statusText: {
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
  },
  statusSubtext: {
    fontSize: 15,
    color: "#9CA3AF",
    textAlign: "center",
    lineHeight: 22,
  },
  tapBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#569F8C20",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginTop: 4,
  },
  tapBadgeText: {
    color: "#569F8C",
    fontSize: 13,
    fontWeight: "600",
  },
  amountCard: {
    backgroundColor: "#1E2E29",
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 24,
    marginBottom: 16,
    gap: 10,
  },
  amountLabel: {
    color: "#9CA3AF",
    fontSize: 12,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  amountInputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0F1512",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#374151",
    gap: 8,
  },
  amountInputRowError: {
    borderColor: "#EF4444",
  },
  amountSymbol: {
    color: "#9CA3AF",
    fontSize: 16,
    fontWeight: "600",
    minWidth: 40,
  },
  amountInput: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "700",
    paddingVertical: 12,
  },
  amountErrorText: {
    color: "#EF4444",
    fontSize: 13,
    marginTop: -4,
  },
  amountFiatEquiv: {
    color: "#9CA3AF",
    fontSize: 13,
    marginTop: 4,
    textAlign: "center",
  },
  infoCard: {
    backgroundColor: "#1E2E29",
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 24,
    marginBottom: 16,
    gap: 4,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  infoLabel: {
    color: "#9CA3AF",
    fontSize: 12,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  infoAddress: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    fontFamily: "monospace",
  },
  infoNetwork: {
    color: "#6B7280",
    fontSize: 13,
  },
  warningRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#374151",
  },
  warningText: {
    color: "#F59E0B",
    fontSize: 13,
  },
  footer: {
    padding: 24,
    paddingTop: 8,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#10B981",
    borderRadius: 14,
    paddingVertical: 16,
    gap: 10,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
  },
  stopButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#374151",
    borderRadius: 14,
    paddingVertical: 16,
    gap: 10,
  },
  stopButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "600",
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#0F1512",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "75%",
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1E2E29",
  },
  modalTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },
  assetItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1E2E29",
  },
  assetItemSelected: {
    backgroundColor: "#1A2520",
  },
  assetItemIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#1F2937",
    alignItems: "center",
    justifyContent: "center",
  },
  assetItemIconText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 12,
  },
  assetItemInfo: {
    flex: 1,
  },
  assetItemSymbol: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  assetItemName: {
    color: "#9CA3AF",
    fontSize: 13,
    marginTop: 2,
  },
});
