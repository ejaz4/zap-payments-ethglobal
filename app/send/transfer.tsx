import { ChainId, EthersClient } from "@/app/profiles/client";
import {
  AddressInput,
  ApprovalModal,
  Button,
  ChainBadgeMini
} from "@/components/ui";
import {
  NetworkSelector,
  SOLANA_NETWORKS,
} from "@/components/ui/NetworkSelector";
import { TokenInfo } from "@/config/tokens";
import { ApiProvider } from "@/crypto/provider/api";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useFiatValue } from "@/hooks/use-fiat-value";
import { ERC20Service } from "@/services/erc20";
import { SecureStorage } from "@/services/storage";
import { BalanceService, TransactionService } from "@/services/wallet";
import { tintedBackground, tintedSurface, useAccentColor } from "@/store/appearance";
import { useContactByAddress, useContactsStore } from "@/store/contacts";
import { useProviderStore } from "@/store/provider";
import { useTokenStore } from "@/store/tokens";
import {
  TokenBalance,
  getSolanaChainKey,
  useNativeBalance,
  useSelectedAccount,
  useTokenBalances,
  useWalletStore,
} from "@/store/wallet";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// Represents either native currency or an ERC20 token
type SelectedAsset =
  | { type: "native" }
  | { type: "token"; token: TokenInfo; balance?: TokenBalance };

