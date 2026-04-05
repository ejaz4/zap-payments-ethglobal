/**
 * Send Anything Screen
 *
 * Shown when scanning a "receive-anything" NFC tag. The receiver wants a specific
 * amount of a settlement token (e.g. 50 USDC). The sender picks any token they
 * hold and Uniswap calculates the equivalent amount to send. The receiver then
 * swaps to their desired token on their side.
 *
 * Params (from NFC tag):
 *   address           — recipient wallet address
 *   chainId           — chain ID
 *   amount            — requested settlement amount (e.g. "50")
 *   settleTokenAddress — settlement token address (e.g. USDC address)
 *   settleTokenSymbol  — settlement token symbol (e.g. "USDC")
 *   settleTokenDecimals — settlement token decimals
 */

import { ChainId, EthersClient } from "@/app/profiles/client";
import { TokenInfo } from "@/config/tokens";
import { NATIVE_TOKEN_ADDRESS, isNativeToken } from "@/config/uniswap";
import { useUniswapQuote } from "@/hooks/use-uniswap-quote";
import { PriceService } from "@/services/price";
import { ERC20Service } from "@/services/erc20";
import { TransactionService } from "@/services/wallet";
import { tintedBackground, useAccentColor } from "@/store/appearance";
import { useSelectedCurrency } from "@/store/currency";
import { useDemoMode } from "@/store/demo";
import { useTokenStore } from "@/store/tokens";
import {
  TokenBalance,
  useNativeBalance,
  useSelectedAccount,
  useTokenBalances,
  useWalletStore,
} from "@/store/wallet";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type SelectedAsset =
  | { type: "native" }
  | { type: "token"; token: TokenInfo; balance?: TokenBalance };

