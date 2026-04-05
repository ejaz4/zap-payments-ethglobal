import { DEFAULT_SLIPPAGE } from "@/config/uniswap";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface UniswapStore {
  /** Uniswap Trading API key */
  apiKey: string;
  setApiKey: (key: string) => void;

  /** Default slippage tolerance in percent (1-50) */
  slippage: number;
  setSlippage: (pct: number) => void;
}

export const useUniswapStore = create<UniswapStore>()(
  persist(
    (set) => ({
      apiKey: (process.env["EXPO_PUBLIC_UNISWAP_API_KEY"] as string | undefined) ?? "",
      setApiKey: (key) => set({ apiKey: key }),

      slippage: DEFAULT_SLIPPAGE,
      setSlippage: (pct) =>
        set({ slippage: Math.max(0.1, Math.min(50, pct)) }),
    }),
    {
      name: "zap-uniswap-store",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
