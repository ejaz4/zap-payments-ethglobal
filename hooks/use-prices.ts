import { ChainId } from "@/app/profiles/client";
import { PriceService } from "@/services/price";
import { useSelectedCurrency } from "@/store/currency";
import { useCallback, useEffect, useState } from "react";

/**
 * Hook to batch-fetch prices for a list of tokens in the user's selected currency.
 * Prices are cached for 5 minutes.
 */
export function usePrices(
  tokens: Array<{ symbol: string; address?: string; chainId: ChainId }>,
) {
  const currency = useSelectedCurrency();
  const [prices, setPrices] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);

  const fetchPrices = useCallback(
    async (forceRefresh = false) => {
      if (tokens.length === 0) { setLoading(false); return; }
      try {
        const priceMap = await PriceService.batchGetPrices(tokens, currency, forceRefresh);
        setPrices(priceMap);
      } catch (error) {
        console.warn("[usePrices] Failed to fetch prices", error);
      } finally {
        setLoading(false);
      }
    },
    // Re-fetch when the currency or token list changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currency, JSON.stringify(tokens)],
  );

  useEffect(() => { fetchPrices(false); }, [fetchPrices]);

  const refresh = useCallback(() => fetchPrices(true), [fetchPrices]);

  return { prices, loading, refresh };
}

/**
 * Hook to get the native currency price for a chain in the user's selected currency.
 */
export function useNativePrice(chainId: ChainId) {
  const currency = useSelectedCurrency();
  const [price, setPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchPrice = useCallback(
    async (forceRefresh = false) => {
      try {
        const p = await PriceService.getNativePrice(chainId, currency, forceRefresh);
        setPrice(p);
      } catch (error) {
        console.warn("[useNativePrice] Failed to fetch price", error);
      } finally {
        setLoading(false);
      }
    },
    [chainId, currency],
  );

  useEffect(() => { fetchPrice(false); }, [fetchPrice]);

  const refresh = useCallback(() => fetchPrice(true), [fetchPrice]);

  return { price, loading, refresh };
}

/**
 * Hook to get the price for a specific token in the user's selected currency.
 */
export function useTokenPrice(symbol: string, address?: string, chainId?: ChainId) {
  const currency = useSelectedCurrency();
  const [price, setPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchPrice = useCallback(
    async (forceRefresh = false) => {
      try {
        let p: number | null = await PriceService.getPriceBySymbol(symbol, currency, forceRefresh);
        if (p === null && address && chainId) {
          p = await PriceService.getPriceByAddress(address, chainId, currency, forceRefresh);
        }
        setPrice(p);
      } catch (error) {
        console.warn("[useTokenPrice] Failed to fetch price", error);
      } finally {
        setLoading(false);
      }
    },
    [symbol, address, chainId, currency],
  );

  useEffect(() => { fetchPrice(false); }, [fetchPrice]);

  const refresh = useCallback(() => fetchPrice(true), [fetchPrice]);

  return { price, loading, refresh };
}
