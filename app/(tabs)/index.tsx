import { ChainId, EthersClient } from "@/app/profiles/client";
import {
  NativeTokenRow,
  TokenRow,
  TransactionRow,
} from "@/components/ui";
import { DEFAULT_TOKENS } from "@/config/tokens";
import { ApiProvider } from "@/crypto/provider/api";
import { useENSName } from "@/hooks/use-ens";
import { useNativePrice } from "@/hooks/use-prices";
import { PriceService } from "@/services/price";
import { BalanceService } from "@/services/wallet";
import { ContractBalance, ZapContractService } from "@/services/zap-contract";
import { tintedBackground, useAccentColor } from "@/store/appearance";
import { useSelectedCurrency } from "@/store/currency";
import { useNetworkStore } from "@/store/network";
import { useProviderStore } from "@/store/provider";
import { useTokenStore } from "@/store/tokens";
import {
  Account,
  CARD_BACKGROUNDS,
  CardBackground,
  getSolanaChainKey,
  SOLANA_NETWORK_IDS,
  TokenBalance,
  useSelectedAccount,
  useWalletStore,
} from "@/store/wallet";
import { useZapContractStore } from "@/store/zap-contract";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import {
  ArrowDownIcon,
  ArrowRightLeftIcon,
  ArrowUpIcon,
  SettingsIcon
} from "lucide-react-native";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  ImageBackground,
  ImageSourcePropType,
  NativeScrollEvent,
  NativeSyntheticEvent,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import ReAnimated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { NfcContext } from "../nfc/context";

// Card background images
const CARD_BACKGROUND_IMAGES: Record<CardBackground, ImageSourcePropType> = {
  "card-background-1": require("@/assets/images/backgrounds/card-background-1.png"),
  "card-background-2": require("@/assets/images/backgrounds/card-background-2.png"),
  "card-background-3": require("@/assets/images/backgrounds/card-background-3.png"),
  "card-background-4": require("@/assets/images/backgrounds/card-background-4.png"),
  "card-background-5": require("@/assets/images/backgrounds/card-background-5.png"),
  "card-background-6": require("@/assets/images/backgrounds/card-background-6.png"),
};

// Get background for account (uses saved preference or assigns based on index)
const getAccountCardBackground = (account: Account): ImageSourcePropType => {
  if (account.cardBackground) {
    return CARD_BACKGROUND_IMAGES[account.cardBackground];
  }
  // Default: cycle through backgrounds based on account index
  const bgKey = CARD_BACKGROUNDS[account.index % CARD_BACKGROUNDS.length];
  return CARD_BACKGROUND_IMAGES[bgKey];
};

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_GAP = 12;
const CARD_PEEK = 20; // How much of adjacent cards peek out
const CARD_WIDTH = SCREEN_WIDTH - CARD_PEEK * 2 - CARD_GAP;
const CARD_TOTAL_WIDTH = CARD_WIDTH + CARD_GAP; // Width including gap for snapping

// ─── AccountCard ─────────────────────────────────────────────────────────────
// Extracted so it can call useENSName (hooks can't be inside render callbacks)

interface AccountCardProps {
  account: Account;
  index: number;
  totalValue: number;
  currency: string;
  copied: boolean;
  activeCardIndex: number;
  onCopy: (address: string) => void;
}

