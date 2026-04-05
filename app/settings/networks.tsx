import { useAccentColor, tintedBackground } from "@/store/appearance";
import { ChainId, DEFAULT_NETWORKS } from "@/app/profiles/client";
import { useNetworkStore } from "@/store/network";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
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

// Network metadata
const NETWORK_META: Record<number, { icon: string }> = {
  [ChainId.mainnet]: { icon: "🔷" },
  [ChainId.polygon]: { icon: "🟣" },
  [ChainId.arbitrum]: { icon: "🔵" },
  [ChainId.optimism]: { icon: "🔴" },
  [ChainId.base]: { icon: "🔵" },
  [ChainId.avalanche]: { icon: "🔺" },
  [ChainId.bsc]: { icon: "🟡" },
  [ChainId.zora]: { icon: "🟢" },
  [ChainId.goerli]: { icon: "🧪" },
  [ChainId.sepolia]: { icon: "🧪" },
};

export default function NetworkSettingsScreen() {
  const accentColor = useAccentColor();
  const bg = tintedBackground(accentColor);
  const router = useRouter();
  const customRpcUrls = useNetworkStore((s) => s.customRpcUrls);
  const customNetworks = useNetworkStore((s) => s.customNetworks);
  const enabledNetworks = useNetworkStore((s) => s.enabledNetworks);
  const favoriteNetworks = useNetworkStore((s) => s.favoriteNetworks);
  const setCustomRpcUrl = useNetworkStore((s) => s.setCustomRpcUrl);
  const resetRpcToDefault = useNetworkStore((s) => s.resetRpcToDefault);
  const toggleNetwork = useNetworkStore((s) => s.toggleNetwork);
  const toggleFavorite = useNetworkStore((s) => s.toggleFavorite);
  const addCustomNetwork = useNetworkStore((s) => s.addCustomNetwork);
  const removeCustomNetwork = useNetworkStore((s) => s.removeCustomNetwork);

  const [editingChain, setEditingChain] = useState<number | null>(null);
  const [rpcInput, setRpcInput] = useState("");
  const [showAddNetwork, setShowAddNetwork] = useState(false);

  // Add network form state
  const [newNetwork, setNewNetwork] = useState({
    chainId: "",
    name: "",
    rpcUrl: "",
    symbol: "",
    decimals: "18",
    blockExplorerUrl: "",
  });

  const allBuiltInNetworks = Object.values(ChainId).filter(
    (v) => typeof v === "number",
  ) as ChainId[];

  const handleEditRpc = (chainId: number) => {
    const currentCustom = customRpcUrls[chainId];
    setRpcInput(currentCustom || "");
    setEditingChain(chainId);
  };

  const handleSaveRpc = () => {
    if (editingChain === null) return;

    const trimmedUrl = rpcInput.trim();

    if (trimmedUrl && !trimmedUrl.startsWith("http")) {
      Alert.alert("Invalid URL", "RPC URL must start with http:// or https://");
      return;
    }

    setCustomRpcUrl(editingChain, trimmedUrl || null);
    setEditingChain(null);
    setRpcInput("");

    Alert.alert(
      "RPC Updated",
      trimmedUrl
        ? "Custom RPC URL saved. Provider cache has been cleared."
        : "Reset to default RPC URL.",
    );
  };

  const handleResetRpc = (chainId: number) => {
    Alert.alert("Reset RPC", "Reset this network to the default RPC URL?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reset",
        onPress: () => resetRpcToDefault(chainId),
      },
    ]);
  };

  const getEffectiveRpcUrl = (chainId: number): string => {
    const customUrl = customRpcUrls[chainId];
    if (customUrl) return customUrl;
    const customNetwork = customNetworks.find((n) => n.chainId === chainId);
    if (customNetwork) return customNetwork.rpcUrl;
    return DEFAULT_NETWORKS[chainId as ChainId]?.rpcUrl || "";
  };

  const isCustomRpc = (chainId: number): boolean => {
    return !!customRpcUrls[chainId];
  };

  const handleAddNetwork = () => {
    const chainId = parseInt(newNetwork.chainId);
    const decimals = parseInt(newNetwork.decimals);

    if (!chainId || isNaN(chainId)) {
      Alert.alert("Error", "Please enter a valid Chain ID");
      return;
    }

    if (!newNetwork.name.trim()) {
      Alert.alert("Error", "Please enter a network name");
      return;
    }

    if (!newNetwork.rpcUrl.trim() || !newNetwork.rpcUrl.startsWith("http")) {
      Alert.alert("Error", "Please enter a valid RPC URL");
      return;
    }

    if (!newNetwork.symbol.trim()) {
      Alert.alert("Error", "Please enter a currency symbol");
      return;
    }

    // Check if chain ID already exists
    const allChainIds = [
      ...allBuiltInNetworks,
      ...customNetworks.map((n) => n.chainId),
    ];
    if (allChainIds.includes(chainId)) {
      Alert.alert("Error", "A network with this Chain ID already exists");
      return;
    }

    addCustomNetwork({
      chainId,
      name: newNetwork.name.trim(),
      rpcUrl: newNetwork.rpcUrl.trim(),
      symbol: newNetwork.symbol.trim().toUpperCase(),
      decimals: isNaN(decimals) ? 18 : decimals,
      blockExplorerUrl: newNetwork.blockExplorerUrl.trim() || undefined,
    });

    setShowAddNetwork(false);
    setNewNetwork({
      chainId: "",
      name: "",
      rpcUrl: "",
      symbol: "",
      decimals: "18",
      blockExplorerUrl: "",
    });

    Alert.alert("Success", "Custom network added successfully!");
  };

  const handleRemoveCustomNetwork = (chainId: number, name: string) => {
    Alert.alert(
      "Remove Network",
      `Are you sure you want to remove "${name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => removeCustomNetwork(chainId),
        },
      ],
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Network Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content}>
        <Text style={styles.sectionTitle}>Networks</Text>
        <Text style={styles.sectionSubtitle}>
          Enable/disable networks and configure custom RPC URLs
        </Text>

        {allBuiltInNetworks.map((chainId) => {
          const config = DEFAULT_NETWORKS[chainId];
          const meta = NETWORK_META[chainId] || { icon: "⚫" };
          const isEnabled = enabledNetworks.includes(chainId);
          const isFavorite = favoriteNetworks.includes(chainId);
          const hasCustomRpc = isCustomRpc(chainId);
          const rpcUrl = getEffectiveRpcUrl(chainId);

          return (
            <View key={chainId} style={styles.networkCard}>
              <View style={styles.networkHeader}>
                <Text style={styles.networkIcon}>{meta.icon}</Text>
                <View style={styles.networkInfo}>
                  <Text style={styles.networkName}>{config?.name}</Text>
                  <Text style={styles.chainIdText}>Chain ID: {chainId}</Text>
                </View>
                <View style={styles.networkActions}>
                  <TouchableOpacity
                    style={[
                      styles.iconButton,
                      isFavorite && styles.activeButton,
                    ]}
                    onPress={() => toggleFavorite(chainId)}
                  >
                    <Ionicons
                      name={isFavorite ? "star" : "star-outline"}
                      size={20}
                      color={isFavorite ? "#F59E0B" : "#9CA3AF"}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.iconButton,
                      isEnabled && styles.activeButton,
                    ]}
                    onPress={() => toggleNetwork(chainId)}
                  >
                    <Ionicons
                      name={isEnabled ? "eye" : "eye-off-outline"}
                      size={20}
                      color={isEnabled ? "#10B981" : "#9CA3AF"}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.rpcSection}>
                <View style={styles.rpcHeader}>
                  <Text style={styles.rpcLabel}>
                    RPC URL{" "}
                    {hasCustomRpc && (
                      <Text style={[styles.customBadge, { color: accentColor }]}>(Custom)</Text>
                    )}
                  </Text>
                  {hasCustomRpc && (
                    <TouchableOpacity onPress={() => handleResetRpc(chainId)}>
                      <Text style={[styles.resetLink, { color: accentColor }]}>Reset</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {editingChain === chainId ? (
                  <View style={styles.editRpcContainer}>
                    <TextInput
                      style={[styles.rpcInput, { borderColor: accentColor }]}
                      value={rpcInput}
                      onChangeText={setRpcInput}
                      placeholder="https://..."
                      placeholderTextColor="#6B7280"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <View style={styles.editButtons}>
                      <TouchableOpacity
                        style={styles.cancelButton}
                        onPress={() => {
                          setEditingChain(null);
                          setRpcInput("");
                        }}
                      >
                        <Text style={styles.cancelButtonText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.saveButton, { backgroundColor: accentColor }]}
                        onPress={handleSaveRpc}
                      >
                        <Text style={styles.saveButtonText}>Save</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.rpcUrlContainer}
                    onPress={() => handleEditRpc(chainId)}
                  >
                    <Text style={styles.rpcUrl} numberOfLines={1}>
                      {rpcUrl}
                    </Text>
                    <Ionicons name="pencil" size={16} color="#9CA3AF" />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}

        {/* Custom Networks Section */}
        {customNetworks.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>
              Custom Networks
            </Text>
            {customNetworks.map((network) => {
              const isEnabled = enabledNetworks.includes(network.chainId);
              const isFavorite = favoriteNetworks.includes(network.chainId);

              return (
                <View key={network.chainId} style={styles.networkCard}>
                  <View style={styles.networkHeader}>
                    <Text style={styles.networkIcon}>🌐</Text>
                    <View style={styles.networkInfo}>
                      <Text style={styles.networkName}>{network.name}</Text>
                      <Text style={styles.chainIdText}>
                        Chain ID: {network.chainId} • {network.symbol}
                      </Text>
                    </View>
                    <View style={styles.networkActions}>
                      <TouchableOpacity
                        style={[
                          styles.iconButton,
                          isFavorite && styles.activeButton,
                        ]}
                        onPress={() => toggleFavorite(network.chainId)}
                      >
                        <Ionicons
                          name={isFavorite ? "star" : "star-outline"}
                          size={20}
                          color={isFavorite ? "#F59E0B" : "#9CA3AF"}
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.iconButton}
                        onPress={() =>
                          handleRemoveCustomNetwork(
                            network.chainId,
                            network.name,
                          )
                        }
                      >
                        <Ionicons
                          name="trash-outline"
                          size={20}
                          color="#EF4444"
                        />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.rpcSection}>
                    <Text style={styles.rpcLabel}>RPC URL</Text>
                    <View style={[styles.rpcUrlContainer, { marginTop: 8 }]}>
                      <Text style={styles.rpcUrl} numberOfLines={1}>
                        {network.rpcUrl}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </>
        )}

        {/* Add Custom Network Button */}
        <TouchableOpacity
          style={[styles.addNetworkButton, { borderColor: accentColor }]}
          onPress={() => setShowAddNetwork(true)}
        >
          <Ionicons name="add-circle-outline" size={24} color={accentColor} />
          <Text style={[styles.addNetworkText, { color: accentColor }]}>Add Custom Network</Text>
        </TouchableOpacity>

        <View style={styles.helpSection}>
          <Ionicons
            name="information-circle-outline"
            size={20}
            color="#9CA3AF"
          />
          <Text style={styles.helpText}>
            Custom RPC URLs allow you to use your own RPC provider for better
            performance or privacy. You can also add entirely new EVM networks.
          </Text>
        </View>
      </ScrollView>

      {/* Add Network Modal */}
      <Modal
        visible={showAddNetwork}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddNetwork(false)}
      >
        <KeyboardAvoidingView
          behavior="padding"
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Custom Network</Text>
              <TouchableOpacity onPress={() => setShowAddNetwork(false)}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalForm}>
              <Text style={styles.inputLabel}>Network Name *</Text>
              <TextInput
                style={styles.modalInput}
                value={newNetwork.name}
                onChangeText={(v) => setNewNetwork({ ...newNetwork, name: v })}
                placeholder="e.g., Polygon zkEVM"
                placeholderTextColor="#6B7280"
              />

              <Text style={styles.inputLabel}>Chain ID *</Text>
              <TextInput
                style={styles.modalInput}
                value={newNetwork.chainId}
                onChangeText={(v) =>
                  setNewNetwork({ ...newNetwork, chainId: v })
                }
                placeholder="e.g., 1101"
                placeholderTextColor="#6B7280"
                keyboardType="number-pad"
              />

              <Text style={styles.inputLabel}>RPC URL *</Text>
              <TextInput
                style={styles.modalInput}
                value={newNetwork.rpcUrl}
                onChangeText={(v) =>
                  setNewNetwork({ ...newNetwork, rpcUrl: v })
                }
                placeholder="https://..."
                placeholderTextColor="#6B7280"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Text style={styles.inputLabel}>Currency Symbol *</Text>
              <TextInput
                style={styles.modalInput}
                value={newNetwork.symbol}
                onChangeText={(v) =>
                  setNewNetwork({ ...newNetwork, symbol: v })
                }
                placeholder="e.g., ETH"
                placeholderTextColor="#6B7280"
                autoCapitalize="characters"
              />

              <Text style={styles.inputLabel}>Decimals</Text>
              <TextInput
                style={styles.modalInput}
                value={newNetwork.decimals}
                onChangeText={(v) =>
                  setNewNetwork({ ...newNetwork, decimals: v })
                }
                placeholder="18"
                placeholderTextColor="#6B7280"
                keyboardType="number-pad"
              />

              <Text style={styles.inputLabel}>
                Block Explorer URL (optional)
              </Text>
              <TextInput
                style={styles.modalInput}
                value={newNetwork.blockExplorerUrl}
                onChangeText={(v) =>
                  setNewNetwork({ ...newNetwork, blockExplorerUrl: v })
                }
                placeholder="https://explorer.example.com"
                placeholderTextColor="#6B7280"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </ScrollView>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowAddNetwork(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, { backgroundColor: accentColor }]}
                onPress={handleAddNetwork}
              >
                <Text style={styles.saveButtonText}>Add Network</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
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
    padding: 16,
  },
  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
  },
  sectionSubtitle: {
    color: "#9CA3AF",
    fontSize: 14,
    marginBottom: 24,
  },
  networkCard: {
    backgroundColor: "#1E2E29",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  networkHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  networkIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  networkInfo: {
    flex: 1,
  },
  networkName: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  chainIdText: {
    color: "#6B7280",
    fontSize: 12,
    marginTop: 2,
  },
  networkActions: {
    flexDirection: "row",
    gap: 8,
  },
  iconButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#374151",
  },
  activeButton: {
    backgroundColor: "#374151",
  },
  rpcSection: {
    borderTopWidth: 1,
    borderTopColor: "#374151",
    paddingTop: 12,
  },
  rpcHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  rpcLabel: {
    color: "#9CA3AF",
    fontSize: 12,
    fontWeight: "500",
  },
  customBadge: {
    color: "#569F8C",
  },
  resetLink: {
    color: "#569F8C",
    fontSize: 12,
    fontWeight: "500",
  },
  rpcUrlContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#374151",
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  rpcUrl: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "monospace",
  },
  editRpcContainer: {
    gap: 12,
  },
  rpcInput: {
    backgroundColor: "#374151",
    borderRadius: 8,
    padding: 12,
    color: "#FFFFFF",
    fontSize: 14,
    borderWidth: 1,
    borderColor: "#569F8C",
  },
  editButtons: {
    flexDirection: "row",
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#374151",
    alignItems: "center",
  },
  cancelButtonText: {
    color: "#FFFFFF",
    fontWeight: "500",
  },
  saveButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#569F8C",
    alignItems: "center",
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  helpSection: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: "#1E2E29",
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    marginBottom: 32,
  },
  helpText: {
    flex: 1,
    color: "#9CA3AF",
    fontSize: 13,
    lineHeight: 18,
  },
  addNetworkButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#1E2E29",
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#569F8C",
    borderStyle: "dashed",
  },
  addNetworkText: {
    color: "#569F8C",
    fontSize: 16,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#1E2E29",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  modalTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "700",
  },
  modalForm: {
    marginBottom: 16,
  },
  inputLabel: {
    color: "#9CA3AF",
    fontSize: 12,
    fontWeight: "500",
    marginBottom: 8,
    marginTop: 16,
  },
  modalInput: {
    backgroundColor: "#374151",
    borderRadius: 12,
    padding: 14,
    color: "#FFFFFF",
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#4B5563",
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
});
