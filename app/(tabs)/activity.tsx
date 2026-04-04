import { TransactionRow } from "@/components/ui";
import {
  useSelectedAccount,
  useTransactions,
  useWalletStore,
} from "@/store/wallet";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

export default function ActivityScreen() {
  const router = useRouter();
  const selectedAccount = useSelectedAccount();
  const transactions = useTransactions();
  const pendingTxs = useWalletStore((s) => s.pendingTransactions);
  const insets = useSafeAreaInsets();

  if (!selectedAccount) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No wallet found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const allTransactions = [
    ...pendingTxs,
    ...transactions.filter((tx) => !pendingTxs.some((p) => p.hash === tx.hash)),
  ];

  return (
    <View style={[{ paddingTop: insets.top }, styles.container]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Activity</Text>
      </View>

      <ScrollView style={styles.content}>
        {allTransactions.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="receipt-outline" size={48} color="#6B7280" />
            </View>
            <Text style={styles.emptyTitle}>No transactions yet</Text>
            <Text style={styles.emptyDescription}>
              Your transaction history will appear here
            </Text>
          </View>
        ) : (
          <View style={styles.transactionList}>
            {allTransactions.map((tx) => (
              <TransactionRow
                key={tx.hash}
                transaction={tx}
                currentAddress={selectedAccount.address}
                onPress={() => {
                  router.push(`/transaction/${tx.hash}` as any);
                }}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F1512",
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1E2E29",
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "700",
  },
  content: {
    flex: 1,
    padding: 16,
  },
  transactionList: {
    gap: 8,
    borderRadius: 25,
    borderColor: "rgba(255,255,255,0.2)",
    borderWidth: 1,
    marginBottom: 32,
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
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#1E2E29",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
  },
  emptyDescription: {
    color: "#6B7280",
    fontSize: 14,
  },
});
