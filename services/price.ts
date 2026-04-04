import { ChainId } from "@/app/profiles/client";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * CoinGecko Platform IDs for different chains
 * Used to look up token prices by contract address
 */
const CHAIN_TO_COINGECKO_PLATFORM: Record<ChainId, string> = {
  [ChainId.mainnet]: "ethereum",
  [ChainId.polygon]: "polygon-pos",
  [ChainId.arbitrum]: "arbitrum-one",
  [ChainId.optimism]: "optimistic-ethereum",
  [ChainId.base]: "base",
  [ChainId.avalanche]: "avalanche",
  [ChainId.bsc]: "binance-smart-chain",
  [ChainId.zora]: "zora",
  [ChainId.goerli]: "ethereum", // testnets use mainnet prices
  [ChainId.sepolia]: "ethereum",
  [ChainId.plasmaTestnet]: "ethereum",
  [ChainId.chilizSpicy]: "chiliz", // Chiliz testnet
};

/**
 * CoinGecko IDs for native currencies
 */
const NATIVE_CURRENCY_IDS: Record<ChainId, string> = {
  [ChainId.mainnet]: "ethereum",
  [ChainId.polygon]: "matic-network",
  [ChainId.arbitrum]: "ethereum",
  [ChainId.optimism]: "ethereum",
  [ChainId.base]: "ethereum",
  [ChainId.avalanche]: "avalanche-2",
  [ChainId.bsc]: "binancecoin",
  [ChainId.zora]: "ethereum",
  [ChainId.goerli]: "ethereum",
  [ChainId.sepolia]: "ethereum",
  [ChainId.plasmaTestnet]: "ethereum", // placeholder
  [ChainId.chilizSpicy]: "chiliz", // Chiliz testnet
};

/**
 * Common token symbol to CoinGecko ID mapping
 * For tokens that might not be found by address
 */
const SYMBOL_TO_COINGECKO_ID: Record<string, string> = {
  ETH: "ethereum",
  WETH: "weth",
  USDC: "usd-coin",
  USDT: "tether",
  DAI: "dai",
  WBTC: "wrapped-bitcoin",
  MATIC: "matic-network",
  AVAX: "avalanche-2",
  BNB: "binancecoin",
  LINK: "chainlink",
  UNI: "uniswap",
  AAVE: "aave",
  CRV: "curve-dao-token",
  MKR: "maker",
  SNX: "havven",
  COMP: "compound-governance-token",
  GRT: "the-graph",
  LDO: "lido-dao",
  ARB: "arbitrum",
  OP: "optimism",
};

/**
 * Price cache entry
 */
interface PriceCacheEntry {
  price: number;
  timestamp: number;
}

/**
 * Chart cache entry
 */
interface ChartCacheEntry {
  timestamps: number[];
  prices: number[];
  timestamp: number;
}

/**
 * Price cache - stores prices with timestamps
 */
type PriceCache = Record<string, PriceCacheEntry>;

/**
 * Chart cache - stores chart data with timestamps
 */
type ChartCache = Record<string, ChartCacheEntry>;

const CACHE_KEY = "zap_price_cache";
const CHART_CACHE_KEY = "zap_chart_cache";
const PRICE_CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes for prices
const CHART_CACHE_DURATION_MS = 10 * 60 * 1000; // 10 minutes for charts

/**
 * CoinGecko API configuration
 * Get your free API key at: https://www.coingecko.com/en/api/pricing
 * Free tier: 10,000 calls/month, Pro: 500,000 calls/month
 *
 * Set your API key in .env file:
 * EXPO_PUBLIC_COINGECKO_API_KEY=your-api-key-here
 *
 * Note: Demo keys (CG-xxx) use api.coingecko.com with x-cg-demo-api-key header
 *       Pro keys use pro-api.coingecko.com with x-cg-pro-api-key header
 */
