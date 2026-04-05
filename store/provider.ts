/**
 * Provider store — tracks which blockchain provider is active (EVM local or API)
 * and, when in API mode, which network is selected plus the full network catalogue.
 */

import { ApiProvider } from "@/crypto/provider/api";
import type { NetworkInfo } from "@/crypto/types";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type ProviderType = "evm" | "api" | "dynamic";

interface ProviderState {
  providerType: ProviderType;
  /**
   * Base URL for the external API (e.g. "https://api.example.com").
   * Persisted so the user only has to enter it once.
   * Falls back to EXPO_PUBLIC_API_URL if empty.
   */
  apiBaseUrl: string;
  /** Networks fetched from the API backend — populated on demand. */
  apiNetworks: NetworkInfo[];
  /** The currently active network when providerType === "api". */
  selectedApiNetworkId: string | null;
  isLoadingApiNetworks: boolean;
  apiNetworksError: string | null;
  /** The currently active Dynamic SVM network (e.g. "sol-mainnet", "sol-devnet"). */
  selectedDynamicNetworkId: string | null;
}

interface ProviderActions {
  /** Switch between "evm" and "api" modes. Auto-fetches API networks on first switch. */
  setProviderType: (type: ProviderType) => void;
  /** Update the API base URL (persisted). Clears the cached network list so it re-fetches. */
  setApiBaseUrl: (url: string) => void;
  /** Fetch the network catalogue from the API backend. */
  fetchApiNetworks: () => Promise<void>;
  /** Set the active API network. */
  setSelectedApiNetworkId: (networkId: string) => void;
  /** Derived: returns the full NetworkInfo for the currently selected API network. */
  getSelectedApiNetwork: () => NetworkInfo | null;
  /** Human-readable label for the active network in either mode. */
  getActiveNetworkLabel: (evmChainName: string) => string;
  /** Returns the resolved API base URL (stored value, or env var fallback). */
  getApiBaseUrl: () => string;
  /** Set the active Dynamic SVM network. */
  setSelectedDynamicNetworkId: (networkId: string) => void;
}

const ENV_API_URL = (process.env["EXPO_PUBLIC_API_URL"] as string | undefined) ?? "";

const initialState: ProviderState = {
  providerType: "evm",
  apiBaseUrl: "",
  apiNetworks: [],
  selectedApiNetworkId: null,
  isLoadingApiNetworks: false,
  apiNetworksError: null,
  selectedDynamicNetworkId: "sol-mainnet",
};

export const useProviderStore = create<ProviderState & ProviderActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      getApiBaseUrl: () => {
        const stored = get().apiBaseUrl.trim();
        return stored || ENV_API_URL;
      },

      setProviderType: (type) => {
        set({ providerType: type });
        // Auto-load API networks the first time the user switches to API mode
        if (type === "api" && get().apiNetworks.length === 0) {
          get().fetchApiNetworks();
        }
      },

      setApiBaseUrl: (url) => {
        set({ apiBaseUrl: url.trim(), apiNetworks: [], selectedApiNetworkId: null });
      },

      fetchApiNetworks: async () => {
        const baseUrl = get().getApiBaseUrl();
        if (!baseUrl) {
          set({
            isLoadingApiNetworks: false,
            apiNetworksError: "No API URL configured. Enter one in Settings → API.",
          });
          return;
        }
        set({ isLoadingApiNetworks: true, apiNetworksError: null });
        try {
          const provider = new ApiProvider(baseUrl);
          const networks = await provider.getNetworks();
          set({ apiNetworks: networks, isLoadingApiNetworks: false });
          if (!get().selectedApiNetworkId && networks.length > 0) {
            set({ selectedApiNetworkId: networks[0].networkId });
          }
        } catch (err: any) {
          console.error("[ProviderStore] fetchApiNetworks error:", err);
          set({
            isLoadingApiNetworks: false,
            apiNetworksError: err?.message ?? "Failed to load API networks",
          });
        }
      },

      setSelectedApiNetworkId: (networkId) => {
        set({ selectedApiNetworkId: networkId });
      },

      getSelectedApiNetwork: () => {
        const { apiNetworks, selectedApiNetworkId } = get();
        return (
          apiNetworks.find((n) => n.networkId === selectedApiNetworkId) ?? null
        );
      },

      setSelectedDynamicNetworkId: (networkId) => {
        set({ selectedDynamicNetworkId: networkId });
      },

      getActiveNetworkLabel: (evmChainName) => {
        const { providerType } = get();
        if (providerType === "dynamic") {
          const nid = get().selectedDynamicNetworkId ?? "sol-mainnet";
          return nid === "sol-devnet" ? "Solana Devnet" : "Solana";
        }
        if (providerType === "api") {
          const network = get().getSelectedApiNetwork();
          return network?.displayName ?? "API";
        }
        return evmChainName;
      },
    }),
    {
      name: "zap-provider-storage",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        providerType: state.providerType,
        apiBaseUrl: state.apiBaseUrl,
        selectedApiNetworkId: state.selectedApiNetworkId,
        selectedDynamicNetworkId: state.selectedDynamicNetworkId,
      }),
    },
  ),
);

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export const useProviderType = () =>
  useProviderStore((s) => s.providerType);

export const useSelectedApiNetwork = () =>
  useProviderStore((s) => s.getSelectedApiNetwork());

export const useApiNetworks = () =>
  useProviderStore((s) => s.apiNetworks);

export const useIsApiMode = () =>
  useProviderStore((s) => s.providerType === "api");

export const useIsDynamicMode = () =>
  useProviderStore((s) => s.providerType === "dynamic");

export const useSelectedDynamicNetworkId = () =>
  useProviderStore((s) => s.selectedDynamicNetworkId);
