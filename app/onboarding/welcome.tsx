import { Button } from "@/components/ui";
import { useWalletStore } from "@/store/wallet";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function WelcomeScreen() {
  const router = useRouter();
  const accounts = useWalletStore((s) => s.accounts);
  const setIsAddingAccount = useWalletStore((s) => s.setIsAddingAccount);

  // Check if user already has a wallet (adding account mode)
  const isAddingAccount = accounts.length > 0;

  const handleCancel = () => {
    setIsAddingAccount(false);
    router.back();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <View style={styles.logo}>
            <Ionicons
              name={isAddingAccount ? "person-add" : "flash"}
              size={64}
              color="#569F8C"
            />
          </View>
          <Text style={styles.title}>
            {isAddingAccount ? "Add Account" : "Zap Wallet"}
          </Text>
          <Text style={styles.subtitle}>
            {isAddingAccount
              ? "Create a new account or import an existing one"
              : "Your simple, secure Ethereum wallet"}
          </Text>
        </View>

        {!isAddingAccount && (
          <View style={styles.features}>
            <FeatureRow
              icon="wallet-outline"
              title="Multi-Chain Support"
              description="Ethereum, Polygon, Arbitrum, and more"
            />
            <FeatureRow
              icon="shield-checkmark-outline"
              title="Secure Storage"
              description="Your keys never leave your device"
            />
            <FeatureRow
              icon="flash-outline"
              title="Fast & Simple"
              description="Send and receive crypto in seconds"
            />
          </View>
        )}

        {isAddingAccount && (
          <View style={styles.features}>
            <FeatureRow
              icon="add-circle-outline"
              title="Create New Account"
              description="Derive a new account from your recovery phrase"
            />
            <FeatureRow
              icon="key-outline"
              title="Import Private Key"
              description="Add an account using a private key"
            />
          </View>
        )}

        <View style={styles.buttons}>
          <Button
            title={isAddingAccount ? "Create New Account" : "Create New Wallet"}
            onPress={() => router.push("/onboarding/create" as any)}
          />
          <Button
            title={
              isAddingAccount ? "Import Private Key" : "Import Existing Wallet"
            }
            variant="outline"
            onPress={() => router.push("/onboarding/import" as any)}
          />
          {isAddingAccount && (
            <Button title="Cancel" variant="ghost" onPress={handleCancel} />
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

function FeatureRow({
  icon,
  title,
  description,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
}) {
  return (
    <View style={styles.featureRow}>
      <View style={styles.featureIcon}>
        <Ionicons name={icon} size={24} color="#569F8C" />
      </View>
      <View style={styles.featureText}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDescription}>{description}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F1512",
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: "space-between",
  },
  logoContainer: {
    alignItems: "center",
    marginTop: 60,
  },
  logo: {
    width: 120,
    height: 120,
    borderRadius: 30,
    backgroundColor: "#1E2E29",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#9CA3AF",
    textAlign: "center",
  },
  features: {
    gap: 16,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1E2E29",
    padding: 16,
    borderRadius: 16,
  },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#374151",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  featureDescription: {
    fontSize: 14,
    color: "#9CA3AF",
  },
  buttons: {
    gap: 12,
    marginBottom: 20,
  },
});
