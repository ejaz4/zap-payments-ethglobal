import { ChainId, DEFAULT_NETWORKS, EthersClient } from "@/app/profiles/client";
import { NetworkSelector } from "@/components/ui/NetworkSelector";
import { getAllDefaultTokens, getTokenKey } from "@/config/tokens";
import {
    NATIVE_TOKEN_ADDRESS,
    SLIPPAGE_PRESETS,
    UNISWAP_CHAINS,
    isUniswapSupported,
} from "@/config/uniswap";
import { usePrices, useTokenPrice } from "@/hooks/use-prices";
import { useSwapExecution, type SwapStep } from "@/hooks/use-swap-execution";
import { useUniswapQuote } from "@/hooks/use-uniswap-quote";
import { useUniswapTokens } from "@/hooks/use-uniswap-tokens";
import { PriceService } from "@/services/price";
import { BalanceService } from "@/services/wallet";
import { hexToRgba, tintedBackground, useAccentColor } from "@/store/appearance";
import { useSelectedCurrency } from "@/store/currency";
import { useTokenStore } from "@/store/tokens";
import { useUniswapStore } from "@/store/uniswap";
import { useSelectedAccount, useWalletStore } from "@/store/wallet";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Modal,
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type PickerFor = "from" | "to";

type CurrencyItem = {
  id: string;
  symbol: string;
  name: string;
  amount: number;
  amountFormatted: string;
  chainId: ChainId;
  address?: string;
  /** Token contract address for ERC20, NATIVE_TOKEN_ADDRESS for native */
  swapAddress: string;
  decimals: number;
  color: string;
  isFavorite: boolean;
  popularity: number;
  logoURI?: string;
};

const SYMBOL_COLORS: Record<string, string> = {
  ETH: "#627EEA",
  SOL: "#14F195",
  USDT: "#26A17B",
  USDC: "#2775CA",
  DAI: "#F5AC37",
  WBTC: "#F7931A",
  MATIC: "#8247E5",
  BNB: "#F3BA2F",
  AVAX: "#E84142",
  OP: "#FF0420",
  ARB: "#28A0F0",
};

