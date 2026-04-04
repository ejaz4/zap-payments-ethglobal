/**
 * Browser Store - State management for DApp Browser
 * Manages tabs, history, connected dapps, and browser sessions
 */

import { ChainId } from "@/app/profiles/client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * DApp Session - Active connection to a DApp
 */
export interface DAppSession {
  host: string;
  url: string;
  name?: string;
  icon?: string;
  address: string;
  chainId: ChainId;
  connectedAt: number;
}

/**
 * Browser Tab Data
 */
export interface BrowserTab {
  id: string;
  url: string;
  title?: string;
  icon?: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
}

/**
 * History Entry
 */
export interface HistoryEntry {
  url: string;
  title?: string;
  icon?: string;
  timestamp: number;
}

/**
 * Favorite DApp
 */
export interface FavoriteDapp {
  url: string;
  name: string;
  icon?: string;
  addedAt: number;
}

interface BrowserState {
  // Current URL being viewed
  currentUrl: string;
  setCurrentUrl: (url: string) => void;

  // Tab state
  activeTabId: string | null;
  tabs: Record<string, BrowserTab>;
  tabOrder: string[];

  // Tab actions
  createTab: (url?: string) => string;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateTab: (tabId: string, updates: Partial<BrowserTab>) => void;

  // Navigation state for current tab
  canGoBack: boolean;
  canGoForward: boolean;
  setNavState: (canGoBack: boolean, canGoForward: boolean) => void;

  // Connected DApps (sessions)
  sessions: Record<string, DAppSession>;
  addSession: (session: DAppSession) => void;
  removeSession: (host: string) => void;
  getSession: (host: string) => DAppSession | null;
  updateSessionChain: (host: string, chainId: ChainId) => void;

  // History
  history: HistoryEntry[];
  addToHistory: (entry: Omit<HistoryEntry, "timestamp">) => void;
  clearHistory: () => void;

  // Favorites
  favorites: FavoriteDapp[];
  addFavorite: (dapp: Omit<FavoriteDapp, "addedAt">) => void;
  removeFavorite: (url: string) => void;
  isFavorite: (url: string) => boolean;

  // Search/Address bar
  isAddressBarFocused: boolean;
  setAddressBarFocused: (focused: boolean) => void;

  // Reset
  reset: () => void;
}

const generateTabId = () =>
  `tab_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

const HOMEPAGE_URL = "about:home";

/**
 * Custom User Agent for Zap Wallet Browser
 * Based on a standard Chrome mobile user agent with Zap Wallet identifier
 */
export const ZAP_WALLET_USER_AGENT =
  "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 ZapWallet/1.0";

const initialState = {
  currentUrl: HOMEPAGE_URL,
  activeTabId: null,
  tabs: {},
  tabOrder: [],
  canGoBack: false,
  canGoForward: false,
  sessions: {},
  history: [],
  favorites: [],
  isAddressBarFocused: false,
};

export const useBrowserStore = create<BrowserState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setCurrentUrl: (url) => set({ currentUrl: url }),

      // Tab management
      createTab: (url = HOMEPAGE_URL) => {
        const tabId = generateTabId();
        const newTab: BrowserTab = {
          id: tabId,
          url,
          canGoBack: false,
          canGoForward: false,
          isLoading: false,
        };

        set((state) => ({
          tabs: { ...state.tabs, [tabId]: newTab },
          tabOrder: [...state.tabOrder, tabId],
          activeTabId: tabId,
          currentUrl: url,
        }));

        return tabId;
      },

      closeTab: (tabId) => {
        set((state) => {
          const newTabs = { ...state.tabs };
          delete newTabs[tabId];
          const newOrder = state.tabOrder.filter((id) => id !== tabId);

          // If closing active tab, switch to another
          let newActiveTabId = state.activeTabId;
          if (state.activeTabId === tabId) {
            const closedIndex = state.tabOrder.indexOf(tabId);
            newActiveTabId =
              newOrder[Math.min(closedIndex, newOrder.length - 1)] || null;
          }

          return {
            tabs: newTabs,
            tabOrder: newOrder,
            activeTabId: newActiveTabId,
            currentUrl: newActiveTabId
              ? newTabs[newActiveTabId]?.url || HOMEPAGE_URL
              : HOMEPAGE_URL,
          };
        });
      },

      setActiveTab: (tabId) => {
        const tab = get().tabs[tabId];
        if (tab) {
          set({
            activeTabId: tabId,
            currentUrl: tab.url,
            canGoBack: tab.canGoBack,
            canGoForward: tab.canGoForward,
          });
        }
      },

      updateTab: (tabId, updates) => {
        set((state) => ({
          tabs: {
            ...state.tabs,
            [tabId]: { ...state.tabs[tabId], ...updates },
          },
          // Update current URL if this is the active tab
          ...(state.activeTabId === tabId && updates.url
            ? { currentUrl: updates.url }
            : {}),
          ...(state.activeTabId === tabId && updates.canGoBack !== undefined
            ? { canGoBack: updates.canGoBack }
            : {}),
          ...(state.activeTabId === tabId && updates.canGoForward !== undefined
            ? { canGoForward: updates.canGoForward }
            : {}),
        }));
      },

      setNavState: (canGoBack, canGoForward) => {
        set({ canGoBack, canGoForward });
      },

      // Sessions
      addSession: (session) => {
        set((state) => ({
          sessions: { ...state.sessions, [session.host]: session },
        }));
      },

      removeSession: (host) => {
        set((state) => {
          const newSessions = { ...state.sessions };
          delete newSessions[host];
          return { sessions: newSessions };
        });
      },

      getSession: (host) => {
        return get().sessions[host] || null;
      },

      updateSessionChain: (host, chainId) => {
        set((state) => {
          const session = state.sessions[host];
          if (session) {
            return {
              sessions: {
                ...state.sessions,
                [host]: { ...session, chainId },
              },
            };
          }
          return state;
        });
      },

      // History
      addToHistory: (entry) => {
        set((state) => {
          // Don't add duplicates in a row
          const last = state.history[0];
          if (last?.url === entry.url) {
            return {
              history: [
                { ...entry, timestamp: Date.now() },
                ...state.history.slice(1),
              ],
            };
          }
          // Keep last 100 entries
          const newHistory = [
            { ...entry, timestamp: Date.now() },
            ...state.history,
          ].slice(0, 100);
          return { history: newHistory };
        });
      },

      clearHistory: () => set({ history: [] }),

      // Favorites
      addFavorite: (dapp) => {
        set((state) => ({
          favorites: [...state.favorites, { ...dapp, addedAt: Date.now() }],
        }));
      },

      removeFavorite: (url) => {
        set((state) => ({
          favorites: state.favorites.filter((f) => f.url !== url),
        }));
      },

      isFavorite: (url) => {
        return get().favorites.some((f) => f.url === url);
      },

      setAddressBarFocused: (focused) => set({ isAddressBarFocused: focused }),

      reset: () => set(initialState),
    }),
    {
      name: "zap-browser-storage",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        sessions: state.sessions,
        history: state.history,
        favorites: state.favorites,
      }),
    },
  ),
);

/**
 * Helper to get host from URL
 */
export function getDappHost(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.host.replace("www.", "");
  } catch {
    return "";
  }
}

/**
 * Helper to normalize URL
 */
export function normalizeUrl(input: string): string {
  let url = input.trim();

  // Check if it's a search query - use DuckDuckGo
  if (!url.includes(".") || url.includes(" ")) {
    return `https://duckduckgo.com/?q=${encodeURIComponent(url)}`;
  }

  // Add https if no protocol
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }

  return url;
}
