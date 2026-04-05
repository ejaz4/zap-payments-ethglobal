import { useAccentColor, tintedBackground } from "@/store/appearance";
import { useWalletStore } from "@/store/wallet";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function AccountsScreen() {
  const accentColor = useAccentColor();
  const bg = tintedBackground(accentColor);
  const router = useRouter();
  const accounts = useWalletStore((s) => s.accounts);
  const selectedIndex = useWalletStore((s) => s.selectedAccountIndex);
  const setSelectedIndex = useWalletStore((s) => s.setSelectedAccountIndex);
  const setIsAddingAccount = useWalletStore((s) => s.setIsAddingAccount);

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const handleSelectAccount = (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedIndex(index);
    router.back();
  };

  const handleOpenAccountSettings = (address: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/settings/account/${address}` as any);
  };

  const handleAddAccount = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsAddingAccount(true);
    router.push("/onboarding/welcome" as any);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Accounts</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content}>
        {accounts.map((account, index) => (
          <View key={account.address} style={styles.accountRowContainer}>
            <TouchableOpacity
              style={[
                styles.accountRow,
                index === selectedIndex && styles.selectedRow,
                index === selectedIndex && { borderColor: accentColor },
              ]}
              onPress={() => handleSelectAccount(index)}
            >
              <View style={styles.accountIcon}>
                <Ionicons
                  name={account.isImported ? "key-outline" : "wallet-outline"}
                  size={24}
                  color="#FFFFFF"
                />
              </View>
              <View style={styles.accountInfo}>
                <Text style={styles.accountName}>{account.name}</Text>
                <Text style={styles.accountAddress}>
                  {formatAddress(account.address)}
                </Text>
              </View>
              {index === selectedIndex && (
                <Ionicons name="checkmark-circle" size={24} color="#10B981" />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.settingsButton}
              onPress={() => handleOpenAccountSettings(account.address)}
            >
              <Ionicons name="settings-outline" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
        ))}

        <View style={styles.addButtons}>
          <TouchableOpacity style={styles.addButton} onPress={handleAddAccount}>
            <Ionicons name="add-circle-outline" size={24} color={accentColor} />
            <Text style={[styles.addButtonText, { color: accentColor }]}>Add Account</Text>
          </TouchableOpacity>
        </View>

        {/* Zap Contract Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment Settings</Text>
          <TouchableOpacity
            style={styles.settingsRow}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/settings/zap-contract" as any);
            }}
          >
            <View style={styles.settingsRowIcon}>
              <Ionicons
                name="hardware-chip-outline"
                size={24}
                color="#8B5CF6"
              />
            </View>
            <View style={styles.settingsRowContent}>
              <Text style={styles.settingsRowTitle}>Zap Contract</Text>
              <Text style={styles.settingsRowSubtitle}>
                Manage your payment terminal contract
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#6B7280" />
          </TouchableOpacity>
        </View>
      </ScrollView>
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
    padding: 16,
  },
  accountRowContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  accountRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1E2E29",
    padding: 16,
    borderRadius: 16,
  },
  selectedRow: {
    borderWidth: 2,
    borderColor: "#569F8C",
  },
  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#1E2E29",
    alignItems: "center",
    justifyContent: "center",
  },
  accountIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#374151",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  accountInfo: {
    flex: 1,
  },
  accountName: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  accountAddress: {
    color: "#6B7280",
    fontSize: 14,
  },
  addButtons: {
    marginTop: 16,
    gap: 8,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1E2E29",
    padding: 16,
    borderRadius: 16,
    gap: 12,
  },
  addButtonText: {
    color: "#569F8C",
    fontSize: 16,
    fontWeight: "600",
  },
  section: {
    marginTop: 32,
  },
  sectionTitle: {
    color: "#9CA3AF",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 12,
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1E2E29",
    padding: 16,
    borderRadius: 16,
    gap: 12,
  },
  settingsRowIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#8B5CF620",
    alignItems: "center",
    justifyContent: "center",
  },
  settingsRowContent: {
    flex: 1,
  },
  settingsRowTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  settingsRowSubtitle: {
    color: "#6B7280",
    fontSize: 13,
  },
});