function amountToText(amount: number): string {
  if (!Number.isFinite(amount)) return "0";
  if (amount >= 1000) return amount.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return amount.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function symbolColor(symbol: string): string {
  const upper = symbol.toUpperCase();
  if (SYMBOL_COLORS[upper]) return SYMBOL_COLORS[upper];
  const hash = upper.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const hue = hash % 360;
  return `hsl(${hue}, 68%, 46%)`;
}

function buildPopularityMap(): Map<string, number> {
  const map = new Map<string, number>();
  const defaultTokens = getAllDefaultTokens();
  defaultTokens.forEach((token, index) => {
    const symbol = token.symbol.toUpperCase();
    const rankBonus = Math.max(30 - (index % 15), 3);
    map.set(symbol, (map.get(symbol) || 0) + rankBonus);
  });
  Object.values(DEFAULT_NETWORKS).forEach((network) => {
    const symbol = network.nativeCurrency.symbol.toUpperCase();
    map.set(symbol, (map.get(symbol) || 0) + 40);
  });
  return map;
}

function CurrencyIcon({ symbol, color }: { symbol: string; color: string }) {
  return (
    <View style={[styles.tokenIcon, { backgroundColor: color }]}>
      <Text style={styles.tokenIconText}>{symbol.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

function TokenPill({
  item,
  accentColor,
  onPress,
}: {
  item: CurrencyItem | null;
  accentColor: string;
  onPress: () => void;
}) {
  const surface = hexToRgba(accentColor, 0.18);
  const border = hexToRgba(accentColor, 0.38);
  return (
    <TouchableOpacity
      style={[styles.tokenPill, { backgroundColor: surface, borderColor: border }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {item ? <CurrencyIcon symbol={item.symbol} color={item.color} /> : null}
      <Text style={styles.tokenLabel}>{item?.symbol || "Select"}</Text>
      <Ionicons name="chevron-down" size={16} color="#D1D5DB" />
    </TouchableOpacity>
  );
}

function formatFiat(amount: string, unitPrice: number | null, currency: string): string {
  const parsed = parseFloat(amount || "0");
  if (!Number.isFinite(parsed) || unitPrice == null) return "";
  return PriceService.formatValue(parsed * unitPrice, currency);
}

const STEP_LABELS: Record<SwapStep, string> = {
  idle: "",
  "checking-approval": "Checking approval...",
  approving: "Approving token...",
  "signing-permit": "Sign permit in wallet...",
  "building-swap": "Building swap...",
  swapping: "Confirming swap...",
  done: "Swap complete!",
  error: "Swap failed",
};

export default function SwapScreen() {
  const insets = useSafeAreaInsets();
  const accentColor = useAccentColor();
  const bg = tintedBackground("#000000");
  const currency = useSelectedCurrency();
  const selectedAccount = useSelectedAccount();
  const globalChainId = useWalletStore((s) => s.selectedChainId);
  const allNativeBalances = useWalletStore((s) => s.nativeBalances);
  const allTokenBalances = useWalletStore((s) => s.tokenBalances);
  const favoriteTokens = useTokenStore((s) => s.favoriteTokens);
  const addCustomToken = useTokenStore((s) => s.addCustomToken);
  const hasToken = useTokenStore((s) => s.hasToken);
  const getTokensForChain = useTokenStore((s) => s.getTokensForChain);
  const slippage = useUniswapStore((s) => s.slippage);
  const setSlippage = useUniswapStore((s) => s.setSlippage);

  // Local chain state — defaults to global, but can be changed independently
  const [selectedChainId, setSelectedChainId] = useState<ChainId>(globalChainId);
  const [showChainPicker, setShowChainPicker] = useState(false);

  // Sync when global chain changes (e.g. user switches in another tab)
  useEffect(() => {
    if (isUniswapSupported(globalChainId)) {
      setSelectedChainId(globalChainId);
    }
  }, [globalChainId]);

  const [fromAmount, setFromAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [fromTokenId, setFromTokenId] = useState<string | null>(null);
  const [toTokenId, setToTokenId] = useState<string | null>(null);
  const [pickerFor, setPickerFor] = useState<PickerFor | null>(null);
  const [search, setSearch] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const accentSurface = hexToRgba(accentColor, 0.18);
  const accentBorder = hexToRgba(accentColor, 0.38);

  const chainSupportsSwap = isUniswapSupported(selectedChainId);
  const chainConfig = UNISWAP_CHAINS[selectedChainId];
  const chainName = chainConfig?.name ?? EthersClient.getNetworkConfig(selectedChainId)?.name ?? "Unknown";
  const { tokens: uniswapTokenList, loading: uniswapSearchLoading, search: searchUniswapTokens } = useUniswapTokens(selectedChainId);

  const defaultColorByKey = useMemo(() => {
    const colorMap = new Map<string, string>();
    getAllDefaultTokens().forEach((token) => {
      if (token.color) {
        colorMap.set(getTokenKey(token.address, token.chainId), token.color);
      }
    });
    return colorMap;
  }, []);

  const popularityMap = useMemo(() => buildPopularityMap(), []);

  // Build currency list for selected chain
  const currencies = useMemo<CurrencyItem[]>(() => {
    if (!selectedAccount?.address) return [];
    const addressLower = selectedAccount.address.toLowerCase();
    const seen = new Set<string>();
    const items: CurrencyItem[] = [];

    // Native balances
    for (const [key, value] of Object.entries(allNativeBalances)) {
      const sep = key.lastIndexOf("_");
      if (sep < 0) continue;
      const accountAddress = key.slice(0, sep);
      if (accountAddress.toLowerCase() !== addressLower) continue;
      const chainId = Number(key.slice(sep + 1)) as ChainId;
      if (chainId !== selectedChainId) continue;

      const amount = Number(value || "0");
      if (!Number.isFinite(amount)) continue;

      const network = EthersClient.getNetworkConfig(chainId);
      const symbol = network?.nativeCurrency.symbol || "NATIVE";
      const name = network?.nativeCurrency.name || "Native Token";
      const id = `native_${chainId}`;
      if (seen.has(id)) continue;
      seen.add(id);

      items.push({
        id,
        symbol,
        name,
        amount,
        amountFormatted: amountToText(amount),
        chainId,
        swapAddress: NATIVE_TOKEN_ADDRESS,
        decimals: network?.nativeCurrency.decimals || 18,
        color: symbolColor(symbol),
        isFavorite: false,
        popularity: popularityMap.get(symbol.toUpperCase()) || 1,
      });
    }

    // ERC20 balances
    for (const [key, balances] of Object.entries(allTokenBalances)) {
      const sep = key.lastIndexOf("_");
      if (sep < 0) continue;
      const accountAddress = key.slice(0, sep);
      if (accountAddress.toLowerCase() !== addressLower) continue;

      for (const token of balances) {
        if (token.chainId !== selectedChainId) continue;
        const amount = Number(token.balanceFormatted || "0");
        if (!Number.isFinite(amount)) continue;

        const tokenId = `token_${token.chainId}_${token.address.toLowerCase()}`;
        if (seen.has(tokenId)) continue;
        seen.add(tokenId);

        const favoriteKey = getTokenKey(token.address, token.chainId);
        const color = defaultColorByKey.get(favoriteKey) || token.logoUri || symbolColor(token.symbol);

        items.push({
          id: tokenId,
          symbol: token.symbol,
          name: token.name,
          amount,
          amountFormatted: amountToText(amount),
          chainId: token.chainId,
          address: token.address,
          swapAddress: token.address,
          decimals: token.decimals,
          color,
          isFavorite: favoriteTokens.has(favoriteKey),
          popularity: popularityMap.get(token.symbol.toUpperCase()) || 1,
        });
      }
    }

    return items;
  }, [selectedAccount?.address, allNativeBalances, allTokenBalances, defaultColorByKey, favoriteTokens, popularityMap, selectedChainId]);

  const byAmount = useMemo(
    () => [...currencies].sort((a, b) => b.amount - a.amount || a.symbol.localeCompare(b.symbol)),
    [currencies],
  );

  const byPopularity = useMemo(
    () => [...currencies].sort((a, b) => b.popularity - a.popularity || b.amount - a.amount || a.symbol.localeCompare(b.symbol)),
    [currencies],
  );

  // Internal token list for the current chain (always available, even without Uniswap GQL)
  const internalTokens = useMemo(() => getTokensForChain(selectedChainId), [getTokensForChain, selectedChainId]);

  // Merge internal token list + Uniswap GQL results into the "to" picker.
  // Tokens the user already holds (in `currencies`) are excluded.
  const uniswapExtras = useMemo<CurrencyItem[]>(() => {
    const existingAddrs = new Set(
      currencies.map((c) => (c.address || c.swapAddress).toLowerCase()),
    );
    const extras: CurrencyItem[] = [];
    const seenAddrs = new Set<string>();

    // First: add internal tokens for this chain (verified, correct addresses)
    for (const t of internalTokens) {
      const addrLower = t.address.toLowerCase();
      if (existingAddrs.has(addrLower) || seenAddrs.has(addrLower)) continue;
      seenAddrs.add(addrLower);
      const favoriteKey = getTokenKey(t.address, t.chainId);
      extras.push({
        id: `internal_${t.chainId}_${addrLower}`,
        symbol: t.symbol,
        name: t.name,
        amount: 0,
        amountFormatted: "0",
        chainId: t.chainId,
        address: t.address,
        swapAddress: t.address,
        decimals: t.decimals,
        color: t.color || symbolColor(t.symbol),
        isFavorite: favoriteTokens.has(favoriteKey),
        popularity: popularityMap.get(t.symbol.toUpperCase()) || 5,
      });
    }

    // Then: add Uniswap GQL results (only for chains that actually have GQL support)
    for (const t of uniswapTokenList) {
      const addrLower = t.address.toLowerCase();
      if (existingAddrs.has(addrLower) || seenAddrs.has(addrLower)) continue;
      seenAddrs.add(addrLower);
      extras.push({
        id: `uniswap_${t.chainId}_${addrLower}`,
        symbol: t.symbol,
        name: t.name,
        amount: 0,
        amountFormatted: "0",
        chainId: t.chainId,
        address: t.address,
        swapAddress: t.address,
        decimals: t.decimals,
        color: symbolColor(t.symbol),
        isFavorite: false,
        popularity: popularityMap.get(t.symbol.toUpperCase()) || 0,
        logoURI: t.logoURI,
      });
    }

    return extras;
  }, [currencies, internalTokens, uniswapTokenList, popularityMap, favoriteTokens, selectedChainId]);

  // Combined list for the "to" picker: user's tokens first, then Uniswap extras sorted by popularity
  const toPickerList = useMemo(
    () => [
      ...byPopularity,
      ...uniswapExtras.sort((a, b) => b.popularity - a.popularity || a.symbol.localeCompare(b.symbol)),
    ],
    [byPopularity, uniswapExtras],
  );

  // Auto-select defaults
  useEffect(() => {
    if (!fromTokenId && byAmount.length > 0) setFromTokenId(byAmount[0].id);
    if (!toTokenId && byPopularity.length > 0) {
      const fallback = byPopularity.find((item) => item.id !== (byAmount[0]?.id || "")) || byPopularity[0];
      setToTokenId(fallback.id);
    }
  }, [fromTokenId, toTokenId, byAmount, byPopularity]);

  // Reset selections on chain change
  useEffect(() => {
    setFromTokenId(null);
    setToTokenId(null);
    setFromAmount("");
    setToAmount("");
  }, [selectedChainId]);

  useEffect(() => {
    if (fromTokenId && !currencies.some((item) => item.id === fromTokenId)) setFromTokenId(byAmount[0]?.id || null);
    if (toTokenId && !currencies.some((item) => item.id === toTokenId) && !uniswapExtras.some((item) => item.id === toTokenId)) setToTokenId(byPopularity[0]?.id || null);
  }, [fromTokenId, toTokenId, currencies, uniswapExtras, byAmount, byPopularity]);

  const fromToken = useMemo(
    () => currencies.find((item) => item.id === fromTokenId) || byAmount[0] || null,
    [currencies, fromTokenId, byAmount],
  );
  const allToTokens = useMemo(() => [...currencies, ...uniswapExtras], [currencies, uniswapExtras]);
  const toToken = useMemo(
    () => allToTokens.find((item) => item.id === toTokenId) || byPopularity[0] || null,
    [allToTokens, toTokenId, byPopularity],
  );

  // Prices for fiat display
  const { price: fromPrice } = useTokenPrice(fromToken?.symbol || "ETH", fromToken?.address, fromToken?.chainId);
  const { price: toPrice } = useTokenPrice(toToken?.symbol || "USDC", toToken?.address, toToken?.chainId);

  // Uniswap quote
  const {
    quote: uniQuote,
    isLoading: quoteLoading,
    error: quoteError,
  } = useUniswapQuote(
    fromToken?.swapAddress || NATIVE_TOKEN_ADDRESS,
    fromToken?.decimals || 18,
    toToken?.swapAddress || NATIVE_TOKEN_ADDRESS,
    toToken?.decimals || 18,
    fromAmount,
    selectedChainId,
    selectedAccount?.address,
    "auto",
    "EXACT_INPUT",
  );

  // Update "you receive" when quote arrives
  useEffect(() => {
    if (uniQuote) {
      setToAmount(uniQuote.formattedOut);
    } else if (!fromAmount || parseFloat(fromAmount) <= 0) {
      setToAmount("");
    }
  }, [uniQuote, fromAmount]);

  // Swap execution
  const { executeSwap, step: swapStep, txHash, error: swapError, reset: resetSwap } = useSwapExecution();

  const handleSwap = () => {
    if (!uniQuote || !selectedAccount) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    executeSwap(uniQuote, selectedAccount.address);
  };

  // After swap completes, refresh balances, record in history, and auto-import the received token
  useEffect(() => {
    if (swapStep === "done") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      BalanceService.forceRefreshBalances();

      // Record swap in transaction history
      if (selectedAccount && txHash) {
        const swapTx = {
          hash: txHash,
          from: selectedAccount.address,
          to: selectedAccount.address,
          value: fromAmount || "0",
          chainId: selectedChainId,
          timestamp: Date.now(),
          status: "confirmed" as const,
          type: "swap" as const,
          tokenSymbol: fromToken?.symbol || "ETH",
          swapFromSymbol: fromToken?.symbol || "ETH",
          swapFromAmount: fromAmount || "0",
          swapToSymbol: toToken?.symbol || "",
          swapToAmount: toAmount || "0",
        };
        useWalletStore.getState().addTransaction(selectedAccount.address, swapTx);
      }

      // Auto-add "to" token to the app's token list if it's not already there
      if (toToken?.address && !hasToken(toToken.address, toToken.chainId)) {
        addCustomToken({
          address: toToken.address,
          chainId: toToken.chainId,
          decimals: toToken.decimals,
          symbol: toToken.symbol,
          name: toToken.name,
          isVerified: false,
          isDefault: false,
        });
      }
    }
  }, [swapStep]);

  // Price impact warning
  const priceImpactPct = uniQuote?.priceImpact ? parseFloat(uniQuote.priceImpact) : null;
  const priceImpactWarning = priceImpactPct != null && priceImpactPct > slippage * 0.7;
  const priceImpactError = priceImpactPct != null && priceImpactPct > slippage;

  // Min output
  const minOutput = uniQuote
    ? (parseFloat(uniQuote.formattedOut) * (1 - slippage / 100)).toFixed(toToken?.decimals && toToken.decimals > 6 ? 6 : toToken?.decimals || 6)
    : null;

  // Gas USD from quote
  const gasUsd = uniQuote?.gasFeeUSD ? `$${parseFloat(uniQuote.gasFeeUSD).toFixed(4)}` : null;

  // Swap button state
  const isSwapping = ["checking-approval", "approving", "signing-permit", "building-swap", "swapping"].includes(swapStep);
  const canSwap = chainSupportsSwap && !!uniQuote && !!selectedAccount && !isSwapping && swapStep !== "done";

  const swapButtonLabel = () => {
    if (!chainSupportsSwap) return "Swap not available on this chain";
    if (swapStep === "done") return "Swap Complete";
    if (isSwapping) return STEP_LABELS[swapStep];
    if (quoteLoading) return "Getting quote...";
    if (quoteError) return "No route found";
    if (!fromAmount || parseFloat(fromAmount) <= 0) return "Enter amount";
    if (!uniQuote) return "Getting quote...";
    return "Swap";
  };

  // Token picker — "to" picker uses the merged list with Uniswap tokens
  const pickerBaseList = pickerFor === "from" ? byAmount : toPickerList;
  const pickerTokensForPrices = useMemo(
    () => pickerBaseList.map((item) => ({ symbol: item.symbol, address: item.address, chainId: item.chainId })),
    [pickerBaseList],
  );
  const { prices: pickerPrices, loading: pickerPricesLoading } = usePrices(pickerTokensForPrices);

  const filteredList = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return pickerBaseList;
    return pickerBaseList.filter((item) => item.symbol.toLowerCase().includes(query) || item.name.toLowerCase().includes(query));
  }, [pickerBaseList, search]);

  const favoriteList = useMemo(() => {
    const source = search.trim() ? filteredList : pickerBaseList;
    return source.filter((item) => item.isFavorite);
  }, [pickerBaseList, filteredList, search]);

  const showPickerSkeleton = pickerFor !== null && (pickerPricesLoading || (pickerFor === "to" && uniswapSearchLoading)) && pickerBaseList.length === 0;

  const fromFiat = useMemo(() => formatFiat(fromAmount, fromPrice, currency), [fromAmount, fromPrice, currency]);
  const toFiat = useMemo(() => formatFiat(toAmount, toPrice, currency), [toAmount, toPrice, currency]);

  const handleSearchChange = useCallback((text: string) => {
    setSearch(text);
    if (pickerFor === "to") {
      searchUniswapTokens(text);
    }
  }, [pickerFor, searchUniswapTokens]);

  const onSelectSymbol = (item: CurrencyItem) => {
    if (pickerFor === "from") setFromTokenId(item.id);
    else if (pickerFor === "to") setToTokenId(item.id);
    setSearch("");
    setPickerFor(null);
  };

  const handleFlipTokens = () => {
    const tmpId = fromTokenId;
    setFromTokenId(toTokenId);
    setToTokenId(tmpId);
    setFromAmount(toAmount);
    setToAmount("");
    resetSwap();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <View style={[styles.content, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Swap</Text>
          <View style={styles.headerRight}>
            <TouchableOpacity onPress={() => setShowChainPicker(true)} style={styles.chainBtn}>
              <View style={[styles.chainDot, { backgroundColor: chainSupportsSwap ? "#10B981" : "#F59E0B" }]} />
              <Text style={styles.chainBtnText}>{chainName}</Text>
              <Ionicons name="chevron-down" size={14} color="#9CA3AF" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowSettings(!showSettings)} style={styles.settingsBtn}>
              <Ionicons name="settings-outline" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Slippage settings */}
        {showSettings && (
          <View style={styles.settingsPanel}>
            <Text style={styles.settingsLabel}>Slippage tolerance</Text>
            <View style={styles.slippageRow}>
              {SLIPPAGE_PRESETS.map((pct) => (
                <TouchableOpacity
                  key={pct}
                  style={[styles.slippageBtn, slippage === pct && { backgroundColor: accentColor }]}
                  onPress={() => setSlippage(pct)}
                >
                  <Text style={[styles.slippageBtnText, slippage === pct && { color: "#FFF" }]}>{pct}%</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* You pay */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>You pay</Text>
          <View style={styles.cardMainRow}>
            <TextInput
              value={fromAmount}
              onChangeText={(v) => { setFromAmount(v); resetSwap(); }}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor="#6B7280"
              style={styles.amountInput}
            />
            <TokenPill item={fromToken} accentColor={accentColor} onPress={() => setPickerFor("from")} />
          </View>
          <Text style={styles.fiatText}>{fromFiat ? `~ ${fromFiat}` : " "}</Text>
        </View>

        {/* Flip arrow */}
        <TouchableOpacity style={styles.arrowWrap} onPress={handleFlipTokens} activeOpacity={0.7}>
          <View style={[styles.arrowButton, { backgroundColor: accentSurface, borderColor: accentBorder }]}>
            <Ionicons name="swap-vertical" size={20} color="#FFFFFF" />
          </View>
        </TouchableOpacity>

        {/* You receive */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>You receive</Text>
          <View style={styles.cardMainRow}>
            <View style={{ flex: 1 }}>
              {quoteLoading ? (
                <ActivityIndicator size="small" color={accentColor} style={{ alignSelf: "flex-start", marginVertical: 8 }} />
              ) : (
                <Text style={[styles.amountDisplay, !toAmount && { color: "#6B7280" }]}>
                  {toAmount || "0.00"}
                </Text>
              )}
            </View>
            <TokenPill item={toToken} accentColor={accentColor} onPress={() => setPickerFor("to")} />
          </View>
          <Text style={styles.fiatText}>{toFiat ? `~ ${toFiat}` : " "}</Text>
        </View>

        {/* Quote details */}
        {uniQuote && (
          <View style={styles.detailsCard}>
            {minOutput && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Min. received ({slippage}% slip.)</Text>
                <Text style={styles.detailValue}>{minOutput} {toToken?.symbol}</Text>
              </View>
            )}
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Routing</Text>
              <Text style={styles.detailValue}>{uniQuote.routing}</Text>
            </View>
            {gasUsd && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Gas</Text>
                <Text style={styles.detailValue}>{gasUsd}</Text>
              </View>
            )}
            {priceImpactPct != null && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Price impact</Text>
                <Text style={[styles.detailValue, priceImpactError ? { color: "#EF4444" } : priceImpactWarning ? { color: "#F59E0B" } : undefined]}>
                  {priceImpactPct.toFixed(2)}%
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Error / status */}
        {quoteError && !quoteLoading && (
          <Text style={styles.errorText}>{quoteError}</Text>
        )}

        {swapStep !== "idle" && swapStep !== "done" && (
          <View style={styles.statusRow}>
            <ActivityIndicator size="small" color={accentColor} />
            <Text style={styles.statusText}>{STEP_LABELS[swapStep]}</Text>
          </View>
        )}

        {swapError && (
          <Text style={styles.errorText}>{swapError}</Text>
        )}

        {swapStep === "done" && txHash && (
          <View style={styles.successRow}>
            <Ionicons name="checkmark-circle" size={18} color="#10B981" />
            <Text style={styles.successText}>Swap complete! Tx: {txHash.slice(0, 10)}...</Text>
          </View>
        )}

        {/* Swap button */}
        <TouchableOpacity
          style={[styles.swapButton, { backgroundColor: canSwap ? accentColor : "#374151" }]}
          onPress={swapStep === "done" ? () => { setFromAmount(""); setToAmount(""); resetSwap(); } : handleSwap}
          disabled={!canSwap && swapStep !== "done"}
          activeOpacity={0.8}
        >
          {isSwapping ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Text style={styles.swapButtonText}>
              {swapStep === "done" ? "New Swap" : swapButtonLabel()}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Chain Picker */}
      <NetworkSelector
        visible={showChainPicker}
        selectedChainId={selectedChainId}
        onSelect={(chainId) => {
          setSelectedChainId(chainId);
          setShowChainPicker(false);
        }}
        onClose={() => setShowChainPicker(false)}
      />

      {/* Token Picker Modal */}
      <Modal visible={pickerFor !== null} transparent animationType="slide" onRequestClose={() => setPickerFor(null)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setPickerFor(null)}>
          <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Select token</Text>
            <View style={styles.searchRow}>
              <Ionicons name="search" size={16} color="#9CA3AF" />
              <TextInput value={search} onChangeText={handleSearchChange} placeholder={pickerFor === "to" ? "Search name or paste address" : "Search token"} placeholderTextColor="#6B7280" style={styles.searchInput} autoCapitalize="none" autoCorrect={false} />
              {pickerFor === "to" && uniswapSearchLoading && <ActivityIndicator size="small" color={accentColor} />}
            </View>

            {favoriteList.length > 0 && (
              <View style={styles.favoritesSection}>
                <Text style={styles.favoritesLabel}>Favorites</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.favoritesRow}>
                  {favoriteList.map((item) => (
                    <TouchableOpacity
                      key={`favorite_${item.id}`}
                      style={[styles.favoriteIconButton, ((pickerFor === "from" && fromToken?.id === item.id) || (pickerFor === "to" && toToken?.id === item.id)) && styles.favoriteIconButtonActive]}
                      onPress={() => onSelectSymbol(item)}
                      activeOpacity={0.8}
                    >
                      <CurrencyIcon symbol={item.symbol} color={item.color} />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            <Text style={styles.modeHint}>{pickerFor === "from" ? "Sorted by your highest balance" : "All Uniswap-supported tokens"}</Text>

            {showPickerSkeleton ? (
              Array.from({ length: 5 }).map((_, index) => (
                <View key={`skeleton_${index}`} style={styles.sheetRow}>
                  <View style={styles.skeletonIcon} />
                  <View style={styles.skeletonTextWrap}>
                    <View style={styles.skeletonLinePrimary} />
                    <View style={styles.skeletonLineSecondary} />
                  </View>
                  <View style={styles.skeletonAmount} />
                </View>
              ))
            ) : filteredList.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>No currencies found</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={styles.sheetList}>
                {filteredList.map((item) => {
                  const price = pickerPrices.get(item.symbol.toUpperCase()) ?? null;
                  const fiatValue = price != null ? PriceService.formatValue(item.amount * price, currency) : "";
                  const networkName = EthersClient.getNetworkConfig(item.chainId)?.name || "Unknown network";
                  const isActive = (pickerFor === "from" && fromToken?.id === item.id) || (pickerFor === "to" && toToken?.id === item.id);

                  return (
                    <TouchableOpacity key={item.id} style={styles.sheetRow} onPress={() => onSelectSymbol(item)} activeOpacity={0.8}>
                      <CurrencyIcon symbol={item.symbol} color={item.color} />
                      <View style={styles.sheetRowInfo}>
                        <Text style={styles.sheetRowLabel}>{item.symbol}</Text>
                        <Text style={styles.sheetRowSubLabel} numberOfLines={1}>{item.name} on {networkName}</Text>
                      </View>
                      <View style={styles.sheetRowRight}>
                        <Text style={styles.sheetRowAmount} numberOfLines={1}>{item.amountFormatted}</Text>
                        <Text style={styles.sheetRowValue} numberOfLines={1}>{fiatValue || " "}</Text>
                      </View>
                      {isActive ? <Ionicons name="checkmark-circle" size={18} color={accentColor} /> : null}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F1512" },
  content: { flex: 1, paddingHorizontal: 16, paddingBottom: 90 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  headerTitle: { color: "#FFFFFF", fontSize: 24, fontWeight: "700" },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 4 },
  chainBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#1D2822", borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: "#2A3A31" },
  chainDot: { width: 8, height: 8, borderRadius: 4 },
  chainBtnText: { color: "#D1D5DB", fontSize: 13, fontWeight: "600" },
  settingsBtn: { padding: 8 },
  settingsPanel: { backgroundColor: "#141B17", borderWidth: 1, borderColor: "#1F2A24", borderRadius: 14, padding: 14, marginBottom: 12 },
  settingsLabel: { color: "#9CA3AF", fontSize: 12, fontWeight: "600", marginBottom: 8 },
  slippageRow: { flexDirection: "row", gap: 8 },
  slippageBtn: { flex: 1, backgroundColor: "#1D2822", borderRadius: 8, paddingVertical: 8, alignItems: "center" },
  slippageBtnText: { color: "#9CA3AF", fontSize: 13, fontWeight: "600" },
  card: { backgroundColor: "#141B17", borderWidth: 1, borderColor: "#1F2A24", borderRadius: 20, padding: 16 },
  cardLabel: { color: "#9CA3AF", fontSize: 14, marginBottom: 10 },
  cardMainRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  amountInput: { flex: 1, color: "#FFFFFF", fontSize: 24, fontWeight: "700", paddingVertical: 4 },
  amountDisplay: { color: "#FFFFFF", fontSize: 24, fontWeight: "700", paddingVertical: 4 },
  fiatText: { color: "#9CA3AF", fontSize: 14, marginTop: 8, minHeight: 20 },
  arrowWrap: { alignItems: "center", marginVertical: 12 },
  arrowButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#1D2822", borderWidth: 1, borderColor: "#2A3A31", alignItems: "center", justifyContent: "center" },
  detailsCard: { backgroundColor: "#141B17", borderWidth: 1, borderColor: "#1F2A24", borderRadius: 14, padding: 14, marginTop: 12, gap: 8 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  detailLabel: { color: "#9CA3AF", fontSize: 12 },
  detailValue: { color: "#E5E7EB", fontSize: 12, fontWeight: "600" },
  errorText: { color: "#EF4444", fontSize: 12, textAlign: "center", marginTop: 8 },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 12 },
  statusText: { color: "#9CA3AF", fontSize: 13 },
  successRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 12 },
  successText: { color: "#10B981", fontSize: 13, fontWeight: "600" },
  swapButton: { marginTop: 16, borderRadius: 16, paddingVertical: 16, alignItems: "center", justifyContent: "center" },
  swapButtonText: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
  tokenPill: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#1D2822", borderWidth: 1, borderColor: "#2A3A31", borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12 },
  tokenIcon: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  tokenIconText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
  tokenLabel: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  sheetBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.48)" },
  sheet: { backgroundColor: "#121915", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderColor: "#26342C" },
  sheetHandle: { alignSelf: "center", width: 44, height: 4, borderRadius: 4, backgroundColor: "#3A4A41", marginBottom: 14 },
  sheetTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "700", marginBottom: 12 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: "#26342C", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10, backgroundColor: "#151E19" },
  searchInput: { flex: 1, color: "#FFFFFF", fontSize: 14, paddingVertical: 0 },
  favoritesSection: { marginBottom: 10 },
  favoritesLabel: { color: "#9CA3AF", fontSize: 12, fontWeight: "600", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.6 },
  favoritesRow: { gap: 10, paddingRight: 8 },
  favoriteIconButton: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: "#2A3A31", alignItems: "center", justifyContent: "center", backgroundColor: "#171F1A" },
  favoriteIconButtonActive: { borderColor: "#4B7B62", backgroundColor: "#1D2A23" },
  modeHint: { color: "#8FA398", fontSize: 12, marginBottom: 4 },
  sheetList: { maxHeight: 420 },
  sheetRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#1E2A24" },
  sheetRowInfo: { flex: 1, minWidth: 0 },
  sheetRowLabel: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
  sheetRowSubLabel: { color: "#9CA3AF", fontSize: 12, marginTop: 2 },
  sheetRowRight: { alignItems: "flex-end", minWidth: 88 },
  sheetRowAmount: { color: "#E5E7EB", fontSize: 14, fontWeight: "600" },
  sheetRowValue: { color: "#9CA3AF", fontSize: 12, marginTop: 2 },
  skeletonIcon: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#25322B" },
  skeletonTextWrap: { flex: 1, gap: 6 },
  skeletonLinePrimary: { width: "34%", height: 10, borderRadius: 8, backgroundColor: "#25322B" },
  skeletonLineSecondary: { width: "58%", height: 8, borderRadius: 8, backgroundColor: "#1E2A24" },
  skeletonAmount: { width: 56, height: 10, borderRadius: 8, backgroundColor: "#25322B" },
  emptyWrap: { paddingVertical: 18, alignItems: "center" },
  emptyText: { color: "#9CA3AF", fontSize: 14 },
});
