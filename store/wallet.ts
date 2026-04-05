import { ChainId } from "@/app/profiles/client";
import { useProviderStore } from "@/store/provider";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Available card background options
 */
export type CardBackground = "card-background-1" | "card-background-2" | "card-background-3" | "card-background-4" | "card-background-5" | "card-background-6";

export const CARD_BACKGROUNDS: CardBackground[] = [
  "card-background-1",
  "card-background-2",
   "card-background-3",
   "card-background-4",
    "card-background-5",
     "card-background-6",
];

/**
 * Account type representing a wallet account
 */
export interface Account {
  address: string;
  name: string;
  index: number;
  isImported: boolean;
  /** "evm" (default) or "solana". Determines which provider and signing path is used. */
  accountType?: "evm" | "solana";
  /** Dynamic wallet ID returned by the API on wallet creation/import. Required for signing in strict Dynamic custody mode. */
  dynamicWalletId?: string;
  /** The API network this wallet was created on (e.g. "dynamic-mainnet", "dynamic-testnet"). */
  networkId?: string;
  cardBackground?: CardBackground;
  /** Native currency amount below which NFC payments are sent automatically without confirmation */
  autoPayLimit?: string;
}

/**
 * Token balance type
 */
export interface TokenBalance {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  balanceFormatted: string;
  priceUsd?: number;
  valueUsd?: number;
  logoUri?: string;
  chainId: ChainId;
}

/**
 * Transaction type with full details
 */
export interface Transaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  chainId: ChainId;
  timestamp: number;
  status: "pending" | "confirmed" | "failed";
  type: "send" | "receive" | "swap" | "approve" | "unknown";
  tokenSymbol?: string;
  tokenAddress?: string;
  tokenDecimals?: number;
  gasUsed?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  gasLimit?: string;
  nonce?: number;
  blockNumber?: number;
  blockHash?: string;
  data?: string;
  confirmedAt?: number;

  // Payment method metadata
  paymentMethod?: "tap-to-pay" | "manual-transfer";

  // NFC/Tap-to-pay specific fields (from smart contract)
  merchantName?: string;
  merchantLocation?: string;
  description?: string;
  itemizedList?: { name: string; price: string; quantity?: number }[];
  contractAddress?: string;
}

/**
 * Wallet initialization state
 */
export type WalletStatus = "uninitialized" | "locked" | "unlocked";

/**
 * Wallet store state
 */
interface WalletState {
  // Status
  status: WalletStatus;
  isLoading: boolean;
  error: string | null;

  // Accounts
  accounts: Account[];
  selectedAccountIndex: number;

  // Network
  selectedChainId: ChainId;

  // Balances (keyed by `${address}_${chainId}`)
  nativeBalances: Record<string, string>;
  tokenBalances: Record<string, TokenBalance[]>;

  // Transactions (keyed by address)
  transactions: Record<string, Transaction[]>;

  // Pending transactions
  pendingTransactions: Transaction[];

  // Has backed up seed phrase
  hasBackedUp: boolean;

  // Flag to allow accessing onboarding for adding accounts
  isAddingAccount: boolean;
}

/**
 * Wallet store actions
 */
interface WalletActions {
  // Status
  setStatus: (status: WalletStatus) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;

  // Accounts
  addAccount: (account: Account) => void;
  removeAccount: (address: string) => void;
  setSelectedAccountIndex: (index: number) => void;
  updateAccountName: (address: string, name: string) => void;
  updateAccountBackground: (
    address: string,
    background: CardBackground,
  ) => void;
  updateAccountAutoPayLimit: (
    address: string,
    limit: string | undefined,
  ) => void;
  clearAccounts: () => void;

  // Network
  setSelectedChainId: (chainId: ChainId) => void;

  // Balances
  setNativeBalance: (
    address: string,
    chainId: ChainId,
    balance: string,
  ) => void;
  setTokenBalances: (
    address: string,
    chainId: ChainId,
    balances: TokenBalance[],
  ) => void;

