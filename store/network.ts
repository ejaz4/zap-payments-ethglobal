import { ChainId, DEFAULT_NETWORKS, EthersClient } from "@/app/profiles/client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Custom RPC configuration per network
 */
export interface CustomRpcConfig {
  chainId: ChainId;
  customRpcUrl: string | null; // null = use default
}

/**
 * Custom network configuration (user-added networks)
 */
export interface CustomNetwork {
  chainId: number;
  name: string;
  rpcUrl: string;
  symbol: string;
  decimals: number;
  blockExplorerUrl?: string;
}

/**
 * Network store state
 */
interface NetworkState {
  // Custom RPC URLs per chain (null means use default)
  customRpcUrls: Record<number, string | null>;

  // User-added custom networks
  customNetworks: CustomNetwork[];

  // Enabled networks (user can hide networks they don't use)
  enabledNetworks: number[];

  // Favorite/pinned networks (shown first)
  favoriteNetworks: number[];
}

/**
 * Network store actions
 */
interface NetworkActions {
  // RPC Configuration
  setCustomRpcUrl: (chainId: number, rpcUrl: string | null) => void;
  getEffectiveRpcUrl: (chainId: number) => string;
  resetRpcToDefault: (chainId: number) => void;

  // Custom Networks
  addCustomNetwork: (network: CustomNetwork) => void;
  removeCustomNetwork: (chainId: number) => void;
  updateCustomNetwork: (
    chainId: number,
    updates: Partial<CustomNetwork>,
  ) => void;
  getCustomNetwork: (chainId: number) => CustomNetwork | undefined;
  isCustomNetwork: (chainId: number) => boolean;
  getAllNetworkChainIds: () => number[];

  // Network visibility
  enableNetwork: (chainId: number) => void;
  disableNetwork: (chainId: number) => void;
  toggleNetwork: (chainId: number) => void;

  // Favorites
  addFavorite: (chainId: number) => void;
  removeFavorite: (chainId: number) => void;
  toggleFavorite: (chainId: number) => void;

  // Get ordered networks (favorites first, then enabled)
  getOrderedNetworks: () => number[];

  // Apply custom RPC configuration to EthersClient
  applyRpcConfiguration: () => void;

  // Reset
  reset: () => void;
}

// All supported networks
const ALL_NETWORKS = Object.values(ChainId).filter(
  (v) => typeof v === "number",
) as ChainId[];

// Default enabled networks
const DEFAULT_ENABLED: number[] = [
  ChainId.mainnet,
  ChainId.polygon,
  ChainId.arbitrum,
  ChainId.optimism,
  ChainId.base,
];

// Default favorites
const DEFAULT_FAVORITES: number[] = [ChainId.mainnet];

const initialState: NetworkState = {
  customRpcUrls: {} as Record<number, string | null>,
  customNetworks: [],
  enabledNetworks: DEFAULT_ENABLED,
  favoriteNetworks: DEFAULT_FAVORITES,
};

/**
 * Network store for managing RPC configuration and network preferences
 */
