import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChainId } from '@/app/profiles/client';
import { TokenInfo, DEFAULT_TOKENS, getTokenKey, getDefaultTokensForChain } from '@/config/tokens';

/**
 * Custom token added by user
 */
export interface CustomToken extends TokenInfo {
  addedAt: number;
  isHidden?: boolean;
}

/**
 * Token store state
 */
interface TokenState {
  // Custom tokens added by user (keyed by `${address}_${chainId}`)
  customTokens: Record<string, CustomToken>;
  
  // Hidden token addresses (user wants to hide these)
  hiddenTokens: Set<string>;
  
  // Favorite tokens (shown first)
  favoriteTokens: Set<string>;
}

/**
 * Token store actions
 */
interface TokenActions {
  // Add a custom token
  addCustomToken: (token: Omit<CustomToken, 'addedAt'>) => void;
  
  // Remove a custom token
  removeCustomToken: (address: string, chainId: ChainId) => void;
  
  // Update a custom token
  updateCustomToken: (address: string, chainId: ChainId, updates: Partial<CustomToken>) => void;
  
  // Check if token exists (custom or default)
  hasToken: (address: string, chainId: ChainId) => boolean;
  
  // Get a specific token (custom or default)
  getToken: (address: string, chainId: ChainId) => TokenInfo | CustomToken | undefined;
  
  // Get all tokens for a chain (default + custom, excluding hidden)
  getTokensForChain: (chainId: ChainId) => TokenInfo[];
  
  // Get custom tokens only for a chain
  getCustomTokensForChain: (chainId: ChainId) => CustomToken[];
  
  // Hide/show a token
  toggleHideToken: (address: string, chainId: ChainId) => void;
  
  // Check if token is hidden
  isTokenHidden: (address: string, chainId: ChainId) => boolean;
  
  // Favorite/unfavorite a token
  toggleFavoriteToken: (address: string, chainId: ChainId) => void;
  
  // Check if token is favorite
  isTokenFavorite: (address: string, chainId: ChainId) => boolean;
  
  // Get all favorite tokens for a chain
  getFavoriteTokensForChain: (chainId: ChainId) => TokenInfo[];
  
  // Import token from contract (validates on-chain)
  importTokenFromAddress: (address: string, chainId: ChainId, onChainData: {
    name: string;
    symbol: string;
    decimals: number;
  }) => CustomToken;
  
  // Reset all custom tokens
  resetCustomTokens: () => void;
}

// Helper to convert Set to Array for persistence
const setToArray = (set: Set<string>): string[] => Array.from(set);
const arrayToSet = (arr: string[] | undefined): Set<string> => new Set(arr || []);

const initialState: TokenState = {
  customTokens: {},
  hiddenTokens: new Set(),
  favoriteTokens: new Set(),
};

/**
 * Token store using Zustand with persistence
 * Manages both default and custom ERC20 tokens
 */
