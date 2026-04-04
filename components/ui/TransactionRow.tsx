import { Transaction } from "@/store/wallet";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface TransactionRowProps {
  transaction: Transaction;
  currentAddress: string;
  onPress?: () => void;
}

export function TransactionRow({
  transaction,
  currentAddress,
  onPress,
}: TransactionRowProps) {
  const isSent =
    transaction.from.toLowerCase() === currentAddress.toLowerCase();
  const isReceived =
    transaction.to.toLowerCase() === currentAddress.toLowerCase();

  const getIcon = () => {
    if (transaction.status === "pending") return "time-outline";
    if (transaction.status === "failed") return "close-circle-outline";

    // Tap-to-pay transactions get a special icon
    if (transaction.paymentMethod === "tap-to-pay") {
      return isReceived ? "receipt-outline" : "phone-portrait-outline";
    }

    if (isSent) return "arrow-up-outline";
    if (isReceived) return "arrow-down-outline";
    return "swap-horizontal-outline";
  };

  const getIconColor = () => {
    if (transaction.status === "pending") return "#F59E0B";
    if (transaction.status === "failed") return "#EF4444";
    if (isSent) return "#EF4444";
    if (isReceived) return "#10B981";
    return "#6B7280";
  };

  const getTitle = () => {
    if (transaction.type === "approve") return "Approve";
    if (transaction.type === "swap") return "Swap";

    // Check for payment request (received via Zap Pay)
    if (transaction.paymentMethod === "tap-to-pay") {
      if (isReceived) return "Payment Received";
      if (isSent) return "Zap Pay";
    }

    if (isSent) return "Sent";
    if (isReceived) return "Received";
    return "Transaction";
  };

  const getSubtitle = () => {
    // Show merchant name for tap-to-pay transactions
    if (
      transaction.paymentMethod === "tap-to-pay" &&
      transaction.merchantName
    ) {
      return transaction.merchantName;
    }

    return isSent
      ? `To ${formatAddress(transaction.to)}`
      : `From ${formatAddress(transaction.from)}`;
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatValue = (value: string) => {
    const num = parseFloat(value);
    if (num === 0) return "0";
    if (num < 0.0001) return "< 0.0001";
    return num.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 6,
    });
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const Container = onPress ? TouchableOpacity : View;

  return (
    <Container style={styles.container} onPress={onPress} activeOpacity={0.7}>
      <View
        style={[
          styles.iconContainer,
          { backgroundColor: `${getIconColor()}20` },
        ]}
      >
        <Ionicons name={getIcon()} size={24} color={getIconColor()} />
      </View>

      <View style={styles.info}>
        <Text style={styles.title}>{getTitle()}</Text>
        <Text style={styles.address}>{getSubtitle()}</Text>
      </View>

      <View style={styles.valueContainer}>
        <Text
          style={[
            styles.value,
            isSent ? styles.sentValue : styles.receivedValue,
          ]}
        >
          {isSent ? "-" : "+"}
          {formatValue(transaction.value)} {transaction.tokenSymbol || "ETH"}
        </Text>
        <Text style={styles.time}>{formatTime(transaction.timestamp)}</Text>
      </View>
    </Container>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "transparent",
    borderRadius: 16,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  info: {
    flex: 1,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  address: {
    color: "#9CA3AF",
    fontSize: 14,
  },
  valueContainer: {
    alignItems: "flex-end",
  },
  value: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  sentValue: {
    color: "#EF4444",
  },
  receivedValue: {
    color: "#10B981",
  },
  time: {
    color: "#6B7280",
    fontSize: 12,
  },
});
