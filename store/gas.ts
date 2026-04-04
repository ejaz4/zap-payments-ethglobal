import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Gas speed presets
 */
export type GasSpeed = "slow" | "normal" | "fast" | "custom";

/**
 * Transaction types for gas configuration
 */
export type TransactionType =
  | "transfer" // Native token transfer
  | "erc20Transfer" // ERC20 token transfer
  | "erc20Approve" // ERC20 approval
  | "swap" // Token swap
  | "contract" // Generic contract interaction
  | "default"; // Fallback

/**
 * Gas configuration for a transaction type
 */
export interface GasConfig {
  speed: GasSpeed;
  customGasLimit?: string;
  customMaxFee?: string; // In Gwei (for EIP-1559)
  customPriorityFee?: string; // In Gwei (for EIP-1559)
  customGasPrice?: string; // In Gwei (for legacy)
}

/**
 * Gas multipliers for speed presets
 * Applied to the estimated gas from the network
 */
export const GAS_SPEED_MULTIPLIERS: Record<
  Exclude<GasSpeed, "custom">,
  { baseFee: number; priorityFee: number; legacy: number }
> = {
  slow: { baseFee: 0.8, priorityFee: 0.5, legacy: 0.85 },
  normal: { baseFee: 1.0, priorityFee: 1.0, legacy: 1.0 },
  fast: { baseFee: 1.25, priorityFee: 1.5, legacy: 1.25 },
};

/**
 * Default gas limits for transaction types
 * Used as fallback when estimation fails
 */
export const DEFAULT_GAS_LIMITS: Record<TransactionType, string> = {
  transfer: "21000",
  erc20Transfer: "65000",
  erc20Approve: "50000",
  swap: "300000",
  contract: "150000",
  default: "100000",
};

/**
 * Gas buffer percentages for safety
 */
export const GAS_LIMIT_BUFFER: Record<TransactionType, number> = {
  transfer: 0, // Native transfers are exact
  erc20Transfer: 0.15, // 15% buffer
  erc20Approve: 0.1, // 10% buffer
  swap: 0.2, // 20% buffer (swaps can vary)
  contract: 0.2, // 20% buffer
  default: 0.15,
};

interface GasState {
  // Default speed for all transactions
  defaultSpeed: GasSpeed;

  // Per-transaction-type gas configuration
  gasConfigs: Partial<Record<TransactionType, GasConfig>>;

  // Whether to show gas estimation details
  showGasDetails: boolean;

  // Whether to use legacy gas pricing (for non-EIP-1559 chains)
  preferLegacyGas: boolean;
}

interface GasActions {
  // Set default gas speed
  setDefaultSpeed: (speed: GasSpeed) => void;

  // Get gas config for a transaction type (with fallback to default)
  getGasConfig: (type: TransactionType) => GasConfig;

  // Set gas config for a transaction type
  setGasConfig: (type: TransactionType, config: GasConfig) => void;

  // Reset gas config for a transaction type
  resetGasConfig: (type: TransactionType) => void;

  // Toggle gas details visibility
  toggleGasDetails: () => void;

  // Set legacy gas preference
  setPreferLegacyGas: (prefer: boolean) => void;

  // Get gas limit with buffer applied
  getGasLimitWithBuffer: (type: TransactionType, estimated?: string) => string;

  // Calculate gas params based on speed and network data
  calculateGasParams: (
    type: TransactionType,
    networkGasData: {
      baseFee?: string;
      priorityFee?: string;
      gasPrice?: string;
      supportsEIP1559: boolean;
    },
  ) => {
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
    gasPrice?: string;
  };

  // Reset all gas settings
  resetAllGasSettings: () => void;
}

const initialState: GasState = {
  defaultSpeed: "normal",
  gasConfigs: {},
  showGasDetails: false,
  preferLegacyGas: false,
};

