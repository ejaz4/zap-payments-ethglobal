import { Input } from "@/components/ui";
import {
  CARD_BACKGROUNDS,
  CardBackground,
  useWalletStore,
} from "@/store/wallet";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Image,
  ImageSourcePropType,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// Card background images
const CARD_BACKGROUND_IMAGES: Record<CardBackground, ImageSourcePropType> = {
  "card-background-1": require("@/assets/images/backgrounds/card-background-1.png"),
  "card-background-2": require("@/assets/images/backgrounds/card-background-2.png"),
};

// Background display names
const CARD_BACKGROUND_NAMES: Record<CardBackground, string> = {
  "card-background-1": "Gradient Blue",
  "card-background-2": "Gradient Purple",
};

export default function AccountDetailScreen() {
  const router = useRouter();
  const { address } = useLocalSearchParams<{ address: string }>();

  const accounts = useWalletStore((s) => s.accounts);
  const selectedIndex = useWalletStore((s) => s.selectedAccountIndex);
  const updateAccountName = useWalletStore((s) => s.updateAccountName);
  const updateAccountBackground = useWalletStore(
    (s) => s.updateAccountBackground,
  );
  const removeAccount = useWalletStore((s) => s.removeAccount);
  const setSelectedAccountIndex = useWalletStore(
    (s) => s.setSelectedAccountIndex,
  );

  const account = accounts.find((a) => a.address === address);
  const accountIndex = accounts.findIndex((a) => a.address === address);

  const [name, setName] = useState(account?.name || "");
  const [hasChanges, setHasChanges] = useState(false);

  if (!account) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Account Not Found</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Account not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const currentBackground =
    account.cardBackground ||
    CARD_BACKGROUNDS[account.index % CARD_BACKGROUNDS.length];

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 10)}...${addr.slice(-8)}`;
  };

  const handleNameChange = (newName: string) => {
    setName(newName);
    setHasChanges(newName !== account.name);
  };

  const handleSaveName = () => {
    if (name.trim() && name !== account.name) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      updateAccountName(account.address, name.trim());
      setHasChanges(false);
    }
  };

  const handleSelectBackground = (background: CardBackground) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateAccountBackground(account.address, background);
  };

  const handleDeleteAccount = () => {
    if (accounts.length <= 1) {
      Alert.alert(
        "Cannot Delete",
        "You must have at least one account in your wallet.",
      );
      return;
    }

    Alert.alert(
      "Delete Account",
      `Are you sure you want to remove "${account.name}" from your wallet?\n\nThis will only remove the account from this app. Your funds will remain safe and you can re-import the account later.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

            // If deleting the selected account, switch to first account
            if (accountIndex === selectedIndex) {
              setSelectedAccountIndex(0);
            } else if (accountIndex < selectedIndex) {
              // Adjust selected index if deleting an account before it
              setSelectedAccountIndex(selectedIndex - 1);
            }

            removeAccount(account.address);
            router.back();
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
        >
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Account Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content}>
        {/* Account Preview */}
        <View style={styles.previewSection}>
          <View style={styles.accountIcon}>
            <Ionicons
              name={account.isImported ? "key-outline" : "wallet-outline"}
              size={32}
              color="#FFFFFF"
            />
          </View>
          <Text style={styles.previewName}>{name || account.name}</Text>
          <Text style={styles.previewAddress}>
            {formatAddress(account.address)}
          </Text>
          {account.isImported && (
            <View style={styles.importedBadge}>
              <Ionicons name="key" size={12} color="#F59E0B" />
              <Text style={styles.importedText}>Imported</Text>
            </View>
          )}
        </View>

        {/* Account Name */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Name</Text>
          <View style={styles.nameInputRow}>
            <View style={styles.nameInputWrapper}>
              <Input
                placeholder="Account name"
                value={name}
                onChangeText={handleNameChange}
              />
            </View>
            {hasChanges && (
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSaveName}
              >
                <Ionicons name="checkmark" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Card Background */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Card Background</Text>
          <View style={styles.backgroundGrid}>
            {CARD_BACKGROUNDS.map((bg) => (
              <TouchableOpacity
                key={bg}
                style={[
                  styles.backgroundOption,
                  currentBackground === bg && styles.backgroundSelected,
                ]}
                onPress={() => handleSelectBackground(bg)}
              >
                <Image
                  source={CARD_BACKGROUND_IMAGES[bg]}
                  style={styles.backgroundPreview}
                />
                <Text style={styles.backgroundName}>
                  {CARD_BACKGROUND_NAMES[bg]}
                </Text>
                {currentBackground === bg && (
                  <View style={styles.selectedCheck}>
                    <Ionicons
                      name="checkmark-circle"
                      size={24}
                      color="#10B981"
                    />
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Danger Zone */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, styles.dangerTitle]}>
            Danger Zone
          </Text>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={handleDeleteAccount}
          >
            <Ionicons name="trash-outline" size={20} color="#EF4444" />
            <Text style={styles.deleteButtonText}>Remove Account</Text>
          </TouchableOpacity>
          <Text style={styles.deleteHint}>
            This will only remove the account from this app. Your funds are safe
            and you can re-import the account at any time.
          </Text>
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
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: "#6B7280",
    fontSize: 16,
  },
  previewSection: {
    alignItems: "center",
    paddingVertical: 24,
    marginBottom: 16,
  },
  accountIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#374151",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  previewName: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 8,
  },
  previewAddress: {
    color: "#6B7280",
    fontSize: 14,
    fontFamily: "monospace",
  },
  importedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#422006",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginTop: 12,
    gap: 6,
  },
  importedText: {
    color: "#F59E0B",
    fontSize: 12,
    fontWeight: "600",
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: "#9CA3AF",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  nameInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  nameInputWrapper: {
    flex: 1,
  },
  saveButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#10B981",
    alignItems: "center",
    justifyContent: "center",
  },
  backgroundGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  backgroundOption: {
    width: "48%",
    aspectRatio: 1.6,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 3,
    borderColor: "transparent",
  },
  backgroundSelected: {
    borderColor: "#10B981",
  },
  backgroundPreview: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  backgroundName: {
    position: "absolute",
    bottom: 8,
    left: 8,
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  selectedCheck: {
    position: "absolute",
    top: 8,
    right: 8,
  },
  dangerTitle: {
    color: "#EF4444",
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1E2E29",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#EF4444",
    gap: 8,
  },
  deleteButtonText: {
    color: "#EF4444",
    fontSize: 16,
    fontWeight: "600",
  },
  deleteHint: {
    color: "#6B7280",
    fontSize: 12,
    textAlign: "center",
    marginTop: 12,
    lineHeight: 18,
  },
});