const COINGECKO_CONFIG = {
  // Reads from EXPO_PUBLIC_COINGECKO_API_KEY env variable
  API_KEY: process.env.EXPO_PUBLIC_COINGECKO_API_KEY || "",

  // Demo keys start with "CG-"
  get IS_DEMO_KEY() {
    return this.API_KEY.startsWith("CG-");
  },

  get BASE_URL() {
    // Demo keys use the free API URL, Pro keys use the pro URL
    if (this.API_KEY && !this.IS_DEMO_KEY) {
      return "https://pro-api.coingecko.com/api/v3";
    }
    return "https://api.coingecko.com/api/v3";
  },

  get HEADERS() {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (this.API_KEY) {
      // Use different header based on key type
      if (this.IS_DEMO_KEY) {
        headers["x-cg-demo-api-key"] = this.API_KEY;
      } else {
        headers["x-cg-pro-api-key"] = this.API_KEY;
      }
    }
    return headers;
  },
};

/**
 * PriceService - Fetch token prices using CoinGecko's free API
 * Caches prices for 5 minutes, charts for 10 minutes
 * Only fetches fresh data on first load or manual refresh
 */
export class PriceService {
  private static priceCache: PriceCache = {};
  private static chartCache: ChartCache = {};
  private static priceCacheLoaded = false;
  private static chartCacheLoaded = false;

  /**
   * Set your CoinGecko API key at runtime
   */
  static setApiKey(apiKey: string): void {
    COINGECKO_CONFIG.API_KEY = apiKey;
  }

  /**
   * Load price cache from AsyncStorage
   */
  private static async loadPriceCache(): Promise<void> {
    if (this.priceCacheLoaded) return;

    try {
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (cached) {
        this.priceCache = JSON.parse(cached);
      }
      this.priceCacheLoaded = true;
    } catch (error) {
      console.warn("[PriceService]: Failed to load price cache", error);
      this.priceCache = {};
      this.priceCacheLoaded = true;
    }
  }

  /**
   * Load chart cache from AsyncStorage
   */
  private static async loadChartCache(): Promise<void> {
    if (this.chartCacheLoaded) return;

    try {
      const cached = await AsyncStorage.getItem(CHART_CACHE_KEY);
      if (cached) {
        this.chartCache = JSON.parse(cached);
      }
      this.chartCacheLoaded = true;
    } catch (error) {
      console.warn("[PriceService]: Failed to load chart cache", error);
      this.chartCache = {};
      this.chartCacheLoaded = true;
    }
  }

