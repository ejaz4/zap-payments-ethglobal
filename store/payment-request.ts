import { ChainId } from "@/app/profiles/client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Default payment terminal contract addresses per chain
 * These are the deployed PaymentTerminalERC20 contracts
 */
export const DEFAULT_TERMINAL_CONTRACTS: Partial<Record<ChainId, string>> = {
  // Testnets - shared contract address
  [ChainId.plasmaTestnet]: "0x640eC5CC37B33E9EE2Ab9C41004462ee8604AE4C",
  [ChainId.chilizSpicy]: "0x640eC5CC37B33E9EE2Ab9C41004462ee8604AE4C",
  [ChainId.sepolia]: "0x640eC5CC37B33E9EE2Ab9C41004462ee8604AE4C",
  [ChainId.goerli]: "0x640eC5CC37B33E9EE2Ab9C41004462ee8604AE4C",
};

/**
 * Get default contract address for a chain
 */
export function getDefaultTerminalContract(chainId: ChainId): string {
  return DEFAULT_TERMINAL_CONTRACTS[chainId] || "";
}

/**
 * Itemized item in a payment request
 */
export interface ItemizedItem {
  name: string;
  quantity: number;
  price: string;
}

/**
 * Active payment request created by the merchant/receiver
 */
export interface PaymentRequest {
  id: string;
  contractAddress: string;
  chainId: number;
  amount: string;
  tokenSymbol: string;
  tokenAddress: string;
  description: string;
  merchantName: string;
  merchantLocation: string;
  itemizedList: ItemizedItem[];
  status: "pending" | "paid" | "cancelled" | "expired" | "failed";
  createdAt: number;
  txHash?: string; // Transaction hash when created on contract
  paidAt?: number;
  paidBy?: string;
  paidTxHash?: string; // Transaction hash of the payment
  contractTransactionId?: bigint; // The ID from the contract
  error?: string;
}

/**
 * Merchant info saved locally
 */
export interface MerchantInfo {
  name: string;
  location: string;
}

/**
 * Payment request settings
 */
export interface PaymentRequestSettings {
  // Auto-cancel timeout in minutes (0 = disabled)
  autoCancelTimeoutMinutes: number;
  // Polling interval in seconds
  pollingIntervalSeconds: number;
}

interface PaymentRequestState {
  // Saved contract address (user can manually input)
  contractAddress: string;
  setContractAddress: (address: string) => void;

  // Merchant info
  merchantInfo: MerchantInfo;
  updateMerchantInfo: (info: Partial<MerchantInfo>) => void;

  // Settings
  settings: PaymentRequestSettings;
  updateSettings: (settings: Partial<PaymentRequestSettings>) => void;

  // Active payment request (being monitored)
  activeRequest: PaymentRequest | null;
  setActiveRequest: (request: PaymentRequest | null) => void;
  updateActiveRequestStatus: (
    status: PaymentRequest["status"],
    extras?: {
      txHash?: string;
      paidBy?: string;
      paidTxHash?: string;
      error?: string;
    },
  ) => void;
  clearActiveRequest: () => void;

  // Check if request has timed out
  isRequestTimedOut: () => boolean;

  // Payment request history
  requestHistory: PaymentRequest[];
  addToHistory: (request: PaymentRequest) => void;
  clearHistory: () => void;
}

export const usePaymentRequestStore = create<PaymentRequestState>()(
  persist(
    (set, get) => ({
      // Contract address
      contractAddress: "",
      setContractAddress: (address) => set({ contractAddress: address }),

      // Merchant info
      merchantInfo: {
        name: "",
        location: "",
      },
      updateMerchantInfo: (info) =>
        set((state) => ({
          merchantInfo: { ...state.merchantInfo, ...info },
        })),

      // Settings
      settings: {
        autoCancelTimeoutMinutes: 10, // Default 10 minutes
        pollingIntervalSeconds: 5, // Default 5 seconds
      },
      updateSettings: (newSettings) =>
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        })),

      // Active request
      activeRequest: null,
      setActiveRequest: (request) => set({ activeRequest: request }),
      updateActiveRequestStatus: (status, extras) =>
        set((state) => {
          if (!state.activeRequest) return state;

          const updatedRequest: PaymentRequest = {
            ...state.activeRequest,
            status,
            ...(extras?.txHash && { txHash: extras.txHash }),
            ...(extras?.paidBy && { paidBy: extras.paidBy }),
            ...(extras?.paidTxHash && { paidTxHash: extras.paidTxHash }),
            ...(extras?.error && { error: extras.error }),
            ...(status === "paid" && { paidAt: Date.now() }),
          };

          // Add to history if completed (paid, cancelled, expired, or failed)
          const shouldAddToHistory = [
            "paid",
            "cancelled",
            "expired",
            "failed",
          ].includes(status);

          return {
            activeRequest: updatedRequest,
            requestHistory: shouldAddToHistory
              ? [updatedRequest, ...state.requestHistory]
              : state.requestHistory,
          };
        }),
      clearActiveRequest: () => set({ activeRequest: null }),

      // Check if request has timed out
      isRequestTimedOut: () => {
        const { activeRequest, settings } = get();
        if (!activeRequest || settings.autoCancelTimeoutMinutes === 0) {
          return false;
        }
        const timeoutMs = settings.autoCancelTimeoutMinutes * 60 * 1000;
        return Date.now() - activeRequest.createdAt > timeoutMs;
      },

      // History
      requestHistory: [],
      addToHistory: (request) =>
        set((state) => ({
          requestHistory: [request, ...state.requestHistory],
        })),
      clearHistory: () => set({ requestHistory: [] }),
    }),
    {
      name: "payment-request-storage",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
