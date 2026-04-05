import { ChainId } from "@/app/profiles/client";
import {
  isNativeToken,
  NATIVE_API_ADDRESS,
  type RouteMode,
} from "@/config/uniswap";
import { uniswapApiCall } from "@/services/uniswap";
import { useUniswapStore } from "@/store/uniswap";
import { parseUnits } from "ethers";
import { useEffect, useState } from "react";

export type QuoteType = "EXACT_INPUT" | "EXACT_OUTPUT";

export interface UniswapQuoteResult {
  amountOut: bigint;
  formattedOut: string;
  amountIn: bigint;
  formattedIn: string;
  gasEstimate: bigint;
  gasFeeUSD: string | null;
  priceImpact: string | null;
  routing: string;
  /** Raw quote object from API — passed to swap/order endpoint */
  quote: any;
  /** Permit2 data for signature, if applicable */
  permitData: any | null;
  routeMode: RouteMode;
  chainId: ChainId;
  quoteType: QuoteType;
}

function getApiTokenAddress(address: string): string {
  if (isNativeToken(address)) return NATIVE_API_ADDRESS;
  return address;
}

function getRoutingPreference(
  mode: RouteMode,
): Record<string, unknown> {
  switch (mode) {
    case "payment":
      return { protocols: ["V3", "V2"] };
    case "auto":
    default:
      return { protocols: ["V3", "V2", "UNISWAPX_V3"] };
  }
}

/**
 * Fetch a Uniswap Trading API quote with 500ms debounce.
 *
 * Mirrors the smart-swap-hub `useUniswapApiQuote` hook but adapted for
 * React Native + ethers.js v6.
 */
export function useUniswapQuote(
  tokenInAddress: string,
  tokenInDecimals: number,
  tokenOutAddress: string,
  tokenOutDecimals: number,
  amount: string,
  chainId: ChainId,
  swapper: string | undefined,
  routeMode: RouteMode = "auto",
  quoteType: QuoteType = "EXACT_INPUT",
  recipient?: string,
) {
  const [quote, setQuote] = useState<UniswapQuoteResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiKey = useUniswapStore((s) => s.apiKey);
  const slippage = useUniswapStore((s) => s.slippage);

  useEffect(() => {
    const fetchQuote = async () => {
      if (!amount || parseFloat(amount) <= 0) {
        setQuote(null);
        setError(null);
        return;
      }

      if (!apiKey) {
        setQuote(null);
        setError("Uniswap API key required — add it in Settings");
        setIsLoading(false);
        return;
      }

      if (!swapper) {
        setQuote(null);
        setError("No wallet connected");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const amountDecimals =
          quoteType === "EXACT_INPUT" ? tokenInDecimals : tokenOutDecimals;
        const parsedAmount = parseUnits(amount, amountDecimals).toString();

        const basePayload: Record<string, unknown> = {
          tokenIn: getApiTokenAddress(tokenInAddress),
          tokenOut: getApiTokenAddress(tokenOutAddress),
          tokenInChainId: chainId,
          tokenOutChainId: chainId,
          type: quoteType,
          amount: parsedAmount,
          swapper,
          slippageTolerance: slippage,
          ...(recipient ? { recipient } : {}),
        };

        const preferredPayload = {
          ...basePayload,
          ...getRoutingPreference(routeMode),
        };

        let data: any;

        try {
          ({ data } = await uniswapApiCall(
            "quote",
            apiKey,
            preferredPayload,
          ));
        } catch (err) {
          // Fall back to base payload if preferred routing fails
          const msg = err instanceof Error ? err.message : "";
          const normalized = msg.toLowerCase();
          if (
            routeMode !== "payment" &&
            (normalized.includes("invalid value") ||
              normalized.includes("requestvalidationerror"))
          ) {
            ({ data } = await uniswapApiCall("quote", apiKey, basePayload));
          } else {
            throw err;
          }
        }

        const rawAmountOut = BigInt(
          data.quote?.output?.amount || data.quote?.amountOut || "0",
        );
        const formattedOut = (
          Number(rawAmountOut) /
          10 ** tokenOutDecimals
        ).toFixed(tokenOutDecimals > 6 ? 6 : tokenOutDecimals);

        const rawAmountIn = BigInt(
          data.quote?.input?.amount || data.quote?.amountIn || "0",
        );
        const formattedIn = (
          Number(rawAmountIn) /
          10 ** tokenInDecimals
        ).toFixed(6);

        const gasEstimate = BigInt(
          data.quote?.gasUseEstimate || data.quote?.gasEstimate || "0",
        );

        setQuote({
          amountOut: rawAmountOut,
          formattedOut,
          amountIn: rawAmountIn,
          formattedIn,
          gasEstimate,
          gasFeeUSD: data.quote?.gasFeeUSD ?? null,
          priceImpact: data.quote?.priceImpact ?? null,
          routing: data.routing || "CLASSIC",
          quote: data.quote,
          permitData: data.permitData || null,
          routeMode,
          chainId,
          quoteType,
        });
        setError(null);
      } catch (err) {
        setQuote(null);
        const msg = err instanceof Error ? err.message : "Quote failed";
        setError(msg.length > 200 ? msg.slice(0, 200) + "..." : msg);
      }

      setIsLoading(false);
    };

    const timeout = setTimeout(fetchQuote, 500);
    return () => clearTimeout(timeout);
  }, [
    apiKey,
    swapper,
    tokenInAddress,
    tokenOutAddress,
    amount,
    tokenInDecimals,
    tokenOutDecimals,
    routeMode,
    chainId,
    recipient,
    quoteType,
    slippage,
  ]);

  return { quote, isLoading, error };
}
