import { ChainId, EthersClient } from "@/app/profiles/client";
import { TokenInfo } from "@/config/tokens";
import { ERC20Service, MAX_UINT256 } from "@/services/erc20";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Button } from "./Button";

interface ApprovalModalProps {
  visible: boolean;
  onClose: () => void;
  onApprove: (amount: bigint) => Promise<void>;
  token: TokenInfo;
  spenderAddress: string;
  spenderName?: string;
  requiredAmount: string;
  ownerAddress: string;
  chainId: ChainId;
}

type ApprovalType = "exact" | "unlimited" | "custom";

export function ApprovalModal({
  visible,
  onClose,
  onApprove,
  token,
  spenderAddress,
  spenderName = "Contract",
  requiredAmount,
  ownerAddress,
  chainId,
}: ApprovalModalProps) {
  const [approvalType, setApprovalType] = useState<ApprovalType>("exact");
  const [customAmount, setCustomAmount] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentAllowance, setCurrentAllowance] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch current allowance on mount
  useEffect(() => {
    if (visible) {
      fetchAllowance();
    }
  }, [visible, token.address, ownerAddress, spenderAddress]);

  const fetchAllowance = async () => {
    try {
      const allowance = await ERC20Service.getAllowance(
        token.address,
        ownerAddress,
        spenderAddress,
        chainId,
      );
      setCurrentAllowance(EthersClient.formatUnits(allowance, token.decimals));
    } catch (e) {
      console.warn("Failed to fetch allowance", e);
    }
  };

  const handleApprove = async () => {
    setError(null);
    setIsLoading(true);

    try {
      let amount: bigint;

      switch (approvalType) {
        case "unlimited":
          amount = MAX_UINT256;
          break;
        case "custom":
          if (!customAmount || parseFloat(customAmount) <= 0) {
            throw new Error("Please enter a valid amount");
          }
          amount = EthersClient.parseUnits(customAmount, token.decimals);
          break;
        case "exact":
        default:
          amount = EthersClient.parseUnits(requiredAmount, token.decimals);
          break;
      }

      await onApprove(amount);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approval failed");
    } finally {
      setIsLoading(false);
    }
  };

  const getApprovalDescription = () => {
    switch (approvalType) {
      case "unlimited":
        return `Allow ${spenderName} to spend unlimited ${token.symbol}. This is convenient but gives full access to your tokens.`;
      case "custom":
        return `Set a custom spending limit for ${spenderName}.`;
      case "exact":
      default:
        return `Allow ${spenderName} to spend exactly ${requiredAmount} ${token.symbol}. Safest option.`;
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Token Approval</Text>
            <TouchableOpacity onPress={onClose} disabled={isLoading}>
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Token Info */}
          <View style={styles.tokenInfo}>
            <View style={styles.tokenIcon}>
              <Text style={styles.tokenIconText}>
                {token.symbol.slice(0, 2)}
              </Text>
            </View>
            <View>
              <Text style={styles.tokenName}>{token.name}</Text>
              <Text style={styles.tokenSymbol}>{token.symbol}</Text>
            </View>
          </View>

          {/* Current Allowance */}
          {currentAllowance !== null && (
            <View style={styles.allowanceInfo}>
              <Text style={styles.allowanceLabel}>Current Allowance:</Text>
              <Text style={styles.allowanceValue}>
                {parseFloat(currentAllowance) > 1e15
                  ? "Unlimited"
                  : `${parseFloat(currentAllowance).toFixed(4)} ${token.symbol}`}
              </Text>
            </View>
          )}

          {/* Approval Options */}
          <View style={styles.optionsContainer}>
            <TouchableOpacity
              style={[
                styles.option,
                approvalType === "exact" && styles.optionSelected,
              ]}
              onPress={() => setApprovalType("exact")}
              disabled={isLoading}
            >
              <View style={styles.optionHeader}>
                <View
                  style={[
                    styles.radio,
                    approvalType === "exact" && styles.radioSelected,
                  ]}
                />
                <Text style={styles.optionTitle}>Exact Amount</Text>
                <View style={styles.recommendedBadge}>
                  <Text style={styles.recommendedText}>Recommended</Text>
                </View>
              </View>
              <Text style={styles.optionAmount}>
                {requiredAmount} {token.symbol}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.option,
                approvalType === "unlimited" && styles.optionSelected,
              ]}
              onPress={() => setApprovalType("unlimited")}
              disabled={isLoading}
            >
              <View style={styles.optionHeader}>
                <View
                  style={[
                    styles.radio,
                    approvalType === "unlimited" && styles.radioSelected,
                  ]}
                />
                <Text style={styles.optionTitle}>Unlimited</Text>
              </View>
              <Text style={styles.optionDescription}>
                No future approvals needed
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.option,
                approvalType === "custom" && styles.optionSelected,
              ]}
              onPress={() => setApprovalType("custom")}
              disabled={isLoading}
            >
              <View style={styles.optionHeader}>
                <View
                  style={[
                    styles.radio,
                    approvalType === "custom" && styles.radioSelected,
                  ]}
                />
                <Text style={styles.optionTitle}>Custom Amount</Text>
              </View>
              {approvalType === "custom" && (
                <TextInput
                  style={styles.customInput}
                  placeholder={`Enter ${token.symbol} amount`}
                  placeholderTextColor="#6B7280"
                  keyboardType="decimal-pad"
                  value={customAmount}
                  onChangeText={setCustomAmount}
                  editable={!isLoading}
                />
              )}
            </TouchableOpacity>
          </View>

          {/* Description */}
          <View style={styles.descriptionContainer}>
            <Ionicons name="information-circle" size={20} color="#6B7280" />
            <Text style={styles.description}>{getApprovalDescription()}</Text>
          </View>

          {/* Error */}
          {error && (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={16} color="#EF4444" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Spender Info */}
          <View style={styles.spenderInfo}>
            <Text style={styles.spenderLabel}>Approving for:</Text>
            <Text style={styles.spenderAddress} numberOfLines={1}>
              {spenderAddress.slice(0, 10)}...{spenderAddress.slice(-8)}
            </Text>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <Button
              title="Cancel"
              variant="outline"
              onPress={onClose}
              disabled={isLoading}
              style={styles.cancelButton}
            />
            <Button
              title={isLoading ? "Approving..." : "Approve"}
              variant="primary"
              onPress={handleApprove}
              loading={isLoading}
              disabled={isLoading}
              style={styles.approveButton}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  container: {
    backgroundColor: "#0F1512",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: "90%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  tokenInfo: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1E2E29",
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  tokenIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#374151",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  tokenIconText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  tokenName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  tokenSymbol: {
    fontSize: 14,
    color: "#9CA3AF",
  },
  allowanceInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#1E2E29",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  allowanceLabel: {
    fontSize: 14,
    color: "#9CA3AF",
  },
  allowanceValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  optionsContainer: {
    gap: 12,
    marginBottom: 16,
  },
  option: {
    backgroundColor: "#1E2E29",
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: "transparent",
  },
  optionSelected: {
    borderColor: "#569F8C",
  },
  optionHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#6B7280",
    marginRight: 12,
  },
  radioSelected: {
    borderColor: "#569F8C",
    backgroundColor: "#569F8C",
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
    flex: 1,
  },
  recommendedBadge: {
    backgroundColor: "#059669",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  recommendedText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  optionAmount: {
    fontSize: 14,
    color: "#9CA3AF",
    marginTop: 4,
    marginLeft: 32,
  },
  optionDescription: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 4,
    marginLeft: 32,
  },
  customInput: {
    backgroundColor: "#374151",
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    marginLeft: 32,
    color: "#FFFFFF",
    fontSize: 14,
  },
  descriptionContainer: {
    flexDirection: "row",
    backgroundColor: "#1E2E29",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    alignItems: "flex-start",
    gap: 8,
  },
  description: {
    flex: 1,
    fontSize: 13,
    color: "#9CA3AF",
    lineHeight: 18,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    flex: 1,
    color: "#EF4444",
    fontSize: 13,
  },
  spenderInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  spenderLabel: {
    fontSize: 14,
    color: "#9CA3AF",
  },
  spenderAddress: {
    fontSize: 12,
    color: "#6B7280",
    fontFamily: "monospace",
    maxWidth: "60%",
  },
  actions: {
    flexDirection: "row",
    gap: 12,
  },
  cancelButton: {
    flex: 1,
  },
  approveButton: {
    flex: 2,
  },
});

export default ApprovalModal;