  /**
   * Save price cache to AsyncStorage
   */
  private static async savePriceCache(): Promise<void> {
    try {
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(this.priceCache));
    } catch (error) {
      console.warn("[PriceService]: Failed to save price cache", error);
    }
  }

  /**
   * Save chart cache to AsyncStorage
   */
  private static async saveChartCache(): Promise<void> {
    try {
      await AsyncStorage.setItem(
        CHART_CACHE_KEY,
        JSON.stringify(this.chartCache),
      );
    } catch (error) {
      console.warn("[PriceService]: Failed to save chart cache", error);
    }
  }

  /**
   * Get cache key for a token
   */
  private static getCacheKey(
    symbolOrAddress: string,
    chainId?: ChainId,
  ): string {
    const normalized = symbolOrAddress.toLowerCase();
    return chainId ? `${normalized}_${chainId}` : normalized;
  }

  /**
   * Get cached price if still valid
   * @param forceRefresh - If true, ignores cache and returns null
   */
  private static getCachedPrice(
    key: string,
    forceRefresh = false,
  ): number | null {
    if (forceRefresh) return null;

    const entry = this.priceCache[key];
    if (!entry) return null;

    const age = Date.now() - entry.timestamp;
    if (age < PRICE_CACHE_DURATION_MS) {
      return entry.price;
    }
    return null;
  }

  /**
   * Get cached chart data if still valid
   * @param forceRefresh - If true, ignores cache and returns null
   */
  private static getCachedChart(
    key: string,
    forceRefresh = false,
  ): { timestamps: number[]; prices: number[] } | null {
    if (forceRefresh) return null;

    const entry = this.chartCache[key];
    if (!entry) return null;

    const age = Date.now() - entry.timestamp;
    if (age < CHART_CACHE_DURATION_MS) {
      return { timestamps: entry.timestamps, prices: entry.prices };
    }
    return null;
  }

  /**
   * Set cached price
   */
  private static setCachedPrice(key: string, price: number): void {
    this.priceCache[key] = {
      price,
      timestamp: Date.now(),
    };
  }

  /**
   * Set cached chart data
   */
  private static setCachedChart(
    key: string,
    data: { timestamps: number[]; prices: number[] },
  ): void {
    this.chartCache[key] = {
      timestamps: data.timestamps,
      prices: data.prices,
      timestamp: Date.now(),
    };
  }

  /**
   * Get price for native currency
   * @param forceRefresh - Force API call, ignoring cache
   */
  static async getNativePrice(
    chainId: ChainId,
    forceRefresh = false,
  ): Promise<number | null> {
    await this.loadPriceCache();

    const coinId = NATIVE_CURRENCY_IDS[chainId];
    if (!coinId) return null;

    // Check cache first
    const cacheKey = `native_${chainId}`;
    const cached = this.getCachedPrice(cacheKey, forceRefresh);
    if (cached !== null) return cached;

    // Fetch from API
    try {
      const price = await this.fetchPriceById(coinId);
      if (price !== null) {
        this.setCachedPrice(cacheKey, price);
        this.savePriceCache();
      }
      return price;
    } catch (error) {
      console.warn("[PriceService]: Failed to fetch native price", error);
      return null;
    }
  }

  /**
   * Get price for a token by symbol
   * @param forceRefresh - Force API call, ignoring cache
   */
  static async getPriceBySymbol(
    symbol: string,
    forceRefresh = false,
  ): Promise<number | null> {
    await this.loadPriceCache();

    const upperSymbol = symbol.toUpperCase();
    const coinId = SYMBOL_TO_COINGECKO_ID[upperSymbol];
    if (!coinId) return null;

    // Check cache
    const cacheKey = `symbol_${upperSymbol}`;
    const cached = this.getCachedPrice(cacheKey, forceRefresh);
    if (cached !== null) return cached;

    // Fetch from API
    try {
      const price = await this.fetchPriceById(coinId);
      if (price !== null) {
        this.setCachedPrice(cacheKey, price);
        this.savePriceCache();
      }
      return price;
    } catch (error) {
      console.warn("[PriceService]: Failed to fetch price by symbol", error);
      return null;
    }
  }

  /**
   * Get price for a token by contract address
   * @param forceRefresh - Force API call, ignoring cache
   */
  static async getPriceByAddress(
    address: string,
    chainId: ChainId,
    forceRefresh = false,
  ): Promise<number | null> {
    await this.loadPriceCache();

    const platform = CHAIN_TO_COINGECKO_PLATFORM[chainId];
    if (!platform) return null;

    // Check cache
    const cacheKey = this.getCacheKey(address, chainId);
    const cached = this.getCachedPrice(cacheKey, forceRefresh);
    if (cached !== null) return cached;

    // Fetch from API
    try {
      const price = await this.fetchPriceByAddress(address, platform);
      if (price !== null) {
        this.setCachedPrice(cacheKey, price);
        this.savePriceCache();
      }
      return price;
    } catch (error) {
      console.warn("[PriceService]: Failed to fetch price by address", error);
      return null;
    }
  }

  /**
   * Batch fetch prices for multiple tokens
   * Returns a Map of symbol/address -> price
   * @param forceRefresh - Force API call, ignoring cache
   */
  static async batchGetPrices(
    tokens: Array<{ symbol: string; address?: string; chainId: ChainId }>,
    forceRefresh = false,
  ): Promise<Map<string, number>> {
    await this.loadPriceCache();

    const results = new Map<string, number>();
    const symbolsToFetch: string[] = [];

    // Check cache first (unless forcing refresh)
    for (const token of tokens) {
      const upperSymbol = token.symbol.toUpperCase();

      if (!forceRefresh) {
        // Try symbol cache
        const symbolCacheKey = `symbol_${upperSymbol}`;
        const symbolCached = this.getCachedPrice(symbolCacheKey);
        if (symbolCached !== null) {
          results.set(upperSymbol, symbolCached);
          continue;
        }

        // Try address cache if available
        if (token.address) {
          const addrCacheKey = this.getCacheKey(token.address, token.chainId);
          const addrCached = this.getCachedPrice(addrCacheKey);
          if (addrCached !== null) {
            results.set(upperSymbol, addrCached);
            continue;
          }
        }
      }

      // Need to fetch
      if (SYMBOL_TO_COINGECKO_ID[upperSymbol]) {
        symbolsToFetch.push(upperSymbol);
      }
    }

    // Batch fetch by symbol (more reliable)
    if (symbolsToFetch.length > 0) {
      const coinIds = symbolsToFetch
        .map((s) => SYMBOL_TO_COINGECKO_ID[s])
        .filter(Boolean);

      if (coinIds.length > 0) {
        const prices = await this.fetchPricesByIds(coinIds);

        for (const symbol of symbolsToFetch) {
          const coinId = SYMBOL_TO_COINGECKO_ID[symbol];
          if (coinId && prices[coinId]) {
            results.set(symbol, prices[coinId]);
            this.setCachedPrice(`symbol_${symbol}`, prices[coinId]);
          }
        }

        this.savePriceCache();
      }
    }

    return results;
  }

  /**
   * Fetch price from CoinGecko by coin ID
   */
  private static async fetchPriceById(coinId: string): Promise<number | null> {
    try {
      const response = await fetch(
        `${COINGECKO_CONFIG.BASE_URL}/simple/price?ids=${coinId}&vs_currencies=usd`,
        { headers: COINGECKO_CONFIG.HEADERS },
      );

      if (!response.ok) {
        console.warn(`[PriceService]: API returned ${response.status}`);
        return null;
      }

      const data = await response.json();
      return data[coinId]?.usd ?? null;
    } catch (error) {
      console.warn("[PriceService]: Fetch error", error);
      return null;
    }
  }

  /**
   * Fetch multiple prices by coin IDs
   */
  private static async fetchPricesByIds(
    coinIds: string[],
  ): Promise<Record<string, number>> {
    try {
      const response = await fetch(
        `${COINGECKO_CONFIG.BASE_URL}/simple/price?ids=${coinIds.join(",")}&vs_currencies=usd`,
        { headers: COINGECKO_CONFIG.HEADERS },
      );

      if (!response.ok) {
        console.warn(`[PriceService]: API returned ${response.status}`);
        return {};
      }

      const data = await response.json();
      const results: Record<string, number> = {};

      for (const coinId of coinIds) {
        if (data[coinId]?.usd) {
          results[coinId] = data[coinId].usd;
        }
      }

      return results;
    } catch (error) {
      console.warn("[PriceService]: Fetch error", error);
      return {};
    }
  }

  /**
   * Fetch price by contract address
   */
  private static async fetchPriceByAddress(
    address: string,
    platform: string,
  ): Promise<number | null> {
    try {
      const response = await fetch(
        `${COINGECKO_CONFIG.BASE_URL}/simple/token_price/${platform}?contract_addresses=${address}&vs_currencies=usd`,
        { headers: COINGECKO_CONFIG.HEADERS },
      );

      if (!response.ok) {
        console.warn(`[PriceService]: API returned ${response.status}`);
        return null;
      }

      const data = await response.json();
      return data[address.toLowerCase()]?.usd ?? null;
    } catch (error) {
      console.warn("[PriceService]: Fetch error", error);
      return null;
    }
  }

  /**
   * Format price for display
   */
  static formatPrice(price: number | null | undefined): string {
    if (price === null || price === undefined) return "";

    if (price < 0.01) {
      return `$${price.toFixed(6)}`;
    } else if (price < 1) {
      return `$${price.toFixed(4)}`;
    } else if (price < 1000) {
      return `$${price.toFixed(2)}`;
    } else {
      return `$${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    }
  }

  /**
   * Format USD value for display
   */
  static formatValue(value: number | null | undefined): string {
    if (value === null || value === undefined) return "";

    if (value < 0.01) {
      return "< $0.01";
    } else if (value < 1000) {
      return `$${value.toFixed(2)}`;
    } else if (value < 1000000) {
      return `$${(value / 1000).toFixed(2)}K`;
    } else {
      return `$${(value / 1000000).toFixed(2)}M`;
    }
  }

  /**
   * Time range options for charts (like Rainbow)
   */
  static readonly TIME_RANGES = {
    "1H": { days: 1, interval: "" }, // CoinGecko returns hourly for 1 day
    "1D": { days: 1, interval: "" },
    "1W": { days: 7, interval: "" },
    "1M": { days: 30, interval: "" },
    "1Y": { days: 365, interval: "" },
    ALL: { days: "max" as const, interval: "" },
  } as const;

  /**
   * Fetch price chart data for a coin
   * Returns timestamps and prices arrays
   * @param forceRefresh - Force API call, ignoring cache
   */
  static async getChartData(
    coinId: string,
    days: number | "max" = 7,
    forceRefresh = false,
  ): Promise<{ timestamps: number[]; prices: number[] } | null> {
    await this.loadChartCache();

    // Check cache first
    const cacheKey = `chart_${coinId}_${days}`;
    const cached = this.getCachedChart(cacheKey, forceRefresh);
    if (cached !== null) {
      console.log(
        `[PriceService]: Using cached chart for ${coinId} (${days} days)`,
      );
      return cached;
    }

    try {
      const url = `${COINGECKO_CONFIG.BASE_URL}/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`;
      console.log(`[PriceService]: Fetching chart from API for ${coinId}`);

      const response = await fetch(url, { headers: COINGECKO_CONFIG.HEADERS });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        console.warn(
          `[PriceService]: Chart API returned ${response.status}: ${errorText}`,
        );
        return null;
      }

      const data = await response.json();

      if (!data.prices || !Array.isArray(data.prices)) {
        return null;
      }

      // CoinGecko returns [[timestamp, price], ...]
      const timestamps: number[] = [];
      const prices: number[] = [];

      for (const [timestamp, price] of data.prices) {
        timestamps.push(timestamp);
        prices.push(price);
      }

      const chartData = { timestamps, prices };

      // Cache the result
      this.setCachedChart(cacheKey, chartData);
      this.saveChartCache();

      return chartData;
    } catch (error) {
      console.warn("[PriceService]: Chart fetch error", error);
      return null;
    }
  }

  /**
   * Get chart data for native currency
   * @param forceRefresh - Force API call, ignoring cache
   */
  static async getNativeChartData(
    chainId: ChainId,
    days: number | "max" = 7,
    forceRefresh = false,
  ): Promise<{ timestamps: number[]; prices: number[] } | null> {
    const coinId = NATIVE_CURRENCY_IDS[chainId];
    if (!coinId) return null;
    return this.getChartData(coinId, days, forceRefresh);
  }

  /**
   * Get chart data by token symbol
   * @param forceRefresh - Force API call, ignoring cache
   */
  static async getChartDataBySymbol(
    symbol: string,
    days: number | "max" = 7,
    forceRefresh = false,
  ): Promise<{ timestamps: number[]; prices: number[] } | null> {
    const coinId = SYMBOL_TO_COINGECKO_ID[symbol.toUpperCase()];
    if (!coinId) return null;
    return this.getChartData(coinId, days, forceRefresh);
  }

  /**
   * Calculate price change percentage from chart data
   */
  static calculatePriceChange(prices: number[]): {
    change: number;
    changePercent: number;
    isPositive: boolean;
  } | null {
    if (!prices || prices.length < 2) return null;

    const firstPrice = prices[0];
    const lastPrice = prices[prices.length - 1];
    const change = lastPrice - firstPrice;
    const changePercent = (change / firstPrice) * 100;

    return {
      change,
      changePercent,
      isPositive: change >= 0,
    };
  }

  /**
   * Format percentage change for display
   */
  static formatPercentChange(percent: number): string {
    const sign = percent >= 0 ? "+" : "";
    return `${sign}${percent.toFixed(2)}%`;
  }
}
