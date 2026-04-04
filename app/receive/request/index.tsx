import { ChainId, EthersClient } from "@/app/profiles/client";
import { Button } from "@/components/ui";
import { DEFAULT_TOKENS, TokenInfo } from "@/config/tokens";
import { PaymentRequestService } from "@/services/payment-request";
import {
  getDefaultTerminalContract,
  ItemizedItem,
  PaymentRequest,
  usePaymentRequestStore,
} from "@/store/payment-request";
import { useSelectedAccount, useWalletStore } from "@/store/wallet";
import { useZapContractStore } from "@/store/zap-contract";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/** Null address for native token */
const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";

interface TokenOption {
  symbol: string;
  address: string;
  decimals: number;
  name?: string;
}

/**
 * Get token options for payment request
 * Native token uses null address (0x0), ERC20 tokens use actual contract address
 */
const getTokenOptions = (chainId: ChainId): TokenOption[] => {
  const network = EthersClient.getNetworkConfig(chainId);

  // Native token always first with null address
  const nativeToken: TokenOption = {
    symbol: network?.nativeCurrency.symbol || "ETH",
    address: NULL_ADDRESS,
    decimals: network?.nativeCurrency.decimals || 18,
    name: `${network?.nativeCurrency.symbol || "ETH"} (Native)`,
  };

  // Get ERC20 tokens for this chain from config
  const erc20Tokens: TokenOption[] = (DEFAULT_TOKENS[chainId] || []).map(
    (token: TokenInfo) => ({
      symbol: token.symbol,
      address: token.address, // Actual ERC20 contract address
      decimals: token.decimals,
      name: token.name,
    }),
  );

  return [nativeToken, ...erc20Tokens];
};

