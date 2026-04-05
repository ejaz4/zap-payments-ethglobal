/**
 * Hook to search tokens via the Uniswap GraphQL API.
 *
 * - On mount: fetches top tokens by volume for the selected chain
 * - On search: queries the Uniswap API for matching tokens
 * - Results are cached in memory per chain + query
 */

import { ChainId } from "@/app/profiles/client";
import { useCallback, useEffect, useRef, useState } from "react";

const UNISWAP_GQL_URL = "https://interface.gateway.uniswap.org/v1/graphql";

/** Map app ChainId to Uniswap GraphQL Chain enum.
 *  Testnets (Sepolia, etc.) are intentionally excluded — the Uniswap GQL API
 *  only has mainnet data, so querying "ETHEREUM" for Sepolia returns mainnet
 *  addresses that don't exist on the testnet. */
const CHAIN_NAME_MAP: Partial<Record<ChainId, string>> = {
  [ChainId.mainnet]: "ETHEREUM",
  [ChainId.polygon]: "POLYGON",
  [ChainId.arbitrum]: "ARBITRUM",
  [ChainId.optimism]: "OPTIMISM",
  [ChainId.base]: "BASE",
  [ChainId.bsc]: "BNB",
  [ChainId.avalanche]: "AVALANCHE",
  [ChainId.zora]: "ZORA",
};

export interface UniswapToken {
  address: string;
  chainId: ChainId;
  decimals: number;
  symbol: string;
  name: string;
  logoURI?: string;
}

// ─── GraphQL fragments ───

const TOKEN_FIELDS = `
  id
  name
  symbol
  decimals
  chain
  address
  project {
    logoUrl
  }
`;

const TOP_TOKENS_QUERY = `
  query TopTokens($chain: Chain!, $page: Int, $pageSize: Int) {
    topTokens(chain: $chain, page: $page, pageSize: $pageSize, orderBy: VOLUME) {
      ${TOKEN_FIELDS}
    }
  }
`;

const SEARCH_TOKENS_QUERY = `
  query SearchTokens($searchQuery: String!, $chains: [Chain!]) {
    searchTokens(searchQuery: $searchQuery, chains: $chains) {
      ${TOKEN_FIELDS}
    }
  }
`;

interface GqlToken {
  id: string;
  name: string;
  symbol: string;
  decimals: number;
  chain: string;
  address: string | null;
  project?: { logoUrl?: string };
}

// ─── In-memory cache ───
const topTokensCache = new Map<string, UniswapToken[]>();
const searchCache = new Map<string, UniswapToken[]>();

function mapGqlTokens(tokens: GqlToken[], chainId: ChainId): UniswapToken[] {
  return tokens
    .filter((t) => t.address) // skip native (address null)
    .map((t) => ({
      address: t.address!,
      chainId,
      decimals: t.decimals,
      symbol: t.symbol,
      name: t.name,
      logoURI: t.project?.logoUrl,
    }));
}

async function gqlFetch(query: string, variables: Record<string, unknown>): Promise<any> {
  const res = await fetch(UNISWAP_GQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://app.uniswap.org",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Uniswap API ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

async function fetchTopTokens(chainId: ChainId): Promise<UniswapToken[]> {
  const chainName = CHAIN_NAME_MAP[chainId];
  if (!chainName) return [];

  const cacheKey = `top_${chainName}`;
  if (topTokensCache.has(cacheKey)) return topTokensCache.get(cacheKey)!;

  try {
    const data = await gqlFetch(TOP_TOKENS_QUERY, {
      chain: chainName,
      page: 1,
      pageSize: 50,
    });
    const tokens = mapGqlTokens(data.topTokens || [], chainId);
    topTokensCache.set(cacheKey, tokens);
    return tokens;
  } catch (err) {
    console.warn("[useUniswapTokens] Top tokens fetch failed:", err);
    return [];
  }
}

async function searchTokens(query: string, chainId: ChainId): Promise<UniswapToken[]> {
  const chainName = CHAIN_NAME_MAP[chainId];
  if (!chainName) return [];

  const cacheKey = `search_${chainName}_${query.toLowerCase()}`;
  if (searchCache.has(cacheKey)) return searchCache.get(cacheKey)!;

  try {
    const data = await gqlFetch(SEARCH_TOKENS_QUERY, {
      searchQuery: query,
      chains: [chainName],
    });
    const tokens = mapGqlTokens(data.searchTokens || [], chainId);
    searchCache.set(cacheKey, tokens);
    return tokens;
  } catch (err) {
    console.warn("[useUniswapTokens] Search failed:", err);
    return [];
  }
}

/**
 * Provides Uniswap token discovery for a chain.
 *
 * - `tokens`: current result set (top tokens or search results)
 * - `loading`: whether a fetch is in progress
 * - `search(query)`: trigger a search (empty string resets to top tokens)
 */
export function useUniswapTokens(chainId: ChainId) {
  const [tokens, setTokens] = useState<UniswapToken[]>([]);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // Fetch top tokens on mount / chain change
  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    fetchTopTokens(chainId).then((result) => {
      if (mountedRef.current) {
        setTokens(result);
        setLoading(false);
      }
    });
    return () => {
      mountedRef.current = false;
    };
  }, [chainId]);

  const search = useCallback(
    (query: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);

      const trimmed = query.trim();
      if (!trimmed) {
        // Reset to top tokens
        setLoading(true);
        fetchTopTokens(chainId).then((result) => {
          if (mountedRef.current) {
            setTokens(result);
            setLoading(false);
          }
        });
        return;
      }

      debounceRef.current = setTimeout(() => {
        setLoading(true);
        searchTokens(trimmed, chainId).then((result) => {
          if (mountedRef.current) {
            setTokens(result);
            setLoading(false);
          }
        });
      }, 300);
    },
    [chainId],
  );

  return { tokens, loading, search };
}
