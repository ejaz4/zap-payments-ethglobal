import { ChainId } from "@/app/profiles/client";

/**
 * Uniswap-supported EVM chain configuration.
 * Only chains where the Uniswap Trading API + V3 deployments exist.
 */

export interface UniswapChainConfig {
  chainId: ChainId;
  name: string;
  explorerUrl: string;
  /** Wrapped native token address used for on-chain swaps */
  wrappedNative: string;
  /** Uniswap V3 SwapRouter02 address */
  swapRouter02: string;
  /** Uniswap V3 QuoterV2 address */
  quoterV2: string;
}

/**
 * Native ETH pseudo-address used by Uniswap UI conventions.
 * Represents "the chain's native gas token" regardless of which chain.
 */
export const NATIVE_TOKEN_ADDRESS =
  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

/**
 * Zero address used by the Uniswap Trading API to represent native tokens.
 */
export const NATIVE_API_ADDRESS =
  "0x0000000000000000000000000000000000000000";

/**
 * Chains where the Uniswap Trading API is available.
 * PlasmaTestnet, ChilizSpicy, and Goerli are NOT supported by Uniswap.
 */
export const UNISWAP_CHAINS: Record<number, UniswapChainConfig> = {
  [ChainId.mainnet]: {
    chainId: ChainId.mainnet,
    name: "Ethereum",
    explorerUrl: "https://etherscan.io",
    wrappedNative: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    swapRouter02: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
    quoterV2: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
  },
  [ChainId.sepolia]: {
    chainId: ChainId.sepolia,
    name: "Sepolia",
    explorerUrl: "https://sepolia.etherscan.io",
    wrappedNative: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
    swapRouter02: "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E",
    quoterV2: "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3",
  },
  [ChainId.polygon]: {
    chainId: ChainId.polygon,
    name: "Polygon",
    explorerUrl: "https://polygonscan.com",
    wrappedNative: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
    swapRouter02: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
    quoterV2: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
  },
  [ChainId.arbitrum]: {
    chainId: ChainId.arbitrum,
    name: "Arbitrum",
    explorerUrl: "https://arbiscan.io",
    wrappedNative: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    swapRouter02: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
    quoterV2: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
  },
  [ChainId.optimism]: {
    chainId: ChainId.optimism,
    name: "Optimism",
    explorerUrl: "https://optimistic.etherscan.io",
    wrappedNative: "0x4200000000000000000000000000000000000006",
    swapRouter02: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
    quoterV2: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
  },
  [ChainId.base]: {
    chainId: ChainId.base,
    name: "Base",
    explorerUrl: "https://basescan.org",
    wrappedNative: "0x4200000000000000000000000000000000000006",
    swapRouter02: "0x2626664c2603336E57B271c5C0b26F421741e481",
    quoterV2: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
  },
  [ChainId.bsc]: {
    chainId: ChainId.bsc,
    name: "BNB Chain",
    explorerUrl: "https://bscscan.com",
    wrappedNative: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    swapRouter02: "0xB971eF87ede563556b2ED4b1C0b0019111Dd85d2",
    quoterV2: "0x78D78E420Da98ad378D7799bE8f19C796B4E0BBB",
  },
  [ChainId.avalanche]: {
    chainId: ChainId.avalanche,
    name: "Avalanche",
    explorerUrl: "https://snowtrace.io",
    wrappedNative: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
    swapRouter02: "0xbb00FF08d01D300023C629E8fFfFcb65A5a578cE",
    quoterV2: "0xbe0F5544EC67e9B3b2D979aaA43f18Fd87E6257F",
  },
  [ChainId.zora]: {
    chainId: ChainId.zora,
    name: "Zora",
    explorerUrl: "https://explorer.zora.energy",
    wrappedNative: "0x4200000000000000000000000000000000000006",
    swapRouter02: "0x7De04c96BE5159c3b5CeffC82aa176dc81281557",
    quoterV2: "0x11867e1b3348F3ce4FcC56B522D624F2f27C037F",
  },
};

/** Check if a chain supports Uniswap swaps */
export function isUniswapSupported(chainId: number): boolean {
  return chainId in UNISWAP_CHAINS;
}

/** Get Uniswap config for a chain (returns null if unsupported) */
export function getUniswapChainConfig(
  chainId: number,
): UniswapChainConfig | null {
  return UNISWAP_CHAINS[chainId] ?? null;
}

/** Check if an address is the native gas token pseudo-address */
export function isNativeToken(address: string): boolean {
  return address.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();
}

/**
 * Convert a token address for use with the Uniswap Trading API.
 * Native tokens use the zero address; ERC20 tokens pass through unchanged.
 */
export function toApiTokenAddress(address: string): string {
  if (isNativeToken(address)) return NATIVE_API_ADDRESS;
  return address;
}

/**
 * Get the on-chain token address for swap router calls.
 * Native tokens resolve to WETH for the chain; ERC20 tokens pass through.
 */
export function toSwapAddress(address: string, chainId: number): string {
  if (isNativeToken(address)) {
    const config = UNISWAP_CHAINS[chainId];
    return config?.wrappedNative ?? address;
  }
  return address;
}

/** Default slippage tolerance percentage */
export const DEFAULT_SLIPPAGE = 5;

/** Available slippage presets */
export const SLIPPAGE_PRESETS = [1, 3, 5, 10] as const;

/**
 * Routing mode for quote requests.
 * - 'auto': V2 + V3 + UniswapX for best price (may have solver delay)
 * - 'payment': V2 + V3 only for deterministic, immediate execution
 */
export type RouteMode = "auto" | "payment";
