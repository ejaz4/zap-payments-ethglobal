import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface MerchantProduct {
  id: string;
  name: string;
  /** Decimal string price in the merchant's pricing currency */
  price: string;
  /** Optional display emoji */
  emoji: string;
}

export interface BasketItem {
  productId: string;
  quantity: number;
}

/**
 * The currency the merchant prices their products in.
 * - "native": chain's native gas token (ETH, MATIC, etc.)
 * - "token": a specific ERC-20 (USDC, USDT, DAI, etc.)
 */
export type PricingToken =
  | { type: "native" }
  | { type: "token"; address: string; symbol: string; decimals: number };

interface MerchantState {
  products: MerchantProduct[];
  basket: BasketItem[];
  /** Currency used for product pricing. Defaults to native. */
  pricingToken: PricingToken;
}

interface MerchantActions {
  addProduct: (product: Omit<MerchantProduct, "id">) => void;
  editProduct: (id: string, updates: Partial<Omit<MerchantProduct, "id">>) => void;
  removeProduct: (id: string) => void;
  addToBasket: (productId: string) => void;
  removeFromBasket: (productId: string) => void;
  clearBasket: () => void;
  getBasketTotal: () => string;
  getBasketCount: () => number;
  setPricingToken: (token: PricingToken) => void;
}

export const useMerchantStore = create<MerchantState & MerchantActions>()(
  persist(
    (set, get) => ({
      products: [],
      basket: [],
      pricingToken: { type: "native" } as PricingToken,

      addProduct: (product) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        set((s) => ({ products: [...s.products, { ...product, id }] }));
      },

      editProduct: (id, updates) => {
        set((s) => ({
          products: s.products.map((p) => (p.id === id ? { ...p, ...updates } : p)),
        }));
      },

      removeProduct: (id) => {
        set((s) => ({
          products: s.products.filter((p) => p.id !== id),
          basket: s.basket.filter((b) => b.productId !== id),
        }));
      },

      addToBasket: (productId) => {
        set((s) => {
          const existing = s.basket.find((b) => b.productId === productId);
          if (existing) {
            return {
              basket: s.basket.map((b) =>
                b.productId === productId ? { ...b, quantity: b.quantity + 1 } : b,
              ),
            };
          }
          return { basket: [...s.basket, { productId, quantity: 1 }] };
        });
      },

      removeFromBasket: (productId) => {
        set((s) => {
          const existing = s.basket.find((b) => b.productId === productId);
          if (!existing) return s;
          if (existing.quantity <= 1) {
            return { basket: s.basket.filter((b) => b.productId !== productId) };
          }
          return {
            basket: s.basket.map((b) =>
              b.productId === productId ? { ...b, quantity: b.quantity - 1 } : b,
            ),
          };
        });
      },

      clearBasket: () => set({ basket: [] }),

      getBasketTotal: () => {
        const { products, basket } = get();
        let total = 0;
        for (const item of basket) {
          const product = products.find((p) => p.id === item.productId);
          if (product) {
            total += parseFloat(product.price) * item.quantity;
          }
        }
        // Round to 8 decimal places to avoid floating point artifacts
        return parseFloat(total.toFixed(8)).toString();
      },

      getBasketCount: () => {
        return get().basket.reduce((sum, b) => sum + b.quantity, 0);
      },

      setPricingToken: (token) => set({ pricingToken: token }),
    }),
    {
      name: "zap-merchant-storage",
      storage: createJSONStorage(() => AsyncStorage),
      // Basket is intentionally NOT persisted — it resets between sessions
      partialize: (state) => ({ products: state.products, pricingToken: state.pricingToken }),
    },
  ),
);
