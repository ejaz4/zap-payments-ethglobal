import { useColorScheme } from "@/hooks/use-color-scheme";
import { WalletService } from "@/services/wallet";
import { hexToRgba, tintedBackground, useAccentColor } from "@/store/appearance";
import { getCurrencyInfo, useSelectedCurrency } from "@/store/currency";
import { useSelectedAccount, useWalletStore } from "@/store/wallet";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function SettingsScreen() {
  const router = useRouter();
  const selectedAccount = useSelectedAccount();
  const hasBackedUp = useWalletStore((s) => s.hasBackedUp);
  const accentColor = useAccentColor();
  const scheme = useColorScheme() ?? "dark";
  const isLight = scheme === "light";
  const bg = tintedBackground(accentColor);
  const textPrimary = isLight ? "#11181C" : "#FFFFFF";
  const textSecondary = isLight ? "#64748B" : "#6B7280";
  const sectionLabel = isLight ? "#475569" : "#6B7280";
  const rowIcon = isLight ? "#334155" : "#FFFFFF";
  const selectedCurrency = useSelectedCurrency();
  const currencyInfo = getCurrencyInfo(selectedCurrency);
  const rowAccentStyle = {
    backgroundColor: hexToRgba(accentColor, 0.14),
    borderColor: hexToRgba(accentColor, 0.28),
    borderWidth: 1,
  };

  const handleShowRecoveryPhrase = async () => {
    Alert.alert(
      "Show Recovery Phrase",
      "Your recovery phrase grants full access to your wallet. Make sure no one is watching.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Show",
          style: "destructive",
          onPress: async () => {
            const mnemonic = await WalletService.getMnemonic();
            if (mnemonic) {
              Alert.alert("Recovery Phrase", mnemonic);
            } else {
              Alert.alert(
                "Error",
                "No recovery phrase found. This wallet may have been imported with a private key.",
              );
            }
          },
        },
      ],
    );
  };

  const handleResetWallet = () => {
    Alert.alert(
      "Reset Wallet",
      "This will delete all wallet data from this device. Make sure you have backed up your recovery phrase!",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            await WalletService.resetWallet();
            router.replace("/onboarding/welcome" as any);
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: textPrimary }]}>Settings</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 78 }}>
        {/* Appearance Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: sectionLabel }]}>Appearance</Text>

          <TouchableOpacity
            style={[styles.row, rowAccentStyle]}
            onPress={() => router.push("/settings/appearance" as any)}
          >
            <View style={styles.rowLeft}>
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: accentColor,
                }}
              />
              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, { color: textPrimary }]}>Accent Colour</Text>
                <Text style={[styles.rowSubtitle, { color: textSecondary }]}> 
                  {accentColor.toUpperCase()}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#6B7280" />
          </TouchableOpacity>
        </View>

        {/* Merchant Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: sectionLabel }]}>Merchant</Text>

          <TouchableOpacity
            style={[styles.row, rowAccentStyle]}
            onPress={() => router.push("/(tabs)/merchant" as any)}
          >
            <View style={styles.rowLeft}>
              <Ionicons name="storefront-outline" size={24} color={rowIcon} />
              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, { color: textPrimary }]}>Merchant Mode</Text>
                <Text style={[styles.rowSubtitle, { color: textSecondary }]}> 
                  Accept payments, manage products
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#6B7280" />
          </TouchableOpacity>
        </View>

        {/* Account Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: sectionLabel }]}>Account</Text>

          <TouchableOpacity
            style={[styles.row, rowAccentStyle]}
            onPress={() => router.push("/settings/accounts" as any)}
          >
            <View style={styles.rowLeft}>
              <Ionicons name="wallet-outline" size={24} color={rowIcon} />
              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, { color: textPrimary }]}>Manage Accounts</Text>
                <Text style={[styles.rowSubtitle, { color: textSecondary }]}>Add or switch accounts</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#6B7280" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.row, rowAccentStyle, { marginTop: 8 }]}
            onPress={() => router.push("/settings/contacts" as any)}
          >
            <View style={styles.rowLeft}>
              <Ionicons name="people-outline" size={24} color={rowIcon} />
              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, { color: textPrimary }]}>Contacts</Text>
                <Text style={[styles.rowSubtitle, { color: textSecondary }]}>Manage saved addresses</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#6B7280" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.row, rowAccentStyle, { marginTop: 8 }]}
            onPress={() => router.push("/settings/ens" as any)}
          >
            <View style={styles.rowLeft}>
              <Ionicons name="finger-print-outline" size={24} color={accentColor} />
              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, { color: textPrimary }]}>ENS Identity</Text>
                <Text style={[styles.rowSubtitle, { color: textSecondary }]}>Manage your .eth name and records</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#6B7280" />
          </TouchableOpacity>
        </View>

        {/* Security Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: sectionLabel }]}>Security</Text>

          <TouchableOpacity
            style={[styles.row, rowAccentStyle]}
            onPress={handleShowRecoveryPhrase}
          >
            <View style={styles.rowLeft}>
              <Ionicons name="key-outline" size={24} color={rowIcon} />
              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, { color: textPrimary }]}>Recovery Phrase</Text>
                <Text style={[styles.rowSubtitle, { color: textSecondary }]}>View your secret phrase</Text>
              </View>
            </View>
            {!hasBackedUp && (
              <View style={styles.warningBadge}>
                <Ionicons name="warning" size={16} color="#F59E0B" />
              </View>
            )}
            <Ionicons name="chevron-forward" size={20} color="#6B7280" />
          </TouchableOpacity>
        </View>

        {/* Network Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: sectionLabel }]}>Network</Text>

          <TouchableOpacity
            style={[styles.row, rowAccentStyle]}
            onPress={() => router.push("/settings/networks" as any)}
          >
            <View style={styles.rowLeft}>
              <Ionicons name="globe-outline" size={24} color={rowIcon} />
              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, { color: textPrimary }]}>Network Settings</Text>
                <Text style={[styles.rowSubtitle, { color: textSecondary }]}> 
                  Configure RPC URLs and networks
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#6B7280" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.row, rowAccentStyle, { marginTop: 8 }]}
            onPress={() => router.push("/settings/currency" as any)}
          >
            <View style={styles.rowLeft}>
              <Ionicons name="cash-outline" size={24} color={rowIcon} />
              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, { color: textPrimary }]}>Display Currency</Text>
                <Text style={[styles.rowSubtitle, { color: textSecondary }]}> 
                  {currencyInfo.flag} {currencyInfo.name} ({currencyInfo.symbol})
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#6B7280" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.row, rowAccentStyle, { marginTop: 8 }]}
            onPress={() => router.push("/settings/gas" as any)}
          >
            <View style={styles.rowLeft}>
              <Ionicons name="flame-outline" size={24} color={rowIcon} />
              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, { color: textPrimary }]}>Gas Settings</Text>
                <Text style={[styles.rowSubtitle, { color: textSecondary }]}> 
                  Configure gas speed and limits
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#6B7280" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.row, rowAccentStyle, { marginTop: 8 }]}
            onPress={() => router.push("/settings/tokens" as any)}
          >
            <View style={styles.rowLeft}>
              <Ionicons name="layers-outline" size={24} color={rowIcon} />
              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, { color: textPrimary }]}>Token List</Text>
                <Text style={[styles.rowSubtitle, { color: textSecondary }]}> 
                  Manage and import ERC20 tokens
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#6B7280" />
          </TouchableOpacity>
        </View>

        {/* API Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: sectionLabel }]}>API Provider</Text>

          <TouchableOpacity
            style={[styles.row, rowAccentStyle]}
            onPress={() => router.push("/settings/api" as any)}
          >
            <View style={styles.rowLeft}>
              <Ionicons name="cloud-outline" size={24} color={rowIcon} />
              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, { color: textPrimary }]}>API Settings</Text>
                <Text style={[styles.rowSubtitle, { color: textSecondary }]}> 
                  Configure external API base URL
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#6B7280" />
          </TouchableOpacity>
        </View>

        {/* About Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: sectionLabel }]}>About</Text>

          <View style={[styles.row, rowAccentStyle]}>
            <View style={styles.rowLeft}>
              <Ionicons
                name="information-circle-outline"
                size={24}
                color={rowIcon}
              />
              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, { color: textPrimary }]}>Version</Text>
                <Text style={[styles.rowSubtitle, { color: textSecondary }]}>1.0.0</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Danger Zone */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: sectionLabel }]}>Danger Zone</Text>

          <TouchableOpacity
            style={styles.dangerRow}
            onPress={handleResetWallet}
          >
            <Ionicons name="trash-outline" size={24} color="#EF4444" />
            <Text style={styles.dangerText}>Reset Wallet</Text>
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
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: "#6B7280",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1E2E29",
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginHorizontal: 16,
    marginBottom: 1,
    borderRadius: 12,
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  rowText: {
    marginLeft: 16,
    flex: 1,
  },
  rowTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 2,
  },
  rowSubtitle: {
    color: "#6B7280",
    fontSize: 14,
  },
  warningBadge: {
    marginRight: 8,
  },
  dangerRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginHorizontal: 16,
    borderRadius: 12,
    gap: 16,
  },
  dangerText: {
    color: "#EF4444",
    fontSize: 16,
    fontWeight: "500",
  },
});
