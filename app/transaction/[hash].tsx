import { DEFAULT_NETWORKS, EthersClient } from "@/app/profiles/client";
import { useNativePrice } from "@/hooks/use-prices";
import { PriceService } from "@/services/price";
import { tintedBackground, useAccentColor } from "@/store/appearance";
import { useSelectedCurrency } from "@/store/currency";
import { Transaction, getSolanaChainKey, useWalletStore } from "@/store/wallet";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo } from "react";
import {
    Alert,
    Linking,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const SOLANA_EXPLORER: Record<number, (hash: string) => string> = {
  [getSolanaChainKey("dynamic-mainnet")]: (hash) => `https://solscan.io/tx/${hash}`,
  [getSolanaChainKey("dynamic-testnet")]: (hash) => `https://solscan.io/tx/${hash}?cluster=devnet`,
};

export default function TransactionDetailsScreen() {
  const accentColor = useAccentColor();
  const bg = tintedBackground("#000000");
  const router = useRouter();
  const { hash } = useLocalSearchParams<{ hash: string }>();

  const getTransaction = useWalletStore((s) => s.getTransaction);
  const pendingTransactions = useWalletStore((s) => s.pendingTransactions);

  // Find transaction in store or pending
  const transaction = useMemo(() => {
    if (!hash) return null;

    // Check pending first
    const pending = pendingTransactions.find((tx) => tx.hash === hash);
    if (pending) return pending;

    // Check confirmed transactions
    return getTransaction(hash);
  }, [hash, pendingTransactions, getTransaction]);

  if (!transaction) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Transaction</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Transaction not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const networkConfig = DEFAULT_NETWORKS[transaction.chainId];
  const currency = useSelectedCurrency();
  const { price: nativePrice } = useNativePrice(transaction.chainId);
  const solanaExplorerFn = SOLANA_EXPLORER[transaction.chainId as number];
  const explorerUrl = solanaExplorerFn
    ? solanaExplorerFn(transaction.hash)
    : EthersClient.getExplorerTxUrl(transaction.hash, transaction.chainId);

  const handleViewInExplorer = () => {
    if (explorerUrl) {
      Linking.openURL(explorerUrl);
    } else {
      Alert.alert(
        "No Explorer",
        "No block explorer available for this network",
      );
    }
  };

  const handleCopyHash = async () => {
    await Clipboard.setStringAsync(transaction.hash);
    Alert.alert("Copied", "Transaction hash copied to clipboard");
  };

  const handleCopyAddress = async (address: string) => {
    await Clipboard.setStringAsync(address);
    Alert.alert("Copied", "Address copied to clipboard");
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 10)}...${address.slice(-8)}`;
  };

  const formatHash = (txHash: string) => {
    return `${txHash.slice(0, 14)}...${txHash.slice(-12)}`;
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const formatGwei = (wei?: string) => {
    if (!wei) return "-";
    const gwei = Number(wei) / 1e9;
    return `${gwei.toFixed(2)} Gwei`;
  };

  const formatEth = (wei?: string) => {
    if (!wei) return "-";
    const eth = Number(wei) / 1e18;
    return `${eth.toFixed(6)} ${networkConfig?.nativeCurrency.symbol || "ETH"}`;
  };

  const getStatusColor = (status: Transaction["status"]) => {
    switch (status) {
      case "confirmed":
        return "#10B981";
      case "pending":
        return "#F59E0B";
      case "failed":
        return "#EF4444";
    }
  };

  const getStatusIcon = (status: Transaction["status"]) => {
    switch (status) {
      case "confirmed":
        return "checkmark-circle";
      case "pending":
        return "time";
      case "failed":
        return "close-circle";
    }
  };

  const getTypeLabel = (type: Transaction["type"]) => {
    switch (type) {
      case "send":
        return "Sent";
      case "receive":
        return "Received";
      case "swap":
        return "Swap";
      case "approve":
        return "Approval";
      default:
        return "Transaction";
    }
  };

  // Calculate gas cost
  const gasCost = useMemo(() => {
    if (!transaction.gasUsed) return null;

    const gasPrice = transaction.gasPrice || transaction.maxFeePerGas;
    if (!gasPrice) return null;

    const cost = BigInt(transaction.gasUsed) * BigInt(gasPrice);
    return EthersClient.fromWei(cost.toString());
  }, [transaction]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Transaction Details</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content}>
        {/* Status Card */}
        <View style={styles.statusCard}>
          <View
            style={[
              styles.statusIcon,
              { backgroundColor: getStatusColor(transaction.status) + "20" },
            ]}
          >
            <Ionicons
              name={getStatusIcon(transaction.status)}
              size={32}
              color={getStatusColor(transaction.status)}
            />
          </View>
          <Text style={styles.statusLabel}>
            {transaction.status.charAt(0).toUpperCase() +
              transaction.status.slice(1)}
          </Text>
          <Text style={styles.typeLabel}>{getTypeLabel(transaction.type)}</Text>

          <Text style={styles.amount}>
            {transaction.type === "send" ? "-" : "+"}
            {transaction.value}{" "}
            {transaction.tokenSymbol ||
              networkConfig?.nativeCurrency.symbol ||
              "ETH"}
          </Text>
          {!transaction.tokenSymbol && nativePrice && (
            <Text style={styles.amountFiat}>
              ≈{" "}
              {PriceService.formatValue(
                parseFloat(transaction.value) * nativePrice,
                currency,
              )}
            </Text>
          )}

          <Text style={styles.timestamp}>
            {formatTimestamp(transaction.timestamp)}
          </Text>
        </View>

        {/* Itemized Receipt Table (NFC payments only) - FIRST */}
        {transaction.paymentMethod === "tap-to-pay" &&
          transaction.itemizedList &&
          transaction.itemizedList.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Receipt</Text>
              <View style={styles.receiptTable}>
                <View style={styles.receiptHeader}>
                  <Text style={styles.receiptHeaderItem}>Item</Text>
                  <Text style={styles.receiptHeaderQty}>Qty</Text>
                  <Text style={styles.receiptHeaderPrice}>Price</Text>
                </View>
                {transaction.itemizedList.map((item, index) => (
                  <View key={index} style={styles.receiptRow}>
                    <Text style={styles.receiptItemName}>{item.name}</Text>
                    <Text style={styles.receiptItemQty}>
                      {item.quantity || 1}
                    </Text>
                    <Text style={styles.receiptItemPrice}>{item.price}</Text>
                  </View>
                ))}
                <View style={styles.receiptTotalRow}>
                  <Text style={styles.receiptTotalLabel}>Total</Text>
                  <Text style={styles.receiptTotalValue}>
                    {transaction.value}{" "}
                    {transaction.tokenSymbol ||
                      networkConfig?.nativeCurrency.symbol ||
                      "ETH"}
                  </Text>
                </View>
              </View>
            </View>
          )}

        {/* Merchant Details Section (NFC payments only) - SECOND */}
        {transaction.paymentMethod === "tap-to-pay" &&
          transaction.merchantName && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Merchant</Text>
              <DetailRow label="Name" value={transaction.merchantName} />
              {transaction.merchantLocation && (
                <DetailRow
                  label="Location"
                  value={transaction.merchantLocation}
                />
              )}
              {transaction.description && (
                <DetailRow
                  label="Description"
                  value={transaction.description}
                />
              )}
            </View>
          )}

        {/* Payment Method Section */}
        {transaction.paymentMethod && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Payment Method</Text>
            <DetailRow
              label="Type"
              value={
                transaction.paymentMethod === "tap-to-pay"
                  ? "⚡ Zap Pay"
                  : "💸 Manual Transfer"
              }
            />
            {transaction.contractAddress && (
              <DetailRow
                label="Contract"
                value={formatAddress(transaction.contractAddress)}
                onCopy={() => handleCopyAddress(transaction.contractAddress!)}
              />
            )}
          </View>
        )}

        {/* Details Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Details</Text>

          <DetailRow
            label="Transaction Hash"
            value={formatHash(transaction.hash)}
            onCopy={() => handleCopyHash()}
            fullValue={transaction.hash}
          />

          <DetailRow
            label="From"
            value={formatAddress(transaction.from)}
            onCopy={() => handleCopyAddress(transaction.from)}
            fullValue={transaction.from}
          />

          <DetailRow
            label="To"
            value={formatAddress(transaction.to)}
            onCopy={() => handleCopyAddress(transaction.to)}
            fullValue={transaction.to}
          />

          <DetailRow
            label="Network"
            value={networkConfig?.name || `Chain ${transaction.chainId}`}
          />

          {transaction.blockNumber && (
            <DetailRow
              label="Block"
              value={transaction.blockNumber.toString()}
            />
          )}

          {transaction.nonce !== undefined && (
            <DetailRow label="Nonce" value={transaction.nonce.toString()} />
          )}

          {transaction.tokenAddress && (
            <DetailRow
              label="Token Contract"
              value={formatAddress(transaction.tokenAddress)}
              onCopy={() => handleCopyAddress(transaction.tokenAddress!)}
            />
          )}
        </View>

        {/* Gas Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Gas</Text>

          {transaction.gasLimit && (
            <DetailRow
              label="Gas Limit"
              value={parseInt(transaction.gasLimit).toLocaleString()}
            />
          )}

          {transaction.gasUsed && (
            <DetailRow
              label="Gas Used"
              value={parseInt(transaction.gasUsed).toLocaleString()}
            />
          )}

          {transaction.gasPrice && (
            <DetailRow
              label="Gas Price"
              value={formatGwei(transaction.gasPrice)}
            />
          )}

          {transaction.maxFeePerGas && (
            <DetailRow
              label="Max Fee"
              value={formatGwei(transaction.maxFeePerGas)}
            />
          )}

          {transaction.maxPriorityFeePerGas && (
            <DetailRow
              label="Priority Fee"
              value={formatGwei(transaction.maxPriorityFeePerGas)}
            />
          )}

          {gasCost && (
            <DetailRow
              label="Total Gas Cost"
              value={`${gasCost} ${networkConfig?.nativeCurrency.symbol || "ETH"}`}
              highlight
            />
          )}
        </View>

        {/* Timestamps Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Timestamps</Text>

          <DetailRow
            label="Submitted"
            value={formatTimestamp(transaction.timestamp)}
          />

          {transaction.confirmedAt && (
            <DetailRow
              label="Confirmed"
              value={formatTimestamp(transaction.confirmedAt)}
            />
          )}
        </View>

        {/* View in Explorer Button */}
        {explorerUrl && (
          <TouchableOpacity
            style={[styles.explorerButton, { borderColor: accentColor }]}
            onPress={handleViewInExplorer}
          >
            <Ionicons name="open-outline" size={20} color={accentColor} />
            <Text style={[styles.explorerButtonText, { color: accentColor }]}>
              View in Block Explorer
            </Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailRow({
  label,
  value,
  onCopy,
  fullValue,
  highlight,
}: {
  label: string;
  value: string;
  onCopy?: () => void;
  fullValue?: string;
  highlight?: boolean;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <View style={styles.detailValueContainer}>
        <Text
          style={[styles.detailValue, highlight && styles.detailValueHighlight]}
          numberOfLines={1}
          ellipsizeMode="middle"
        >
          {value}
        </Text>
        {onCopy && (
          <TouchableOpacity onPress={onCopy} style={styles.copyButton}>
            <Ionicons name="copy-outline" size={16} color="#9CA3AF" />
          </TouchableOpacity>
        )}
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
    padding: 16,
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
  statusCard: {
    backgroundColor: "#1E2E29",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    marginBottom: 24,
  },
  statusIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  statusLabel: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 4,
  },
  typeLabel: {
    color: "#9CA3AF",
    fontSize: 14,
    marginBottom: 16,
  },
  amount: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 4,
  },
  amountFiat: {
    color: "#9CA3AF",
    fontSize: 16,
    marginBottom: 8,
  },
  timestamp: {
    color: "#6B7280",
    fontSize: 14,
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
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
    gap: 12,
  },
  detailLabel: {
    color: "#9CA3AF",
    fontSize: 14,
    flexShrink: 0,
  },
  detailValueContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    justifyContent: "flex-end",
  },
  detailValue: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "monospace",
    flexShrink: 1,
    textAlign: "right",
  },
  detailValueHighlight: {
    color: "#10B981",
    fontWeight: "600",
  },
  copyButton: {
    padding: 4,
  },
  explorerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#1E2E29",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#569F8C",
  },
  explorerButtonText: {
    color: "#569F8C",
    fontSize: 16,
    fontWeight: "600",
  },
  // Receipt table styles
  receiptTable: {
    backgroundColor: "#0F1512",
    borderRadius: 12,
    overflow: "hidden",
  },
  receiptHeader: {
    flexDirection: "row",
    backgroundColor: "#374151",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  receiptHeaderItem: {
    flex: 2,
    color: "#9CA3AF",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  receiptHeaderQty: {
    width: 50,
    color: "#9CA3AF",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    textAlign: "center",
  },
  receiptHeaderPrice: {
    width: 80,
    color: "#9CA3AF",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    textAlign: "right",
  },
  receiptRow: {
    flexDirection: "row",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
  },
  receiptItemName: {
    flex: 2,
    color: "#FFFFFF",
    fontSize: 14,
  },
  receiptItemQty: {
    width: 50,
    color: "#9CA3AF",
    fontSize: 14,
    textAlign: "center",
  },
  receiptItemPrice: {
    width: 80,
    color: "#FFFFFF",
    fontSize: 14,
    textAlign: "right",
    fontWeight: "500",
  },
  receiptTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 12,
    backgroundColor: "#1E2E29",
  },
  receiptTotalLabel: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  receiptTotalValue: {
    color: "#10B981",
    fontSize: 16,
    fontWeight: "700",
  },
});