  // Transactions
  addTransaction: (address: string, transaction: Transaction) => void;
  updateTransactionStatus: (
    hash: string,
    status: Transaction["status"],
  ) => void;
  updateTransaction: (hash: string, updates: Partial<Transaction>) => void;
  getTransaction: (hash: string) => Transaction | null;
  setTransactions: (address: string, transactions: Transaction[]) => void;
  addPendingTransaction: (transaction: Transaction) => void;
  removePendingTransaction: (hash: string) => void;

  // Backup
  setHasBackedUp: (hasBackedUp: boolean) => void;

  // Adding account mode
  setIsAddingAccount: (isAddingAccount: boolean) => void;

  // Reset
  reset: () => void;
}

const initialState: WalletState = {
  status: "uninitialized",
  isLoading: false,
  error: null,
  accounts: [],
  selectedAccountIndex: 0,
  selectedChainId: ChainId.mainnet,
  nativeBalances: {},
  tokenBalances: {},
  transactions: {},
  pendingTransactions: [],
  hasBackedUp: false,
  isAddingAccount: false,
};

/**
 * Wallet store using Zustand with persistence
 * Based on Rainbow's wallet state management patterns
 */
export const useWalletStore = create<WalletState & WalletActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      // Status actions
      setStatus: (status) => set({ status }),
      setLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),

      // Account actions
      addAccount: (account) =>
        set((state) => ({
          accounts: [...state.accounts, account],
        })),

      removeAccount: (address) =>
        set((state) => ({
          accounts: state.accounts.filter((a) => a.address !== address),
        })),

      setSelectedAccountIndex: (index) => set({ selectedAccountIndex: index }),

      updateAccountName: (address, name) =>
        set((state) => ({
          accounts: state.accounts.map((a) =>
            a.address === address ? { ...a, name } : a,
          ),
        })),

      updateAccountBackground: (address, background) =>
        set((state) => ({
          accounts: state.accounts.map((a) =>
            a.address === address ? { ...a, cardBackground: background } : a,
          ),
        })),

      updateAccountAutoPayLimit: (address, limit) =>
        set((state) => ({
          accounts: state.accounts.map((a) =>
            a.address === address ? { ...a, autoPayLimit: limit } : a,
          ),
        })),

      clearAccounts: () =>
        set({
          accounts: [],
          selectedAccountIndex: 0,
          nativeBalances: {},
          tokenBalances: {},
          transactions: {},
        }),

      // Network actions
      setSelectedChainId: (chainId) => set({ selectedChainId: chainId }),

      // Balance actions
      setNativeBalance: (address, chainId, balance) =>
        set((state) => ({
          nativeBalances: {
            ...state.nativeBalances,
            [`${address}_${chainId}`]: balance,
          },
        })),

      setTokenBalances: (address, chainId, balances) =>
        set((state) => ({
          tokenBalances: {
            ...state.tokenBalances,
            [`${address}_${chainId}`]: balances,
          },
        })),

      // Transaction actions
      addTransaction: (address, transaction) =>
        set((state) => {
          const existing = state.transactions[address] || [];
          return {
            transactions: {
              ...state.transactions,
              [address]: [transaction, ...existing],
            },
          };
        }),

      updateTransactionStatus: (hash, status) =>
        set((state) => {
          const newTransactions: Record<string, Transaction[]> = {};
          for (const [addr, txs] of Object.entries(state.transactions)) {
            newTransactions[addr] = txs.map((tx) =>
              tx.hash === hash ? { ...tx, status } : tx,
            );
          }
          return { transactions: newTransactions };
        }),

      updateTransaction: (hash, updates) =>
        set((state) => {
          const newTransactions: Record<string, Transaction[]> = {};
          for (const [addr, txs] of Object.entries(state.transactions)) {
            newTransactions[addr] = txs.map((tx) =>
              tx.hash === hash ? { ...tx, ...updates } : tx,
            );
          }
          return { transactions: newTransactions };
        }),

      getTransaction: (hash) => {
        const state = get();
        for (const txs of Object.values(state.transactions)) {
          const found = txs.find((tx) => tx.hash === hash);
          if (found) return found;
        }
        return null;
      },

      setTransactions: (address, transactions) =>
        set((state) => ({
          transactions: {
            ...state.transactions,
            [address]: transactions,
          },
        })),

      addPendingTransaction: (transaction) =>
        set((state) => ({
          pendingTransactions: [transaction, ...state.pendingTransactions],
        })),

      removePendingTransaction: (hash) =>
        set((state) => ({
          pendingTransactions: state.pendingTransactions.filter(
            (tx) => tx.hash !== hash,
          ),
        })),

      // Backup
      setHasBackedUp: (hasBackedUp) => set({ hasBackedUp }),

      // Adding account mode
      setIsAddingAccount: (isAddingAccount) => set({ isAddingAccount }),

      // Reset
      reset: () => set(initialState),
    }),
    {
      name: "zap-wallet-storage",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        accounts: state.accounts,
        selectedAccountIndex: state.selectedAccountIndex,
        selectedChainId: state.selectedChainId,
        hasBackedUp: state.hasBackedUp,
        transactions: state.transactions,
        // Cache balances for instant loading on app start
        nativeBalances: state.nativeBalances,
        tokenBalances: state.tokenBalances,
      }),
    },
  ),
);

