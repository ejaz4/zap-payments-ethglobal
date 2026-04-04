import { EthersClient } from "@/app/profiles/client";
import { Button } from "@/components/ui";
import { useSelectedAccount, useWalletStore } from "@/store/wallet";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Share, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ShowAddressScreen() {
  const router = useRouter();
  const selectedAccount = useSelectedAccount();
  const selectedChainId = useWalletStore((s) => s.selectedChainId);
  const networkConfig = EthersClient.getNetworkConfig(selectedChainId);

  const [copied, setCopied] = useState(false);

  const copyAddress = async () => {
    if (selectedAccount) {
      await Clipboard.setStringAsync(selectedAccount.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const shareAddress = async () => {
    if (selectedAccount) {
      await Share.share({
        message: selectedAccount.address,
        title: "My Wallet Address",
      });
    }
  };

  if (!selectedAccount) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No wallet found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Show Address</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        <View style={styles.qrContainer}>
          <QRCode
            value={JSON.stringify({
              chainId: selectedChainId.toString(),
              address: selectedAccount.address,
              network: "ethereum",
            })}
            size={180}
            backgroundColor="#FFFFFF"
            color="#000000"
          />
        </View>

        <Text style={styles.networkLabel}>
          {networkConfig?.name || "Ethereum"} Network
        </Text>

        <View style={styles.addressContainer}>
          <Text style={styles.addressLabel}>Your Address</Text>
          <Text style={styles.address}>{selectedAccount.address}</Text>
        </View>

        <View style={styles.warningBox}>
          <Ionicons name="warning-outline" size={20} color="#F59E0B" />
          <Text style={styles.warningText}>
            Only send {networkConfig?.nativeCurrency.symbol || "ETH"} and tokens
            on {networkConfig?.name || "Ethereum"} to this address
          </Text>
        </View>

        <View style={styles.actions}>
          <Button
            title={copied ? "Copied!" : "Copy Address"}
            onPress={copyAddress}
            variant={copied ? "secondary" : "primary"}
          />
          <Button title="Share" variant="outline" onPress={shareAddress} />
        </View>
      </View>
    </SafeAreaView>
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
    padding: 24,
    alignItems: "center",
  },
  qrContainer: {
    padding: 24,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    marginBottom: 24,
  },
  networkLabel: {
    color: "#9CA3AF",
    fontSize: 14,
    marginBottom: 16,
  },
  addressContainer: {
    width: "100%",
    backgroundColor: "#1E2E29",
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
  },
  addressLabel: {
    color: "#6B7280",
    fontSize: 12,
    marginBottom: 8,
  },
  address: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "monospace",
    lineHeight: 22,
  },
  warningBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    padding: 16,
    borderRadius: 12,
    gap: 12,
    marginBottom: 24,
    width: "100%",
  },
  warningText: {
    flex: 1,
    color: "#F59E0B",
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    width: "100%",
    gap: 12,
    marginTop: "auto",
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
});
