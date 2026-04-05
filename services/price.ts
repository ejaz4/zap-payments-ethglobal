import { ChainId } from "@/app/profiles/client";
import { getCurrencyInfo } from "@/store/currency";
import { useProviderStore } from "@/store/provider";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Native currency symbol per EVM chain — used to build `/v1/prices` requests.
 */
const NATIVE_SYMBOL_BY_CHAIN: Partial<Record<ChainId, string>> = {
  [ChainId.mainnet]: "ETH",
  [ChainId.polygon]: "MATIC",
  [ChainId.arbitrum]: "ETH",
  [ChainId.optimism]: "ETH",
  [ChainId.base]: "ETH",
  [ChainId.avalanche]: "AVAX",
  [ChainId.bsc]: "BNB",
  [ChainId.zora]: "ETH",
  [ChainId.goerli]: "ETH",
  [ChainId.sepolia]: "ETH",
  [ChainId.plasmaTestnet]: "ETH",
  [ChainId.chilizSpicy]: "CHZ",
  // Solana placeholder chain keys (999001 = mainnet, 999002 = devnet)
  [999001 as ChainId]: "SOL",
  [999002 as ChainId]: "SOL",
};

interface PriceCacheEntry {
  price: number;
  timestamp: number;
}

type PriceCache = Record<string, PriceCacheEntry>;

const CACHE_KEY = "zap_price_cache";
const PRICE_CACHE_DURATION_MS = 5 * 60 * 1000;

export class PriceService {
  private static priceCache: PriceCache = {};
  private static priceCacheLoaded = false;
  private static inFlightBatch = new Map<string, Promise<Record<string, number>>>();

  private static getApiBaseUrl(): string {
    return useProviderStore.getState().getApiBaseUrl();
  }

  // ---------------------------------------------------------------------------
  // Cache helpers
  // ---------------------------------------------------------------------------

  private static async loadPriceCache(): Promise<void> {
    if (this.priceCacheLoaded) return;
    try {
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (cached) this.priceCache = JSON.parse(cached);
    } catch {
      this.priceCache = {};
    }
    this.priceCacheLoaded = true;
  }

