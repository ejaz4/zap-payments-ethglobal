import { useAccentColor, tintedBackground } from "@/store/appearance";
import { ChainId, DEFAULT_NETWORKS, EthersClient } from "@/app/profiles/client";
import { DEFAULT_TOKENS, getTokenKey, TokenInfo } from "@/config/tokens";
import { CustomToken, useTokenStore } from "@/store/tokens";
import { useWalletStore } from "@/store/wallet";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
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

export default function TokensSettingsScreen() {
  const accentColor = useAccentColor();
  const bg = tintedBackground(accentColor);
  const router = useRouter();
  const selectedChainId = useWalletStore((s) => s.selectedChainId);

  const customTokens = useTokenStore((s) => s.customTokens);
  const getTokensForChain = useTokenStore((s) => s.getTokensForChain);
  const getCustomTokensForChain = useTokenStore(
    (s) => s.getCustomTokensForChain,
  );
  const addCustomToken = useTokenStore((s) => s.addCustomToken);
  const removeCustomToken = useTokenStore((s) => s.removeCustomToken);
  const toggleFavoriteToken = useTokenStore((s) => s.toggleFavoriteToken);
  const isTokenFavorite = useTokenStore((s) => s.isTokenFavorite);
  const toggleHideToken = useTokenStore((s) => s.toggleHideToken);
  const isTokenHidden = useTokenStore((s) => s.isTokenHidden);
  const hasToken = useTokenStore((s) => s.hasToken);

  const [showImport, setShowImport] = useState(false);
  const [importAddress, setImportAddress] = useState("");
  const [importChainId, setImportChainId] = useState<ChainId>(selectedChainId);
  const [isLoading, setIsLoading] = useState(false);
  const [importedTokenInfo, setImportedTokenInfo] = useState<{
    name: string;
    symbol: string;
    decimals: number;
  } | null>(null);

  const allTokensForChain = getTokensForChain(selectedChainId);
  const customTokensForChain = getCustomTokensForChain(selectedChainId);
  const defaultTokensForChain = DEFAULT_TOKENS[selectedChainId] || [];

  const handleLookupToken = useCallback(async () => {
    if (!importAddress || !EthersClient.isValidAddress(importAddress)) {
      Alert.alert("Invalid Address", "Please enter a valid contract address");
      return;
    }

    // Check if already added
    if (hasToken(importAddress, importChainId)) {
      Alert.alert("Token Exists", "This token is already in your list");
      return;
    }

    setIsLoading(true);
    try {
      console.log(
        "[TokenImport] Looking up token:",
        importAddress,
        "on chain:",
        importChainId,
      );

      // Fetch token info from chain - do them sequentially for better error handling
      let name: string | null = null;
      let symbol: string | null = null;
      let decimals: number | null = null;

      try {
        symbol = await EthersClient.getERC20Symbol(
          importAddress,
          importChainId,
        );
        console.log("[TokenImport] Symbol:", symbol);
      } catch (e) {
        console.error("[TokenImport] Symbol fetch failed:", e);
      }

      try {
        name = await EthersClient.getERC20Name(importAddress, importChainId);
        console.log("[TokenImport] Name:", name);
      } catch (e) {
        console.error("[TokenImport] Name fetch failed:", e);
      }

      try {
        decimals = await EthersClient.getERC20Decimals(
          importAddress,
          importChainId,
        );
        console.log("[TokenImport] Decimals:", decimals);
      } catch (e) {
        console.error("[TokenImport] Decimals fetch failed:", e);
      }

      if (!symbol || decimals === null || decimals === undefined) {
        Alert.alert(
          "Invalid Token",
          `Could not fetch token information from the ${selectedChainId === 1 ? "Ethereum" : "selected"} network. Make sure this is a valid ERC20 contract on the current network.`,
        );
        return;
      }

      setImportedTokenInfo({ name: name || symbol, symbol, decimals });
    } catch (error) {
      console.error("[TokenImport] Token lookup failed:", error);
      Alert.alert(
        "Lookup Failed",
        "Could not fetch token information. Please check the address and try again.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [importAddress, importChainId, hasToken]);

  const handleImportToken = useCallback(() => {
    if (!importedTokenInfo || !importAddress) return;

    addCustomToken({
      address: importAddress,
      chainId: importChainId,
      name: importedTokenInfo.name,
      symbol: importedTokenInfo.symbol,
      decimals: importedTokenInfo.decimals,
      isVerified: false,
    });

    Alert.alert(
      "Token Imported",
      `${importedTokenInfo.symbol} has been added to your token list`,
    );
    setShowImport(false);
    setImportAddress("");
    setImportedTokenInfo(null);
  }, [importedTokenInfo, importAddress, importChainId, addCustomToken]);

  const handleRemoveToken = (token: CustomToken) => {
    Alert.alert(
      "Remove Token",
      `Remove ${token.symbol} from your custom tokens?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => removeCustomToken(token.address, token.chainId),
        },
      ],
    );
  };

  const networkConfig = DEFAULT_NETWORKS[selectedChainId];

  // Simple network icon mapping
  const getNetworkIcon = (chainId: ChainId): string => {
    const icons: Partial<Record<ChainId, string>> = {
      [ChainId.mainnet]: "🔷",
      [ChainId.polygon]: "🟣",
      [ChainId.arbitrum]: "🔵",
      [ChainId.optimism]: "🔴",
      [ChainId.base]: "🔵",
      [ChainId.avalanche]: "🔺",
      [ChainId.bsc]: "🟡",
      [ChainId.zora]: "⚡",
      [ChainId.sepolia]: "🧪",
      [ChainId.goerli]: "🧪",
    };
    return icons[chainId] || "⚫";
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Token List</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView style={styles.content}>
        {/* Current Network Info */}
        <View style={styles.networkInfo}>
          <Text style={styles.networkIcon}>
            {getNetworkIcon(selectedChainId)}
          </Text>
          <Text style={styles.networkName}>{networkConfig?.name}</Text>
        </View>

        {/* Import Token Section */}
        {!showImport ? (
          <TouchableOpacity
            style={[styles.importButton, { borderColor: accentColor }]}
            onPress={() => setShowImport(true)}
          >
            <Ionicons name="add-circle-outline" size={24} color={accentColor} />
            <Text style={[styles.importButtonText, { color: accentColor }]}>Import Custom Token</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.importSection}>
            <Text style={styles.sectionTitle}>Import Token</Text>

            <Text style={styles.inputLabel}>Contract Address</Text>
            <TextInput
              style={styles.input}
              value={importAddress}
              onChangeText={(text) => {
                setImportAddress(text);
                setImportedTokenInfo(null);
              }}
              placeholder="0x..."
              placeholderTextColor="#6B7280"
              autoCapitalize="none"
              autoCorrect={false}
            />

            {importedTokenInfo && (
              <View style={styles.tokenPreview}>
                <Text style={styles.tokenPreviewTitle}>Token Found</Text>
                <View style={styles.tokenPreviewRow}>
                  <Text style={styles.tokenPreviewLabel}>Name:</Text>
                  <Text style={styles.tokenPreviewValue}>
                    {importedTokenInfo.name}
                  </Text>
                </View>
                <View style={styles.tokenPreviewRow}>
                  <Text style={styles.tokenPreviewLabel}>Symbol:</Text>
                  <Text style={styles.tokenPreviewValue}>
                    {importedTokenInfo.symbol}
                  </Text>
                </View>
                <View style={styles.tokenPreviewRow}>
                  <Text style={styles.tokenPreviewLabel}>Decimals:</Text>
                  <Text style={styles.tokenPreviewValue}>
                    {importedTokenInfo.decimals}
                  </Text>
                </View>
              </View>
            )}

            <View style={styles.importActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setShowImport(false);
                  setImportAddress("");
                  setImportedTokenInfo(null);
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              {importedTokenInfo ? (
                <TouchableOpacity
                  style={styles.confirmButton}
                  onPress={handleImportToken}
                >
                  <Text style={styles.confirmButtonText}>Import Token</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.lookupButton,
                    { backgroundColor: accentColor },
                    isLoading && styles.lookupButtonDisabled,
                  ]}
                  onPress={handleLookupToken}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.lookupButtonText}>Lookup</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Custom Tokens Section */}
        {customTokensForChain.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Custom Tokens</Text>
            {customTokensForChain.map((token) => (
              <TokenListItem
                key={getTokenKey(token.address, token.chainId)}
                token={token}
                isCustom
                isFavorite={isTokenFavorite(token.address, token.chainId)}
                isHidden={isTokenHidden(token.address, token.chainId)}
                onToggleFavorite={() =>
                  toggleFavoriteToken(token.address, token.chainId)
                }
                onToggleHide={() =>
                  toggleHideToken(token.address, token.chainId)
                }
                onRemove={() => handleRemoveToken(token)}
              />
            ))}
          </View>
        )}

        {/* Default Tokens Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Default Tokens ({defaultTokensForChain.length})
          </Text>
          {defaultTokensForChain.map((token) => (
            <TokenListItem
              key={getTokenKey(token.address, token.chainId)}
              token={token}
              isCustom={false}
              isFavorite={isTokenFavorite(token.address, token.chainId)}
              isHidden={isTokenHidden(token.address, token.chainId)}
              onToggleFavorite={() =>
                toggleFavoriteToken(token.address, token.chainId)
              }
              onToggleHide={() => toggleHideToken(token.address, token.chainId)}
            />
          ))}

          {defaultTokensForChain.length === 0 && (
            <Text style={styles.emptyText}>
              No default tokens for this network
            </Text>
          )}
        </View>

        <View style={styles.helpSection}>
          <Ionicons
            name="information-circle-outline"
            size={20}
            color="#9CA3AF"
          />
          <Text style={styles.helpText}>
            Tap ⭐ to favorite a token (shown first). Tap 👁 to hide a token.
            Custom tokens can be removed with the trash icon.
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function TokenListItem({
  token,
  isCustom,
  isFavorite,
  isHidden,
  onToggleFavorite,
  onToggleHide,
  onRemove,
}: {
  token: TokenInfo;
  isCustom: boolean;
  isFavorite: boolean;
  isHidden: boolean;
  onToggleFavorite: () => void;
  onToggleHide: () => void;
  onRemove?: () => void;
}) {
  const formatAddress = (addr: string) =>
    `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  return (
    <View style={[styles.tokenItem, isHidden && styles.tokenItemHidden]}>
      <View style={styles.tokenIcon}>
        <Text style={styles.tokenIconText}>
          {token.symbol.slice(0, 2).toUpperCase()}
        </Text>
      </View>
      <View style={styles.tokenInfo}>
        <View style={styles.tokenNameRow}>
          <Text style={styles.tokenSymbol}>{token.symbol}</Text>
          {token.isVerified && (
            <Ionicons name="checkmark-circle" size={14} color="#10B981" />
          )}
          {isCustom && (
            <View style={[styles.customBadge, { backgroundColor: accentColor }]}>
              <Text style={styles.customBadgeText}>Custom</Text>
            </View>
          )}
        </View>
        <Text style={styles.tokenName}>{token.name}</Text>
        <Text style={styles.tokenAddress}>{formatAddress(token.address)}</Text>
      </View>
      <View style={styles.tokenActions}>
        <TouchableOpacity
          style={[styles.actionButton, isFavorite && styles.actionButtonActive]}
          onPress={onToggleFavorite}
        >
          <Ionicons
            name={isFavorite ? "star" : "star-outline"}
            size={18}
            color={isFavorite ? "#F59E0B" : "#6B7280"}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, isHidden && styles.actionButtonActive]}
          onPress={onToggleHide}
        >
          <Ionicons
            name={isHidden ? "eye-off" : "eye-outline"}
            size={18}
            color={isHidden ? "#EF4444" : "#6B7280"}
          />
        </TouchableOpacity>
        {isCustom && onRemove && (
          <TouchableOpacity style={styles.actionButton} onPress={onRemove}>
            <Ionicons name="trash-outline" size={18} color="#EF4444" />
          </TouchableOpacity>
        )}
      </View>
    </View>
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
  networkInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#1E2E29",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  networkIcon: {
    fontSize: 24,
  },
  networkName: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  importButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#1E2E29",
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#569F8C",
    borderStyle: "dashed",
  },
  importButtonText: {
    color: "#569F8C",
    fontSize: 16,
    fontWeight: "600",
  },
  importSection: {
    backgroundColor: "#1E2E29",
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
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
    borderRadius: 12,
    padding: 14,
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "monospace",
    borderWidth: 1,
    borderColor: "#4B5563",
  },
  tokenPreview: {
    backgroundColor: "#374151",
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  tokenPreviewTitle: {
    color: "#10B981",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 12,
  },
  tokenPreviewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  tokenPreviewLabel: {
    color: "#9CA3AF",
    fontSize: 14,
  },
  tokenPreviewValue: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
  },
  importActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#374151",
    alignItems: "center",
  },
  cancelButtonText: {
    color: "#FFFFFF",
    fontWeight: "500",
  },
  lookupButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#569F8C",
    alignItems: "center",
  },
  lookupButtonDisabled: {
    opacity: 0.6,
  },
  lookupButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#10B981",
    alignItems: "center",
  },
  confirmButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  section: {
    marginBottom: 24,
  },
  tokenItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1E2E29",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  tokenItemHidden: {
    opacity: 0.5,
  },
  tokenIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#374151",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  tokenIconText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  tokenInfo: {
    flex: 1,
  },
  tokenNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tokenSymbol: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  tokenName: {
    color: "#9CA3AF",
    fontSize: 13,
    marginTop: 2,
  },
  tokenAddress: {
    color: "#6B7280",
    fontSize: 11,
    fontFamily: "monospace",
    marginTop: 2,
  },
  customBadge: {
    backgroundColor: "#569F8C",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  customBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "600",
  },
  tokenActions: {
    flexDirection: "row",
    gap: 4,
  },
  actionButton: {
    padding: 8,
    borderRadius: 8,
  },
  actionButtonActive: {
    backgroundColor: "#374151",
  },
  emptyText: {
    color: "#6B7280",
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 24,
  },
  helpSection: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: "#1E2E29",
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  helpText: {
    flex: 1,
    color: "#9CA3AF",
    fontSize: 13,
    lineHeight: 18,
  },
});
