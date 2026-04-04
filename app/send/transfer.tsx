import { ChainId, EthersClient } from "@/app/profiles/client";
import {
  ApprovalModal,
  Button,
  ChainBadgeMini,
  ContactPicker,
  Input,
} from "@/components/ui";
import { TokenInfo } from "@/config/tokens";
import { ERC20Service } from "@/services/erc20";
import { TransactionService } from "@/services/wallet";
import { useContactByAddress, useContactsStore } from "@/store/contacts";
import { useTokenStore } from "@/store/tokens";
import {
  TokenBalance,
  useNativeBalance,
  useSelectedAccount,
  useTokenBalances,
  useWalletStore,
} from "@/store/wallet";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Keyboard,
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
  const router = useRouter();
  const { tokenAddress, chainId: chainIdParam } = useLocalSearchParams<{
    tokenAddress?: string;
    chainId?: string;
  }>();
  const selectedAccount = useSelectedAccount();
  const storeChainId = useWalletStore((s) => s.selectedChainId);
  const setSelectedChainId = useWalletStore((s) => s.setSelectedChainId);
  const nativeBalance = useNativeBalance();
  const tokenBalances = useTokenBalances();
  const getTokensForChain = useTokenStore((s) => s.getTokensForChain);

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

  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [recipientError, setRecipientError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);

  // Token selection state
  const [selectedAsset, setSelectedAsset] = useState<SelectedAsset>({
    type: "native",
  });
  const [showAssetPicker, setShowAssetPicker] = useState(false);

  // Approval state for ERC20 tokens
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [pendingSpender, setPendingSpender] = useState<string | null>(null);
  const [needsApproval, setNeedsApproval] = useState(false);
  const [checkingApproval, setCheckingApproval] = useState(false);

  // Contact picker state
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [showSaveContactModal, setShowSaveContactModal] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const existingContact = useContactByAddress(resolvedAddress || "");
  const addContact = useContactsStore((s) => s.addContact);

  // Track if we've already auto-selected asset from params
  const [hasAutoSelected, setHasAutoSelected] = useState(false);

  // Get available tokens with balances for the current chain
  const availableTokens = useMemo(() => {
    const tokens = getTokensForChain(selectedChainId);
    return tokens.map((token) => {
      const balance = tokenBalances.find(
        (tb) =>
          tb.address.toLowerCase() === token.address.toLowerCase() &&
          tb.chainId === selectedChainId,
      );
      return { token, balance };
    });
  }, [selectedChainId, tokenBalances, getTokensForChain]);

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
      return networkConfig?.nativeCurrency.symbol || "ETH";
    }
    return selectedAsset.token.symbol;
  }, [selectedAsset, networkConfig]);

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

  // Resolve ENS
  useEffect(() => {
    const resolveAddress = async () => {
      if (!recipient) {
        setResolvedAddress(null);
        return;
      }

      // If already a valid address
      if (EthersClient.isValidAddress(recipient)) {
        setResolvedAddress(recipient);
        setRecipientError(null);
        return;
      }

      // Try ENS resolution
      if (recipient.includes(".")) {
        setIsResolving(true);
        try {
          const resolved = await EthersClient.resolveENS(
            recipient,
            ChainId.mainnet,
          );
          if (resolved) {
            setResolvedAddress(resolved);
            setRecipientError(null);
          } else {
            setResolvedAddress(null);
            setRecipientError("Could not resolve ENS name");
          }
        } catch {
          setResolvedAddress(null);
          setRecipientError("Could not resolve ENS name");
        } finally {
          setIsResolving(false);
        }
      } else {
        setResolvedAddress(null);
        if (recipient.length > 0) {
          setRecipientError("Invalid address");
        }
      }
    };

    const timer = setTimeout(resolveAddress, 500);
    return () => clearTimeout(timer);
  }, [recipient]);

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

    const balance = parseFloat(currentBalance);
    if (num > balance) {
      setAmountError("Insufficient balance");
      return;
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

  // Check if ERC20 token transfer needs approval
  // For direct transfers, approval is not needed (we use transfer, not transferFrom)
  // But this can be useful when interacting with DEX or other contracts
  const checkApprovalNeeded = async (
    spenderAddress: string,
  ): Promise<boolean> => {
    if (selectedAsset.type !== "token" || !selectedAccount || !amount) {
      return false;
    }

    try {
      setCheckingApproval(true);
      const amountWei = EthersClient.parseUnits(
        amount,
        selectedAsset.token.decimals,
      );
      const needsApproval = await ERC20Service.needsApproval(
        selectedAsset.token.address,
        selectedAccount.address,
        spenderAddress,
        amountWei,
        effectiveChainId,
      );
      return needsApproval;
    } catch (error) {
      console.error("Error checking approval:", error);
      return false;
    } finally {
      setCheckingApproval(false);
    }
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

  const canSend = resolvedAddress && amount && !amountError && !recipientError;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Send</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
        {/* Asset Selector */}
        <TouchableOpacity
          style={styles.assetSelector}
          onPress={() => setShowAssetPicker(true)}
        >
          <View style={styles.assetInfo}>
            <View style={styles.assetIconWrapper}>
              <View style={styles.assetIcon}>
                <Text style={styles.assetIconText}>
                  {selectedAsset.type === "native"
                    ? (networkConfig?.nativeCurrency.symbol || "ETH").slice(
                        0,
                        2,
                      )
                    : selectedAsset.token.symbol.slice(0, 2)}
                </Text>
              </View>
              {/* Show chain badge */}
              <View style={styles.assetIconChainBadge}>
                <ChainBadgeMini chainId={effectiveChainId} size="small" />
              </View>
            </View>
            <View>
              <Text style={styles.assetSymbol}>{currentSymbol}</Text>
              <View style={styles.assetSubRow}>
                <Text style={styles.assetBalance}>
                  Balance: {parseFloat(currentBalance).toFixed(6)}
                </Text>
                <Text style={styles.assetChainName}>
                  on {effectiveNetworkConfig?.name || "Unknown"}
                </Text>
              </View>
            </View>
          </View>
          <Ionicons name="chevron-down" size={20} color="#6B7280" />
        </TouchableOpacity>

        {/* Recipient field with contact picker */}
        <View style={styles.recipientContainer}>
          <View style={styles.recipientInputWrapper}>
            <Input
              label="Recipient"
              placeholder="Address or ENS name"
              value={recipient}
              onChangeText={setRecipient}
              autoCapitalize="none"
              autoCorrect={false}
              error={recipientError || undefined}
              rightIcon={
                isResolving
                  ? undefined
                  : resolvedAddress
                    ? "checkmark-circle"
                    : undefined
              }
            />
          </View>
          <TouchableOpacity
            style={styles.contactPickerButton}
            onPress={() => setShowContactPicker(true)}
          >
            <Ionicons name="people" size={22} color="#569F8C" />
          </TouchableOpacity>
        </View>

        {/* Show contact name if recipient is a saved contact */}
        {existingContact && resolvedAddress && (
          <View style={styles.contactBadge}>
            <Ionicons name="person" size={14} color="#10B981" />
            <Text style={styles.contactBadgeText}>{existingContact.name}</Text>
          </View>
        )}

        {resolvedAddress && resolvedAddress !== recipient && (
          <Text style={styles.resolvedAddress}>
            → {resolvedAddress.slice(0, 10)}...{resolvedAddress.slice(-8)}
          </Text>
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
            <Ionicons name="person-add-outline" size={16} color="#569F8C" />
            <Text style={styles.saveContactText}>Save to contacts</Text>
          </TouchableOpacity>
        )}

        <View style={styles.amountContainer}>
          <Input
            label={`Amount (${currentSymbol})`}
            placeholder="0.0"
            value={amount}
            onChangeText={(text) => {
              setAmount(text);
              validateAmount(text);
            }}
            keyboardType="decimal-pad"
            error={amountError || undefined}
          />
          <TouchableOpacity style={styles.maxButton} onPress={handleSetMax}>
            <Text style={styles.maxButtonText}>MAX</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.balanceInfo}>
          <Text style={styles.balanceLabel}>Available:</Text>
          <Text style={styles.balanceValue}>
            {parseFloat(currentBalance).toFixed(6)} {currentSymbol}
          </Text>
        </View>
      </ScrollView>

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
              keyExtractor={(item, index) =>
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

      {/* Contact Picker Modal */}
      <ContactPicker
        visible={showContactPicker}
        onClose={() => setShowContactPicker(false)}
        onSelectContact={(contact) => {
          setRecipient(contact.address);
          setShowContactPicker(false);
        }}
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
  assetSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1E2E29",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  assetInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  assetIconWrapper: {
    position: "relative",
  },
  assetIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#374151",
    alignItems: "center",
    justifyContent: "center",
  },
  assetIconChainBadge: {
    position: "absolute",
    bottom: -2,
    right: -4,
  },
  assetIconText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  assetSymbol: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  assetSubRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  assetBalance: {
    color: "#9CA3AF",
    fontSize: 12,
  },
  assetChainName: {
    color: "#6B7280",
    fontSize: 10,
    fontStyle: "italic",
  },
  resolvedAddress: {
    color: "#10B981",
    fontSize: 12,
    marginTop: -12,
    marginBottom: 16,
  },
  recipientContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  recipientInputWrapper: {
    flex: 1,
  },
  contactPickerButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#1E2E29",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 28, // Align with input (accounting for label)
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
