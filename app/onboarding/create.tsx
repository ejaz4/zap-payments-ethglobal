import { Button } from "@/components/ui";
import { WalletService } from "@/services/wallet";
import { useWalletStore } from "@/store/wallet";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Step = "generate" | "backup" | "verify";

export default function CreateWalletScreen() {
  const router = useRouter();
  const accounts = useWalletStore((s) => s.accounts);
  const [step, setStep] = useState<Step>("generate");
  const [mnemonic, setMnemonic] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [revealedWords, setRevealedWords] = useState(false);
  const setHasBackedUp = useWalletStore((s) => s.setHasBackedUp);
  const setIsAddingAccount = useWalletStore((s) => s.setIsAddingAccount);

  // Check if user already has a wallet (adding account mode)
  const isAddingAccount = accounts.length > 0;

  const handleGenerate = async () => {
    setIsLoading(true);
    try {
      if (isAddingAccount) {
        // Create a new independent account with fresh random private key
        const address = await WalletService.createNewAccount();
        if (address) {
          setIsAddingAccount(false);
          router.back(); // Go back to accounts screen
        } else {
          Alert.alert("Error", "Failed to create account.");
        }
      } else {
        // Creating a brand new wallet with mnemonic
        const result = await WalletService.createNewWallet();
        if (result) {
          setMnemonic(result.mnemonic);
          setStep("backup");
        } else {
          Alert.alert("Error", "Failed to create wallet");
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      Alert.alert(
        "Error",
        isAddingAccount
          ? `Failed to create account: ${errorMessage}`
          : "Failed to create wallet",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackupComplete = () => {
    setHasBackedUp(true);
    router.replace("/(tabs)" as any);
  };

  const handleSkipBackup = () => {
    Alert.alert(
      "Skip Backup?",
      "If you lose access to your device, you will lose all funds. We strongly recommend backing up your recovery phrase.",
      [
        { text: "Back Up Now", style: "cancel" },
        {
          text: "Skip",
          style: "destructive",
          onPress: () => router.replace("/(tabs)" as any),
        },
      ],
    );
  };

  const words = mnemonic.split(" ");

  if (step === "generate") {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {isAddingAccount ? "Add Account" : "Create Wallet"}
          </Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <Ionicons
              name={isAddingAccount ? "person-add-outline" : "key-outline"}
              size={64}
              color="#569F8C"
            />
          </View>

          <Text style={styles.title}>
            {isAddingAccount ? "Create New Account" : "Create New Wallet"}
          </Text>
          <Text style={styles.description}>
            {isAddingAccount
              ? "A new account with a unique private key will be generated. This account will be independent from your other accounts."
              : "We'll generate a unique 12-word recovery phrase for you. This phrase is the only way to recover your wallet if you lose access."}
          </Text>

          {!isAddingAccount && (
            <View style={styles.warningBox}>
              <Ionicons name="warning-outline" size={24} color="#F59E0B" />
              <Text style={styles.warningText}>
                Never share your recovery phrase. Anyone with this phrase can
                access your funds.
              </Text>
            </View>
          )}

          {isAddingAccount && (
            <View style={styles.warningBox}>
              <Ionicons
                name="information-circle-outline"
                size={24}
                color="#569F8C"
              />
              <Text style={styles.warningText}>
                The new account will be automatically added to your wallet and
                you can switch between accounts anytime.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.footer}>
          <Button
            title={
              isAddingAccount ? "Create Account" : "Generate Recovery Phrase"
            }
            onPress={handleGenerate}
            loading={isLoading}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (step === "backup") {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setStep("generate")}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Backup Phrase</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView style={styles.scrollContent}>
          <Text style={styles.title}>Your Recovery Phrase</Text>
          <Text style={styles.description}>
            Write down these 12 words in order and store them in a safe place.
          </Text>

          <TouchableOpacity
            style={styles.revealButton}
            onPress={() => setRevealedWords(!revealedWords)}
          >
            <Ionicons
              name={revealedWords ? "eye-off-outline" : "eye-outline"}
              size={20}
              color="#569F8C"
            />
            <Text style={styles.revealText}>
              {revealedWords ? "Hide Words" : "Reveal Words"}
            </Text>
          </TouchableOpacity>

          <View style={styles.wordsContainer}>
            {words.map((word, index) => (
              <View key={index} style={styles.wordBox}>
                <Text style={styles.wordNumber}>{index + 1}</Text>
                <Text style={styles.word}>
                  {revealedWords ? word : "••••••"}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.warningBox}>
            <Ionicons
              name="shield-checkmark-outline"
              size={24}
              color="#10B981"
            />
            <Text style={styles.warningText}>
              Store this phrase offline. Do not take screenshots or store it
              digitally.
            </Text>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Button title="I've Backed It Up" onPress={handleBackupComplete} />
          <Button
            title="Skip for Now"
            variant="ghost"
            onPress={handleSkipBackup}
          />
        </View>
      </SafeAreaView>
    );
  }

  return null;
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
    justifyContent: "center",
  },
  scrollContent: {
    flex: 1,
    padding: 24,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#1E2E29",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    color: "#9CA3AF",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 24,
  },
  warningBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1E2E29",
    padding: 16,
    borderRadius: 12,
    gap: 12,
    marginTop: 16,
  },
  warningText: {
    flex: 1,
    color: "#D1D5DB",
    fontSize: 14,
    lineHeight: 20,
  },
  revealButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 16,
  },
  revealText: {
    color: "#569F8C",
    fontSize: 16,
    fontWeight: "500",
  },
  wordsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 24,
  },
  wordBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1E2E29",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    width: "48%",
  },
  wordNumber: {
    color: "#6B7280",
    fontSize: 14,
    marginRight: 12,
    width: 20,
  },
  word: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "500",
  },
  footer: {
    padding: 24,
    gap: 12,
  },
});
