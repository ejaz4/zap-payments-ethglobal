import { Button } from "@/components/ui";
import { dynamicClient } from "@/crypto/dynamic/client";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { WalletService } from "@/services/wallet";
import { tintedBackground, useAccentColor } from "@/store/appearance";
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

type Step = "type" | "generate" | "backup";
type AccountType = "evm" | "solana" | "dynamic";

export default function CreateWalletScreen() {
  const accentColor = useAccentColor();
  const scheme = useColorScheme() ?? "dark";
  const isLight = scheme === "light";
  const bg = tintedBackground("#000000");
  const textPrimary = isLight ? "#11181C" : "#FFFFFF";
  const textMuted = isLight ? "#64748B" : "#9CA3AF";
  const cardBg = isLight ? "#FFFFFF" : "#1E2E29";
  const cardAltBg = isLight ? "#EEF4F1" : "#374151";
  const strongMuted = isLight ? "#334155" : "#D1D5DB";
  const router = useRouter();
  const accounts = useWalletStore((s) => s.accounts);
  const [step, setStep] = useState<Step>("generate");
  const [accountType, setAccountType] = useState<AccountType>("evm");
  const [mnemonic, setMnemonic] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [revealedWords, setRevealedWords] = useState(false);
  const setHasBackedUp = useWalletStore((s) => s.setHasBackedUp);
  const setIsAddingAccount = useWalletStore((s) => s.setIsAddingAccount);

  // In "add account" mode we show the type picker first.
  // For a brand-new wallet setup we skip straight to EVM mnemonic generation.
  const isAddingAccount = accounts.length > 0;

  // Only initialise the step once on mount
  const [initialized, setInitialized] = useState(false);
  if (!initialized) {
    setInitialized(true);
    if (isAddingAccount && step !== "type") setStep("type");
  }

  const handleGenerate = async () => {
    setIsLoading(true);
    try {
      if (isAddingAccount) {
        let address: string | null = null;

        if (accountType === "dynamic") {
          // Check if user already has a Dynamic wallet — if so, they need
          // to sign in with a different identity to get a new one.
          const hasDynamicAlready = accounts.some(
            (a) => a.accountType === "dynamic",
          );

          // If they already have one, log out so the auth UI shows a fresh
          // login (different email/social = different wallet).
          if (hasDynamicAlready && dynamicClient.auth.authenticatedUser) {
            await dynamicClient.auth.logout();
          }

          // Show auth UI if not already authenticated
          if (!dynamicClient.auth.authenticatedUser) {
            await new Promise<void>((resolve, reject) => {
              const cleanup = () => {
                dynamicClient.auth.off("authSuccess", onSuccess);
                dynamicClient.auth.off("authFailed", onFailed);
              };
              const onSuccess = () => { cleanup(); resolve(); };
              const onFailed = (_data: unknown, reason: unknown) => {
                cleanup();
                reject(new Error(typeof reason === "string" ? reason : "Authentication cancelled"));
              };
              dynamicClient.auth.on("authSuccess", onSuccess);
              dynamicClient.auth.on("authFailed", onFailed);
              dynamicClient.ui.auth.show();
            });
          }
          address = await WalletService.createDynamicAccount();
        } else if (accountType === "solana") {
          address = await WalletService.createSolanaAccount();
        } else {
          address = await WalletService.createNewAccount();
        }

        if (address) {
          setIsAddingAccount(false);
          router.back();
        } else {
          Alert.alert("Error", "Failed to create account.");
        }
      } else {
        // Creating a brand new wallet with mnemonic (always EVM)
        const result = await WalletService.createNewWallet();
        if (result) {
          setMnemonic(result.mnemonic);
          setStep("backup");
        } else {
          Alert.alert("Error", "Failed to create wallet");
        }
      }
    } catch (error) {
      Alert.alert(
        "Error",
        error instanceof Error ? error.message : "Unknown error",
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

  // ─── Step: type picker ──────────────────────────────────────────────────────
  if (step === "type") {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: textPrimary }]}>Add Account</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.content}>
          <Text style={[styles.title, { color: textPrimary }]}>Choose account type</Text>
          <Text style={[styles.description, { color: textMuted }]}> 
            Pick the type of account you want to add to your wallet.
          </Text>

          <View style={styles.typeRow}>
            <TouchableOpacity
              style={[
                styles.typeCard,
                { backgroundColor: cardBg },
                accountType === "evm" && styles.typeCardSelected,
                accountType === "evm" && { borderColor: accentColor },
                accountType === "evm" && isLight && { backgroundColor: "#EAF2EE" },
              ]}
              onPress={() => setAccountType("evm")}
              activeOpacity={0.8}
            >
              <Text style={styles.typeIcon}>⛓️</Text>
              <Text style={[styles.typeLabel, { color: textPrimary }]}>EVM</Text>
              <Text style={[styles.typeDesc, { color: textMuted }]}> 
                Ethereum, Base, Arbitrum, Optimism and all EVM-compatible chains
              </Text>
              {accountType === "evm" && (
                <View style={styles.typeCheck}>
                  <Ionicons name="checkmark-circle" size={20} color={accentColor} />
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.typeCard,
                { backgroundColor: cardBg },
                accountType === "solana" && styles.typeCardSelected,
                accountType === "solana" && { borderColor: accentColor },
                accountType === "solana" && isLight && { backgroundColor: "#EAF2EE" },
              ]}
              onPress={() => setAccountType("solana")}
              activeOpacity={0.8}
            >
              <Text style={styles.typeIcon}>☀️</Text>
              <Text style={[styles.typeLabel, { color: textPrimary }]}>Solana</Text>
              <Text style={[styles.typeDesc, { color: textMuted }]}>
                Solana mainnet and devnet via the API provider
              </Text>
              {accountType === "solana" && (
                <View style={styles.typeCheck}>
                  <Ionicons name="checkmark-circle" size={20} color="#9945FF" />
                </View>
              )}
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[
              styles.typeCardWide,
              { backgroundColor: cardBg },
              accountType === "dynamic" && styles.typeCardSelected,
              accountType === "dynamic" && { borderColor: "#F5841F" },
              accountType === "dynamic" && isLight && { backgroundColor: "#FEF3E7" },
            ]}
            onPress={() => setAccountType("dynamic")}
            activeOpacity={0.8}
          >
            <Text style={styles.typeIcon}>🔐</Text>
            <Text style={[styles.typeLabel, { color: textPrimary }]}>Dynamic</Text>
            <Text style={[styles.typeDesc, { color: textMuted }]}>
              MPC-secured Solana wallet via Dynamic SDK — email or social login, no seed phrase
            </Text>
            {accountType === "dynamic" && (
              <View style={styles.typeCheck}>
                <Ionicons name="checkmark-circle" size={20} color="#F5841F" />
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Button
            title="Continue"
            onPress={() => setStep("generate")}
          />
        </View>
      </SafeAreaView>
    );
  }

  // ─── Step: generate / confirm ───────────────────────────────────────────────
  if (step === "generate") {
    const isSolana = isAddingAccount && accountType === "solana";
    const isDynamic = isAddingAccount && accountType === "dynamic";

    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => (isAddingAccount ? setStep("type") : router.back())}
          >
            <Ionicons name="arrow-back" size={24} color={textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: textPrimary }]}>
            {isAddingAccount ? "Add Account" : "Create Wallet"}
          </Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.content}>
          <View style={[styles.iconContainer, { backgroundColor: cardBg }]}>
            <Ionicons
              name={
                isDynamic
                  ? "shield-checkmark-outline"
                  : isSolana
                  ? "sunny-outline"
                  : isAddingAccount
                  ? "person-add-outline"
                  : "key-outline"
              }
              size={64}
              color={isDynamic ? "#F5841F" : isSolana ? "#9945FF" : accentColor}
            />
          </View>

          <Text style={[styles.title, { color: textPrimary }]}>
            {isDynamic
              ? "Create Dynamic Wallet"
              : isSolana
              ? "Create Solana Account"
              : isAddingAccount
              ? "Create EVM Account"
              : "Create New Wallet"}
          </Text>
          <Text style={[styles.description, { color: textMuted }]}>
            {isDynamic
              ? "Sign in with email or social to create an MPC-secured Solana wallet. No seed phrase needed — Dynamic handles key management securely."
              : isSolana
              ? "A new Solana keypair will be generated and stored securely on your device. Operations go through the API provider."
              : isAddingAccount
              ? "A new EVM account with a unique private key will be generated. This account will be independent from your other accounts."
              : "We'll generate a unique 12-word recovery phrase for you. This phrase is the only way to recover your wallet if you lose access."}
          </Text>

          {!isAddingAccount && (
            <View style={[styles.warningBox, { backgroundColor: cardBg, borderWidth: isLight ? 1 : 0, borderColor: isLight ? "#DCE8E2" : "transparent" }]}> 
              <Ionicons name="warning-outline" size={24} color="#F59E0B" />
              <Text style={[styles.warningText, { color: strongMuted }]}> 
                Never share your recovery phrase. Anyone with this phrase can
                access your funds.
              </Text>
            </View>
          )}

          {isAddingAccount && (
            <View style={[styles.warningBox, { backgroundColor: cardBg, borderWidth: isLight ? 1 : 0, borderColor: isLight ? "#DCE8E2" : "transparent" }, isSolana && styles.warningBoxSolana, isDynamic && styles.warningBoxDynamic]}>
              <Ionicons
                name="information-circle-outline"
                size={24}
                color={isDynamic ? "#F5841F" : isSolana ? "#9945FF" : accentColor}
              />
              <Text style={[styles.warningText, { color: strongMuted }]}>
                {isDynamic
                  ? "Dynamic uses MPC key management — your wallet is secured without exposing a private key. You'll sign in via the Dynamic flow."
                  : "The new account will be automatically added to your wallet and you can switch between accounts anytime."}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.footer}>
          <Button
            title={
              isDynamic
                ? "Sign In with Dynamic"
                : isSolana
                ? "Create Solana Account"
                : isAddingAccount
                ? "Create EVM Account"
                : "Generate Recovery Phrase"
            }
            onPress={handleGenerate}
            loading={isLoading}
          />
        </View>
      </SafeAreaView>
    );
  }

  // ─── Step: backup mnemonic (EVM new wallet only) ────────────────────────────
  if (step === "backup") {
    const words = mnemonic.split(" ");

    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setStep("generate")}>
            <Ionicons name="arrow-back" size={24} color={textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: textPrimary }]}>Backup Phrase</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView style={styles.scrollContent}>
          <Text style={[styles.title, { color: textPrimary }]}>Your Recovery Phrase</Text>
          <Text style={[styles.description, { color: textMuted }]}> 
            Write down these 12 words in order and store them in a safe place.
          </Text>

          <TouchableOpacity
            style={styles.revealButton}
            onPress={() => setRevealedWords(!revealedWords)}
          >
            <Ionicons
              name={revealedWords ? "eye-off-outline" : "eye-outline"}
              size={20}
              color={accentColor}
            />
            <Text style={[styles.revealText, { color: accentColor }]}>
              {revealedWords ? "Hide Words" : "Reveal Words"}
            </Text>
          </TouchableOpacity>

          <View style={styles.wordsContainer}>
            {words.map((word, index) => (
              <View key={index} style={styles.wordBox}>
                <Text style={[styles.wordNumber, { color: textMuted }]}>{index + 1}</Text>
                <Text style={[styles.word, { color: textPrimary }]}> 
                  {revealedWords ? word : "••••••"}
                </Text>
              </View>
            ))}
          </View>

          <View style={[styles.warningBox, { backgroundColor: cardBg, borderWidth: isLight ? 1 : 0, borderColor: isLight ? "#DCE8E2" : "transparent" }]}> 
            <Ionicons
              name="shield-checkmark-outline"
              size={24}
              color="#10B981"
            />
            <Text style={[styles.warningText, { color: strongMuted }]}> 
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
  warningBoxSolana: {
    borderWidth: 1,
    borderColor: "#9945FF30",
  },
  warningBoxDynamic: {
    borderWidth: 1,
    borderColor: "#F5841F30",
  },
  warningText: {
    flex: 1,
    color: "#D1D5DB",
    fontSize: 14,
    lineHeight: 20,
  },
  // Type picker
  typeRow: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
    marginTop: 8,
  },
  typeCard: {
    flex: 1,
    backgroundColor: "#1E2E29",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    gap: 8,
    borderWidth: 2,
    borderColor: "transparent",
    position: "relative",
  },
  typeCardWide: {
    width: "100%",
    backgroundColor: "#1E2E29",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    gap: 8,
    borderWidth: 2,
    borderColor: "transparent",
    position: "relative",
    marginTop: 12,
  },
  typeCardSelected: {
    borderColor: "#569F8C",
    backgroundColor: "#1A2E28",
  },
  typeIcon: {
    fontSize: 36,
    marginBottom: 4,
  },
  typeLabel: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
  },
  typeDesc: {
    color: "#9CA3AF",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 17,
  },
  typeCheck: {
    position: "absolute",
    top: 10,
    right: 10,
  },
  // Backup
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
