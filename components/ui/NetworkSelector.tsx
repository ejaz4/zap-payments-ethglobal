import { ChainId, EthersClient } from "@/app/profiles/client";
import { useNetworkStore } from "@/store/network";
import { Ionicons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface NetworkSelectorProps {
  visible: boolean;
  selectedChainId: ChainId;
  onSelect: (chainId: ChainId) => void;
  onClose: () => void;
}

// Network metadata with icons
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

export function NetworkSelector({
  visible,
  selectedChainId,
  onSelect,
  onClose,
}: NetworkSelectorProps) {
  // Get raw state values (not computed) to avoid infinite loop
  const enabledNetworks = useNetworkStore((s) => s.enabledNetworks);
  const favoriteNetworks = useNetworkStore((s) => s.favoriteNetworks);

  // Compute ordered networks in useMemo to avoid recalculating on every render
  const networks = useMemo(() => {
    // Order: favorites first, then others
    const favorites = favoriteNetworks.filter((id) =>
      enabledNetworks.includes(id),
    );
    const others = enabledNetworks.filter(
      (id) => !favoriteNetworks.includes(id),
    );
    const orderedNetworks = [...favorites, ...others];

    return orderedNetworks.map((chainId) => {
      const config = EthersClient.getNetworkConfig(chainId);
      const meta = NETWORK_META[chainId as ChainId] || {
        icon: "⚫",
        color: "#9CA3AF",
      };
      return {
        chainId,
        name: config?.name || `Chain ${chainId}`,
        icon: meta.icon,
        isFavorite: favoriteNetworks.includes(chainId),
      };
    });
  }, [enabledNetworks, favoriteNetworks]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>Select Network</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <FlatList
            data={networks}
            keyExtractor={(item) => item.chainId.toString()}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.networkRow,
                  item.chainId === selectedChainId && styles.selectedRow,
                ]}
                onPress={() => {
                  onSelect(item.chainId);
                  onClose();
                }}
              >
                <Text style={styles.networkIcon}>{item.icon}</Text>
                <View style={styles.networkInfo}>
                  <Text style={styles.networkName}>{item.name}</Text>
                  {item.isFavorite && (
                    <Ionicons name="star" size={12} color="#F59E0B" />
                  )}
                </View>
                {item.chainId === selectedChainId && (
                  <Ionicons name="checkmark-circle" size={24} color="#10B981" />
                )}
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

interface NetworkBadgeProps {
  chainId: ChainId;
  onPress?: () => void;
}

export function NetworkBadge({ chainId, onPress }: NetworkBadgeProps) {
  const meta = NETWORK_META[chainId] || { icon: "⚫", color: "#9CA3AF" };
  const config = EthersClient.getNetworkConfig(chainId);

  return (
    <TouchableOpacity
      style={styles.badge}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={styles.badgeIcon}>{meta.icon}</Text>
      <Text style={styles.badgeName}>{config?.name || "Unknown"}</Text>
      <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
    </TouchableOpacity>
  );
}

/**
 * Small chain badge for showing which network a token is on
 * Similar to Rainbow's ChainImage component
 */
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
  const meta = NETWORK_META[chainId] || { icon: "⚫", color: "#9CA3AF" };
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
          backgroundColor: meta.color + "20", // 20% opacity
          borderColor: meta.color + "40", // 40% opacity
        },
      ]}
    >
      <Text style={[styles.chainBadgeMiniIcon, { fontSize: iconSize }]}>
        {meta.icon}
      </Text>
      {showName && (
        <Text style={[styles.chainBadgeMiniName, { fontSize: iconSize - 2 }]}>
          {config?.name || "Unknown"}
        </Text>
      )}
    </View>
  );
}

/**
 * Get network metadata for a given chainId
 */
export function getNetworkMeta(chainId: ChainId) {
  return NETWORK_META[chainId] || { icon: "⚫", color: "#9CA3AF" };
}

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
    maxHeight: "70%",
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
    color: "#FFFFFF",
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
  networkIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  networkInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  networkName: {
    color: "#FFFFFF",
    fontSize: 16,
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
    color: "#FFFFFF",
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
