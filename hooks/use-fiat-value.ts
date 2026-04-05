import { ChainId } from "@/app/profiles/client";
import { useNativePrice } from "@/hooks/use-prices";
import { PriceService } from "@/services/price";
import { useSelectedCurrency } from "@/store/currency";
import { useMemo } from "react";

/**
 * Convert a crypto amount to a formatted fiat string using the user's
 * selected display currency. Returns null when no price is available.
 *
 * @example
 * const fiat = useFiatValue("1.5", ChainId.mainnet); // "£1,234.56"
 */
export function useFiatValue(amount: string, chainId: ChainId): string | null {
  const currency = useSelectedCurrency();
  const { price } = useNativePrice(chainId);

  return useMemo(() => {
    if (!price || !amount) return null;
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) return null;
    return PriceService.formatValue(num * price, currency);
  }, [price, amount, currency]);
}