export const useNetworkStore = create<NetworkState & NetworkActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      // RPC Configuration
      setCustomRpcUrl: (chainId, rpcUrl) => {
        set((state) => ({
          customRpcUrls: {
            ...state.customRpcUrls,
            [chainId]: rpcUrl,
          },
        }));
        // Apply to EthersClient
        get().applyRpcConfiguration();
      },

      getEffectiveRpcUrl: (chainId) => {
        const customUrl = get().customRpcUrls[chainId];
        if (customUrl) {
          return customUrl;
        }
        // Check if it's a custom network
        const customNetwork = get().customNetworks.find(
          (n) => n.chainId === chainId,
        );
        if (customNetwork) {
          return customNetwork.rpcUrl;
        }
        return DEFAULT_NETWORKS[chainId as ChainId]?.rpcUrl || "";
      },

      resetRpcToDefault: (chainId) => {
        set((state) => ({
          customRpcUrls: {
            ...state.customRpcUrls,
            [chainId]: null,
          },
        }));
        get().applyRpcConfiguration();
      },

      // Custom Networks
      addCustomNetwork: (network) => {
        set((state) => ({
          customNetworks: [...state.customNetworks, network],
          enabledNetworks: [...state.enabledNetworks, network.chainId],
        }));
        // Configure in EthersClient
        EthersClient.configureNetwork({
          chainId: network.chainId as ChainId,
          name: network.name,
          rpcUrl: network.rpcUrl,
          nativeCurrency: {
            name: network.symbol,
            symbol: network.symbol,
            decimals: network.decimals,
          },
          blockExplorerUrl: network.blockExplorerUrl,
        });
      },

      removeCustomNetwork: (chainId) => {
        set((state) => ({
          customNetworks: state.customNetworks.filter(
            (n) => n.chainId !== chainId,
          ),
          enabledNetworks: state.enabledNetworks.filter((id) => id !== chainId),
          favoriteNetworks: state.favoriteNetworks.filter(
            (id) => id !== chainId,
          ),
        }));
        EthersClient.clearProviderCache();
      },

      updateCustomNetwork: (chainId, updates) => {
        set((state) => ({
          customNetworks: state.customNetworks.map((n) =>
            n.chainId === chainId ? { ...n, ...updates } : n,
          ),
        }));
        get().applyRpcConfiguration();
      },

      getCustomNetwork: (chainId) => {
        return get().customNetworks.find((n) => n.chainId === chainId);
      },

      isCustomNetwork: (chainId) => {
        return get().customNetworks.some((n) => n.chainId === chainId);
      },

      getAllNetworkChainIds: () => {
        const builtIn = ALL_NETWORKS as number[];
        const custom = get().customNetworks.map((n) => n.chainId);
        return [...builtIn, ...custom];
      },

      // Network visibility
      enableNetwork: (chainId) =>
        set((state) => ({
          enabledNetworks: state.enabledNetworks.includes(chainId)
            ? state.enabledNetworks
            : [...state.enabledNetworks, chainId],
        })),

      disableNetwork: (chainId) =>
        set((state) => ({
          enabledNetworks: state.enabledNetworks.filter((id) => id !== chainId),
          favoriteNetworks: state.favoriteNetworks.filter(
            (id) => id !== chainId,
          ),
        })),

      toggleNetwork: (chainId) => {
        const { enabledNetworks, enableNetwork, disableNetwork } = get();
        if (enabledNetworks.includes(chainId)) {
          disableNetwork(chainId);
        } else {
          enableNetwork(chainId);
        }
      },

      // Favorites
      addFavorite: (chainId) => {
        const { enabledNetworks, enableNetwork } = get();
        // Auto-enable if not enabled
        if (!enabledNetworks.includes(chainId)) {
          enableNetwork(chainId);
        }
        set((state) => ({
          favoriteNetworks: state.favoriteNetworks.includes(chainId)
            ? state.favoriteNetworks
            : [...state.favoriteNetworks, chainId],
        }));
      },

      removeFavorite: (chainId) =>
        set((state) => ({
          favoriteNetworks: state.favoriteNetworks.filter(
            (id) => id !== chainId,
          ),
        })),

      toggleFavorite: (chainId) => {
        const { favoriteNetworks, addFavorite, removeFavorite } = get();
        if (favoriteNetworks.includes(chainId)) {
          removeFavorite(chainId);
        } else {
          addFavorite(chainId);
        }
      },

      // Get ordered networks
      getOrderedNetworks: () => {
        const { enabledNetworks, favoriteNetworks } = get();
        const favorites = favoriteNetworks.filter((id) =>
          enabledNetworks.includes(id),
        );
        const others = enabledNetworks.filter(
          (id) => !favoriteNetworks.includes(id),
        );
        return [...favorites, ...others];
      },

      // Apply configuration to EthersClient
      applyRpcConfiguration: () => {
        const { customRpcUrls, customNetworks } = get();

        // Clear provider cache to force new connections
        EthersClient.clearProviderCache();

        // Configure built-in networks with custom RPC if set
        for (const chainId of ALL_NETWORKS) {
          const customUrl = customRpcUrls[chainId];
          const defaultConfig = DEFAULT_NETWORKS[chainId];

          if (customUrl && defaultConfig) {
            EthersClient.configureNetwork({
              ...defaultConfig,
              rpcUrl: customUrl,
            });
          }
        }

        // Configure custom networks
        for (const network of customNetworks) {
          EthersClient.configureNetwork({
            chainId: network.chainId as ChainId,
            name: network.name,
            rpcUrl: network.rpcUrl,
            nativeCurrency: {
              name: network.symbol,
              symbol: network.symbol,
              decimals: network.decimals,
            },
            blockExplorerUrl: network.blockExplorerUrl,
          });
        }
      },

      // Reset
      reset: () => set(initialState),
    }),
    {
      name: "zap-network-storage",
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        // Apply RPC configuration after rehydration
        if (state) {
          state.applyRpcConfiguration();
        }
      },
    },
  ),
);

// Selectors
export const useCustomRpcUrl = (chainId: ChainId) =>
  useNetworkStore((s) => s.customRpcUrls[chainId] || null);

export const useIsNetworkEnabled = (chainId: ChainId) =>
  useNetworkStore((s) => s.enabledNetworks.includes(chainId));

export const useIsNetworkFavorite = (chainId: ChainId) =>
  useNetworkStore((s) => s.favoriteNetworks.includes(chainId));

export const useEnabledNetworks = () =>
  useNetworkStore((s) => s.enabledNetworks);

export const useOrderedNetworks = () =>
  useNetworkStore((s) => s.getOrderedNetworks());
