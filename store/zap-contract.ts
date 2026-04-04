/**
 * Zap Contract Store
 * Manages the user's deployed Zap Payment Terminal contract
 */

import { ChainId } from "@/app/profiles/client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Zap Contract configuration per chain
 */
export interface ZapContractEntry {
  /** The deployed contract address */
  address: string;
  /** Chain ID where deployed */
  chainId: ChainId;
  /** Wallet address that owns the contract */
  ownerAddress: string;
  /** Timestamp when deployed */
  deployedAt: number;
  /** Deployment transaction hash */
  deployTxHash?: string;
  /** Whether this is manually entered vs deployed */
  isManual: boolean;
  /** Whether to auto-withdraw funds to wallet after payment */
  autoWithdraw: boolean;
}

interface ZapContractState {
  /**
   * Zap contracts keyed by `${walletAddress}_${chainId}`
   */
  contracts: Record<string, ZapContractEntry>;

  /**
   * Get contract for current wallet and chain
   */
  getContract: (
    walletAddress: string,
    chainId: ChainId,
  ) => ZapContractEntry | null;

  /**
   * Set/save a zap contract
   */
  setContract: (entry: ZapContractEntry) => void;

  /**
   * Clear/remove a zap contract for a wallet+chain
   */
  clearContract: (walletAddress: string, chainId: ChainId) => void;

  /**
   * Check if a contract is configured for wallet+chain
   */
  hasContract: (walletAddress: string, chainId: ChainId) => boolean;

  /**
   * Update contract settings (e.g., autoWithdraw)
   */
  updateContractSettings: (
    walletAddress: string,
    chainId: ChainId,
    settings: Partial<Pick<ZapContractEntry, "autoWithdraw">>,
  ) => void;
}

export const useZapContractStore = create<ZapContractState>()(
  persist(
    (set, get) => ({
      contracts: {},

      getContract: (walletAddress, chainId) => {
        const key = `${walletAddress.toLowerCase()}_${chainId}`;
        return get().contracts[key] || null;
      },

      setContract: (entry) => {
        const key = `${entry.ownerAddress.toLowerCase()}_${entry.chainId}`;
        set((state) => ({
          contracts: {
            ...state.contracts,
            [key]: entry,
          },
        }));
      },

      clearContract: (walletAddress, chainId) => {
        const key = `${walletAddress.toLowerCase()}_${chainId}`;
        set((state) => {
          const { [key]: _, ...rest } = state.contracts;
          return { contracts: rest };
        });
      },

      hasContract: (walletAddress, chainId) => {
        const key = `${walletAddress.toLowerCase()}_${chainId}`;
        return !!get().contracts[key]?.address;
      },

      updateContractSettings: (walletAddress, chainId, settings) => {
        const key = `${walletAddress.toLowerCase()}_${chainId}`;
        const existing = get().contracts[key];
        if (existing) {
          set((state) => ({
            contracts: {
              ...state.contracts,
              [key]: { ...existing, ...settings },
            },
          }));
        }
      },
    }),
    {
      name: "zap-contract-storage",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

/**
 * Hook to get the current wallet's zap contract for selected chain
 */
export function useZapContract(
  walletAddress: string | undefined,
  chainId: ChainId,
) {
  const getContract = useZapContractStore((s) => s.getContract);
  const hasContract = useZapContractStore((s) => s.hasContract);

  if (!walletAddress) {
    return { contract: null, hasContract: false };
  }

  return {
    contract: getContract(walletAddress, chainId),
    hasContract: hasContract(walletAddress, chainId),
  };
}