export default function CreatePaymentRequestScreen() {
  const router = useRouter();
  const selectedAccount = useSelectedAccount();
  const selectedChainId = useWalletStore((s) => s.selectedChainId);
  const networkConfig = EthersClient.getNetworkConfig(selectedChainId);

  // Zap Contract Store - prioritize this
  const { getContract: getZapContract } = useZapContractStore();
  const zapContract = selectedAccount
    ? getZapContract(selectedAccount.address, selectedChainId)
    : null;

  // Store
  const {
    contractAddress: storedContractAddress,
    setContractAddress,
    merchantInfo,
    updateMerchantInfo,
    setActiveRequest,
  } = usePaymentRequestStore();

  // Use Zap Contract if available, otherwise fall back to stored contract
  const contractAddress = zapContract?.address || storedContractAddress;

  // Form state
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [selectedToken, setSelectedToken] = useState(
    getTokenOptions(selectedChainId)[0],
  );
  const [itemizedItems, setItemizedItems] = useState<ItemizedItem[]>([]);
  const [newItem, setNewItem] = useState<ItemizedItem>({
    name: "",
    quantity: 1,
    price: "",
  });

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showContractInput, setShowContractInput] = useState(!contractAddress);
  const [showTokenSelector, setShowTokenSelector] = useState(false);

  // Token options
  const tokenOptions = useMemo(
    () => getTokenOptions(selectedChainId),
    [selectedChainId],
  );

  // Set default contract address for testnets if not already set (only if no Zap Contract)
  useEffect(() => {
    if (!zapContract && !storedContractAddress) {
      const defaultContract = getDefaultTerminalContract(selectedChainId);
      if (defaultContract) {
        setContractAddress(defaultContract);
        setShowContractInput(false);
      }
    }
  }, [selectedChainId, zapContract, storedContractAddress, setContractAddress]);

  // Auto-calculate amount from itemized items
  useEffect(() => {
    if (itemizedItems.length > 0) {
      const total = itemizedItems.reduce((sum, item) => {
        const qty = item.quantity || 0;
        const val = parseFloat(item.price) || 0;
        return sum + qty * val;
      }, 0);
      setAmount(total ? total.toFixed(6) : "");
    }
  }, [itemizedItems]);

  // Validate contract address
  const isValidContractAddress = useMemo(() => {
    return contractAddress.startsWith("0x") && contractAddress.length === 42;
  }, [contractAddress]);

  // Can submit
  const canSubmit = useMemo(() => {
    return (
      isValidContractAddress &&
      amount &&
      parseFloat(amount) > 0 &&
      description.trim() &&
      merchantInfo.name.trim() &&
      merchantInfo.location.trim()
    );
  }, [
    isValidContractAddress,
    amount,
    description,
    merchantInfo.name,
    merchantInfo.location,
  ]);

  // Add itemized item
  const handleAddItem = () => {
    if (newItem.name.trim() && newItem.price && parseFloat(newItem.price) > 0) {
      setItemizedItems([...itemizedItems, { ...newItem }]);
      setNewItem({ name: "", quantity: 1, price: "" });
    }
  };

  // Remove itemized item
  const handleRemoveItem = (index: number) => {
    setItemizedItems(itemizedItems.filter((_, i) => i !== index));
  };

  // Submit payment request to contract
  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !selectedAccount) {
      Alert.alert("Error", "Please fill in all required fields");
      return;
    }

    setIsSubmitting(true);

    try {
      // Create the payment request service
      const service = new PaymentRequestService(
        contractAddress,
        selectedChainId as ChainId,
      );

      // Check if we're the owner of the contract
      const isOwner = await service.isOwner(selectedAccount.address);
      if (!isOwner) {
        Alert.alert(
          "Not Owner",
          "You are not the owner of this payment terminal contract. Only the owner can create payment requests.",
        );
        setIsSubmitting(false);
        return;
      }

      // Check if there's already an active transaction
      const existingTx = await service.getActiveTransaction();
      if (existingTx && !existingTx.paid && !existingTx.cancelled) {
        Alert.alert(
          "Active Request Exists",
          "There is already an active payment request on this contract. Please wait for it to be paid or cancel it first.",
        );
        setIsSubmitting(false);
        return;
      }

      // Serialize itemized list
      const itemizedListJson = JSON.stringify(
        itemizedItems.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          value: item.price,
        })),
      );

      // Call the contract
      const { hash } = await service.createPaymentRequest(
        selectedAccount.address,
        amount,
        selectedToken.decimals,
        description,
        merchantInfo.name,
        merchantInfo.location,
        itemizedListJson,
        selectedToken.address,
      );

      console.log("[CreateRequest] Payment request created with hash:", hash);

      // Haptic feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Create local request record
      const requestId = Date.now().toString();
      const request: PaymentRequest = {
        id: requestId,
        contractAddress,
        chainId: selectedChainId,
        amount,
        tokenSymbol: selectedToken.symbol,
        tokenAddress: selectedToken.address,
        description,
        merchantName: merchantInfo.name,
        merchantLocation: merchantInfo.location,
        itemizedList: itemizedItems,
        status: "pending",
        createdAt: Date.now(),
        txHash: hash,
      };

      // Set as active request
      setActiveRequest(request);

      // Navigate to status screen
      router.replace("/receive/request/status");
    } catch (err: any) {
      console.error("Failed to create payment request:", err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", err?.message || "Failed to create payment request");
    } finally {
      setIsSubmitting(false);
    }
  }, [
    canSubmit,
    selectedAccount,
    contractAddress,
    selectedChainId,
    amount,
    selectedToken,
    description,
    merchantInfo,
    itemizedItems,
    setActiveRequest,
    router,
  ]);

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
        <Text style={styles.headerTitle}>Payment Request</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
        >
          {/* Contract Address Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Contract Address</Text>
              {contractAddress && (
                <TouchableOpacity
                  onPress={() => setShowContractInput(!showContractInput)}
                >
                  <Text style={styles.editButton}>
                    {showContractInput ? "Hide" : "Edit"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            {(showContractInput || !contractAddress) && (
              <TextInput
                style={styles.input}
                value={contractAddress}
                onChangeText={setContractAddress}
                placeholder="0x..."
                placeholderTextColor="#6B7280"
                autoCapitalize="none"
                autoCorrect={false}
              />
            )}
            {contractAddress && !showContractInput && (
              <Text style={styles.savedAddress}>
                {contractAddress.slice(0, 10)}...{contractAddress.slice(-8)}
              </Text>
            )}
            <Text style={styles.helperText}>
              Enter the payment terminal contract address
            </Text>
          </View>

          {/* Merchant Info Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Merchant Info</Text>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Name *</Text>
              <TextInput
                style={styles.input}
                value={merchantInfo.name}
                onChangeText={(text) => updateMerchantInfo({ name: text })}
                placeholder="Your Business Name"
                placeholderTextColor="#6B7280"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Location *</Text>
              <TextInput
                style={styles.input}
                value={merchantInfo.location}
                onChangeText={(text) => updateMerchantInfo({ location: text })}
                placeholder="City, State"
                placeholderTextColor="#6B7280"
              />
            </View>
          </View>

          {/* Payment Details Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Payment Details</Text>
            <View style={styles.amountRow}>
              <View style={styles.amountInputContainer}>
                <Text style={styles.label}>Amount *</Text>
                <TextInput
                  style={[
                    styles.input,
                    styles.amountInput,
                    itemizedItems.length > 0 && styles.inputDisabled,
                  ]}
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0.00"
                  placeholderTextColor="#6B7280"
                  keyboardType="decimal-pad"
                  editable={itemizedItems.length === 0}
                />
              </View>
              <View style={styles.tokenContainer}>
                <Text style={styles.label}>Token</Text>
                <TouchableOpacity
                  style={styles.tokenSelector}
                  onPress={() => setShowTokenSelector(true)}
                >
                  <Text style={styles.tokenText}>{selectedToken.symbol}</Text>
                  <Ionicons name="chevron-down" size={16} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Description *</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={description}
                onChangeText={setDescription}
                placeholder="Payment for..."
                placeholderTextColor="#6B7280"
                multiline
                numberOfLines={2}
              />
            </View>
          </View>

          {/* Itemized List Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Itemized List (Optional)</Text>

            {/* Existing items */}
            {itemizedItems.length > 0 && (
              <View style={styles.itemsList}>
                {itemizedItems.map((item, index) => (
                  <View key={index} style={styles.itemRow}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <Text style={styles.itemQty}>x{item.quantity}</Text>
                    <Text style={styles.itemPrice}>
                      {item.price} {selectedToken.symbol}
                    </Text>
                    <TouchableOpacity
                      onPress={() => handleRemoveItem(index)}
                      style={styles.removeButton}
                    >
                      <Ionicons name="close-circle" size={20} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* Add new item */}
            <View style={styles.addItemRow}>
              <TextInput
                style={[styles.input, styles.itemNameInput]}
                value={newItem.name}
                onChangeText={(text) => setNewItem({ ...newItem, name: text })}
                placeholder="Item name"
                placeholderTextColor="#6B7280"
              />
              <TextInput
                style={[styles.input, styles.itemQtyInput]}
                value={newItem.quantity.toString()}
                onChangeText={(text) =>
                  setNewItem({ ...newItem, quantity: parseInt(text) || 1 })
                }
                placeholder="Qty"
                placeholderTextColor="#6B7280"
                keyboardType="number-pad"
              />
              <TextInput
                style={[styles.input, styles.itemPriceInput]}
                value={newItem.price}
                onChangeText={(text) => setNewItem({ ...newItem, price: text })}
                placeholder="Price"
                placeholderTextColor="#6B7280"
                keyboardType="decimal-pad"
              />
              <TouchableOpacity
                style={styles.addButton}
                onPress={handleAddItem}
              >
                <Ionicons name="add" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Network Info */}
          <View style={styles.networkInfo}>
            <Ionicons name="globe-outline" size={16} color="#9CA3AF" />
            <Text style={styles.networkText}>
              {networkConfig?.name || "Unknown Network"}
            </Text>
          </View>
        </ScrollView>

        {/* Submit Button */}
        <View style={styles.footer}>
          <Button
            title={isSubmitting ? "Creating..." : "Create Payment Request"}
            onPress={handleSubmit}
            disabled={!canSubmit || isSubmitting}
          />
        </View>
      </KeyboardAvoidingView>

      {/* Token Selector Modal */}
      <Modal
        visible={showTokenSelector}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTokenSelector(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Token</Text>
              <TouchableOpacity onPress={() => setShowTokenSelector(false)}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.tokenList}>
              {tokenOptions.map((token, index) => (
                <TouchableOpacity
                  key={`${token.address}-${index}`}
                  style={[
                    styles.tokenOption,
                    selectedToken.address === token.address &&
                      styles.tokenOptionSelected,
                  ]}
                  onPress={() => {
                    setSelectedToken(token);
                    setShowTokenSelector(false);
                  }}
                >
                  <View style={styles.tokenOptionInfo}>
                    <Text style={styles.tokenOptionSymbol}>{token.symbol}</Text>
                    {token.name && (
                      <Text style={styles.tokenOptionName}>{token.name}</Text>
                    )}
                  </View>
                  {selectedToken.address === token.address && (
                    <Ionicons name="checkmark" size={20} color="#569F8C" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
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
  scrollView: {
    flex: 1,
    padding: 16,
  },
  section: {
    backgroundColor: "#1E2E29",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    color: "#9CA3AF",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 12,
  },
  editButton: {
    color: "#569F8C",
    fontSize: 14,
    fontWeight: "500",
  },
  inputGroup: {
    marginBottom: 12,
  },
  label: {
    color: "#9CA3AF",
    fontSize: 14,
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#374151",
    borderRadius: 12,
    padding: 14,
    color: "#FFFFFF",
    fontSize: 16,
  },
  inputDisabled: {
    opacity: 0.5,
  },
  textArea: {
    minHeight: 60,
    textAlignVertical: "top",
  },
  savedAddress: {
    color: "#10B981",
    fontSize: 14,
    fontFamily: "monospace",
    marginBottom: 8,
  },
  helperText: {
    color: "#6B7280",
    fontSize: 12,
    marginTop: 8,
  },
  amountRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  amountInputContainer: {
    flex: 1,
  },
  amountInput: {
    fontSize: 20,
    fontWeight: "600",
  },
  tokenContainer: {
    width: 80,
  },
  tokenBadge: {
    backgroundColor: "#374151",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  tokenText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  itemsList: {
    marginBottom: 12,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#374151",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  itemName: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
  },
  itemQty: {
    color: "#9CA3AF",
    fontSize: 14,
    marginRight: 12,
  },
  itemPrice: {
    color: "#10B981",
    fontSize: 14,
    fontWeight: "500",
    marginRight: 8,
  },
  removeButton: {
    padding: 4,
  },
  addItemRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  itemNameInput: {
    flex: 1,
  },
  itemQtyInput: {
    width: 60,
    textAlign: "center",
  },
  itemPriceInput: {
    width: 80,
  },
  addButton: {
    backgroundColor: "#569F8C",
    borderRadius: 8,
    padding: 12,
  },
  networkInfo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
  },
  networkText: {
    color: "#9CA3AF",
    fontSize: 14,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#1E2E29",
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
  tokenSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1E2E29",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#1A2421",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "60%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1E2E29",
  },
  modalTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },
  tokenList: {
    padding: 16,
  },
  tokenOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: "#0F1512",
  },
  tokenOptionSelected: {
    borderWidth: 1,
    borderColor: "#569F8C",
  },
  tokenOptionInfo: {
    flex: 1,
  },
  tokenOptionSymbol: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  tokenOptionName: {
    color: "#9CA3AF",
    fontSize: 12,
    marginTop: 2,
  },
});