  private static async savePriceCache(): Promise<void> {
    try { await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(this.priceCache)); } catch {}
  }

  private static getCachedPrice(key: string, forceRefresh = false): number | null {
    if (forceRefresh) return null;
    const entry = this.priceCache[key];
    if (!entry) return null;
    return Date.now() - entry.timestamp < PRICE_CACHE_DURATION_MS ? entry.price : null;
  }

  private static setCachedPrice(key: string, price: number): void {
    this.priceCache[key] = { price, timestamp: Date.now() };
  }

  // ---------------------------------------------------------------------------
  // API fetch
  // ---------------------------------------------------------------------------

  /**
   * Fetch prices for multiple symbols in one request via GET /v1/prices.
   * Returns a record of uppercase symbol → price in the requested currency.
   */
  private static async fetchPricesBySymbols(
    symbols: string[],
    currency: string,
  ): Promise<Record<string, number>> {
    if (symbols.length === 0) return {};

    const dedupKey = `${[...symbols].sort().join(",")}_${currency}`;
    if (this.inFlightBatch.has(dedupKey)) return this.inFlightBatch.get(dedupKey)!;

    const promise = (async (): Promise<Record<string, number>> => {
      try {
        const baseUrl = this.getApiBaseUrl();
        if (!baseUrl) return {};

        const url = `${baseUrl}/v1/prices?symbols=${symbols.join(",")}&currency=${currency}`;
        const res = await fetch(url, { headers: { "Content-Type": "application/json" } });
        const text = await res.text();
        const json = JSON.parse(text);
        if (!json.ok || !json.data?.prices) return {};
        // Each entry is { currency, price, source } — extract the price field
        const raw = json.data.prices as Record<string, { price: number } | number>;
        const result: Record<string, number> = {};
        for (const [sym, val] of Object.entries(raw)) {
          result[sym] = typeof val === "number" ? val : val.price;
        }
        return result;
      } catch {
        return {};
      } finally {
        this.inFlightBatch.delete(dedupKey);
      }
    })();

    this.inFlightBatch.set(dedupKey, promise);
    return promise;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  static async getNativePrice(
    chainId: ChainId,
    currency = "usd",
    forceRefresh = false,
  ): Promise<number | null> {
    await this.loadPriceCache();
    const symbol = NATIVE_SYMBOL_BY_CHAIN[chainId];
    if (!symbol) return null;

    const cacheKey = `native_${chainId}_${currency}`;
    const cached = this.getCachedPrice(cacheKey, forceRefresh);
    if (cached !== null) return cached;

    const prices = await this.fetchPricesBySymbols([symbol], currency);
    const price = prices[symbol] ?? null;
    if (price !== null) { this.setCachedPrice(cacheKey, price); this.savePriceCache(); }
    return price;
  }

  static async getPriceBySymbol(
    symbol: string,
    currency = "usd",
    forceRefresh = false,
  ): Promise<number | null> {
    await this.loadPriceCache();
    const upper = symbol.toUpperCase();
    const cacheKey = `symbol_${upper}_${currency}`;
    const cached = this.getCachedPrice(cacheKey, forceRefresh);
    if (cached !== null) return cached;

    const prices = await this.fetchPricesBySymbols([upper], currency);
    const price = prices[upper] ?? null;
    if (price !== null) { this.setCachedPrice(cacheKey, price); this.savePriceCache(); }
    return price;
  }

  /** Contract address lookups are not supported by the API. Returns null. */
  static async getPriceByAddress(
    _address: string,
    _chainId: ChainId,
    _currency = "usd",
    _forceRefresh = false,
  ): Promise<number | null> {
    return null;
  }

  static async batchGetPrices(
    tokens: Array<{ symbol: string; address?: string; chainId: ChainId }>,
    currency = "usd",
    forceRefresh = false,
  ): Promise<Map<string, number>> {
    await this.loadPriceCache();
    const results = new Map<string, number>();
    const symbolsToFetch: string[] = [];

    for (const token of tokens) {
      const upper = token.symbol.toUpperCase();
      if (!forceRefresh) {
        const cached = this.getCachedPrice(`symbol_${upper}_${currency}`);
        if (cached !== null) { results.set(upper, cached); continue; }
      }
      if (!symbolsToFetch.includes(upper)) symbolsToFetch.push(upper);
    }

    if (symbolsToFetch.length > 0) {
      const prices = await this.fetchPricesBySymbols(symbolsToFetch, currency);
      for (const symbol of symbolsToFetch) {
        if (prices[symbol] != null) {
          results.set(symbol, prices[symbol]);
          this.setCachedPrice(`symbol_${symbol}_${currency}`, prices[symbol]);
        }
      }
      this.savePriceCache();
    }

    return results;
  }

  /** Chart data is not available via the API. Returns null. */
  static async getChartData(
    _coinId: string,
    _days: number | "max" = 7,
    _forceRefresh = false,
  ): Promise<{ timestamps: number[]; prices: number[] } | null> {
    return null;
  }

  static async getNativeChartData(
    _chainId: ChainId,
    _days: number | "max" = 7,
    _currency = "usd",
    _forceRefresh = false,
  ): Promise<{ timestamps: number[]; prices: number[] } | null> {
    return null;
  }

  static async getChartDataBySymbol(
    _symbol: string,
    _days: number | "max" = 7,
    _currency = "usd",
    _forceRefresh = false,
  ): Promise<{ timestamps: number[]; prices: number[] } | null> {
    return null;
  }

  // ---------------------------------------------------------------------------
  // Formatting
  // ---------------------------------------------------------------------------

  static formatPrice(price: number | null | undefined, currency = "usd"): string {
    if (price == null) return "";
    const { symbol, decimals } = getCurrencyInfo(currency);
    if (decimals === 0) {
      return `${symbol}${Math.round(price).toLocaleString()}`;
    }
    if (price < 0.01) return `${symbol}${price.toFixed(6)}`;
    if (price < 1)    return `${symbol}${price.toFixed(4)}`;
    if (price < 1000) return `${symbol}${price.toFixed(2)}`;
    return `${symbol}${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  }

  static formatValue(value: number | null | undefined, currency = "usd"): string {
    if (value == null) return "";
    const { symbol, decimals } = getCurrencyInfo(currency);
    if (decimals === 0) {
      if (value < 1000) return `${symbol}${Math.round(value).toLocaleString()}`;
      if (value < 1_000_000) return `${symbol}${Math.round(value / 1000).toLocaleString()}K`;
      return `${symbol}${(value / 1_000_000).toFixed(2)}M`;
    }
    if (value < 0.01) return `< ${symbol}0.01`;
    if (value < 1000) return `${symbol}${value.toFixed(2)}`;
    if (value < 1_000_000) return `${symbol}${(value / 1000).toFixed(2)}K`;
    return `${symbol}${(value / 1_000_000).toFixed(2)}M`;
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  static calculatePriceChange(prices: number[]): {
    change: number;
    changePercent: number;
    isPositive: boolean;
  } | null {
    if (!prices || prices.length < 2) return null;
    const first = prices[0];
    const last = prices[prices.length - 1];
    const change = last - first;
    const changePercent = (change / first) * 100;
    return { change, changePercent, isPositive: change >= 0 };
  }

  static formatPercentChange(percent: number): string {
    return `${percent >= 0 ? "+" : ""}${percent.toFixed(2)}%`;
  }
}
