import { ChainId, EthersClient } from "@/app/profiles/client";
import type { NetworkCapabilities, NetworkInfo } from "@/crypto/types";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { tintedBackground, useAccentColor } from "@/store/appearance";
import { useNetworkStore } from "@/store/network";
import { useProviderStore } from "@/store/provider";
import { useSelectedAccount } from "@/store/wallet";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo } from "react";
import {
    FlatList,
    Modal,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

// ---------------------------------------------------------------------------
// EVM network metadata
// ---------------------------------------------------------------------------

const NETWORK_META: Record<ChainId, { icon: string; color: string }> = {
  [ChainId.mainnet]: { icon: "🔷", color: "#627EEA" },
  [ChainId.polygon]: { icon: "🟣", color: "#8247E5" },
  [ChainId.arbitrum]: { icon: "🔵", color: "#28A0F0" },
  [ChainId.optimism]: { icon: "🔴", color: "#FF0420" },
  [ChainId.base]: { icon: "🔵", color: "#0052FF" },
  [ChainId.avalanche]: { icon: "🔺", color: "#E84142" },
  [ChainId.bsc]: { icon: "🟡", color: "#F0B90B" },
  [ChainId.zora]: { icon: "🟢", color: "#00FF00" },
  [ChainId.goerli]: { icon: "🧪", color: "#9CA3AF" },
  [ChainId.sepolia]: { icon: "🧪", color: "#9CA3AF" },
  [ChainId.plasmaTestnet]: { icon: "⚡", color: "#FF6B00" },
  [ChainId.chilizSpicy]: { icon: "🌶️", color: "#CD0000" },
};

// ---------------------------------------------------------------------------
// Hardcoded Solana networks (served via API provider)
// ---------------------------------------------------------------------------

const SOL_CAPS: NetworkCapabilities = {
  createKeypair: true,
  importPrivateKey: true,
  importMnemonic: false,
  supportsNativeTransfers: true,
  supportsTokenTransfers: true,
  supportsContracts: false,
  supportsTransactionSimulation: false,
  supportsHistory: true,
  supportsNameService: false,
  supportsTrustLines: false,
  supportsChecks: false,
};

export const SOLANA_NETWORKS: NetworkInfo[] = [
  {
    networkId: "dynamic-mainnet",
    family: "solana",
    chainId: "101",
    displayName: "Solana",
    symbol: "SOL",
    decimals: 9,
    isTestnet: false,
    rpc: { publicRpcUrls: [], explorerTxBaseUrl: "https://solscan.io/tx/" },
    capabilities: SOL_CAPS,
  },
  {
    networkId: "dynamic-testnet",
    family: "solana",
    chainId: "103",
    displayName: "Solana Devnet",
    symbol: "SOL",
    decimals: 9,
    isTestnet: true,
    rpc: {
      publicRpcUrls: [],
      explorerTxBaseUrl: "https://solscan.io/tx/?cluster=devnet",
    },
    capabilities: SOL_CAPS,
  },
];

// ---------------------------------------------------------------------------
// NetworkSelector
// ---------------------------------------------------------------------------

interface NetworkSelectorProps {
  visible: boolean;
  selectedChainId: ChainId;
  onSelect: (chainId: ChainId) => void;
  onClose: () => void;
}

export function NetworkSelector({
  visible,
  selectedChainId,
  onSelect,
  onClose,
}: NetworkSelectorProps) {
  const accentColor = useAccentColor();
  const bg = tintedBackground(accentColor);
  const scheme = useColorScheme() ?? "dark";
  const isLight = scheme === "light";
  const panelBorder = isLight ? "#D5E2DC" : "#1E2E29";
  const rowBg = isLight ? "#FFFFFF" : "#1E2E29";
  const titleColor = isLight ? "#0F172A" : "#FFFFFF";
  const nameColor = isLight ? "#11181C" : "#FFFFFF";
  const closeColor = isLight ? "#0F172A" : "#FFFFFF";
  const providerType = useProviderStore((s) => s.providerType);
  const setProviderType = useProviderStore((s) => s.setProviderType);
  const selectedApiNetworkId = useProviderStore((s) => s.selectedApiNetworkId);
  const setSelectedApiNetworkId = useProviderStore((s) => s.setSelectedApiNetworkId);

  const selectedAccount = useSelectedAccount();
  const isSolanaAccount = selectedAccount?.accountType === "solana";

  // When the modal opens, ensure the provider matches the account type.
  useEffect(() => {
    if (!visible) return;
    if (isSolanaAccount && providerType !== "api") {
      // Auto-select Solana mainnet when switching to a Solana account
      const defaultSolana = SOLANA_NETWORKS[0];
      setSelectedApiNetworkId(defaultSolana.networkId);
      setProviderType("api");
    } else if (!isSolanaAccount && providerType === "api") {
      // If the active API network is Solana, revert to EVM
      const isOnSolana = SOLANA_NETWORKS.some((n) => n.networkId === selectedApiNetworkId);
      if (isOnSolana) setProviderType("evm");
    }
  }, [visible, isSolanaAccount]);

  // EVM network list
  const enabledNetworks = useNetworkStore((s) => s.enabledNetworks);
  const favoriteNetworks = useNetworkStore((s) => s.favoriteNetworks);

  const evmNetworks = useMemo(() => {
    const favorites = favoriteNetworks.filter((id) => enabledNetworks.includes(id));
    const others = enabledNetworks.filter((id) => !favoriteNetworks.includes(id));
    return [...favorites, ...others].map((chainId) => {
      const config = EthersClient.getNetworkConfig(chainId);
      const meta = NETWORK_META[chainId as ChainId] ?? { icon: "⚫", color: "#9CA3AF" };
      return {
        chainId,
        name: config?.name ?? `Chain ${chainId}`,
        currency: config?.nativeCurrency?.symbol ?? "ETH",
        icon: meta.icon,
        isFavorite: favoriteNetworks.includes(chainId),
      };
    });
  }, [enabledNetworks, favoriteNetworks]);

  const handleSelectEvm = (chainId: ChainId) => {
    setProviderType("evm");
    onSelect(chainId);
    onClose();
  };

  const handleSelectSolana = (network: NetworkInfo) => {
    setSelectedApiNetworkId(network.networkId);
    setProviderType("api");
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.modal, { backgroundColor: bg }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: panelBorder }]}>
            <Text style={[styles.title, { color: titleColor }]}> 
              {isSolanaAccount ? "☀️  Solana Networks" : "⛓️  EVM Networks"}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={closeColor} />
            </TouchableOpacity>
          </View>

          {/* EVM network list — only for EVM accounts */}
          {!isSolanaAccount && (
            <FlatList
              data={evmNetworks}
              keyExtractor={(item) => item.chainId.toString()}
              renderItem={({ item }) => {
                const isSelected =
                  providerType === "evm" && item.chainId === selectedChainId;
                return (
                  <TouchableOpacity
                    style={[
                      styles.networkRow,
                      { backgroundColor: rowBg },
                      isSelected && styles.selectedRow,
                    ]}
                    onPress={() => handleSelectEvm(item.chainId)}
                  >
                    <Text style={styles.networkIcon}>{item.icon}</Text>
                    <View style={styles.networkInfo}>
                      <Text style={[styles.networkName, { color: nameColor }]}>{item.name}</Text>
                      <View style={styles.tag}>
                        <Text style={styles.tagText}>{item.currency}</Text>
                      </View>
                      {item.isFavorite && (
                        <Ionicons name="star" size={12} color="#F59E0B" />
                      )}
                    </View>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={24} color="#10B981" />
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          )}

          {/* Solana network list — only for Solana accounts */}
          {isSolanaAccount && (
            <FlatList
              data={SOLANA_NETWORKS}
              keyExtractor={(item) => item.networkId}
              renderItem={({ item }) => {
                const isSelected =
                  providerType === "api" && item.networkId === selectedApiNetworkId;
                return (
                  <TouchableOpacity
                    style={[
                      styles.networkRow,
                      { backgroundColor: rowBg },
                      isSelected && styles.selectedRowSolana,
                    ]}
                    onPress={() => handleSelectSolana(item)}
                  >
                    <Text style={styles.networkIcon}>☀️</Text>
                    <View style={styles.networkInfo}>
                      <Text style={[styles.networkName, { color: nameColor }]}>{item.displayName}</Text>
                      <View style={styles.tag}>
                        <Text style={styles.tagText}>{item.symbol}</Text>
                      </View>
                      {item.isTestnet && (
                        <View style={styles.tag}>
                          <Text style={styles.tagText}>devnet</Text>
                        </View>
                      )}
                    </View>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={24} color="#9945FF" />
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// NetworkBadge — shows active network name for either EVM or API mode
// ---------------------------------------------------------------------------

interface NetworkBadgeProps {
  chainId: ChainId;
  onPress?: () => void;
}

export function NetworkBadge({ chainId, onPress }: NetworkBadgeProps) {
  const scheme = useColorScheme() ?? "dark";
  const isLight = scheme === "light";
  const selectedAccount = useSelectedAccount();
  const isSolanaAccount = selectedAccount?.accountType === "solana";
  const selectedApiNetworkId = useProviderStore((s) => s.selectedApiNetworkId);

  let icon: string;
  let name: string;

  if (isSolanaAccount) {
    const solNet = SOLANA_NETWORKS.find((n) => n.networkId === selectedApiNetworkId)
      ?? SOLANA_NETWORKS[0];
    icon = "☀️";
    name = solNet.displayName;
  } else {
    const meta = NETWORK_META[chainId] ?? { icon: "⚫", color: "#9CA3AF" };
    const config = EthersClient.getNetworkConfig(chainId);
    icon = meta.icon;
    name = config?.name ?? "Unknown";
  }

  return (
    <TouchableOpacity
      style={[
        styles.badge,
        {
          backgroundColor: isLight ? "#FFFFFF" : "transparent",
          borderWidth: isLight ? 1 : 0,
          borderColor: isLight ? "#D5E2DC" : "transparent",
        },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={styles.badgeIcon}>{icon}</Text>
      <Text style={[styles.badgeName, { color: isLight ? "#11181C" : "#FFFFFF" }]}>{name}</Text>
      <Ionicons name="chevron-down" size={16} color={isLight ? "#64748B" : "#9CA3AF"} />
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// ChainBadgeMini — always EVM-specific
// ---------------------------------------------------------------------------

interface ChainBadgeMiniProps {
  chainId: ChainId;
  size?: "small" | "medium";
  showName?: boolean;
}

export function ChainBadgeMini({
  chainId,
  size = "small",
  showName = false,
}: ChainBadgeMiniProps) {
  const meta = NETWORK_META[chainId] ?? { icon: "⚫", color: "#9CA3AF" };
  const config = EthersClient.getNetworkConfig(chainId);

  const iconSize = size === "small" ? 12 : 16;
  const containerSize = size === "small" ? 18 : 24;

  return (
    <View
      style={[
        styles.chainBadgeMini,
        {
          width: showName ? "auto" : containerSize,
          height: containerSize,
          backgroundColor: meta.color + "20",
          borderColor: meta.color + "40",
        },
      ]}
    >
      <Text style={[styles.chainBadgeMiniIcon, { fontSize: iconSize }]}>
        {meta.icon}
      </Text>
      {showName && (
        <Text style={[styles.chainBadgeMiniName, { fontSize: iconSize - 2 }]}>
          {config?.name ?? "Unknown"}
        </Text>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// getNetworkMeta helper
// ---------------------------------------------------------------------------

export function getNetworkMeta(chainId: ChainId) {
  return NETWORK_META[chainId] ?? { icon: "⚫", color: "#9CA3AF" };
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modal: {
    backgroundColor: "#0F1512",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "75%",
    paddingBottom: 34,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#1E2E29",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
  },
  networkRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 12,
    backgroundColor: "#1E2E29",
  },
  selectedRow: {
    backgroundColor: "#374151",
  },
  selectedRowSolana: {
    backgroundColor: "#2D1B4E",
    borderWidth: 1,
    borderColor: "#9945FF40",
  },
  networkIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  networkInfo: {
    flex: 1,
    gap: 4,
    flexDirection: "row",
    alignItems: "center",
  },
  networkName: {
    fontSize: 16,
    fontWeight: "500",
    flex: 1,
  },
  tag: {
    backgroundColor: "#374151",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  tagText: {
    color: "#9CA3AF",
    fontSize: 11,
    fontWeight: "500",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  badgeIcon: {
    fontSize: 16,
  },
  badgeName: {
    fontSize: 18,
    fontWeight: "500",
  },
  chainBadgeMini: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 4,
    gap: 4,
  },
  chainBadgeMiniIcon: {
    textAlign: "center",
  },
  chainBadgeMiniName: {
    color: "#FFFFFF",
    fontWeight: "600",
    paddingRight: 4,
  },
});