export default function SendAnythingScreen() {
  const accentColor = useAccentColor();
  const bg = tintedBackground("#000000");
  const router = useRouter();
  const currency = useSelectedCurrency();
  const demoMode = useDemoMode();
  const selectedAccount = useSelectedAccount();
  const selectedChainId = useWalletStore((s) => s.selectedChainId);
  const nativeBalance = useNativeBalance();
  const tokenBalances = useTokenBalances();
  const getTokensForChain = useTokenStore((s) => s.getTokensForChain);

  const {
    address: recipientAddress,
    chainId: chainIdParam,
    amount: requestedAmount,
    settleTokenAddress,
    settleTokenSymbol,
    settleTokenDecimals: settleTokenDecimalsParam,
  } = useLocalSearchParams<{
    address: string;
    chainId: string;
    amount: string;
    settleTokenAddress: string;
    settleTokenSymbol: string;
    settleTokenDecimals: string;
  }>();

  const effectiveChainId = chainIdParam
    ? (parseInt(chainIdParam, 10) as ChainId)
    : selectedChainId;
  const settleDecimals = settleTokenDecimalsParam
    ? parseInt(settleTokenDecimalsParam, 10)
    : 18;
  const networkConfig = EthersClient.getNetworkConfig(effectiveChainId);
  const nativeSymbol = networkConfig?.nativeCurrency.symbol ?? "ETH";

  const [selectedAsset, setSelectedAsset] = useState<SelectedAsset>({ type: "native" });
  const [showPicker, setShowPicker] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);

  // Build available tokens with balances
  const availableTokens = useMemo(() => {
    const tokens = getTokensForChain(effectiveChainId);
    return tokens.map((token) => {
      const balance = tokenBalances.find(
        (tb) =>
          tb.address.toLowerCase() === token.address.toLowerCase() &&
          tb.chainId === effectiveChainId,
      );
      return { token, balance };
    });
  }, [effectiveChainId, tokenBalances, getTokensForChain]);

  // Current asset info
  const currentSymbol =
    selectedAsset.type === "native"
      ? nativeSymbol
      : selectedAsset.token.symbol;
  const currentDecimals =
    selectedAsset.type === "native"
      ? (networkConfig?.nativeCurrency.decimals ?? 18)
      : selectedAsset.token.decimals;
  const currentSwapAddress =
    selectedAsset.type === "native"
      ? NATIVE_TOKEN_ADDRESS
      : selectedAsset.token.address;
  const currentBalance =
    selectedAsset.type === "native"
      ? nativeBalance
      : selectedAsset.balance?.balanceFormatted ?? "0";

  // Is the selected asset the same as the settlement token?
  const isSameAsSettle =
    (selectedAsset.type === "native" && isNativeToken(settleTokenAddress ?? "")) ||
    (selectedAsset.type === "token" &&
      selectedAsset.token.address.toLowerCase() === (settleTokenAddress ?? "").toLowerCase());

  // Uniswap quote: how much of currentAsset = requestedAmount of settleToken (EXACT_OUTPUT)
  const {
    quote: uniQuote,
    isLoading: quoteLoading,
    error: quoteError,
  } = useUniswapQuote(
    currentSwapAddress,
    currentDecimals,
    settleTokenAddress ?? NATIVE_TOKEN_ADDRESS,
    settleDecimals,
    isSameAsSettle ? "" : (requestedAmount ?? ""), // skip quote if same token
    effectiveChainId,
    selectedAccount?.address,
    "payment",
    "EXACT_OUTPUT",
  );

  // Amount to send
  const sendAmount = isSameAsSettle
    ? requestedAmount ?? "0"
    : uniQuote?.formattedIn ?? "";

  const hasSufficientBalance =
    sendAmount && currentBalance
      ? parseFloat(currentBalance) >= parseFloat(sendAmount)
      : false;

  // Fiat display
  const [sendFiat, setSendFiat] = useState<string | null>(null);
  useEffect(() => {
    if (!sendAmount || parseFloat(sendAmount) <= 0) {
      setSendFiat(null);
      return;
    }
    (async () => {
      try {
        const price =
          selectedAsset.type === "native"
            ? await PriceService.getNativePrice(effectiveChainId, "usd")
            : await PriceService.getPriceBySymbol(currentSymbol, "usd");
        if (price) {
          setSendFiat(PriceService.formatValue(parseFloat(sendAmount) * price, currency));
        }
      } catch {}
    })();
  }, [sendAmount, selectedAsset, effectiveChainId, currentSymbol, currency]);

  const executeSend = async () => {
    if (!selectedAccount || !recipientAddress || !sendAmount) return;
    setIsSending(true);
    try {
      if (selectedAsset.type === "native") {
        const result = await TransactionService.sendNative(
          selectedAccount.address,
          recipientAddress,
          sendAmount,
          effectiveChainId,
        );
        if ("error" in result) throw new Error(result.error);
      } else {
        const result = await ERC20Service.transfer(
          selectedAccount.address,
          recipientAddress,
          selectedAsset.token.address,
          sendAmount,
          selectedAsset.token.decimals,
          effectiveChainId,
        );
        if ("error" in result) throw new Error(result.error);
      }

      setSendSuccess(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => router.replace("/(tabs)"), 2000);
    } catch (err: any) {
      Alert.alert("Send Failed", err.message || "Transaction failed");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSending(false);
    }
  };

  const handleSend = () => {
    if (!selectedAccount || !recipientAddress || !sendAmount) return;

    if (demoMode) {
      executeSend();
      return;
    }

    const confirmMsg = `Send ${parseFloat(sendAmount).toFixed(6)} ${currentSymbol} to ${recipientAddress.slice(0, 8)}...${recipientAddress.slice(-4)}?`;
    Alert.alert("Confirm Payment", confirmMsg, [
      { text: "Cancel", style: "cancel" },
      { text: "Send", onPress: executeSend },
    ]);
  };

  // Demo mode: auto-send as soon as we have a valid amount
  const autoSendFiredRef = React.useRef(false);
  useEffect(() => {
    if (
      demoMode &&
      hasSufficientBalance &&
      sendAmount &&
      parseFloat(sendAmount) > 0 &&
      !isSending &&
      !sendSuccess &&
      !autoSendFiredRef.current
    ) {
      autoSendFiredRef.current = true;
      executeSend();
    }
  }, [demoMode, hasSufficientBalance, sendAmount, isSending, sendSuccess]);

  const formatAddr = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  if (sendSuccess) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
        <View style={styles.successContainer}>
          <Ionicons name="checkmark-circle" size={96} color="#10B981" />
          <Text style={styles.successTitle}>Payment Sent!</Text>
          <Text style={styles.successSub}>
            {parseFloat(sendAmount).toFixed(6)} {currentSymbol}
          </Text>
          <Text style={styles.successHint}>Returning to wallet...</Text>
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
        <Text style={styles.headerTitle}>Send Anything</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        {/* Request info */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Payment Request</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Recipient</Text>
            <Text style={styles.detailValueMono}>{formatAddr(recipientAddress ?? "")}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Requesting</Text>
            <Text style={[styles.detailValue, { fontWeight: "700" }]}>
              {requestedAmount} {settleTokenSymbol}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Chain</Text>
            <Text style={styles.detailValue}>{networkConfig?.name ?? "Unknown"}</Text>
          </View>
        </View>

        {/* Token selector */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Pay with</Text>
          <TouchableOpacity
            style={styles.tokenSelector}
            onPress={() => setShowPicker(true)}
          >
            <View style={[styles.tokenDot, { backgroundColor: accentColor }]}>
              <Text style={styles.tokenDotText}>
                {currentSymbol.slice(0, 1)}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.tokenName}>{currentSymbol}</Text>
              <Text style={styles.tokenBal}>Balance: {parseFloat(currentBalance || "0").toFixed(6)}</Text>
            </View>
            <Ionicons name="chevron-down" size={18} color="#9CA3AF" />
          </TouchableOpacity>

          {/* Quote result */}
          {!isSameAsSettle && quoteLoading && (
            <View style={styles.quoteRow}>
              <ActivityIndicator size="small" color={accentColor} />
              <Text style={styles.quoteText}>Calculating equivalent amount...</Text>
            </View>
          )}

          {!isSameAsSettle && quoteError && (
            <Text style={styles.errorText}>No swap route found for this token</Text>
          )}

          {sendAmount && parseFloat(sendAmount) > 0 && (
            <View style={styles.amountBox}>
              <Text style={styles.amountLabel}>You send</Text>
              <Text style={styles.amountValue}>
                {parseFloat(sendAmount).toFixed(6)} {currentSymbol}
              </Text>
              {sendFiat && <Text style={styles.amountFiat}>~ {sendFiat}</Text>}
              {!isSameAsSettle && uniQuote && (
                <Text style={styles.amountEquiv}>
                  = {requestedAmount} {settleTokenSymbol} (via Uniswap)
                </Text>
              )}
            </View>
          )}

          {!hasSufficientBalance && sendAmount && parseFloat(sendAmount) > 0 && (
            <Text style={styles.errorText}>
              Insufficient {currentSymbol} balance
            </Text>
          )}
        </View>

        {/* Quote details */}
        {!isSameAsSettle && uniQuote && (
          <View style={styles.detailsCard}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Routing</Text>
              <Text style={styles.detailValue}>{uniQuote.routing}</Text>
            </View>
            {uniQuote.gasFeeUSD && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Est. gas</Text>
                <Text style={styles.detailValue}>${parseFloat(uniQuote.gasFeeUSD).toFixed(4)}</Text>
              </View>
            )}
            {uniQuote.priceImpact && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Price impact</Text>
                <Text style={styles.detailValue}>{parseFloat(uniQuote.priceImpact).toFixed(2)}%</Text>
              </View>
            )}
          </View>
        )}

        {/* Send button */}
        <TouchableOpacity
          style={[
            styles.sendBtn,
            { backgroundColor: hasSufficientBalance && sendAmount ? accentColor : "#374151" },
          ]}
          onPress={handleSend}
          disabled={!hasSufficientBalance || !sendAmount || isSending}
        >
          {isSending ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Text style={styles.sendBtnText}>
              {!sendAmount || parseFloat(sendAmount) <= 0
                ? "Select a token"
                : !hasSufficientBalance
                ? "Insufficient balance"
                : `Send ${parseFloat(sendAmount).toFixed(4)} ${currentSymbol}`}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Token Picker Modal */}
      <Modal visible={showPicker} transparent animationType="slide" onRequestClose={() => setShowPicker(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setShowPicker(false)}>
          <Pressable style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Choose token to send</Text>

            {/* Native */}
            <TouchableOpacity
              style={styles.sheetRow}
              onPress={() => {
                setSelectedAsset({ type: "native" });
                setShowPicker(false);
              }}
            >
              <View style={[styles.tokenDot, { backgroundColor: "#627EEA" }]}>
                <Text style={styles.tokenDotText}>{nativeSymbol.slice(0, 1)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetRowLabel}>{nativeSymbol}</Text>
                <Text style={styles.sheetRowSub}>Native token</Text>
              </View>
              <Text style={styles.sheetRowBal}>{parseFloat(nativeBalance || "0").toFixed(4)}</Text>
              {selectedAsset.type === "native" && (
                <Ionicons name="checkmark-circle" size={18} color={accentColor} />
              )}
            </TouchableOpacity>

            {/* ERC20 tokens */}
            <FlatList
              data={availableTokens}
              keyExtractor={(item) => item.token.address}
              style={{ maxHeight: 400 }}
              renderItem={({ item }) => {
                const bal = parseFloat(item.balance?.balanceFormatted || "0");
                const isActive =
                  selectedAsset.type === "token" &&
                  selectedAsset.token.address.toLowerCase() === item.token.address.toLowerCase();
                return (
                  <TouchableOpacity
                    style={styles.sheetRow}
                    onPress={() => {
                      setSelectedAsset({ type: "token", token: item.token, balance: item.balance });
                      setShowPicker(false);
                    }}
                  >
                    <View style={[styles.tokenDot, { backgroundColor: item.token.color || "#6B7280" }]}>
                      <Text style={styles.tokenDotText}>{item.token.symbol.slice(0, 1)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sheetRowLabel}>{item.token.symbol}</Text>
                      <Text style={styles.sheetRowSub}>{item.token.name}</Text>
                    </View>
                    <Text style={styles.sheetRowBal}>{bal.toFixed(4)}</Text>
                    {isActive && <Ionicons name="checkmark-circle" size={18} color={accentColor} />}
                  </TouchableOpacity>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  content: { flex: 1, padding: 20, gap: 16 },
  card: {
    backgroundColor: "#1E2E29",
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  cardTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  detailRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  detailLabel: { color: "#9CA3AF", fontSize: 12 },
  detailValue: { color: "#E5E7EB", fontSize: 12, fontWeight: "600" },
  detailValueMono: { color: "#E5E7EB", fontSize: 11, fontFamily: "monospace" },
  detailsCard: {
    backgroundColor: "#1E2E29",
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  tokenSelector: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#141B17",
    borderRadius: 12,
    padding: 14,
  },
  tokenDot: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  tokenDotText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  tokenName: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
  tokenBal: { color: "#9CA3AF", fontSize: 12, marginTop: 2 },
  quoteRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  quoteText: { color: "#9CA3AF", fontSize: 12 },
  errorText: { color: "#EF4444", fontSize: 12 },
  amountBox: {
    backgroundColor: "#141B17",
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  amountLabel: { color: "#9CA3AF", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 },
  amountValue: { color: "#FFFFFF", fontSize: 22, fontWeight: "700" },
  amountFiat: { color: "#9CA3AF", fontSize: 13 },
  amountEquiv: { color: "#10B981", fontSize: 12, fontWeight: "600", marginTop: 2 },
  sendBtn: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  sendBtnText: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
  // Success
  successContainer: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 16 },
  successTitle: { color: "#10B981", fontSize: 28, fontWeight: "700", marginTop: 16 },
  successSub: { color: "#D1D5DB", fontSize: 20, fontWeight: "500" },
  successHint: { color: "#9CA3AF", fontSize: 15 },
  // Sheet
  sheetBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.48)" },
  sheet: {
    backgroundColor: "#121915",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderColor: "#26342C",
    maxHeight: "70%",
  },
  sheetHandle: { alignSelf: "center", width: 44, height: 4, borderRadius: 4, backgroundColor: "#3A4A41", marginBottom: 14 },
  sheetTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "700", marginBottom: 12 },
  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1E2A24",
  },
  sheetRowLabel: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
  sheetRowSub: { color: "#9CA3AF", fontSize: 12, marginTop: 2 },
  sheetRowBal: { color: "#E5E7EB", fontSize: 14, fontWeight: "600", marginRight: 8 },
});