// Selectors
export const useSelectedAccount = () => {
  const accounts = useWalletStore((s) => s.accounts);
  const selectedIndex = useWalletStore((s) => s.selectedAccountIndex);
  return accounts[selectedIndex] || null;
};

export const useSelectedChainId = () =>
  useWalletStore((s) => s.selectedChainId);

/**
 * Stable placeholder ChainId values for Solana networks.
 * These are outside the real EVM chain ID range (max ~84532 for testnets).
 * Used as storage keys in nativeBalances / tokenBalances maps.
 */
export const SOLANA_CHAIN_KEYS: Record<string, ChainId> = {
  "dynamic-mainnet": 999001 as ChainId,
  "dynamic-testnet": ChainId.solanaDevnet,
};

/** All Solana networkIds in display order */
export const SOLANA_NETWORK_IDS = ["dynamic-mainnet", "dynamic-testnet"] as const;

/** Get the storage ChainId for a Solana networkId */
export function getSolanaChainKey(networkId: string): ChainId {
  return SOLANA_CHAIN_KEYS[networkId] ?? (999001 as ChainId);
}

export const useNativeBalance = (address?: string, chainId?: ChainId) => {
  const balances = useWalletStore((s) => s.nativeBalances);
  const selectedChainId = useWalletStore((s) => s.selectedChainId);
  const selectedAccount = useSelectedAccount();
  const selectedApiNetworkId = useProviderStore((s) => s.selectedApiNetworkId);

  const addr = address || selectedAccount?.address;
  const isSolana = selectedAccount?.accountType === "solana";
  const chain = isSolana
    ? getSolanaChainKey(selectedApiNetworkId ?? "dynamic-mainnet")
    : (chainId || selectedChainId);

  if (!addr) return "0";
  return balances[`${addr}_${chain}`] || "0";
};

export const useTokenBalances = (address?: string, chainId?: ChainId) => {
  const balances = useWalletStore((s) => s.tokenBalances);
  const selectedChainId = useWalletStore((s) => s.selectedChainId);
  const selectedAccount = useSelectedAccount();
  const selectedApiNetworkId = useProviderStore((s) => s.selectedApiNetworkId);

  const addr = address || selectedAccount?.address;
  const isSolana = selectedAccount?.accountType === "solana";
  const chain = isSolana
    ? getSolanaChainKey(selectedApiNetworkId ?? "dynamic-mainnet")
    : (chainId || selectedChainId);

  if (!addr) return [];
  return balances[`${addr}_${chain}`] || [];
};

export const useTransactions = (address?: string) => {
  const transactions = useWalletStore((s) => s.transactions);
  const selectedAccount = useSelectedAccount();

  const addr = address || selectedAccount?.address;
  if (!addr) return [];
  return transactions[addr] || [];
};