function AccountCard({
  account,
  index,
  totalValue,
  currency,
  copied,
  activeCardIndex,
  onCopy,
}: AccountCardProps) {
  const cardBackground = getAccountCardBackground(account);
  // ENS only works on mainnet
  const ensName = useENSName(account.address, ChainId.mainnet);

  const formatAddress = (addr: string) =>
    `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  return (
    <View style={styles.cardWrapper}>
      <ImageBackground
        source={cardBackground}
        style={styles.balanceCard}
        imageStyle={styles.balanceCardImage}
      >
        <View style={{ alignItems: "flex-start" }}>
          {totalValue > 0 ? (
            <Text style={styles.balance}>
              {PriceService.formatValue(totalValue, currency)}
            </Text>
          ) : (
            <Text style={styles.balance}>$0.00</Text>
          )}
        </View>

        <TouchableOpacity
          style={styles.addressRow}
          onPress={() => onCopy(account.address)}
          onPressIn={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
        >
          <Text style={styles.accountName}>
            {ensName ?? account.name}
          </Text>
          <View style={styles.addressBadge}>
            <Text style={styles.addressText}>
              {ensName ? account.name : formatAddress(account.address)}
            </Text>
            <Ionicons
              name={copied && activeCardIndex === index ? "checkmark" : "copy-outline"}
              size={14}
              color="rgba(255,255,255,0.4)"
            />
          </View>
        </TouchableOpacity>
      </ImageBackground>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const accentColor = useAccentColor();
  const bg = tintedBackground("#000000");
  const accounts = useWalletStore((s) => s.accounts);
  const selectedAccountIndex = useWalletStore((s) => s.selectedAccountIndex);
  const setSelectedAccountIndex = useWalletStore(
    (s) => s.setSelectedAccountIndex,
  );
  const selectedAccount = useSelectedAccount();
  const selectedChainId = useWalletStore((s) => s.selectedChainId);
  const allNativeBalances = useWalletStore((s) => s.nativeBalances);
  const allTokenBalances = useWalletStore((s) => s.tokenBalances);
  const allTransactions = useWalletStore((s) => s.transactions);
  const pendingTxs = useWalletStore((s) => s.pendingTransactions);
  const currency = useSelectedCurrency();

  const enabledNetworks = useNetworkStore((s) => s.enabledNetworks);

  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tokenPrices, setTokenPrices] = useState<Map<string, number>>(
    new Map(),
  );
  const [activeCardIndex, setActiveCardIndex] = useState(selectedAccountIndex);
  const flatListRef = useRef<FlatList>(null);

  // Contract holdings state
  const { getContract } = useZapContractStore();
  const [contractBalances, setContractBalances] = useState<ContractBalance[]>(
    [],
  );
  const [withdrawingToken, setWithdrawingToken] = useState<string | null>(null);
  const withdrawAnimations = useRef<Map<string, Animated.Value>>(new Map());

  // Get current account data based on active card
  const currentAccount = accounts[activeCardIndex] || selectedAccount;
  const transactions = currentAccount
    ? allTransactions[currentAccount.address] || []
    : [];

  // Get contract for current account and chain (keep for contract holdings section)
  const currentContract = useMemo(() => {
    if (!currentAccount) return null;
    return getContract(currentAccount.address, selectedChainId);
  }, [currentAccount, selectedChainId, getContract]);

  const showContractHoldings = currentContract && contractBalances.length > 0;

  const nfcState = useContext(NfcContext);

  const isSolanaAccount = currentAccount?.accountType === "solana";

  // Multi-chain: all non-zero native balances for current account
  const allChainNativeBalances = useMemo(() => {
    if (!currentAccount) return [];
    if (isSolanaAccount) {
      // Show a row for each Solana network that has a non-zero balance
      return SOLANA_NETWORK_IDS
        .map((networkId) => {
          const chainKey = getSolanaChainKey(networkId);
          const balance = allNativeBalances[`${currentAccount.address}_${chainKey}`] || "0";
          const label = networkId === "dynamic-mainnet" ? "Solana" : "Solana Devnet";
          return {
            chainId: chainKey,
            balance,
            config: { nativeCurrency: { symbol: "SOL", name: label } } as any,
          };
        })
        .filter(({ balance }) => parseFloat(balance) > 0);
    }
    return enabledNetworks
      .map((chainId) => {
        const balance = allNativeBalances[`${currentAccount.address}_${chainId}`] || "0";
        const config = EthersClient.getNetworkConfig(chainId as ChainId);
        return { chainId: chainId as ChainId, balance, config };
      })
      .filter(({ balance }) => parseFloat(balance) > 0);
  }, [currentAccount, enabledNetworks, allNativeBalances, isSolanaAccount]);

  // Multi-chain: all token balances for current account across all enabled networks
  const allChainTokenBalances = useMemo(() => {
    if (!currentAccount) return [];
    if (isSolanaAccount) {
      const result: TokenBalance[] = [];
      for (const networkId of SOLANA_NETWORK_IDS) {
        const chainKey = getSolanaChainKey(networkId);
        const tokens = allTokenBalances[`${currentAccount.address}_${chainKey}`] || [];
        result.push(...tokens);
      }
      return result;
    }
    const result: TokenBalance[] = [];
    for (const chainId of enabledNetworks) {
      const tokens = allTokenBalances[`${currentAccount.address}_${chainId}`] || [];
      result.push(...tokens);
    }
    return result;
  }, [currentAccount, enabledNetworks, allTokenBalances, isSolanaAccount]);

  // Get 2 most recent transactions (pending + confirmed) for current account
  const recentTransactions = useMemo(() => {
    const accountPendingTxs = pendingTxs.filter(
      (tx) =>
        tx.from.toLowerCase() === currentAccount?.address?.toLowerCase() ||
        tx.to?.toLowerCase() === currentAccount?.address?.toLowerCase(),
    );
    const allTxs = [
      ...accountPendingTxs,
      ...transactions.filter(
        (tx) => !accountPendingTxs.some((p) => p.hash === tx.hash),
      ),
    ];
    return allTxs.slice(0, 2);
  }, [pendingTxs, transactions, currentAccount]);

  const { refresh: refreshNativePrice } = useNativePrice(ChainId.mainnet);

  // Fetch prices for all tokens + all chains' native tokens
  useEffect(() => {
    const fetchPrices = async () => {
      let nativeTokens: { symbol: string; address: string; chainId: ChainId }[];

      if (isSolanaAccount) {
        nativeTokens = [{ symbol: "SOL", address: "native", chainId: getSolanaChainKey("dynamic-mainnet") }];
      } else {
        nativeTokens = enabledNetworks
          .map((chainId) => {
            const config = EthersClient.getNetworkConfig(chainId as ChainId);
            return config
              ? { symbol: config.nativeCurrency.symbol, address: "native", chainId: chainId as ChainId }
              : null;
          })
          .filter(Boolean) as { symbol: string; address: string; chainId: ChainId }[];
      }

      const tokens = [
        ...nativeTokens,
        ...allChainTokenBalances.map((t) => ({
          symbol: t.symbol,
          address: t.address,
          chainId: t.chainId,
        })),
      ];

      const fetched = await PriceService.batchGetPrices(tokens, currency);
      // Merge into existing prices — never wipe previously-loaded values
      if (fetched.size > 0) {
        setTokenPrices(prev => {
          const next = new Map(prev);
          for (const [k, v] of fetched) next.set(k, v);
          return next;
        });
      }
    };

    fetchPrices();
    // No interval - cache handles freshness, pull-to-refresh forces update
  }, [allChainTokenBalances, enabledNetworks, currency, isSolanaAccount]);

  // Fetch contract balances whenever we have a contract or wallet balances change
  // (wallet balance change indicates auto-withdraw may have completed)
  // Always check - even with autoWithdraw on, funds might be stuck from failed withdrawals
  useEffect(() => {
    const fetchContractBalances = async () => {
      if (!currentContract || !currentAccount) {
        setContractBalances([]);
        return;
      }

      try {
        // Get default token addresses for current chain
        const defaultTokens = DEFAULT_TOKENS[selectedChainId] || [];
        const tokenAddresses = defaultTokens.map((t) => t.address);

        const balances = await ZapContractService.getContractBalances(
          currentContract.address,
          selectedChainId,
          tokenAddresses,
        );
        setContractBalances(balances);
      } catch (error) {
        console.error("Failed to fetch contract balances:", error);
        setContractBalances([]);
      }
    };

    fetchContractBalances();
  }, [currentContract, currentAccount, selectedChainId]);

  // Withdraw a single token/native from contract
  const handleWithdraw = useCallback(
    async (balance: ContractBalance) => {
      if (!currentContract || !currentAccount || withdrawingToken) return;

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const tokenKey = balance.tokenAddress || "native";
      setWithdrawingToken(tokenKey);

      // Get or create animation value
      if (!withdrawAnimations.current.has(tokenKey)) {
        withdrawAnimations.current.set(tokenKey, new Animated.Value(1));
      }

      try {
        let result;

        if (balance.tokenAddress && balance.tokenAddress !== "native") {
          result = await ZapContractService.withdrawERC20(
            currentContract.address,
            currentAccount.address,
            selectedChainId,
            balance.tokenAddress,
          );
        } else {
          result = await ZapContractService.withdrawNative(
            currentContract.address,
            currentAccount.address,
            selectedChainId,
          );
        }

        if (result.success) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

          // Animate row out
          const anim = withdrawAnimations.current.get(tokenKey)!;
          Animated.timing(anim, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }).start(() => {
            // Remove from list after animation
            setContractBalances((prev) =>
              prev.filter((b) => (b.tokenAddress || "native") !== tokenKey),
            );
            withdrawAnimations.current.delete(tokenKey);
          });

          // Also refresh main wallet balances
          BalanceService.forceRefreshBalances();
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          Alert.alert(
            "Withdraw Failed",
            result.error || "Unknown error occurred",
          );
        }
      } catch (error: any) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert(
          "Withdraw Failed",
          error.message || "Unknown error occurred",
        );
      } finally {
        setWithdrawingToken(null);
      }
    },
    [currentContract, currentAccount, selectedChainId, withdrawingToken],
  );

  // Fetch balances for all enabled networks
  const refreshAllChainBalances = useCallback(async () => {
    if (!currentAccount) return;
    const walletStoreState = useWalletStore.getState();

    if (currentAccount.accountType === "solana") {
      const apiBaseUrl = useProviderStore.getState().getApiBaseUrl();
      if (!apiBaseUrl) return;
      try {
        const provider = new ApiProvider(apiBaseUrl);
        // Fetch balances for all Solana networks in parallel
        await Promise.allSettled(
          SOLANA_NETWORK_IDS.map(async (networkId) => {
            const chainKey = getSolanaChainKey(networkId);
            try {
              const [nativeResult, tokenResult] = await Promise.allSettled([
                provider.getNativeBalance(currentAccount.address, networkId),
                provider.getTokenBalances(currentAccount.address, networkId),
              ]);
              if (nativeResult.status === "fulfilled") {
                walletStoreState.setNativeBalance(currentAccount.address, chainKey, nativeResult.value.amount);
              }
              if (tokenResult.status === "fulfilled") {
                const solTokens: TokenBalance[] = tokenResult.value.map((b) => ({
                  address: b.assetId.replace(`token:${networkId}:`, ""),
                  symbol: b.symbol,
                  name: b.symbol,
                  decimals: b.decimals,
                  balance: b.amountAtomic,
                  balanceFormatted: b.amount,
                  chainId: chainKey,
                }));
                walletStoreState.setTokenBalances(currentAccount.address, chainKey, solTokens);
              }
            } catch (err) {
              console.warn(`[Home] Failed to fetch Solana balances for ${networkId}:`, err);
            }
          }),
        );
      } catch (err) {
        console.warn("[Home] Failed to fetch Solana balances:", err);
      }
      return;
    }

    const tokenStoreState = useTokenStore.getState();
    await Promise.allSettled(
      enabledNetworks.map(async (chainId) => {
        try {
          const tokens = tokenStoreState.getTokensForChain(chainId as ChainId);
          const tokenAddresses = tokens.map((t) => t.address);
          const { native, tokens: tokenBalanceMap } = await EthersClient.batchGetAllBalances(
            tokenAddresses, currentAccount.address, chainId as ChainId,
          );

          walletStoreState.setNativeBalance(
            currentAccount.address, chainId as ChainId, EthersClient.fromWei(native),
          );

          const newTokenBalances: TokenBalance[] = [];
          for (const token of tokens) {
            const balance = tokenBalanceMap.get(token.address.toLowerCase()) ?? 0n;
            const formatted = EthersClient.formatUnits(balance, token.decimals);
            if (parseFloat(formatted) > 0) {
              newTokenBalances.push({
                address: token.address,
                symbol: token.symbol,
                name: token.name,
                decimals: token.decimals,
                balance: balance.toString(),
                balanceFormatted: formatted,
                chainId: chainId as ChainId,
              });
            }
          }
          walletStoreState.setTokenBalances(currentAccount.address, chainId as ChainId, newTokenBalances);
        } catch (err) {
          console.warn(`[Home] Failed to fetch balances for chain ${chainId}:`, err);
        }
      }),
    );
  }, [currentAccount, enabledNetworks]);

  // Pull-to-refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);

    await refreshAllChainBalances();
    refreshNativePrice();

    // Refresh contract balances
    if (currentContract && currentAccount) {
      try {
        const defaultTokens = DEFAULT_TOKENS[selectedChainId] || [];
        const tokenAddresses = defaultTokens.map((t: { address: string }) => t.address);
        const balances = await ZapContractService.getContractBalances(
          currentContract.address,
          selectedChainId,
          tokenAddresses,
        );
        setContractBalances(balances);
      } catch (error) {
        console.error("Failed to refresh contract balances:", error);
      }
    }

    setRefreshing(false);
  }, [refreshAllChainBalances, refreshNativePrice, currentContract, currentAccount, selectedChainId]);

  // Auto-refresh on mount and when account changes
  useEffect(() => {
    if (currentAccount) {
      refreshAllChainBalances();
    }
  }, [currentAccount]);

  // Sync active card index with selected account
  useEffect(() => {
    if (activeCardIndex !== selectedAccountIndex) {
      setSelectedAccountIndex(activeCardIndex);
    }
  }, [activeCardIndex, selectedAccountIndex, setSelectedAccountIndex]);

  // Handle card scroll end
  const onScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const contentOffsetX = event.nativeEvent.contentOffset.x;
      const newIndex = Math.round(contentOffsetX / CARD_TOTAL_WIDTH);
      if (
        newIndex >= 0 &&
        newIndex < accounts.length &&
        newIndex !== activeCardIndex
      ) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setActiveCardIndex(newIndex);
      }
    },
    [accounts.length, activeCardIndex],
  );

  const copyAddress = async (address?: string) => {
    const addr = address || currentAccount?.address;
    if (addr) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await Clipboard.setStringAsync(addr);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!currentAccount) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No wallet found</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Sum total portfolio value for an account across all enabled networks
  const getAccountTotalValue = (account: Account) => {
    let total = 0;
    if (account.accountType === "solana") {
      const solPrice = tokenPrices.get("SOL");
      for (const networkId of SOLANA_NETWORK_IDS) {
        const chainKey = getSolanaChainKey(networkId);
        const nativeBal = allNativeBalances[`${account.address}_${chainKey}`];
        if (nativeBal && solPrice) {
          const num = parseFloat(nativeBal);
          if (!isNaN(num)) total += num * solPrice;
        }
        const tokens = allTokenBalances[`${account.address}_${chainKey}`] || [];
        for (const token of tokens) {
          const price = tokenPrices.get(token.symbol.toUpperCase());
          if (price) {
            const num = parseFloat(token.balanceFormatted);
            if (!isNaN(num)) total += num * price;
          }
        }
      }
      return total;
    }
    for (const chainId of enabledNetworks) {
      const nativeBal = allNativeBalances[`${account.address}_${chainId}`];
      if (nativeBal) {
        const config = EthersClient.getNetworkConfig(chainId as ChainId);
        const symbol = config?.nativeCurrency.symbol?.toUpperCase() ?? "ETH";
        const price = tokenPrices.get(symbol);
        if (price) {
          const num = parseFloat(nativeBal);
          if (!isNaN(num)) total += num * price;
        }
      }
      const tokens = allTokenBalances[`${account.address}_${chainId}`] || [];
      for (const token of tokens) {
        const price = tokenPrices.get(token.symbol.toUpperCase());
        if (price) {
          const num = parseFloat(token.balanceFormatted);
          if (!isNaN(num)) total += num * price;
        }
      }
    }
    return total;
  };

  const renderAccountCard = ({
    item: account,
    index,
  }: {
    item: Account;
    index: number;
  }) => (
    <AccountCard
      account={account}
      index={index}
      totalValue={getAccountTotalValue(account)}
      currency={currency}
      copied={copied}
      activeCardIndex={activeCardIndex}
      onCopy={copyAddress}
    />
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: bg }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Wallet</Text>
        <TouchableOpacity
          style={styles.accountButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/settings" as any);
          }}
        >
          <SettingsIcon size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 8) + 78 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#FFFFFF"
          />
        }
      >
        {/* Swipable Account Cards */}
        <FlatList
          ref={flatListRef}
          data={accounts}
          renderItem={renderAccountCard}
          keyExtractor={(item) => item.address}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          snapToInterval={CARD_TOTAL_WIDTH}
          decelerationRate="fast"
          contentContainerStyle={styles.cardsContainer}
          onMomentumScrollEnd={onScrollEnd}
          initialScrollIndex={
            accounts.length > 0
              ? Math.min(selectedAccountIndex, accounts.length - 1)
              : 0
          }
          getItemLayout={(_, index) => ({
            length: CARD_TOTAL_WIDTH,
            offset: CARD_TOTAL_WIDTH * index,
            index,
          })}
          scrollEventThrottle={16}
        />

        {/* Page Indicators */}
        {accounts.length > 1 && (
          <View style={styles.pageIndicators}>
            {accounts.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.pageIndicator,
                  index === activeCardIndex && styles.pageIndicatorActive,
                  index === activeCardIndex && { backgroundColor: accentColor },
                ]}
              />
            ))}
          </View>
        )}

        <View style={styles.nfcStatusContainer}>
          {nfcState.isLocked && (
            <TouchableOpacity
              style={styles.nfcStatusRow}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                nfcState.toggleLock();
              }}
            >
              <Ionicons name="lock-closed-outline" size={18} color="#6B7280" />
              <Text style={styles.nfcStatusTextLocked}>Tap to pay locked</Text>
            </TouchableOpacity>
          )}

          {nfcState.isListening && !nfcState.isLocked && (
            <TouchableOpacity
              style={styles.nfcStatusRow}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                nfcState.toggleLock();
              }}
            >
              <Ionicons name="radio-outline" size={18} color={accentColor} />
              <Text style={[styles.nfcStatusText, { color: accentColor }]}>Tap to pay</Text>
            </TouchableOpacity>
          )}

          {!nfcState.isSupported && (
            <View style={styles.nfcStatusRow}>
              <Ionicons name="close-circle-outline" size={18} color="#EF4444" />
              <Text style={styles.nfcStatusTextError}>
                This device does not support tap to pay
              </Text>
            </View>
          )}

          {nfcState.isSupported && !nfcState.isEnabled && (
            <View style={styles.nfcStatusRow}>
              <Ionicons name="warning-outline" size={18} color="#F59E0B" />
              <Text style={styles.nfcStatusTextWarning}>
                Tap to pay not available
              </Text>
            </View>
          )}
        </View>

        {/* Action Buttons */}
        <View style={styles.actions}>
          <ActionButton
            icon={<ArrowUpIcon color={accentColor} size={30} />}
            label="Send"
            onPress={() => router.push("/send" as any)}
          />
          <ActionButton
            icon={<ArrowDownIcon color={accentColor} size={30} />}
            label="Receive"
            onPress={() => router.push("/receive" as any)}
          />
          <ActionButton
            icon={<SettingsIcon color={accentColor} size={30} />}
            label="Settings"
            onPress={() => router.push("/settings/accounts" as any)}
          />
          <ActionButton
            icon={<ArrowRightLeftIcon color={accentColor} size={30} />}
            label="Swap"
            onPress={() => router.push("/(tabs)/swap" as any)}
          />
        </View>

        {/* Pending Transactions */}
        {pendingTxs.filter(
          (tx) =>
            tx.from.toLowerCase() === currentAccount?.address?.toLowerCase() ||
            tx.to?.toLowerCase() === currentAccount?.address?.toLowerCase(),
        ).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Pending</Text>
            <View style={styles.pendingBadge}>
              <Ionicons name="time-outline" size={16} color="#F59E0B" />
              <Text style={styles.pendingText}>
                {
                  pendingTxs.filter(
                    (tx) =>
                      tx.from.toLowerCase() ===
                        currentAccount?.address?.toLowerCase() ||
                      tx.to?.toLowerCase() ===
                        currentAccount?.address?.toLowerCase(),
                  ).length
                }{" "}
                pending transaction
                {pendingTxs.filter(
                  (tx) =>
                    tx.from.toLowerCase() ===
                      currentAccount?.address?.toLowerCase() ||
                    tx.to?.toLowerCase() ===
                      currentAccount?.address?.toLowerCase(),
                ).length > 1
                  ? "s"
                  : ""}
              </Text>
            </View>
          </View>
        )}

        {/* Recent Activity */}
        {recentTransactions.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent Activity</Text>
              <TouchableOpacity
                style={styles.seeMoreButton}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push("/(tabs)/activity" as any);
                }}
              >
                <Text style={[styles.seeMoreText, { color: accentColor }]}>See More</Text>
                <Ionicons name="chevron-forward" size={16} color={accentColor} />
              </TouchableOpacity>
            </View>
            <View style={styles.listContent}>
              {recentTransactions.map((tx) => (
                <TransactionRow
                  key={tx.hash}
                  transaction={tx}
                  currentAddress={currentAccount?.address || ""}
                  onPress={() => router.push(`/transaction/${tx.hash}` as any)}
                />
              ))}
            </View>
          </View>
        )}

        {/* Assets — all networks */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Assets</Text>

          <View style={styles.listContent}>
            {/* Native token row per network with a non-zero balance */}
            {allChainNativeBalances.map(({ chainId, balance, config }) => {
              const symbol = config?.nativeCurrency.symbol ?? "ETH";
              const name = config?.nativeCurrency.name ?? "Ethereum";
              const price = tokenPrices.get(symbol.toUpperCase());
              const valueUsd = price ? parseFloat(balance) * price : undefined;
              return (
                <NativeTokenRow
                  key={`native-${chainId}`}
                  symbol={symbol}
                  name={name}
                  balance={balance}
                  valueUsd={valueUsd}
                  chainId={chainId}
                  onPress={() =>
                    router.push({
                      pathname: "/token/native",
                      params: { chainId: String(chainId) },
                    } as any)
                  }
                />
              );
            })}

            {/* ERC20 tokens across all networks */}
            {allChainTokenBalances.map((token) => {
              const price = tokenPrices.get(token.symbol.toUpperCase());
              const valueUsd = price
                ? parseFloat(token.balanceFormatted) * price
                : undefined;
              return (
                <TokenRow
                  key={`${token.chainId}-${token.address}`}
                  token={{ ...token, valueUsd }}
                  onPress={() =>
                    router.push({
                      pathname: `/token/${token.address}`,
                      params: { chainId: String(token.chainId) },
                    } as any)
                  }
                  showChevron
                />
              );
            })}
          </View>

          {allChainNativeBalances.length === 0 && allChainTokenBalances.length === 0 && (
            <Text style={styles.noTokens}>No balances found across your networks</Text>
          )}
        </View>

        {/* Contract Holdings */}
        {showContractHoldings && contractBalances.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Contract Holdings</Text>
              <TouchableOpacity
                style={styles.contractBadge}
                onPress={() => router.push("/settings/zap-contract" as any)}
              >
                <Ionicons name="flash" size={14} color={accentColor} />
                <Text style={[styles.contractBadgeText, { color: accentColor }]}>Zap Contract</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.listContent}>
              {contractBalances.map((balance) => {
                const tokenKey = balance.tokenAddress || "native";

                // Get or create animation value for this token
                if (!withdrawAnimations.current.has(tokenKey)) {
                  withdrawAnimations.current.set(
                    tokenKey,
                    new Animated.Value(1),
                  );
                }
                const animValue = withdrawAnimations.current.get(tokenKey)!;
                const isWithdrawing = withdrawingToken === tokenKey;

                return (
                  <Animated.View
                    key={tokenKey}
                    style={{
                      opacity: animValue,
                      transform: [
                        {
                          translateX: animValue.interpolate({
                            inputRange: [0, 1],
                            outputRange: [100, 0],
                          }),
                        },
                      ],
                    }}
                  >
                    <View style={styles.holdingRow}>
                      <View style={styles.holdingIcon}>
                        <Text style={[styles.holdingIconText, { color: accentColor }]}>
                          {balance.symbol.slice(0, 2).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.holdingInfo}>
                        <Text style={styles.holdingSymbol}>
                          {balance.symbol}
                        </Text>
                        <Text style={styles.holdingName}>{balance.name}</Text>
                      </View>
                      <View style={styles.holdingBalance}>
                        <Text style={styles.holdingAmount}>
                          {parseFloat(balance.balanceFormatted).toLocaleString(
                            undefined,
                            { minimumFractionDigits: 0, maximumFractionDigits: 6 },
                          )}
                        </Text>
                        {(() => {
                          const price =
                            balance.tokenAddress === "native"
                              ? (tokenPrices.get("ETH") ?? null)
                              : (tokenPrices.get(balance.symbol.toUpperCase()) ?? null);
                          const val =
                            price !== null
                              ? parseFloat(balance.balanceFormatted) * (price ?? 0)
                              : null;
                          return val !== null && val > 0 ? (
                            <Text style={styles.holdingFiat}>
                              {PriceService.formatValue(val, currency)}
                            </Text>
                          ) : null;
                        })()}
                      </View>
                      <TouchableOpacity
                        style={[
                          styles.withdrawButton,
                          isWithdrawing && styles.withdrawButtonDisabled,
                        ]}
                        onPress={() => handleWithdraw(balance)}
                        disabled={isWithdrawing || withdrawingToken !== null}
                      >
                        {isWithdrawing ? (
                          <ActivityIndicator size="small" color={accentColor} />
                        ) : (
                          <>
                            <Ionicons
                              name="download-outline"
                              size={16}
                              color={accentColor}
                            />
                            <Text style={[styles.withdrawButtonText, { color: accentColor }]}>
                              Withdraw
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  </Animated.View>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>

    </View>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  disabled = false,
}: {
  icon: React.ReactElement;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <ReAnimated.View style={animatedStyle}>
      <TouchableOpacity
        style={[styles.actionButton, disabled && styles.actionDisabled]}
        onPress={onPress}
        onPressIn={() => {
          scale.value = withSpring(0.92, { damping: 18, stiffness: 400 });
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 18, stiffness: 400 });
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }}
        disabled={disabled}
        activeOpacity={1}
      >
        <View style={styles.actionIcon}>{icon}</View>
        <Text
          style={[styles.actionLabel, disabled && styles.actionLabelDisabled]}
        >
          {label}
        </Text>
      </TouchableOpacity>
    </ReAnimated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F1512",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "700",
  },
  accountButton: {
    padding: 4,
  },
  content: {
    flex: 1,
  },
  cardsContainer: {
    paddingHorizontal: CARD_PEEK,
  },
  cardWrapper: {
    width: CARD_TOTAL_WIDTH,
    paddingRight: CARD_GAP,
  },
  balanceCard: {
    flex: 1,
    padding: 32,
    gap: 60,
    overflow: "hidden",
    justifyContent: "space-between",
  },
  balanceCardImage: {
    borderRadius: 24,
    resizeMode: "cover",
  },
  networkBadgeInCard: {
    alignSelf: "flex-start",
    backgroundColor: "transparent",
    marginBottom: 16,
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  accountName: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 18,
  },
  addressBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    // backgroundColor: "#374151",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  addressText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 14,
  },
  totalValue: {
    color: "#FFFFFF",
    opacity: 0.5,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 4,
  },
  balance: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 4,
  },
  balanceFiat: {
    color: "#FFFFFF",
    opacity: 0.6,
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
    marginBottom: 8,
  },
  pageIndicators: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 12,
    gap: 8,
  },
  pageIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#374151",
  },
  pageIndicatorActive: {
    backgroundColor: "#10B981",
    width: 24,
  },
  nfcStatusContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 8,
  },
  nfcStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  nfcStatusText: {
    color: "#10B981",
    fontSize: 14,
    fontWeight: "500",
  },
  nfcStatusTextLocked: {
    color: "#6B7280",
    fontSize: 14,
    fontWeight: "500",
  },
  nfcStatusTextError: {
    color: "#EF4444",
    fontSize: 14,
    fontWeight: "500",
  },
  nfcStatusTextWarning: {
    color: "#F59E0B",
    fontSize: 14,
    fontWeight: "500",
  },
  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 32,
    marginBottom: 24,
  },
  actionButton: {
    alignItems: "center",
    gap: 8,
  },
  actionDisabled: {
    opacity: 0.5,
  },
  actionIcon: {
    width: "100%",
    height: 30,
    borderRadius: 28,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    color: "#569F8C",
    flex: 1,
  },
  actionLabel: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
  },
  actionLabelDisabled: {
    color: "#6B7280",
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  sectionTitle: {
    color: "#9CA3AF",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  pendingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#1E2E29",
    padding: 16,
    borderRadius: 12,
  },
  pendingText: {
    color: "#F59E0B",
    fontSize: 14,
    fontWeight: "500",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  seeMoreButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  seeMoreText: {
    color: "#569F8C",
    fontSize: 14,
    fontWeight: "600",
  },
  transactionList: {
    backgroundColor: "transparent",
    borderRadius: 12,
    overflow: "hidden",
  },
  noTokens: {
    color: "#6B7280",
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 24,
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
  listContent: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 24,
  },
  // Contract Holdings styles
  contractBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(86, 159, 140, 0.15)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  contractBadgeText: {
    color: "#569F8C",
    fontSize: 12,
    fontWeight: "600",
  },
  holdingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  holdingIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#1E2E29",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  holdingIconText: {
    color: "#569F8C",
    fontSize: 14,
    fontWeight: "700",
  },
  holdingInfo: {
    flex: 1,
  },
  holdingSymbol: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  holdingName: {
    color: "#9CA3AF",
    fontSize: 13,
  },
  holdingBalance: {
    marginRight: 12,
  },
  holdingAmount: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
    fontFamily: "monospace",
  },
  holdingFiat: {
    color: "#9CA3AF",
    fontSize: 12,
    marginTop: 2,
  },
  withdrawButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(86, 159, 140, 0.15)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 90,
    justifyContent: "center",
  },
  withdrawButtonDisabled: {
    opacity: 0.5,
  },
  withdrawButtonText: {
    color: "#569F8C",
    fontSize: 13,
    fontWeight: "600",
  },
});
