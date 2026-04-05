import { ChainId, DEFAULT_NETWORKS, EthersClient } from "@/app/profiles/client";
import { getAllDefaultTokens, getTokenKey } from "@/config/tokens";
import { usePrices, useTokenPrice } from "@/hooks/use-prices";
import { PriceService } from "@/services/price";
import { hexToRgba, tintedBackground, useAccentColor } from "@/store/appearance";
import { useSelectedCurrency } from "@/store/currency";
import { useTokenStore } from "@/store/tokens";
import { useSelectedAccount, useWalletStore } from "@/store/wallet";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import {
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
  color: string;
  isFavorite: boolean;
  popularity: number;
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

export default function SwapScreen() {
  const insets = useSafeAreaInsets();
  const accentColor = useAccentColor();
  const bg = tintedBackground(accentColor);
  const currency = useSelectedCurrency();
  const selectedAccount = useSelectedAccount();
  const allNativeBalances = useWalletStore((s) => s.nativeBalances);
  const allTokenBalances = useWalletStore((s) => s.tokenBalances);
  const favoriteTokens = useTokenStore((s) => s.favoriteTokens);

  const [fromAmount, setFromAmount] = useState("0.00");
  const [toAmount, setToAmount] = useState("0.00");
  const [fromTokenId, setFromTokenId] = useState<string | null>(null);
  const [toTokenId, setToTokenId] = useState<string | null>(null);
  const [pickerFor, setPickerFor] = useState<PickerFor | null>(null);
  const [search, setSearch] = useState("");
  const accentSurface = hexToRgba(accentColor, 0.18);
  const accentBorder = hexToRgba(accentColor, 0.38);

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

  const currencies = useMemo<CurrencyItem[]>(() => {
    if (!selectedAccount?.address) return [];

    const addressLower = selectedAccount.address.toLowerCase();
    const seen = new Set<string>();
    const items: CurrencyItem[] = [];

    for (const [key, value] of Object.entries(allNativeBalances)) {
      const sep = key.lastIndexOf("_");
      if (sep < 0) continue;
      const accountAddress = key.slice(0, sep);
      if (accountAddress.toLowerCase() !== addressLower) continue;

      const chainId = Number(key.slice(sep + 1)) as ChainId;
      const amount = Number(value || "0");
      if (!Number.isFinite(amount) || amount <= 0) continue;

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
        color: symbolColor(symbol),
        isFavorite: false,
        popularity: popularityMap.get(symbol.toUpperCase()) || 1,
      });
    }

    for (const [key, balances] of Object.entries(allTokenBalances)) {
      const sep = key.lastIndexOf("_");
      if (sep < 0) continue;
      const accountAddress = key.slice(0, sep);
      if (accountAddress.toLowerCase() !== addressLower) continue;

      for (const token of balances) {
        const amount = Number(token.balanceFormatted || "0");
        if (!Number.isFinite(amount) || amount <= 0) continue;

        const tokenId = `token_${token.chainId}_${token.address.toLowerCase()}`;
        if (seen.has(tokenId)) continue;
        seen.add(tokenId);

        const favoriteKey = getTokenKey(token.address, token.chainId);
        const color =
          defaultColorByKey.get(favoriteKey) || token.logoUri || symbolColor(token.symbol);

        items.push({
          id: tokenId,
          symbol: token.symbol,
          name: token.name,
          amount,
          amountFormatted: amountToText(amount),
          chainId: token.chainId,
          address: token.address,
          color,
          isFavorite: favoriteTokens.has(favoriteKey),
          popularity: popularityMap.get(token.symbol.toUpperCase()) || 1,
        });
      }
    }

    return items;
  }, [
    selectedAccount?.address,
    allNativeBalances,
    allTokenBalances,
    defaultColorByKey,
    favoriteTokens,
    popularityMap,
  ]);

  const byAmount = useMemo(
    () =>
      [...currencies].sort(
        (a, b) => b.amount - a.amount || a.symbol.localeCompare(b.symbol),
      ),
    [currencies],
  );

  const byPopularity = useMemo(
    () =>
      [...currencies].sort(
        (a, b) =>
          b.popularity - a.popularity ||
          b.amount - a.amount ||
          a.symbol.localeCompare(b.symbol),
      ),
    [currencies],
  );

  useEffect(() => {
    if (!fromTokenId && byAmount.length > 0) {
      setFromTokenId(byAmount[0].id);
    }
    if (!toTokenId && byPopularity.length > 0) {
      const fallback =
        byPopularity.find((item) => item.id !== (byAmount[0]?.id || "")) ||
        byPopularity[0];
      setToTokenId(fallback.id);
    }
  }, [fromTokenId, toTokenId, byAmount, byPopularity]);

  useEffect(() => {
    if (fromTokenId && !currencies.some((item) => item.id === fromTokenId)) {
      setFromTokenId(byAmount[0]?.id || null);
    }
    if (toTokenId && !currencies.some((item) => item.id === toTokenId)) {
      setToTokenId(byPopularity[0]?.id || null);
    }
  }, [fromTokenId, toTokenId, currencies, byAmount, byPopularity]);

  const fromToken = useMemo(
    () => currencies.find((item) => item.id === fromTokenId) || byAmount[0] || null,
    [currencies, fromTokenId, byAmount],
  );

  const toToken = useMemo(
    () => currencies.find((item) => item.id === toTokenId) || byPopularity[0] || null,
    [currencies, toTokenId, byPopularity],
  );

  const { price: fromPrice } = useTokenPrice(
    fromToken?.symbol || "ETH",
    fromToken?.address,
    fromToken?.chainId,
  );
  const { price: toPrice } = useTokenPrice(
    toToken?.symbol || "USDC",
    toToken?.address,
    toToken?.chainId,
  );

  const pickerBaseList = pickerFor === "from" ? byAmount : byPopularity;
  const pickerTokensForPrices = useMemo(
    () =>
      pickerBaseList.map((item) => ({
        symbol: item.symbol,
        address: item.address,
        chainId: item.chainId,
      })),
    [pickerBaseList],
  );
  const { prices: pickerPrices, loading: pickerPricesLoading } = usePrices(
    pickerTokensForPrices,
  );

  const filteredList = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return pickerBaseList;
    return pickerBaseList.filter(
      (item) =>
        item.symbol.toLowerCase().includes(query) ||
        item.name.toLowerCase().includes(query),
    );
  }, [pickerBaseList, search]);

  const favoriteList = useMemo(() => {
    const source = search.trim() ? filteredList : pickerBaseList;
    return source.filter((item) => item.isFavorite);
  }, [pickerBaseList, filteredList, search]);

  const showPickerSkeleton =
    pickerFor !== null && pickerPricesLoading && pickerBaseList.length > 0;

  const fromFiat = useMemo(
    () => formatFiat(fromAmount, fromPrice, currency),
    [fromAmount, fromPrice, currency],
  );
  const toFiat = useMemo(
    () => formatFiat(toAmount, toPrice, currency),
    [toAmount, toPrice, currency],
  );

  const onSelectSymbol = (item: CurrencyItem) => {
    if (pickerFor === "from") {
      setFromTokenId(item.id);
    } else if (pickerFor === "to") {
      setToTokenId(item.id);
    }
    setSearch("");
    setPickerFor(null);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}> 
      <View style={[styles.content, { paddingTop: insets.top + 12 }]}> 
        <Text style={styles.headerTitle}>Swap</Text>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>You pay</Text>
          <View style={styles.cardMainRow}>
            <TextInput
              value={fromAmount}
              onChangeText={setFromAmount}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor="#6B7280"
              style={styles.amountInput}
            />
            <TokenPill item={fromToken} accentColor={accentColor} onPress={() => setPickerFor("from")} />
          </View>
          <Text style={styles.fiatText}>{fromFiat ? `≈ ${fromFiat}` : " "}</Text>
        </View>

        <View style={styles.arrowWrap}>
          <View style={[styles.arrowButton, { backgroundColor: accentSurface, borderColor: accentBorder }]}>
            <Ionicons name="arrow-down" size={20} color="#FFFFFF" />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>You receive</Text>
          <View style={styles.cardMainRow}>
            <TextInput
              value={toAmount}
              onChangeText={setToAmount}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor="#6B7280"
              style={styles.amountInput}
            />
            <TokenPill item={toToken} accentColor={accentColor} onPress={() => setPickerFor("to")} />
          </View>
          <Text style={styles.fiatText}>{toFiat ? `≈ ${toFiat}` : " "}</Text>
        </View>
      </View>

      <Modal
        visible={pickerFor !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerFor(null)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setPickerFor(null)}>
          <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Select token</Text>
            <View style={styles.searchRow}>
              <Ionicons name="search" size={16} color="#9CA3AF" />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search token"
                placeholderTextColor="#6B7280"
                style={styles.searchInput}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {favoriteList.length > 0 && (
              <View style={styles.favoritesSection}>
                <Text style={styles.favoritesLabel}>Favorites</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.favoritesRow}>
                  {favoriteList.map((item) => (
                    <TouchableOpacity
                      key={`favorite_${item.id}`}
                      style={[
                        styles.favoriteIconButton,
                        ((pickerFor === "from" && fromToken?.id === item.id) ||
                          (pickerFor === "to" && toToken?.id === item.id)) &&
                          styles.favoriteIconButtonActive,
                      ]}
                      onPress={() => onSelectSymbol(item)}
                      activeOpacity={0.8}
                    >
                      <CurrencyIcon symbol={item.symbol} color={item.color} />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            <Text style={styles.modeHint}>
              {pickerFor === "from"
                ? "Sorted by your highest balance"
                : "Sorted by token popularity"}
            </Text>

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
                  const fiatValue =
                    price != null
                      ? PriceService.formatValue(item.amount * price, currency)
                      : "";
                  const networkName =
                    EthersClient.getNetworkConfig(item.chainId)?.name || "Unknown network";
                  const isActive =
                    (pickerFor === "from" && fromToken?.id === item.id) ||
                    (pickerFor === "to" && toToken?.id === item.id);

                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.sheetRow}
                      onPress={() => onSelectSymbol(item)}
                      activeOpacity={0.8}
                    >
                      <CurrencyIcon symbol={item.symbol} color={item.color} />
                      <View style={styles.sheetRowInfo}>
                        <Text style={styles.sheetRowLabel}>{item.symbol}</Text>
                        <Text style={styles.sheetRowSubLabel} numberOfLines={1}>
                          {item.name} on {networkName}
                        </Text>
                      </View>
                      <View style={styles.sheetRowRight}>
                        <Text style={styles.sheetRowAmount} numberOfLines={1}>
                          {item.amountFormatted}
                        </Text>
                        <Text style={styles.sheetRowValue} numberOfLines={1}>
                          {fiatValue || " "}
                        </Text>
                      </View>
                      {isActive ? (
                        <Ionicons name="checkmark-circle" size={18} color={accentColor} />
                      ) : null}
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
  container: {
    flex: 1,
    backgroundColor: "#0F1512",
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 90,
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 16,
  },
  card: {
    backgroundColor: "#141B17",
    borderWidth: 1,
    borderColor: "#1F2A24",
    borderRadius: 20,
    padding: 16,
  },
  cardLabel: {
    color: "#9CA3AF",
    fontSize: 14,
    marginBottom: 10,
  },
  cardMainRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  amountInput: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "700",
    paddingVertical: 4,
  },
  fiatText: {
    color: "#9CA3AF",
    fontSize: 14,
    marginTop: 8,
    minHeight: 20,
  },
  arrowWrap: {
    alignItems: "center",
    marginVertical: 12,
  },
  arrowButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#1D2822",
    borderWidth: 1,
    borderColor: "#2A3A31",
    alignItems: "center",
    justifyContent: "center",
  },
  tokenPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#1D2822",
    borderWidth: 1,
    borderColor: "#2A3A31",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  tokenIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  tokenIconText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  tokenLabel: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.48)",
  },
  sheet: {
    backgroundColor: "#121915",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: "#26342C",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 44,
    height: 4,
    borderRadius: 4,
    backgroundColor: "#3A4A41",
    marginBottom: 14,
  },
  sheetTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#26342C",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
    backgroundColor: "#151E19",
  },
  searchInput: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 14,
    paddingVertical: 0,
  },
  favoritesSection: {
    marginBottom: 10,
  },
  favoritesLabel: {
    color: "#9CA3AF",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  favoritesRow: {
    gap: 10,
    paddingRight: 8,
  },
  favoriteIconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "#2A3A31",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#171F1A",
  },
  favoriteIconButtonActive: {
    borderColor: "#4B7B62",
    backgroundColor: "#1D2A23",
  },
  modeHint: {
    color: "#8FA398",
    fontSize: 12,
    marginBottom: 4,
  },
  sheetList: {
    maxHeight: 420,
  },
  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1E2A24",
  },
  sheetRowInfo: {
    flex: 1,
    minWidth: 0,
  },
  sheetRowLabel: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  sheetRowSubLabel: {
    color: "#9CA3AF",
    fontSize: 12,
    marginTop: 2,
  },
  sheetRowRight: {
    alignItems: "flex-end",
    minWidth: 88,
  },
  sheetRowAmount: {
    color: "#E5E7EB",
    fontSize: 14,
    fontWeight: "600",
  },
  sheetRowValue: {
    color: "#9CA3AF",
    fontSize: 12,
    marginTop: 2,
  },
  skeletonIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#25322B",
  },
  skeletonTextWrap: {
    flex: 1,
    gap: 6,
  },
  skeletonLinePrimary: {
    width: "34%",
    height: 10,
    borderRadius: 8,
    backgroundColor: "#25322B",
  },
  skeletonLineSecondary: {
    width: "58%",
    height: 8,
    borderRadius: 8,
    backgroundColor: "#1E2A24",
  },
  skeletonAmount: {
    width: 56,
    height: 10,
    borderRadius: 8,
    backgroundColor: "#25322B",
  },
  emptyWrap: {
    paddingVertical: 18,
    alignItems: "center",
  },
  emptyText: {
    color: "#9CA3AF",
    fontSize: 14,
  },
});