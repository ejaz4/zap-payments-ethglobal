import { EthersClient } from "@/app/profiles/client";
import {
  NativeTokenRow,
  NetworkBadge,
  NetworkSelector,
  TokenRow,
  TransactionRow,
} from "@/components/ui";
import { DEFAULT_TOKENS } from "@/config/tokens";
import { useNativePrice } from "@/hooks/use-prices";
import { PriceService } from "@/services/price";
import { BalanceService } from "@/services/wallet";
import { ContractBalance, ZapContractService } from "@/services/zap-contract";
import {
  Account,
  CARD_BACKGROUNDS,
  CardBackground,
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
  PlusIcon,
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
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { NfcContext } from "../nfc/context";

// Card background images
const CARD_BACKGROUND_IMAGES: Record<CardBackground, ImageSourcePropType> = {
  "card-background-1": require("@/assets/images/backgrounds/card-background-1.png"),
  "card-background-2": require("@/assets/images/backgrounds/card-background-2.png"),
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

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const accounts = useWalletStore((s) => s.accounts);
  const selectedAccountIndex = useWalletStore((s) => s.selectedAccountIndex);
  const setSelectedAccountIndex = useWalletStore(
    (s) => s.setSelectedAccountIndex,
  );
  const selectedAccount = useSelectedAccount();
  const selectedChainId = useWalletStore((s) => s.selectedChainId);
  const setSelectedChainId = useWalletStore((s) => s.setSelectedChainId);
  const allNativeBalances = useWalletStore((s) => s.nativeBalances);
  const allTokenBalances = useWalletStore((s) => s.tokenBalances);
  const allTransactions = useWalletStore((s) => s.transactions);
  const pendingTxs = useWalletStore((s) => s.pendingTransactions);

  const [refreshing, setRefreshing] = useState(false);
  const [networkSelectorVisible, setNetworkSelectorVisible] = useState(false);
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
  const nativeBalance = currentAccount
    ? allNativeBalances[`${currentAccount.address}_${selectedChainId}`] || "0"
    : "0";
  const tokenBalances = currentAccount
    ? allTokenBalances[`${currentAccount.address}_${selectedChainId}`] || []
    : [];
  const transactions = currentAccount
    ? allTransactions[currentAccount.address] || []
    : [];

  // Get contract for current account and chain
  const currentContract = useMemo(() => {
    if (!currentAccount) return null;
    return getContract(currentAccount.address, selectedChainId);
  }, [currentAccount, selectedChainId, getContract]);

  // Show contract holdings when we have a contract with any balance
  // (regardless of autoWithdraw setting - funds might be stuck from failed withdrawals)
  const showContractHoldings = currentContract && contractBalances.length > 0;

  const nfcState = useContext(NfcContext);

  const networkConfig = EthersClient.getNetworkConfig(selectedChainId);

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

  // Native currency price
  const { price: nativePrice, refresh: refreshNativePrice } =
    useNativePrice(selectedChainId);

  // Calculate native USD value
  const nativeValueUsd = useMemo(() => {
    if (!nativePrice) return undefined;
    const balanceNum = parseFloat(nativeBalance);
    if (isNaN(balanceNum)) return undefined;
    return balanceNum * nativePrice;
  }, [nativeBalance, nativePrice]);

  // Total portfolio value
  const totalValueUsd = useMemo(() => {
    let total = nativeValueUsd || 0;
    for (const token of tokenBalances) {
      const price = tokenPrices.get(token.symbol.toUpperCase());
      if (price) {
        const balanceNum = parseFloat(token.balanceFormatted);
        if (!isNaN(balanceNum)) {
          total += balanceNum * price;
        }
      }
    }
    return total;
  }, [nativeValueUsd, tokenBalances, tokenPrices]);

  // Fetch token prices
  useEffect(() => {
    const fetchPrices = async () => {
      if (tokenBalances.length === 0) return;

      const tokens = tokenBalances.map((t) => ({
        symbol: t.symbol,
        address: t.address,
        chainId: t.chainId,
      }));

      const prices = await PriceService.batchGetPrices(tokens);
      setTokenPrices(prices);
    };

    fetchPrices();
    // No interval - cache handles freshness, pull-to-refresh forces update
  }, [tokenBalances]);

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
  }, [currentContract, currentAccount, selectedChainId, nativeBalance]);

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

  // Pull-to-refresh - force fresh API calls
  const onRefresh = useCallback(async () => {
    setRefreshing(true);

    // Refresh balances
    await BalanceService.forceRefreshBalances();

    // Refresh native price
    refreshNativePrice();

    // Refresh token prices (force fresh)
    if (tokenBalances.length > 0) {
      const tokens = tokenBalances.map((t) => ({
        symbol: t.symbol,
        address: t.address,
        chainId: t.chainId,
      }));
      const prices = await PriceService.batchGetPrices(tokens, true);
      setTokenPrices(prices);
    }

    // Refresh contract balances (always check if contract exists)
    if (currentContract && currentAccount) {
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
        console.error("Failed to refresh contract balances:", error);
      }
    }

    setRefreshing(false);
  }, [
    refreshNativePrice,
    tokenBalances,
    currentContract,
    currentAccount,
    selectedChainId,
  ]);

  // Auto-refresh on mount/chain change (throttled)
  useEffect(() => {
    if (currentAccount) {
      BalanceService.refreshBalances();
    }
  }, [currentAccount, selectedChainId]);

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

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatBalance = (balance: string) => {
    const num = parseFloat(balance);
    if (num === 0) return "0";
    if (num < 0.0001) return "< 0.0001";
    return num.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 4,
    });
  };

  if (!currentAccount) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No wallet found</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Calculate balance and value for a specific account
  const getAccountBalance = (account: Account) => {
    return allNativeBalances[`${account.address}_${selectedChainId}`] || "0";
  };

  const getAccountTokenBalances = (account: Account) => {
    return allTokenBalances[`${account.address}_${selectedChainId}`] || [];
  };

  const getAccountTotalValue = (account: Account) => {
    const balance = getAccountBalance(account);
    let total = 0;

    // Native balance value
    if (nativePrice) {
      const balanceNum = parseFloat(balance);
      if (!isNaN(balanceNum)) {
        total += balanceNum * nativePrice;
      }
    }

    // Token values
    const tokens = getAccountTokenBalances(account);
    for (const token of tokens) {
      const price = tokenPrices.get(token.symbol.toUpperCase());
      if (price) {
        const balanceNum = parseFloat(token.balanceFormatted);
        if (!isNaN(balanceNum)) {
          total += balanceNum * price;
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
  }) => {
    const balance = getAccountBalance(account);
    const totalValue = getAccountTotalValue(account);
    const cardBackground = getAccountCardBackground(account);

    return (
      <View style={styles.cardWrapper}>
        <ImageBackground
          source={cardBackground}
          style={styles.balanceCard}
          imageStyle={styles.balanceCardImage}
        >
          <View style={{ alignItems: "flex-start" }}>
            {/* Total USD Value */}
            {totalValue > 0 && (
              <Text style={styles.totalValue}>
                {PriceService.formatValue(totalValue)}
              </Text>
            )}

            <Text style={styles.balance}>
              {networkConfig?.nativeCurrency.symbol || "ETH"}{" "}
              {formatBalance(balance)}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.addressRow}
            onPress={() => copyAddress(account.address)}
            onPressIn={() =>
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
            }
          >
            <Text style={styles.accountName}>{account.name}</Text>
            <View style={styles.addressBadge}>
              <Text style={styles.addressText}>
                {formatAddress(account.address)}
              </Text>
              <Ionicons
                name={
                  copied && activeCardIndex === index
                    ? "checkmark"
                    : "copy-outline"
                }
                size={14}
                color="#9CA3AF"
              />
            </View>
          </TouchableOpacity>
        </ImageBackground>
      </View>
    );
  };

  return (
    <View style={[{ paddingTop: insets.top }, styles.container]}>
      <View style={styles.header}>
        {/* Network Selector inside card */}
        <TouchableOpacity
          style={styles.networkBadgeInCard}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setNetworkSelectorVisible(true);
          }}
        >
          <NetworkBadge
            chainId={selectedChainId}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setNetworkSelectorVisible(true);
            }}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.accountButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/settings/accounts" as any);
          }}
        >
          <Ionicons name="person-circle-outline" size={32} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
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
              <Ionicons name="radio-outline" size={18} color="#10B981" />
              <Text style={styles.nfcStatusText}>Tap to pay</Text>
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
            icon={<ArrowUpIcon color={"#569F8C"} size={30} />}
            label="Send"
            onPress={() => router.push("/send" as any)}
          />
          <ActionButton
            icon={<ArrowDownIcon color={"#569F8C"} size={30} />}
            label="Receive"
            onPress={() => router.push("/receive" as any)}
          />
          <ActionButton
            icon={<PlusIcon color={"#569F8C"} size={30} />}
            label="Add Money"
            onPress={() =>
              Alert.alert("Coming Soon", "Add Money feature is coming soon!")
            }
          />
          <ActionButton
            icon={<ArrowRightLeftIcon color={"#569F8C"} size={30} />}
            label="Swap"
            onPress={() =>
              Alert.alert("Coming Soon", "Swap feature is coming soon!")
            }
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
                <Text style={styles.seeMoreText}>See More</Text>
                <Ionicons name="chevron-forward" size={16} color="#569F8C" />
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

        {/* Tokens */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tokens</Text>

          <View style={styles.listContent}>
            <NativeTokenRow
              symbol={networkConfig?.nativeCurrency.symbol || "ETH"}
              name={networkConfig?.nativeCurrency.name || "Ethereum"}
              balance={nativeBalance}
              valueUsd={nativeValueUsd}
              onPress={() =>
                router.push({
                  pathname: "/token/native",
                  params: { chainId: String(selectedChainId) },
                } as any)
              }
            />
            {tokenBalances.map((token) => {
              // Calculate USD value for this token
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

          {tokenBalances.length === 0 && (
            <Text style={styles.noTokens}>
              No other tokens found on this network
            </Text>
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
                <Ionicons name="flash" size={14} color="#569F8C" />
                <Text style={styles.contractBadgeText}>Zap Contract</Text>
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
                        <Text style={styles.holdingIconText}>
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
                          {parseFloat(balance.balanceFormatted).toFixed(6)}
                        </Text>
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
                          <ActivityIndicator size="small" color="#569F8C" />
                        ) : (
                          <>
                            <Ionicons
                              name="download-outline"
                              size={16}
                              color="#569F8C"
                            />
                            <Text style={styles.withdrawButtonText}>
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

      <NetworkSelector
        visible={networkSelectorVisible}
        selectedChainId={selectedChainId}
        onSelect={setSelectedChainId}
        onClose={() => setNetworkSelectorVisible(false)}
      />
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
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  };

  return (
    <TouchableOpacity
      style={[styles.actionButton, disabled && styles.actionDisabled]}
      onPress={handlePress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <View style={styles.actionIcon}>{icon}</View>
      <Text
        style={[styles.actionLabel, disabled && styles.actionLabelDisabled]}
      >
        {label}
      </Text>
    </TouchableOpacity>
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
    color: "#9CA3AF",
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
    justifyContent: "space-around",
    paddingHorizontal: 16,
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
