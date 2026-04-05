import { useAccentColor, tintedBackground } from "@/store/appearance";
import {
  DEFAULT_GAS_LIMITS,
  GasSpeed,
  TransactionType,
  useGasStore,
} from "@/store/gas";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const SPEED_OPTIONS: {
  speed: GasSpeed;
  label: string;
  icon: string;
  description: string;
}[] = [
  {
    speed: "slow",
    label: "Slow",
    icon: "🐢",
    description: "Lower fees, longer wait",
  },
  {
    speed: "normal",
    label: "Normal",
    icon: "⚡",
    description: "Balanced speed and cost",
  },
  {
    speed: "fast",
    label: "Fast",
    icon: "🚀",
    description: "Higher fees, faster confirmation",
  },
];

const TRANSACTION_TYPES: {
  type: TransactionType;
  label: string;
  description: string;
}[] = [
  {
    type: "transfer",
    label: "Native Transfer",
    description: "ETH, MATIC, etc.",
  },
  {
    type: "erc20Transfer",
    label: "Token Transfer",
    description: "ERC20 tokens",
  },
  {
    type: "erc20Approve",
    label: "Token Approval",
    description: "Approve spending",
  },
  { type: "swap", label: "Token Swap", description: "DEX swaps" },
  {
    type: "contract",
    label: "Contract Interaction",
    description: "Other contracts",
  },
];