export default function SendScreen() {
  const accentColor = useAccentColor();
  const scheme = useColorScheme() ?? "dark";
  const isLight = scheme === "light";
  const bg = tintedBackground(accentColor);
  const headerBg = tintedSurface(accentColor, 0.08, isLight ? "#FFFFFF" : "#111111", scheme);
  const panelBg = tintedSurface(accentColor, 0.11, isLight ? "#FFFFFF" : "#111111", scheme);
  const panelBorder = isLight ? "#D6E4DE" : "#24312C";
  const panelText = isLight ? "#0F172A" : "#FFFFFF";
  const panelMuted = isLight ? "#64748B" : "#9CA3AF";
  const panelSubtle = isLight ? "#94A3B8" : "#6B7280";
  const router = useRouter();
  const {
    tokenAddress,
    chainId: chainIdParam,
    address: addressParam,
    amount: amountParam,
  } = useLocalSearchParams<{
    tokenAddress?: string;
    chainId?: string;
    /** Pre-filled recipient address — set when navigating from a Zap Pay NFC tap */
    address?: string;
    /** Pre-filled amount — set when navigating from a Zap Pay NFC tap */
    amount?: string;
  }>();
  const selectedAccount = useSelectedAccount();
  const isSolanaAccount = selectedAccount?.accountType === "solana";
  const selectedApiNetworkId = useProviderStore((s) => s.selectedApiNetworkId);
  const solanaNetworkName = SOLANA_NETWORKS.find((n) => n.networkId === (selectedApiNetworkId ?? "dynamic-mainnet"))?.displayName ?? "Solana";
  const storeChainId = useWalletStore((s) => s.selectedChainId);
  const setSelectedChainId = useWalletStore((s) => s.setSelectedChainId);
  const nativeBalance = useNativeBalance();
  const tokenBalances = useTokenBalances();
  const getTokensForChain = useTokenStore((s) => s.getTokensForChain);

  // For Solana: re-fetch native + token balances whenever the selected network changes
  useEffect(() => {
    if (!isSolanaAccount || !selectedAccount) return;
    const apiBaseUrl = useProviderStore.getState().getApiBaseUrl();
    if (!apiBaseUrl) return;
    const walletStore = useWalletStore.getState();
    const provider = new ApiProvider(apiBaseUrl);
    const networkId = selectedApiNetworkId ?? "dynamic-mainnet";
    const chainKey = getSolanaChainKey(networkId);

    // Fetch native and token balances in parallel
    Promise.allSettled([
      provider.getNativeBalance(selectedAccount.address, networkId),
      provider.getTokenBalances(selectedAccount.address, networkId),
    ]).then(([nativeResult, tokenResult]) => {
      if (nativeResult.status === "fulfilled") {
        walletStore.setNativeBalance(selectedAccount.address, chainKey, nativeResult.value.amount);
      }
      if (tokenResult.status === "fulfilled") {
        const solTokens = tokenResult.value.map((b) => ({
          address: b.assetId.replace(`token:${networkId}:`, ""),
          symbol: b.symbol,
          name: b.symbol,
          decimals: b.decimals,
          balance: b.amountAtomic,
          balanceFormatted: b.amount,
          chainId: chainKey,
        }));
        walletStore.setTokenBalances(selectedAccount.address, chainKey, solTokens);
      }
    });
  }, [isSolanaAccount, selectedAccount?.address, selectedApiNetworkId]);

  // Use chainId from params if provided, otherwise fall back to store's selectedChainId
  const selectedChainId = useMemo(() => {
    if (chainIdParam) {
      const parsed = parseInt(chainIdParam, 10);
      if (!isNaN(parsed) && Object.values(ChainId).includes(parsed)) {
        return parsed as ChainId;
      }
    }
    return storeChainId;
  }, [chainIdParam, storeChainId]);

  const networkConfig = EthersClient.getNetworkConfig(selectedChainId);

  const [recipient, setRecipient] = useState(addressParam || "");
  const [amount, setAmount] = useState(amountParam || "");
  const fiatAmount = useFiatValue(amount, selectedChainId);
  const [isLoading, setIsLoading] = useState(false);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);

  // Token selection state
  const [selectedAsset, setSelectedAsset] = useState<SelectedAsset>({
    type: "native",
  });
  const [showAssetPicker, setShowAssetPicker] = useState(false);

  // Approval state for ERC20 tokens
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [pendingSpender, setPendingSpender] = useState<string | null>(null);

  // Chain picker state
  const [showChainPicker, setShowChainPicker] = useState(false);

  const [showSaveContactModal, setShowSaveContactModal] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const existingContact = useContactByAddress(resolvedAddress || "");
  const addContact = useContactsStore((s) => s.addContact);

  // Track if we've already auto-selected asset from params
  const [hasAutoSelected, setHasAutoSelected] = useState(false);

  // Get available tokens with balances for the current chain
  const availableTokens = useMemo(() => {
    if (isSolanaAccount) {
      // For Solana, use tokens already fetched from the API (stored in tokenBalances)
      return tokenBalances.map((tb) => ({
        token: {
          address: tb.address,
          symbol: tb.symbol,
          name: tb.name,
          decimals: tb.decimals,
        } as any,
        balance: tb,
      }));
    }
    const tokens = getTokensForChain(selectedChainId);
    return tokens.map((token) => {
      const balance = tokenBalances.find(
        (tb) =>
          tb.address.toLowerCase() === token.address.toLowerCase() &&
          tb.chainId === selectedChainId,
      );
      return { token, balance };
    });
  }, [selectedChainId, tokenBalances, getTokensForChain, isSolanaAccount]);

  // Auto-select asset from route params on mount
  useEffect(() => {
    if (hasAutoSelected) return;

    if (tokenAddress && availableTokens.length > 0) {
      const foundToken = availableTokens.find(
        ({ token }) =>
          token.address.toLowerCase() === tokenAddress.toLowerCase(),
      );
      if (foundToken) {
        setSelectedAsset({
          type: "token",
          token: foundToken.token,
          balance: foundToken.balance,
        });
        setHasAutoSelected(true);
      }
    } else if (!tokenAddress) {
      // Native token was selected
      setHasAutoSelected(true);
    }
  }, [tokenAddress, availableTokens, hasAutoSelected]);

  // Get current balance based on selected asset
  const currentBalance = useMemo(() => {
    if (selectedAsset.type === "native") {
      return nativeBalance;
    }
    const tokenBalance = tokenBalances.find(
      (tb) =>
        tb.address.toLowerCase() ===
          selectedAsset.token.address.toLowerCase() &&
        tb.chainId === selectedChainId,
    );
    return tokenBalance?.balanceFormatted || "0";
  }, [selectedAsset, nativeBalance, tokenBalances, selectedChainId]);

  const currentSymbol = useMemo(() => {
    if (selectedAsset.type === "native") {
      if (isSolanaAccount) return "SOL";
      return networkConfig?.nativeCurrency.symbol || "ETH";
    }
    return selectedAsset.token.symbol;
  }, [selectedAsset, networkConfig, isSolanaAccount]);

  // Get the effective chain ID based on selected asset
  // If a token has a different chainId than the selected chain, use the token's chain
  const effectiveChainId = useMemo(() => {
    if (selectedAsset.type === "token" && selectedAsset.balance?.chainId) {
      return selectedAsset.balance.chainId;
    }
    return selectedChainId;
  }, [selectedAsset, selectedChainId]);

  // Get the network config for the effective chain
  const effectiveNetworkConfig = useMemo(() => {
    return EthersClient.getNetworkConfig(effectiveChainId);
  }, [effectiveChainId]);


  const validateAmount = (value: string) => {
    if (!value) {
      setAmountError(null);
      return;
    }

    const num = parseFloat(value);
    if (isNaN(num) || num <= 0) {
      setAmountError("Invalid amount");
      return;
    }

    // For Solana, skip local balance check — the API validates funds
    if (!isSolanaAccount) {
      const balance = parseFloat(currentBalance);
      if (num > balance) {
        setAmountError("Insufficient balance");
        return;
      }
    }

    setAmountError(null);
  };

  const handleSetMax = () => {
    const balance = parseFloat(currentBalance);
    // For native currency, leave some for gas
    const maxAmount =
      selectedAsset.type === "native" ? Math.max(0, balance - 0.01) : balance;
    setAmount(maxAmount.toString());
    validateAmount(maxAmount.toString());
  };

  // Handle approval for ERC20 tokens
  const handleApproval = async (approvalAmount: bigint) => {
    if (selectedAsset.type !== "token" || !selectedAccount || !pendingSpender) {
      throw new Error("Invalid state for approval");
    }

    const result = await ERC20Service.approve(
      selectedAccount.address,
      selectedAsset.token.address,
      pendingSpender,
      approvalAmount,
      effectiveChainId,
    );

    if (!result.success) {
      throw new Error(result.error || "Approval failed");
    }

    // After successful approval, proceed with the transfer
    setShowApprovalModal(false);
    setPendingSpender(null);

    // Re-trigger send after approval
    Alert.alert(
      "Approval Successful",
      `Your ${selectedAsset.token.symbol} tokens have been approved. You can now complete the transaction.`,
      [{ text: "OK" }],
    );
  };

  const handleSend = async () => {
    Keyboard.dismiss();

    if (!selectedAccount || !resolvedAddress || !amount) {
      return;
    }

    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) {
      setAmountError("Invalid amount");
      return;
    }

    const isToken = selectedAsset.type === "token";

    // Solana send path — delegates signing to Dynamic custody via the API
    if (isSolanaAccount) {
      const networkId = useProviderStore.getState().selectedApiNetworkId ?? "dynamic-mainnet";

      // All Solana wallets are Dynamic-managed — accountType is the source of truth.
      // The API signs using the from_address in custody context (dynamicWalletId is metadata only).

      const confirmMessage = `Send ${amount} ${currentSymbol} to ${resolvedAddress.slice(0, 8)}...${resolvedAddress.slice(-4)} on Solana?`;
      Alert.alert("Confirm Transaction", confirmMessage, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send",
          onPress: async () => {
            setIsLoading(true);
            try {
              const apiBaseUrl = useProviderStore.getState().getApiBaseUrl();
              if (!apiBaseUrl) throw new Error("No API URL configured. Set one in Settings → API.");

              // privateKey may be empty in strict Dynamic custody mode — that's OK
              const privateKey = await SecureStorage.loadPrivateKey(selectedAccount.address);

              const provider = new ApiProvider(apiBaseUrl);
              const tokenRef = isToken && selectedAsset.type === "token" ? selectedAsset.token.address : undefined;

              // Use the split flow (build → sign → broadcast) as recommended by the API docs.
              // Falls back gracefully: Dynamic custody signs via feePayer address.
              let result;
              try {
                result = await provider.sendSplit(
                  selectedAccount.address,
                  resolvedAddress,
                  amount,
                  networkId,
                  privateKey || undefined,
                  tokenRef,
                );
              } catch (splitErr) {
                // Fallback to one-shot send if split flow isn't supported
                console.warn("[Transfer] Split flow failed, falling back to sendWithKey:", splitErr);
                result = await provider.sendWithKey(
                  selectedAccount.address,
                  resolvedAddress,
                  amount,
                  networkId,
                  privateKey || undefined,
                  tokenRef,
                );
              }

              // Record in transaction history — mark as pending until confirmed
              const chainKey = getSolanaChainKey(networkId);
              const txHash = result.txHash ?? `sol-${Date.now()}`;
              useWalletStore.getState().addTransaction(selectedAccount.address, {
                hash: txHash,
                from: selectedAccount.address,
                to: resolvedAddress,
                value: amount,
                chainId: chainKey,
                timestamp: Date.now(),
                status: result.status === "confirmed" ? "confirmed" : "pending",
                type: "send",
                tokenSymbol: isToken && selectedAsset.type === "token" ? selectedAsset.token.symbol : "SOL",
                tokenAddress: tokenRef,
              });

              // Refresh balances after send
              BalanceService.forceRefreshBalances();

              Alert.alert(
                "Transaction Sent",
                result.txHash
                  ? `Transaction hash: ${result.txHash.slice(0, 10)}...${result.explorerUrl ? `\n\n${result.explorerUrl}` : ""}`
                  : "Transaction submitted.",
                [{ text: "OK", onPress: () => router.back() }],
              );
            } catch (error: any) {
              console.error("Solana send error:", error);
              const message = error?.message ?? "Failed to send transaction";
              // Handle 503 — custody/provider failure with actionable message
              if (message.includes("503") || message.toLowerCase().includes("custody") || message.toLowerCase().includes("signing")) {
                Alert.alert(
                  "Signing Failed",
                  "The selected wallet could not sign this transaction. This usually means the wallet is not managed by Dynamic in this environment.\n\nTry creating or importing the wallet again.",
                );
              } else {
                Alert.alert("Error", message);
              }
            } finally {
              setIsLoading(false);
            }
          },
        },
      ]);
      return;
    }

    // EVM send path
    const networkName = effectiveNetworkConfig?.name || "Unknown Network";
    const nativeSymbol = effectiveNetworkConfig?.nativeCurrency.symbol || "ETH";

    // For ERC20 tokens, check if user has native balance for gas
    if (isToken) {
      try {
        const nativeBalanceWei = await EthersClient.getNativeBalance(
          selectedAccount.address,
          effectiveChainId,
        );
        // Require at least some native currency for gas (0.0001 as minimum)
        const minGasBalance = EthersClient.toWei("0.0001");
        if (nativeBalanceWei < minGasBalance) {
          const currentNativeBalance = EthersClient.fromWei(nativeBalanceWei);
          Alert.alert(
            "Insufficient Gas",
            `You need ${nativeSymbol} on ${networkName} to pay for gas fees.\n\nYour ${nativeSymbol} balance: ${currentNativeBalance}\n\nPlease add some ${nativeSymbol} to your wallet to send ${currentSymbol}.`,
          );
          return;
        }
      } catch (error) {
        console.warn("Failed to check native balance for gas:", error);
        // Continue anyway - the transaction will fail with a clearer error if there's no gas
      }
    }

    const confirmMessage = `Send ${amount} ${currentSymbol} to ${resolvedAddress.slice(0, 6)}...${resolvedAddress.slice(-4)} on ${networkName}?`;

    Alert.alert("Confirm Transaction", confirmMessage, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Send",
        onPress: async () => {
          setIsLoading(true);
          try {
            let result;

            if (isToken) {
              // Send ERC20 token using the effective chain (token's chain)
              result = await TransactionService.sendToken(
                selectedAccount.address,
                resolvedAddress,
                selectedAsset.token.address,
                amount,
                selectedAsset.token.decimals,
                effectiveChainId,
                selectedAsset.token.symbol,
              );
            } else {
              // Send native currency using the effective chain
              result = await TransactionService.sendNative(
                selectedAccount.address,
                resolvedAddress,
                amount,
                effectiveChainId,
              );
            }

            if ("hash" in result) {
              Alert.alert(
                "Transaction Sent",
                `Transaction hash: ${result.hash.slice(0, 10)}...`,
                [{ text: "OK", onPress: () => router.back() }],
              );
            } else {
              Alert.alert("Error", result.error);
            }
          } catch (error) {
            console.error("Send error:", error);
            Alert.alert("Error", "Failed to send transaction");
          } finally {
            setIsLoading(false);
          }
        },
      },
    ]);
  };

  const handleSelectAsset = (asset: SelectedAsset) => {
    setSelectedAsset(asset);
    setShowAssetPicker(false);
    // Reset amount when switching assets
    setAmount("");
    setAmountError(null);
  };

  // All Solana wallets are Dynamic-managed (created via the API); no unmanaged gate needed.
  const canSend = resolvedAddress && amount && !amountError;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <View style={[styles.header, { backgroundColor: headerBg, borderBottomColor: panelBorder }]}> 
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={panelText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: panelText }]}>Send</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
        {/* NFC source badge — shown when address was read from a Zap Pay tap */}
        {addressParam && (
          <View style={styles.nfcSourceBadge}>
            <Ionicons name="radio" size={14} color="#10B981" />
            <Text style={styles.nfcSourceBadgeText}>
              Address read via Zap Pay NFC
            </Text>
          </View>
        )}

        <View style={[styles.balanceInfo, { backgroundColor: panelBg, borderColor: panelBorder }]}> 
          <Text style={[styles.balanceLabel, { color: panelMuted }]}>Available:</Text>
          <Text style={[styles.balanceValue, { color: panelText }]}>
            {parseFloat(currentBalance).toFixed(6)} {currentSymbol}
          </Text>
        </View>

        <View style={[styles.amountCard, { backgroundColor: panelBg, borderColor: panelBorder }]}> 
          <View style={styles.amountCardHeaderRow}>
            <Text style={[styles.amountCardLabel, { color: panelMuted }]}>Amount</Text>
            <View style={styles.amountCardPills}>
              <TouchableOpacity
                style={[
                  styles.amountCardChip,
                  { borderColor: panelBorder, backgroundColor: isLight ? "#FFFFFF" : "#14201C" },
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowChainPicker(true);
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.amountCardChipText, { color: panelText }]} numberOfLines={1}>
                  {isSolanaAccount ? solanaNetworkName : (networkConfig?.name ?? "Unknown")}
                </Text>
                <Ionicons name="chevron-down" size={14} color={panelSubtle} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.amountCardChip,
                  { borderColor: panelBorder, backgroundColor: isLight ? "#FFFFFF" : "#14201C" },
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowAssetPicker(true);
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.amountCardChipText, { color: panelText }]} numberOfLines={1}>
                  {currentSymbol}
                </Text>
                <Ionicons name="chevron-down" size={14} color={panelSubtle} />
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.amountCardMetaRow}>
            <View style={styles.assetInfo}>
              <View style={[styles.assetIcon, { backgroundColor: isLight ? "#EAF2EF" : "#253531" }]}>
                <Text style={styles.assetIconText}>
                  {selectedAsset.type === "native"
                    ? (networkConfig?.nativeCurrency.symbol || "ETH").slice(0, 2)
                    : selectedAsset.token.symbol.slice(0, 2)}
                </Text>
              </View>
              <View>
                <Text style={[styles.assetSymbol, { color: panelText }]}>{currentSymbol}</Text>
                <Text style={[styles.assetBalance, { color: panelMuted }]}>Balance: {parseFloat(currentBalance).toFixed(6)}</Text>
              </View>
            </View>
          </View>
          <View style={styles.amountCardRow}>
            <TextInput
              value={amount}
              onChangeText={(text) => {
                setAmount(text);
                validateAmount(text);
              }}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={panelSubtle}
              style={[styles.amountCardInput, { color: panelText }]}
            />
            <TouchableOpacity
              style={[styles.amountCardMax, { backgroundColor: isLight ? "#E8F0EC" : "#1E2E29", borderColor: panelBorder }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                handleSetMax();
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.amountCardMaxText, { color: accentColor }]}>MAX</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.amountCardFiat, { color: panelMuted }]}>{fiatAmount ? `≈ ${fiatAmount}` : " "}</Text>
          {amountError && <Text style={styles.amountCardError}>{amountError}</Text>}
        </View>

        {/* Recipient field with integrated contact picker button */}
        <AddressInput
          label="Recipient"
          value={recipient}
          onChangeText={setRecipient}
          onResolvedAddress={setResolvedAddress}
          onChainDetected={(detectedId) => {
            setSelectedChainId(detectedId);
          }}
          chainId={selectedChainId}
          isSolana={isSolanaAccount}
          onContactsPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
        />

        {/* Show contact name if recipient is a saved contact */}
        {existingContact && resolvedAddress && (
          <View style={styles.contactBadge}>
            <Ionicons name="person" size={14} color="#10B981" />
            <Text style={styles.contactBadgeText}>{existingContact.name}</Text>
          </View>
        )}

        {/* Save to contacts button - show after resolving a new address */}
        {resolvedAddress && !existingContact && (
          <TouchableOpacity
            style={styles.saveContactButton}
            onPress={() => {
              setNewContactName("");
              setShowSaveContactModal(true);
            }}
          >
            <Ionicons name="person-add-outline" size={16} color={accentColor} />
            <Text style={[styles.saveContactText, { color: accentColor }]}>Save to contacts</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.footer}>
        <Button
          title="Send"
          onPress={handleSend}
          loading={isLoading}
          disabled={!canSend}
        />
      </View>

      {/* Asset Picker Modal */}
      <Modal
        visible={showAssetPicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAssetPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Asset</Text>
              <TouchableOpacity onPress={() => setShowAssetPicker(false)}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <FlatList
              data={[
                { type: "native" as const },
                ...availableTokens.map(({ token, balance }) => ({
                  type: "token" as const,
                  token,
                  balance,
                })),
              ]}
              keyExtractor={(item) =>
                item.type === "native" ? "native" : item.token.address
              }
              renderItem={({ item }) => {
                const isNative = item.type === "native";
                const symbol = isNative
                  ? networkConfig?.nativeCurrency.symbol || "ETH"
                  : item.token.symbol;
                const name = isNative
                  ? networkConfig?.nativeCurrency.name || "Ether"
                  : item.token.name;
                const balance = isNative
                  ? nativeBalance
                  : item.balance?.balanceFormatted || "0";
                const isSelected =
                  selectedAsset.type === item.type &&
                  (isNative ||
                    (selectedAsset.type === "token" &&
                      item.type === "token" &&
                      selectedAsset.token.address === item.token.address));

                return (
                  <TouchableOpacity
                    style={[
                      styles.assetItem,
                      isSelected && styles.assetItemSelected,
                    ]}
                    onPress={() => handleSelectAsset(item)}
                  >
                    <View style={styles.assetItemIconWrapper}>
                      <View style={styles.assetItemIcon}>
                        <Text style={styles.assetItemIconText}>
                          {symbol.slice(0, 2)}
                        </Text>
                      </View>
                      {/* Chain badge for tokens */}
                      {!isNative && item.balance?.chainId && (
                        <View style={styles.assetItemChainBadge}>
                          <ChainBadgeMini
                            chainId={item.balance.chainId}
                            size="small"
                          />
                        </View>
                      )}
                    </View>
                    <View style={styles.assetItemInfo}>
                      <Text style={styles.assetItemSymbol}>{symbol}</Text>
                      <View style={styles.assetItemSubRow}>
                        <Text style={styles.assetItemName}>{name}</Text>
                        {/* Show chain name for multi-chain clarity */}
                        {!isNative && item.balance?.chainId && (
                          <Text style={styles.assetItemChainName}>
                            on{" "}
                            {EthersClient.getNetworkConfig(item.balance.chainId)
                              ?.name || "Unknown"}
                          </Text>
                        )}
                      </View>
                    </View>
                    <View style={styles.assetItemBalance}>
                      <Text style={styles.assetItemBalanceText}>
                        {parseFloat(balance).toFixed(4)}
                      </Text>
                    </View>
                    {isSelected && (
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color="#10B981"
                      />
                    )}
                  </TouchableOpacity>
                );
              }}
              style={styles.assetList}
            />
          </View>
        </View>
      </Modal>

      {/* ERC20 Approval Modal */}
      {selectedAsset.type === "token" && selectedAccount && (
        <ApprovalModal
          visible={showApprovalModal}
          onClose={() => {
            setShowApprovalModal(false);
            setPendingSpender(null);
          }}
          onApprove={handleApproval}
          token={selectedAsset.token}
          spenderAddress={pendingSpender || resolvedAddress || ""}
          spenderName="Recipient"
          requiredAmount={amount}
          ownerAddress={selectedAccount.address}
          chainId={effectiveChainId}
        />
      )}

      {/* Chain Picker Modal */}
      <NetworkSelector
        visible={showChainPicker}
        selectedChainId={selectedChainId}
        onSelect={(chainId) => setSelectedChainId(chainId)}
        onClose={() => setShowChainPicker(false)}
      />

      {/* Save Contact Modal */}
      <Modal
        visible={showSaveContactModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowSaveContactModal(false)}
      >
        <View style={styles.saveContactModalOverlay}>
          <View style={styles.saveContactModalContent}>
            <Text style={styles.saveContactModalTitle}>Save Contact</Text>
            <Text style={styles.saveContactModalSubtitle}>
              {resolvedAddress?.slice(0, 10)}...{resolvedAddress?.slice(-8)}
            </Text>
            <TextInput
              style={styles.saveContactInput}
              placeholder="Contact name"
              placeholderTextColor="#6B7280"
              value={newContactName}
              onChangeText={setNewContactName}
              autoCapitalize="words"
              autoFocus
            />
            <View style={styles.saveContactModalButtons}>
              <TouchableOpacity
                style={styles.saveContactModalCancelButton}
                onPress={() => setShowSaveContactModal(false)}
              >
                <Text style={styles.saveContactModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.saveContactModalSaveButton,
                  { backgroundColor: accentColor },
                  !newContactName.trim() &&
                    styles.saveContactModalSaveButtonDisabled,
                ]}
                onPress={() => {
                  if (newContactName.trim() && resolvedAddress) {
                    addContact(newContactName.trim(), resolvedAddress);
                    setShowSaveContactModal(false);
                    Alert.alert("Saved", `${newContactName} added to contacts`);
                  }
                }}
                disabled={!newContactName.trim()}
              >
                <Text style={styles.saveContactModalSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  },
  chainSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1E2E29",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 8,
  },
  chainSelectorLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  chainSelectorIcon: {
    fontSize: 24,
  },
  chainSelectorLabel: {
    color: "#6B7280",
    fontSize: 11,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  chainSelectorName: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
    marginTop: 1,
  },
  assetSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1E2E29",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
  },
  assetInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  assetIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#374151",
    alignItems: "center",
    justifyContent: "center",
  },
  assetIconText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
  assetSymbol: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  assetBalance: {
    color: "#9CA3AF",
    fontSize: 12,
    marginTop: 1,
  },
  contactBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: -8,
    marginBottom: 12,
  },
  contactBadgeText: {
    color: "#10B981",
    fontSize: 13,
    fontWeight: "500",
  },
  saveContactButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: -8,
    marginBottom: 12,
  },
  saveContactText: {
    color: "#569F8C",
    fontSize: 13,
    fontWeight: "500",
  },
  amountContainer: {
    position: "relative",
  },
  maxButton: {
    position: "absolute",
    right: 16,
    top: 42,
    backgroundColor: "#374151",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  maxButtonText: {
    color: "#569F8C",
    fontSize: 12,
    fontWeight: "600",
  },
  nfcSourceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#10B98115",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  nfcSourceBadgeText: {
    color: "#10B981",
    fontSize: 13,
    fontWeight: "500",
  },
  fiatEquiv: {
    color: "#9CA3AF",
    fontSize: 14,
    textAlign: "right",
    marginTop: 4,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  balanceInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#1E2E29",
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  balanceLabel: {
    color: "#6B7280",
    fontSize: 14,
  },
  balanceValue: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
  },
  amountCard: {
    backgroundColor: "#141B17",
    borderWidth: 1,
    borderColor: "#1F2A24",
    borderRadius: 20,
    padding: 16,
    marginTop: 16,
  },
  amountCardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  amountCardLabel: {
    color: "#9CA3AF",
    fontSize: 14,
    marginBottom: 10,
  },
  amountCardPills: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
  },
  amountCardChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: 140,
  },
  amountCardChipText: {
    fontSize: 13,
    fontWeight: "600",
  },
  amountCardMetaRow: {
    marginTop: 12,
    marginBottom: 8,
  },
  amountCardRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  amountCardInput: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "700",
    paddingVertical: 4,
  },
  amountCardMax: {
    backgroundColor: "#1E2E29",
    borderWidth: 1,
    borderColor: "#2D3D38",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  amountCardMaxText: {
    fontSize: 12,
    fontWeight: "700",
  },
  amountCardFiat: {
    color: "#9CA3AF",
    fontSize: 14,
    marginTop: 8,
    minHeight: 20,
  },
  amountCardError: {
    color: "#F87171",
    fontSize: 12,
    marginTop: 4,
  },
  footer: {
    padding: 24,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#1E2E29",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "70%",
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
  },
  modalTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },
  assetList: {
    padding: 16,
  },
  assetItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: "#0F1512",
  },
  assetItemSelected: {
    borderWidth: 1,
    borderColor: "#10B981",
  },
  assetItemIconWrapper: {
    position: "relative",
    marginRight: 12,
  },
  assetItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#374151",
    alignItems: "center",
    justifyContent: "center",
  },
  assetItemChainBadge: {
    position: "absolute",
    bottom: -2,
    right: -4,
  },
  assetItemIconText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  assetItemInfo: {
    flex: 1,
  },
  assetItemSymbol: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  assetItemSubRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  assetItemName: {
    color: "#9CA3AF",
    fontSize: 12,
  },
  assetItemChainName: {
    color: "#6B7280",
    fontSize: 10,
    fontStyle: "italic",
  },
  assetItemBalance: {
    marginRight: 12,
  },
  assetItemBalanceText: {
    color: "#9CA3AF",
    fontSize: 14,
  },
  saveContactModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  saveContactModalContent: {
    backgroundColor: "#1E2E29",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 320,
  },
  saveContactModalTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 8,
  },
  saveContactModalSubtitle: {
    color: "#9CA3AF",
    fontSize: 13,
    fontFamily: "monospace",
    textAlign: "center",
    marginBottom: 16,
  },
  saveContactInput: {
    backgroundColor: "#374151",
    borderRadius: 12,
    padding: 16,
    color: "#FFFFFF",
    fontSize: 16,
    marginBottom: 16,
  },
  saveContactModalButtons: {
    flexDirection: "row",
    gap: 12,
  },
  saveContactModalCancelButton: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#374151",
    alignItems: "center",
  },
  saveContactModalCancelText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "500",
  },
  saveContactModalSaveButton: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#569F8C",
    alignItems: "center",
  },
  saveContactModalSaveButtonDisabled: {
    opacity: 0.5,
  },
  saveContactModalSaveText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});
