import { ChainId, EthersClient } from "@/app/profiles/client";
import { ChainBadgeMini, PriceChart } from "@/components/ui";
import { useNativePrice, useTokenPrice } from "@/hooks/use-prices";
import { ERC20Service } from "@/services/erc20";
import { PriceService } from "@/services/price";
import {
  TokenBalance,
  useSelectedAccount,
  useTokenBalances,
  useWalletStore,
} from "@/store/wallet";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// Simple token metadata type
interface SimpleTokenMetadata {
  name: string;
  symbol: string;
  decimals: number;
}

export default function TokenDetailsScreen() {
  const router = useRouter();
  const { address: tokenAddress, chainId: chainIdParam } =
    useLocalSearchParams<{ address: string; chainId?: string }>();
  const selectedAccount = useSelectedAccount();
  const storeChainId = useWalletStore((s) => s.selectedChainId);
  const tokenBalances = useTokenBalances(); // Use the hook instead of direct store access

  // Use chainId from params if provided, otherwise fall back to store's selectedChainId
  const selectedChainId = useMemo(() => {
    if (chainIdParam) {
      const parsed = parseInt(chainIdParam, 10);
      console.log(
        `[TokenDetails] Parsed chainId from params: ${parsed}, valid: ${Object.values(ChainId).includes(parsed)}`,
      );
      if (!isNaN(parsed) && Object.values(ChainId).includes(parsed)) {
        return parsed as ChainId;
      }
    }
    console.log(`[TokenDetails] Using store chainId: ${storeChainId}`);
    return storeChainId;
  }, [chainIdParam, storeChainId]);

  const [balance, setBalance] = useState<string>("0");
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [chartRefreshTrigger, setChartRefreshTrigger] = useState(0);

  // Token metadata from chain
  const [tokenMetadata, setTokenMetadata] =
    useState<SimpleTokenMetadata | null>(null);

  const networkConfig = EthersClient.getNetworkConfig(selectedChainId);

  // Check if this is native token (special address or no address)
  const isNativeToken =
    !tokenAddress || tokenAddress === "native" || tokenAddress === "0x";

  // Price hooks
  const { price: nativePrice, refresh: refreshNativePrice } =
    useNativePrice(selectedChainId);
  const { price: tokenPrice, refresh: refreshTokenPrice } = useTokenPrice(
    tokenMetadata?.symbol || "",
    isNativeToken ? undefined : tokenAddress,
    selectedChainId,
  );

  // Get the appropriate price
  const price = isNativeToken ? nativePrice : tokenPrice;

  // Calculate USD value
  const valueUsd = useMemo(() => {
    if (!price) return null;
    const balanceNum = parseFloat(balance);
    if (isNaN(balanceNum)) return null;
    return balanceNum * price;
  }, [balance, price]);

  // Debug log
  useEffect(() => {
    console.log(
      `[TokenDetails] tokenAddress: ${tokenAddress}, chainIdParam: ${chainIdParam}, selectedChainId: ${selectedChainId}, network: ${networkConfig?.name}`,
    );
  }, [tokenAddress, chainIdParam, selectedChainId, networkConfig]);

  // Find token info from balances
  useEffect(() => {
    if (isNativeToken) {
      // Native token
      if (networkConfig) {
        setTokenMetadata({
          name: networkConfig.nativeCurrency.name,
          symbol: networkConfig.nativeCurrency.symbol,
          decimals: networkConfig.nativeCurrency.decimals,
        });
      }
    } else {
      // ERC20 token - check from existing balances first (match by BOTH address AND chainId)
      const foundBalance = tokenBalances.find(
        (t: TokenBalance) =>
          t.address.toLowerCase() === tokenAddress?.toLowerCase() &&
          t.chainId === selectedChainId,
      );

      if (foundBalance) {
        setTokenMetadata({
          name: foundBalance.name,
          symbol: foundBalance.symbol,
          decimals: foundBalance.decimals,
        });
      } else if (tokenAddress && selectedChainId) {
        // Fetch metadata from chain if not in balances
        ERC20Service.getTokenMetadata(tokenAddress, selectedChainId).then(
          (metadata) => {
            if (metadata) {
              setTokenMetadata({
                name: metadata.name,
                symbol: metadata.symbol,
                decimals: metadata.decimals,
              });
            }
          },
        );
      }
    }
  }, [
    tokenAddress,
    isNativeToken,
    selectedChainId,
    networkConfig,
    tokenBalances,
  ]);

  // Get balance
  useEffect(() => {
    if (!selectedAccount) return;

    if (isNativeToken) {
      console.log(
        `[TokenDetails] Fetching native balance for ${selectedAccount.address} on chain ${selectedChainId}`,
      );
      EthersClient.getNativeBalance(selectedAccount.address, selectedChainId)
        .then((bal: bigint) => {
          const formatted = EthersClient.fromWei(bal);
          console.log(`[TokenDetails] Native balance fetched: ${formatted}`);
          setBalance(formatted);
        })
        .catch((error) => {
          console.error(
            `[TokenDetails] Failed to fetch native balance:`,
            error,
          );
        });
    } else if (tokenAddress) {
      // Match by BOTH address AND chainId
      const tokenBalance = tokenBalances.find(
        (t: TokenBalance) =>
          t.address.toLowerCase() === tokenAddress.toLowerCase() &&
          t.chainId === selectedChainId,
      );
      if (tokenBalance) {
        setBalance(tokenBalance.balanceFormatted);
      } else {
        // Fetch from chain
        ERC20Service.getFormattedBalance(
          tokenAddress,
          selectedAccount.address,
          tokenMetadata?.decimals || 18,
          selectedChainId,
        ).then(setBalance);
      }
    }
  }, [
    selectedAccount,
    tokenAddress,
    isNativeToken,
    selectedChainId,
    tokenBalances,
    tokenMetadata,
  ]);

  const onRefresh = useCallback(async () => {
    if (!selectedAccount) return;
    setRefreshing(true);

    try {
      // Refresh balances
      if (isNativeToken) {
        const bal = await EthersClient.getNativeBalance(
          selectedAccount.address,
          selectedChainId,
        );
        setBalance(EthersClient.fromWei(bal));
      } else if (tokenAddress && tokenMetadata) {
        const bal = await ERC20Service.getFormattedBalance(
          tokenAddress,
          selectedAccount.address,
          tokenMetadata.decimals,
          selectedChainId,
        );
        setBalance(bal);
      }

      // Refresh prices (force fresh API call)
      if (isNativeToken) {
        refreshNativePrice();
      } else {
        refreshTokenPrice();
      }

      // Trigger chart refresh
      setChartRefreshTrigger((prev) => prev + 1);
    } catch (error) {
      console.error("Failed to refresh balance:", error);
    }

    setRefreshing(false);
  }, [
    selectedAccount,
    tokenAddress,
    isNativeToken,
    selectedChainId,
    tokenMetadata,
    refreshNativePrice,
    refreshTokenPrice,
  ]);

  const handleCopyAddress = async () => {
    if (selectedAccount) {
      await Clipboard.setStringAsync(selectedAccount.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopyTokenAddress = async () => {
    if (tokenAddress && !isNativeToken) {
      await Clipboard.setStringAsync(tokenAddress);
      Alert.alert("Copied", "Token contract address copied to clipboard");
    }
  };

  const handleShare = async () => {
    if (!selectedAccount) return;
    try {
      await Share.share({
        message: `My ${tokenMetadata?.symbol || "wallet"} address: ${selectedAccount.address}`,
      });
    } catch (error) {
      console.error("Share failed:", error);
    }
  };

  const handleSend = () => {
    if (isNativeToken) {
      router.push({
        pathname: "/send",
        params: { chainId: selectedChainId },
      });
    } else {
      router.push({
        pathname: "/send",
        params: { tokenAddress, chainId: selectedChainId },
      });
    }
  };

  const handleViewOnExplorer = () => {
    if (!networkConfig?.blockExplorerUrl) return;

    const url = isNativeToken
      ? `${networkConfig.blockExplorerUrl}/address/${selectedAccount?.address}`
      : `${networkConfig.blockExplorerUrl}/token/${tokenAddress}`;

    // In a real app, use Linking.openURL(url)
    Alert.alert("Open Explorer", url);
  };

  const formatBalance = (bal: string) => {
    const num = parseFloat(bal);
    if (num === 0) return "0";
    if (num < 0.0001) return "< 0.0001";
    if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(2)}K`;
    return num.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 6,
    });
  };

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 10)}...${addr.slice(-8)}`;
  };

  if (!tokenMetadata) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Token Details</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{tokenMetadata.symbol}</Text>
        <TouchableOpacity onPress={handleViewOnExplorer}>
          <Ionicons name="open-outline" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#FFFFFF"
          />
        }
      >
        {/* Token Icon & Name */}
        <View style={styles.tokenHeader}>
          <View style={styles.tokenIcon}>
            <Text style={styles.tokenIconText}>
              {tokenMetadata.symbol.slice(0, 2).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.tokenName}>{tokenMetadata.name}</Text>
          <Text style={styles.tokenSymbol}>{tokenMetadata.symbol}</Text>
        </View>

        {/* Balance Section */}
        <View style={styles.balanceSection}>
          <Text style={styles.balanceLabel}>Your Balance</Text>
          {valueUsd !== null && (
            <Text style={styles.balanceUsd}>
              {PriceService.formatValue(valueUsd)}
            </Text>
          )}
          <Text style={styles.balanceValue}>
            {formatBalance(balance)} {tokenMetadata.symbol}
          </Text>
          {price && (
            <Text style={styles.priceLabel}>
              1 {tokenMetadata.symbol} = {PriceService.formatPrice(price)}
            </Text>
          )}
        </View>

        {/* Price Chart */}
        <View style={styles.chartSection}>
          <PriceChart
            symbol={tokenMetadata.symbol}
            height={180}
            showTimeRangeSelector={true}
            initialTimeRange="1W"
            refreshTrigger={chartRefreshTrigger}
          />
        </View>

        {/* Action Buttons */}
        <View style={styles.actions}>
          <ActionButton icon="arrow-up" label="Send" onPress={handleSend} />
          <ActionButton
            icon="arrow-down"
            label="Receive"
            onPress={() => setShowQR(true)}
          />
          <ActionButton
            icon="share-outline"
            label="Share"
            onPress={handleShare}
          />
        </View>

        {/* QR Code Section (collapsible) */}
        {showQR && selectedAccount && (
          <View style={styles.qrSection}>
            <Text style={styles.sectionTitle}>
              Receive {tokenMetadata.symbol}
            </Text>
            <View style={styles.qrPlaceholder}>
              <Ionicons name="qr-code-outline" size={120} color="#6B7280" />
              <Text style={styles.qrHint}>
                Scan to receive {tokenMetadata.symbol}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.addressContainer}
              onPress={handleCopyAddress}
            >
              <Text style={styles.addressText}>{selectedAccount.address}</Text>
              <Ionicons
                name={copied ? "checkmark-circle" : "copy-outline"}
                size={20}
                color={copied ? "#10B981" : "#569F8C"}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.hideQrButton}
              onPress={() => setShowQR(false)}
            >
              <Text style={styles.hideQrText}>Hide QR Code</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Token Info Section */}
        <View style={styles.infoSection}>
          <Text style={styles.sectionTitle}>Token Info</Text>

          <InfoRow label="Name" value={tokenMetadata.name} />
          <InfoRow label="Symbol" value={tokenMetadata.symbol} />
          <InfoRow label="Decimals" value={tokenMetadata.decimals.toString()} />
          <InfoRow label="Network" value={networkConfig?.name || "Unknown"} />

          {!isNativeToken && tokenAddress && (
            <TouchableOpacity onPress={handleCopyTokenAddress}>
              <InfoRow
                label="Contract"
                value={formatAddress(tokenAddress)}
                showCopy
              />
            </TouchableOpacity>
          )}
        </View>

        {/* Network Badge */}
        <View style={styles.networkSection}>
          <View style={styles.networkBadge}>
            <ChainBadgeMini chainId={selectedChainId} size="medium" />
            <Text style={styles.networkText}>{networkConfig?.name}</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.actionButton} onPress={onPress}>
      <View style={styles.actionIcon}>
        <Ionicons name={icon} size={24} color="#FFFFFF" />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function InfoRow({
  label,
  value,
  showCopy = false,
}: {
  label: string;
  value: string;
  showCopy?: boolean;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <View style={styles.infoValueContainer}>
        <Text style={styles.infoValue}>{value}</Text>
        {showCopy && <Ionicons name="copy-outline" size={14} color="#6B7280" />}
      </View>
    </View>
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
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: "#6B7280",
    fontSize: 16,
  },
  tokenHeader: {
    alignItems: "center",
    paddingVertical: 32,
  },
  tokenIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#374151",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  tokenIconText: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "700",
  },
  tokenName: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 4,
  },
  tokenSymbol: {
    color: "#9CA3AF",
    fontSize: 16,
  },
  balanceSection: {
    alignItems: "center",
    paddingVertical: 24,
    marginHorizontal: 16,
    backgroundColor: "#1E2E29",
    borderRadius: 16,
    marginBottom: 24,
  },
  balanceLabel: {
    color: "#9CA3AF",
    fontSize: 14,
    marginBottom: 8,
  },
  balanceUsd: {
    color: "#10B981",
    fontSize: 36,
    fontWeight: "700",
    marginBottom: 4,
  },
  balanceValue: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "600",
  },
  priceLabel: {
    color: "#9CA3AF",
    fontSize: 12,
    marginTop: 8,
  },
  chartSection: {
    marginHorizontal: 16,
    marginBottom: 24,
    paddingVertical: 16,
    backgroundColor: "#1E2E29",
    borderRadius: 16,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: 16,
    marginBottom: 32,
  },
  actionButton: {
    alignItems: "center",
  },
  actionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#569F8C",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  actionLabel: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
  },
  qrSection: {
    alignItems: "center",
    marginHorizontal: 16,
    padding: 24,
    backgroundColor: "#1E2E29",
    borderRadius: 16,
    marginBottom: 24,
  },
  qrContainer: {
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    marginVertical: 16,
  },
  qrPlaceholder: {
    padding: 24,
    backgroundColor: "#374151",
    borderRadius: 12,
    marginVertical: 16,
    alignItems: "center",
  },
  qrHint: {
    color: "#9CA3AF",
    fontSize: 14,
    marginTop: 12,
  },
  addressContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#374151",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  addressText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontFamily: "monospace",
    flex: 1,
  },
  hideQrButton: {
    marginTop: 16,
    padding: 8,
  },
  hideQrText: {
    color: "#569F8C",
    fontSize: 14,
    fontWeight: "500",
  },
  infoSection: {
    marginHorizontal: 16,
    padding: 16,
    backgroundColor: "#1E2E29",
    borderRadius: 16,
    marginBottom: 24,
  },
  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
  },
  infoLabel: {
    color: "#9CA3AF",
    fontSize: 14,
  },
  infoValueContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  infoValue: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
  },
  networkSection: {
    alignItems: "center",
    paddingVertical: 24,
  },
  networkBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#1E2E29",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  networkText: {
    color: "#9CA3AF",
    fontSize: 14,
  },
});