export default function GasSettingsScreen() {
  const accentColor = useAccentColor();
  const bg = tintedBackground(accentColor);
  const router = useRouter();

  const defaultSpeed = useGasStore((s) => s.defaultSpeed);
  const showGasDetails = useGasStore((s) => s.showGasDetails);
  const preferLegacyGas = useGasStore((s) => s.preferLegacyGas);
  const gasConfigs = useGasStore((s) => s.gasConfigs);

  const setDefaultSpeed = useGasStore((s) => s.setDefaultSpeed);
  const toggleGasDetails = useGasStore((s) => s.toggleGasDetails);
  const setPreferLegacyGas = useGasStore((s) => s.setPreferLegacyGas);
  const setGasConfig = useGasStore((s) => s.setGasConfig);
  const resetGasConfig = useGasStore((s) => s.resetGasConfig);
  const resetAllGasSettings = useGasStore((s) => s.resetAllGasSettings);

  const [expandedType, setExpandedType] = useState<TransactionType | null>(
    null,
  );
  const [customGasLimit, setCustomGasLimit] = useState("");
  const [customMaxFee, setCustomMaxFee] = useState("");
  const [customPriorityFee, setCustomPriorityFee] = useState("");

  const handleSpeedSelect = (speed: GasSpeed) => {
    setDefaultSpeed(speed);
  };

  const handleToggleType = (type: TransactionType) => {
    if (expandedType === type) {
      setExpandedType(null);
    } else {
      setExpandedType(type);
      const config = gasConfigs[type];
      setCustomGasLimit(config?.customGasLimit || "");
      setCustomMaxFee(config?.customMaxFee || "");
      setCustomPriorityFee(config?.customPriorityFee || "");
    }
  };

  const handleSaveCustomConfig = (type: TransactionType) => {
    setGasConfig(type, {
      speed: "custom",
      customGasLimit: customGasLimit || undefined,
      customMaxFee: customMaxFee || undefined,
      customPriorityFee: customPriorityFee || undefined,
    });
    Alert.alert("Saved", `Custom gas settings saved for ${type}`);
    setExpandedType(null);
  };

  const handleResetType = (type: TransactionType) => {
    resetGasConfig(type);
    setCustomGasLimit("");
    setCustomMaxFee("");
    setCustomPriorityFee("");
    Alert.alert("Reset", `Gas settings reset for ${type}`);
  };

  const handleResetAll = () => {
    Alert.alert(
      "Reset All Gas Settings",
      "This will reset all gas settings to defaults.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: () => {
            resetAllGasSettings();
            setExpandedType(null);
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Gas Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView style={styles.content}>
        {/* Default Speed Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Default Gas Speed</Text>
          <Text style={styles.sectionSubtitle}>
            This speed will be used for all transactions unless customized
          </Text>

          <View style={styles.speedOptions}>
            {SPEED_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.speed}
                style={[
                  styles.speedCard,
                  defaultSpeed === option.speed && styles.speedCardActive,
                  defaultSpeed === option.speed && { borderColor: accentColor },
                ]}
                onPress={() => handleSpeedSelect(option.speed)}
              >
                <Text style={styles.speedIcon}>{option.icon}</Text>
                <Text
                  style={[
                    styles.speedLabel,
                    defaultSpeed === option.speed && styles.speedLabelActive,
                    defaultSpeed === option.speed && { color: accentColor },
                  ]}
                >
                  {option.label}
                </Text>
                <Text style={styles.speedDescription}>
                  {option.description}
                </Text>
                {defaultSpeed === option.speed && (
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color="#10B981"
                    style={styles.checkIcon}
                  />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Speed Multipliers Info */}
        <View style={styles.infoCard}>
          <Ionicons
            name="information-circle-outline"
            size={20}
            color="#9CA3AF"
          />
          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>Speed Multipliers</Text>
            <Text style={styles.infoText}>
              Slow: ~80% of base fee{"\n"}
              Normal: 100% of base fee{"\n"}
              Fast: ~125% of base fee
            </Text>
          </View>
        </View>

        {/* Options Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Options</Text>

          <TouchableOpacity style={styles.optionRow} onPress={toggleGasDetails}>
            <View style={styles.optionInfo}>
              <Text style={styles.optionLabel}>Show Gas Details</Text>
              <Text style={styles.optionDescription}>
                Display detailed gas breakdown in transactions
              </Text>
            </View>
            <View
              style={[styles.toggle, showGasDetails && styles.toggleActive, showGasDetails && { backgroundColor: accentColor }]}
            >
              <View
                style={[
                  styles.toggleKnob,
                  showGasDetails && styles.toggleKnobActive,
                ]}
              />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.optionRow}
            onPress={() => setPreferLegacyGas(!preferLegacyGas)}
          >
            <View style={styles.optionInfo}>
              <Text style={styles.optionLabel}>Use Legacy Gas</Text>
              <Text style={styles.optionDescription}>
                Use gasPrice instead of EIP-1559 (maxFeePerGas)
              </Text>
            </View>
            <View
              style={[styles.toggle, preferLegacyGas && styles.toggleActive, preferLegacyGas && { backgroundColor: accentColor }]}
            >
              <View
                style={[
                  styles.toggleKnob,
                  preferLegacyGas && styles.toggleKnobActive,
                ]}
              />
            </View>
          </TouchableOpacity>
        </View>

        {/* Per-Transaction Type Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Custom Limits by Transaction Type
          </Text>
          <Text style={styles.sectionSubtitle}>
            Set custom gas limits for specific transaction types
          </Text>

          {TRANSACTION_TYPES.map((txType) => {
            const config = gasConfigs[txType.type];
            const hasCustom = !!config;
            const isExpanded = expandedType === txType.type;

            return (
              <View key={txType.type} style={styles.txTypeCard}>
                <TouchableOpacity
                  style={styles.txTypeHeader}
                  onPress={() => handleToggleType(txType.type)}
                >
                  <View style={styles.txTypeInfo}>
                    <Text style={styles.txTypeLabel}>{txType.label}</Text>
                    <Text style={styles.txTypeDescription}>
                      {txType.description}
                    </Text>
                    <Text style={styles.defaultLimit}>
                      Default: {DEFAULT_GAS_LIMITS[txType.type]} gas
                    </Text>
                  </View>
                  <View style={styles.txTypeRight}>
                    {hasCustom && (
                      <View style={[styles.customBadge, { backgroundColor: accentColor }]}>
                        <Text style={styles.customBadgeText}>Custom</Text>
                      </View>
                    )}
                    <Ionicons
                      name={isExpanded ? "chevron-up" : "chevron-down"}
                      size={20}
                      color="#6B7280"
                    />
                  </View>
                </TouchableOpacity>

                {isExpanded && (
                  <View style={styles.txTypeExpanded}>
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Custom Gas Limit</Text>
                      <TextInput
                        style={styles.input}
                        value={customGasLimit}
                        onChangeText={setCustomGasLimit}
                        placeholder={DEFAULT_GAS_LIMITS[txType.type]}
                        placeholderTextColor="#6B7280"
                        keyboardType="number-pad"
                      />
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Max Fee (Gwei)</Text>
                      <TextInput
                        style={styles.input}
                        value={customMaxFee}
                        onChangeText={setCustomMaxFee}
                        placeholder="Auto"
                        placeholderTextColor="#6B7280"
                        keyboardType="decimal-pad"
                      />
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Priority Fee (Gwei)</Text>
                      <TextInput
                        style={styles.input}
                        value={customPriorityFee}
                        onChangeText={setCustomPriorityFee}
                        placeholder="Auto"
                        placeholderTextColor="#6B7280"
                        keyboardType="decimal-pad"
                      />
                    </View>

                    <View style={styles.expandedButtons}>
                      {hasCustom && (
                        <TouchableOpacity
                          style={styles.resetButton}
                          onPress={() => handleResetType(txType.type)}
                        >
                          <Text style={styles.resetButtonText}>
                            Reset to Default
                          </Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={[styles.saveButton, { backgroundColor: accentColor }]}
                        onPress={() => handleSaveCustomConfig(txType.type)}
                      >
                        <Text style={styles.saveButtonText}>Save</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Reset All */}
        <TouchableOpacity
          style={styles.resetAllButton}
          onPress={handleResetAll}
        >
          <Ionicons name="refresh" size={20} color="#EF4444" />
          <Text style={styles.resetAllText}>Reset All Gas Settings</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
      </KeyboardAvoidingView>
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
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
  sectionSubtitle: {
    color: "#9CA3AF",
    fontSize: 14,
    marginBottom: 16,
  },
  speedOptions: {
    gap: 12,
  },
  speedCard: {
    backgroundColor: "#1E2E29",
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: "transparent",
  },
  speedCardActive: {
    borderColor: "#569F8C",
  },
  speedIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  speedLabel: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  speedLabelActive: {
    color: "#569F8C",
  },
  speedDescription: {
    color: "#9CA3AF",
    fontSize: 13,
  },
  checkIcon: {
    position: "absolute",
    top: 16,
    right: 16,
  },
  infoCard: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: "#1E2E29",
    borderRadius: 12,
    padding: 16,
    marginBottom: 32,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  infoText: {
    color: "#9CA3AF",
    fontSize: 13,
    lineHeight: 20,
  },
  optionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#1E2E29",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  optionInfo: {
    flex: 1,
    marginRight: 16,
  },
  optionLabel: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 4,
  },
  optionDescription: {
    color: "#6B7280",
    fontSize: 13,
  },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#374151",
    padding: 2,
    justifyContent: "center",
  },
  toggleActive: {
    backgroundColor: "#569F8C",
  },
  toggleKnob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },
  toggleKnobActive: {
    alignSelf: "flex-end",
  },
  txTypeCard: {
    backgroundColor: "#1E2E29",
    borderRadius: 12,
    marginBottom: 12,
    overflow: "hidden",
  },
  txTypeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
  },
  txTypeInfo: {
    flex: 1,
  },
  txTypeLabel: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 2,
  },
  txTypeDescription: {
    color: "#9CA3AF",
    fontSize: 13,
    marginBottom: 4,
  },
  defaultLimit: {
    color: "#6B7280",
    fontSize: 12,
    fontFamily: "monospace",
  },
  txTypeRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  customBadge: {
    backgroundColor: "#569F8C",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  customBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "600",
  },
  txTypeExpanded: {
    padding: 16,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: "#374151",
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    color: "#9CA3AF",
    fontSize: 12,
    fontWeight: "500",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#374151",
    borderRadius: 8,
    padding: 12,
    color: "#FFFFFF",
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#4B5563",
  },
  expandedButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  resetButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#374151",
    alignItems: "center",
  },
  resetButtonText: {
    color: "#FFFFFF",
    fontWeight: "500",
  },
  saveButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#569F8C",
    alignItems: "center",
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  resetAllButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#1E2E29",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#EF4444",
  },
  resetAllText: {
    color: "#EF4444",
    fontSize: 16,
    fontWeight: "500",
  },
});