export const useGasStore = create<GasState & GasActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      setDefaultSpeed: (speed) => {
        set({ defaultSpeed: speed });
      },

      getGasConfig: (type) => {
        const { gasConfigs, defaultSpeed } = get();
        const config = gasConfigs[type];

        if (config) {
          return config;
        }

        // Return default config
        return {
          speed: defaultSpeed,
        };
      },

      setGasConfig: (type, config) => {
        set((state) => ({
          gasConfigs: {
            ...state.gasConfigs,
            [type]: config,
          },
        }));
      },

      resetGasConfig: (type) => {
        set((state) => {
          const newConfigs = { ...state.gasConfigs };
          delete newConfigs[type];
          return { gasConfigs: newConfigs };
        });
      },

      toggleGasDetails: () => {
        set((state) => ({ showGasDetails: !state.showGasDetails }));
      },

      setPreferLegacyGas: (prefer) => {
        set({ preferLegacyGas: prefer });
      },

      getGasLimitWithBuffer: (type, estimated) => {
        const { gasConfigs } = get();
        const config = gasConfigs[type];

        // If custom gas limit is set, use it
        if (config?.customGasLimit) {
          return config.customGasLimit;
        }

        // Apply buffer to estimated gas
        const baseGas =
          estimated || DEFAULT_GAS_LIMITS[type] || DEFAULT_GAS_LIMITS.default;
        const buffer = GAS_LIMIT_BUFFER[type] || GAS_LIMIT_BUFFER.default;

        const gasWithBuffer = Math.ceil(parseInt(baseGas, 10) * (1 + buffer));
        return gasWithBuffer.toString();
      },

      calculateGasParams: (type, networkGasData) => {
        const config = get().getGasConfig(type);
        const { preferLegacyGas } = get();

        // Use legacy gas if preferred or if chain doesn't support EIP-1559
        if (preferLegacyGas || !networkGasData.supportsEIP1559) {
          if (config.speed === "custom" && config.customGasPrice) {
            // Convert Gwei to Wei
            const gasPriceWei = BigInt(
              Math.floor(parseFloat(config.customGasPrice) * 1e9),
            );
            return { gasPrice: gasPriceWei.toString() };
          }

          const multiplier =
            GAS_SPEED_MULTIPLIERS[
              config.speed === "custom" ? "normal" : config.speed
            ];
          const baseGasPrice = BigInt(networkGasData.gasPrice || "0");
          const adjustedGasPrice =
            (baseGasPrice * BigInt(Math.floor(multiplier.legacy * 100))) /
            BigInt(100);

          return { gasPrice: adjustedGasPrice.toString() };
        }

        // EIP-1559 gas calculation
        if (config.speed === "custom") {
          const maxFee = config.customMaxFee
            ? BigInt(Math.floor(parseFloat(config.customMaxFee) * 1e9))
            : BigInt(networkGasData.baseFee || "0");
          const priorityFee = config.customPriorityFee
            ? BigInt(Math.floor(parseFloat(config.customPriorityFee) * 1e9))
            : BigInt(networkGasData.priorityFee || "1000000000"); // 1 Gwei default

          return {
            maxFeePerGas: maxFee.toString(),
            maxPriorityFeePerGas: priorityFee.toString(),
          };
        }

        const multiplier = GAS_SPEED_MULTIPLIERS[config.speed];
        const baseFee = BigInt(networkGasData.baseFee || "0");
        const priorityFee = BigInt(networkGasData.priorityFee || "1000000000");

        const adjustedBaseFee =
          (baseFee * BigInt(Math.floor(multiplier.baseFee * 100))) /
          BigInt(100);
        const adjustedPriorityFee =
          (priorityFee * BigInt(Math.floor(multiplier.priorityFee * 100))) /
          BigInt(100);

        // maxFeePerGas = 2 * baseFee + priorityFee (standard formula)
        const maxFeePerGas = adjustedBaseFee * BigInt(2) + adjustedPriorityFee;

        return {
          maxFeePerGas: maxFeePerGas.toString(),
          maxPriorityFeePerGas: adjustedPriorityFee.toString(),
        };
      },

      resetAllGasSettings: () => {
        set(initialState);
      },
    }),
    {
      name: "zap-gas-store",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

// Export selectors
export const useDefaultSpeed = () => useGasStore((s) => s.defaultSpeed);
export const useShowGasDetails = () => useGasStore((s) => s.showGasDetails);
export const usePreferLegacyGas = () => useGasStore((s) => s.preferLegacyGas);