export const useTokenStore = create<TokenState & TokenActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      addCustomToken: (token) => {
        const key = getTokenKey(token.address, token.chainId);
        set((state) => ({
          customTokens: {
            ...state.customTokens,
            [key]: {
              ...token,
              address: token.address.toLowerCase(),
              addedAt: Date.now(),
              isDefault: false,
            },
          },
        }));
      },

      removeCustomToken: (address, chainId) => {
        const key = getTokenKey(address, chainId);
        set((state) => {
          const newCustomTokens = { ...state.customTokens };
          delete newCustomTokens[key];
          return { customTokens: newCustomTokens };
        });
      },

      updateCustomToken: (address, chainId, updates) => {
        const key = getTokenKey(address, chainId);
        set((state) => {
          const existing = state.customTokens[key];
          if (!existing) return state;
          return {
            customTokens: {
              ...state.customTokens,
              [key]: { ...existing, ...updates },
            },
          };
        });
      },

      hasToken: (address, chainId) => {
        const key = getTokenKey(address, chainId);
        const { customTokens } = get();
        
        // Check custom tokens
        if (customTokens[key]) return true;
        
        // Check default tokens
        const defaultTokens = DEFAULT_TOKENS[chainId] || [];
        return defaultTokens.some(t => t.address.toLowerCase() === address.toLowerCase());
      },

      getToken: (address, chainId) => {
        const key = getTokenKey(address, chainId);
        const { customTokens } = get();
        
        // Check custom tokens first
        if (customTokens[key]) return customTokens[key];
        
        // Check default tokens
        const defaultTokens = DEFAULT_TOKENS[chainId] || [];
        return defaultTokens.find(t => t.address.toLowerCase() === address.toLowerCase());
      },

      getTokensForChain: (chainId) => {
        const { customTokens, hiddenTokens, favoriteTokens } = get();
        
        // Get default tokens
        const defaultTokens = getDefaultTokensForChain(chainId);
        
        // Get custom tokens for this chain
        const customForChain = Object.values(customTokens).filter(
          t => t.chainId === chainId
        );
        
        // Merge, excluding hidden tokens
        const allTokens = [...defaultTokens, ...customForChain].filter(t => {
          const key = getTokenKey(t.address, t.chainId);
          return !hiddenTokens.has(key);
        });
        
        // Sort: favorites first, then alphabetically by symbol
        return allTokens.sort((a, b) => {
          const aKey = getTokenKey(a.address, a.chainId);
          const bKey = getTokenKey(b.address, b.chainId);
          const aFav = favoriteTokens.has(aKey);
          const bFav = favoriteTokens.has(bKey);
          
          if (aFav && !bFav) return -1;
          if (!aFav && bFav) return 1;
          return a.symbol.localeCompare(b.symbol);
        });
      },

      getCustomTokensForChain: (chainId) => {
        const { customTokens } = get();
        return Object.values(customTokens).filter(t => t.chainId === chainId);
      },

      toggleHideToken: (address, chainId) => {
        const key = getTokenKey(address, chainId);
        set((state) => {
          const newHidden = new Set(state.hiddenTokens);
          if (newHidden.has(key)) {
            newHidden.delete(key);
          } else {
            newHidden.add(key);
          }
          return { hiddenTokens: newHidden };
        });
      },

      isTokenHidden: (address, chainId) => {
        const key = getTokenKey(address, chainId);
        return get().hiddenTokens.has(key);
      },

      toggleFavoriteToken: (address, chainId) => {
        const key = getTokenKey(address, chainId);
        set((state) => {
          const newFavorites = new Set(state.favoriteTokens);
          if (newFavorites.has(key)) {
            newFavorites.delete(key);
          } else {
            newFavorites.add(key);
          }
          return { favoriteTokens: newFavorites };
        });
      },

      isTokenFavorite: (address, chainId) => {
        const key = getTokenKey(address, chainId);
        return get().favoriteTokens.has(key);
      },

      getFavoriteTokensForChain: (chainId) => {
        const { favoriteTokens } = get();
        const allTokens = get().getTokensForChain(chainId);
        return allTokens.filter(t => {
          const key = getTokenKey(t.address, t.chainId);
          return favoriteTokens.has(key);
        });
      },

      importTokenFromAddress: (address, chainId, onChainData) => {
        const token: CustomToken = {
          address: address.toLowerCase(),
          chainId,
          name: onChainData.name,
          symbol: onChainData.symbol,
          decimals: onChainData.decimals,
          addedAt: Date.now(),
          isDefault: false,
          isVerified: false,
        };
        
        get().addCustomToken(token);
        return token;
      },

      resetCustomTokens: () => {
        set({
          customTokens: {},
          hiddenTokens: new Set(),
          favoriteTokens: new Set(),
        });
      },
    }),
    {
      name: 'zap-token-store',
      storage: createJSONStorage(() => AsyncStorage),
      // Custom serialization for Set types
      partialize: (state) => ({
        customTokens: state.customTokens,
        hiddenTokens: setToArray(state.hiddenTokens),
        favoriteTokens: setToArray(state.favoriteTokens),
      }),
      // Custom merge to restore Sets
      merge: (persistedState: any, currentState) => ({
        ...currentState,
        ...persistedState,
        hiddenTokens: arrayToSet(persistedState?.hiddenTokens),
        favoriteTokens: arrayToSet(persistedState?.favoriteTokens),
      }),
    }
  )
);

// Selectors
export const useCustomTokens = () => useTokenStore((s) => s.customTokens);
export const useTokensForChain = (chainId: ChainId) => {
  const getTokensForChain = useTokenStore((s) => s.getTokensForChain);
  return getTokensForChain(chainId);
};
