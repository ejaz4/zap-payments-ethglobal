import { ChainId } from "@/app/profiles/client";
import { PriceService } from "@/services/price";
import { useCallback, useEffect, useState } from "react";

/**
 * Hook to get token prices
 * Prices are cached for 5 minutes, only makes API calls when cache is stale
 */
export function usePrices(
  tokens: Array<{ symbol: string; address?: string; chainId: ChainId }>,
) {
  const [prices, setPrices] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);

  const fetchPrices = useCallback(
    async (forceRefresh = false) => {
      if (tokens.length === 0) {
        setLoading(false);
        return;
      }

      try {
        const priceMap = await PriceService.batchGetPrices(
          tokens,
          forceRefresh,
        );
        setPrices(priceMap);
      } catch (error) {
        console.warn("[usePrices]: Failed to fetch prices", error);
      } finally {
        setLoading(false);
      }
    },
    [tokens],
  );

  // Fetch on mount (uses cache if available)
  useEffect(() => {
    fetchPrices(false);
  }, [fetchPrices]);

  // Return refresh function that forces API call
  const refresh = useCallback(() => fetchPrices(true), [fetchPrices]);

  return { prices, loading, refresh };
}

/**
 * Hook to get native currency price for a chain
 * Prices are cached for 5 minutes
 */
export function useNativePrice(chainId: ChainId) {
  const [price, setPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchPrice = useCallback(
    async (forceRefresh = false) => {
      try {
        const p = await PriceService.getNativePrice(chainId, forceRefresh);
        setPrice(p);
        setLoading(false);
      } catch (error) {
        console.warn("[useNativePrice]: Failed to fetch price", error);
        setLoading(false);
      }
    },
    [chainId],
  );

  // Fetch on mount (uses cache)
  useEffect(() => {
    fetchPrice(false);
  }, [fetchPrice]);

  // Return refresh function that forces API call
  const refresh = useCallback(() => fetchPrice(true), [fetchPrice]);

  return { price, loading, refresh };
}

/**
 * Hook to get price for a specific token
 * Prices are cached for 5 minutes
 */
export function useTokenPrice(
  symbol: string,
  address?: string,
  chainId?: ChainId,
) {
  const [price, setPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchPrice = useCallback(
    async (forceRefresh = false) => {
      try {
        let p: number | null = null;

        // Try by symbol first (more reliable)
        p = await PriceService.getPriceBySymbol(symbol, forceRefresh);

        // Fall back to address if available
        if (p === null && address && chainId) {
          p = await PriceService.getPriceByAddress(
            address,
            chainId,
            forceRefresh,
          );
        }

        setPrice(p);
        setLoading(false);
      } catch (error) {
        console.warn("[useTokenPrice]: Failed to fetch price", error);
        setLoading(false);
      }
    },
    [symbol, address, chainId],
  );

  // Fetch on mount (uses cache)
  useEffect(() => {
    fetchPrice(false);
  }, [fetchPrice]);

  // Return refresh function that forces API call
  const refresh = useCallback(() => fetchPrice(true), [fetchPrice]);

  return { price, loading, refresh };
}
