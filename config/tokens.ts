import { ChainId } from "@/app/profiles/client";

/**
 * ERC20 Token definition
 * Based on Rainbow's RainbowToken structure
 */
export interface TokenInfo {
  address: string;
  chainId: ChainId;
  decimals: number;
  symbol: string;
  name: string;
  logoURI?: string;
  color?: string;
  isVerified?: boolean;
  isDefault?: boolean; // Comes with app by default
}

/**
 * Default token lists per chain
 * These are popular, verified tokens that come with the app
 * Structure inspired by Rainbow's rainbow-token-list.json
 */
export const DEFAULT_TOKENS: Record<ChainId, TokenInfo[]> = {
  // Ethereum Mainnet
  [ChainId.mainnet]: [
    {
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      chainId: ChainId.mainnet,
      decimals: 6,
      symbol: "USDC",
      name: "USD Coin",
      color: "#2775CA",
      isVerified: true,
      isDefault: true,
    },
    {
      address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      chainId: ChainId.mainnet,
      decimals: 6,
      symbol: "USDT",
      name: "Tether USD",
      color: "#26A17B",
      isVerified: true,
      isDefault: true,
    },
    {
      address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      chainId: ChainId.mainnet,
      decimals: 18,
      symbol: "DAI",
      name: "Dai Stablecoin",
      color: "#F5AC37",
      isVerified: true,
      isDefault: true,
    },
    {
      address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
      chainId: ChainId.mainnet,
      decimals: 8,
      symbol: "WBTC",
      name: "Wrapped BTC",
      color: "#F7931A",
      isVerified: true,
      isDefault: true,
    },
    {
      address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      chainId: ChainId.mainnet,
      decimals: 18,
      symbol: "WETH",
      name: "Wrapped Ether",
      color: "#627EEA",
      isVerified: true,
      isDefault: true,
    },
    {
      address: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9",
      chainId: ChainId.mainnet,
      decimals: 18,
      symbol: "AAVE",
      name: "Aave",
      color: "#7285B2",
      isVerified: true,
      isDefault: true,
    },
    {
      address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
      chainId: ChainId.mainnet,
      decimals: 18,
      symbol: "UNI",
      name: "Uniswap",
      color: "#FF007A",
      isVerified: true,
      isDefault: true,
    },
    {
      address: "0x514910771AF9Ca656af840dff83E8264EcF986CA",
      chainId: ChainId.mainnet,
      decimals: 18,
      symbol: "LINK",
      name: "Chainlink",
      color: "#2A5ADA",
      isVerified: true,
      isDefault: true,
    },
    {
      address: "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE",
      chainId: ChainId.mainnet,
      decimals: 18,
      symbol: "SHIB",
      name: "Shiba Inu",
      color: "#E8442F",
      isVerified: true,
      isDefault: true,
    },
    {
      address: "0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0",
      chainId: ChainId.mainnet,
      decimals: 18,
      symbol: "MATIC",
      name: "Polygon",
      color: "#8247E5",
      isVerified: true,
      isDefault: true,
    },
    {
      address: "0x6982508145454Ce325dDbE47a25d4ec3d2311933",
      chainId: ChainId.mainnet,
      decimals: 18,
      symbol: "PEPE",
      name: "Pepe",
      color: "#479F53",
      isVerified: true,
      isDefault: true,
    },
  ],

  // Polygon
  [ChainId.polygon]: [
    {
      address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
      chainId: ChainId.polygon,
      decimals: 6,
      symbol: "USDC",
      name: "USD Coin",
      color: "#2775CA",
      isVerified: true,
      isDefault: true,
    },
    {
      address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
      chainId: ChainId.polygon,
      decimals: 6,
      symbol: "USDC.e",
      name: "Bridged USDC",
      color: "#2775CA",
      isVerified: true,
      isDefault: true,
    },
    {
      address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
      chainId: ChainId.polygon,
      decimals: 6,
      symbol: "USDT",
      name: "Tether USD",
      color: "#26A17B",
      isVerified: true,
      isDefault: true,
    },
    {
      address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063",
      chainId: ChainId.polygon,
      decimals: 18,
      symbol: "DAI",
      name: "Dai Stablecoin",
      color: "#F5AC37",
      isVerified: true,
      isDefault: true,
    },
    {
      address: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6",
      chainId: ChainId.polygon,
      decimals: 8,
      symbol: "WBTC",
      name: "Wrapped BTC",
      color: "#F7931A",
      isVerified: true,
      isDefault: true,
    },
    {
      address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
      chainId: ChainId.polygon,
      decimals: 18,
      symbol: "WETH",
      name: "Wrapped Ether",
      color: "#627EEA",
      isVerified: true,
      isDefault: true,
    },
    {
      address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
      chainId: ChainId.polygon,
      decimals: 18,
      symbol: "WMATIC",
      name: "Wrapped MATIC",
      color: "#8247E5",
      isVerified: true,
      isDefault: true,
    },
    {
      address: "0xb33EaAd8d922B1083446DC23f610c2567fB5180f",
      chainId: ChainId.polygon,
      decimals: 18,
      symbol: "UNI",
      name: "Uniswap",
      color: "#FF007A",
      isVerified: true,
      isDefault: true,
    },
    {
      address: "0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39",
      chainId: ChainId.polygon,
      decimals: 18,
      symbol: "LINK",
      name: "Chainlink",
      color: "#2A5ADA",
      isVerified: true,
      isDefault: true,
    },
  ],

  // Arbitrum
  [ChainId.arbitrum]: [
    {
      address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      chainId: ChainId.arbitrum,
      decimals: 6,
      symbol: "USDC",
      name: "USD Coin",
      color: "#2775CA",
      isVerified: true,
      isDefault: true,
    },
    {
      address: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
      chainId: ChainId.arbitrum,
      decimals: 6,
      symbol: "USDC.e",
      name: "Bridged USDC",
      color: "#2775CA",
      isVerified: true,
      isDefault: true,
    },
    {
      address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
      chainId: ChainId.arbitrum,
      decimals: 6,
      symbol: "USDT",
      name: "Tether USD",
      color: "#26A17B",
      isVerified: true,
      isDefault: true,
    },
    {
      address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
      chainId: ChainId.arbitrum,
      decimals: 18,
      symbol: "DAI",
      name: "Dai Stablecoin",
      color: "#F5AC37",
      isVerified: true,
      isDefault: true,
    },
    {
      address: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
      chainId: ChainId.arbitrum,
      decimals: 8,
      symbol: "WBTC",
      name: "Wrapped BTC",
      color: "#F7931A",
      isVerified: true,
      isDefault: true,
    },
    {
      address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
      chainId: ChainId.arbitrum,
      decimals: 18,
      symbol: "WETH",
      name: "Wrapped Ether",
      color: "#627EEA",
      isVerified: true,
      isDefault: true,
    },
    {
      address: "0x912CE59144191C1204E64559FE8253a0e49E6548",
      chainId: ChainId.arbitrum,
      decimals: 18,
      symbol: "ARB",
      name: "Arbitrum",
      color: "#28A0F0",
      isVerified: true,
      isDefault: true,
    },
    {
      address: "0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0",
      chainId: ChainId.arbitrum,
      decimals: 18,
      symbol: "UNI",
      name: "Uniswap",
      color: "#FF007A",
      isVerified: true,
      isDefault: true,
    },
  ],

  // Optimism
  [ChainId.optimism]: [
    {
      address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
      chainId: ChainId.optimism,
      decimals: 6,
      symbol: "USDC",
      name: "USD Coin",
      color: "#2775CA",
      isVerified: true,
      isDefault: true,
    },
    {
      address: "0x7F5c764cBc14f9669B88837ca1490cCa17c31607",
      chainId: ChainId.optimism,
      decimals: 6,
      symbol: "USDC.e",
      name: "Bridged USDC",
      color: "#2775CA",
      isVerified: true,
      isDefault: true,
    },
    {
      address: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58",
      chainId: ChainId.optimism,
      decimals: 6,
      symbol: "USDT",
      name: "Tether USD",
      color: "#26A17B",
      isVerified: true,
      isDefault: true,
    },
    {
      address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
      chainId: ChainId.optimism,
      decimals: 18,
      symbol: "DAI",
      name: "Dai Stablecoin",
      color: "#F5AC37",
      isVerified: true,
      isDefault: true,
    },
    {
      address: "0x68f180fcCe6836688e9084f035309E29Bf0A2095",
      chainId: ChainId.optimism,
      decimals: 8,
      symbol: "WBTC",
      name: "Wrapped BTC",
      color: "#F7931A",
      isVerified: true,
      isDefault: true,
    },
    {
      address: "0x4200000000000000000000000000000000000006",
      chainId: ChainId.optimism,
      decimals: 18,
      symbol: "WETH",
      name: "Wrapped Ether",
      color: "#627EEA",
      isVerified: true,
      isDefault: true,
    },
    {
      address: "0x4200000000000000000000000000000000000042",
      chainId: ChainId.optimism,
      decimals: 18,
      symbol: "OP",
      name: "Optimism",
      color: "#FF0420",
      isVerified: true,
      isDefault: true,
    },
  ],

  // Base
  [ChainId.base]: [
    {
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      chainId: ChainId.base,
      decimals: 6,
      symbol: "USDC",
      name: "USD Coin",
      color: "#2775CA",
      isVerified: true,
      isDefault: true,
    },
    {
      address: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA",
      chainId: ChainId.base,
      decimals: 6,
      symbol: "USDbC",
      name: "Bridged USDC",
      color: "#2775CA",
      isVerified: true,
      isDefault: true,
    },
    {
      address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
      chainId: ChainId.base,
      decimals: 18,
      symbol: "DAI",
      name: "Dai Stablecoin",
      color: "#F5AC37",
      isVerified: true,
      isDefault: true,
    },
    {
      address: "0x4200000000000000000000000000000000000006",
      chainId: ChainId.base,
      decimals: 18,
      symbol: "WETH",
      name: "Wrapped Ether",
      color: "#627EEA",
      isVerified: true,
      isDefault: true,
    },
    {
      address: "0x532f27101965dd16442E59d40670FaF5eBB142E4",
      chainId: ChainId.base,
      decimals: 18,
      symbol: "BRETT",
      name: "Brett",
      color: "#1652F0",
      isVerified: true,
      isDefault: true,
    },
  ],

  // BSC
  [ChainId.bsc]: [
    {
      address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
      chainId: ChainId.bsc,
      decimals: 18,
      symbol: "USDC",
      name: "USD Coin",
      color: "#2775CA",
      isVerified: true,
      isDefault: true,
    },
    {
      address: "0x55d398326f99059fF775485246999027B3197955",
      chainId: ChainId.bsc,
      decimals: 18,
      symbol: "USDT",
      name: "Tether USD",
      color: "#26A17B",
      isVerified: true,
      isDefault: true,
    },
    {
      address: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
      chainId: ChainId.bsc,
      decimals: 18,
      symbol: "BUSD",
      name: "Binance USD",
      color: "#F3BA2F",
      isVerified: true,
      isDefault: true,
    },
    {
      address: "0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3",
      chainId: ChainId.bsc,
      decimals: 18,
      symbol: "DAI",
      name: "Dai Stablecoin",
      color: "#F5AC37",
      isVerified: true,
      isDefault: true,
    },
    {
      address: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8",
      chainId: ChainId.bsc,
      decimals: 18,
      symbol: "ETH",
      name: "Ethereum",
      color: "#627EEA",
      isVerified: true,
      isDefault: true,
    },
    {
      address: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",
      chainId: ChainId.bsc,
      decimals: 18,
      symbol: "BTCB",
      name: "Bitcoin BEP2",
      color: "#F7931A",
      isVerified: true,
      isDefault: true,
    },
    {
      address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
      chainId: ChainId.bsc,
      decimals: 18,
      symbol: "WBNB",
      name: "Wrapped BNB",
      color: "#F3BA2F",
      isVerified: true,
      isDefault: true,
    },
  ],

  // Avalanche
  [ChainId.avalanche]: [
    {
      address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
      chainId: ChainId.avalanche,
      decimals: 6,
      symbol: "USDC",
      name: "USD Coin",
      color: "#2775CA",
      isVerified: true,
      isDefault: true,
    },
    {
      address: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7",
      chainId: ChainId.avalanche,
      decimals: 6,
      symbol: "USDT",
      name: "Tether USD",
      color: "#26A17B",
      isVerified: true,
      isDefault: true,
    },
    {
      address: "0xd586E7F844cEa2F87f50152665BCbc2C279D8d70",
      chainId: ChainId.avalanche,
      decimals: 18,
      symbol: "DAI.e",
      name: "Dai Stablecoin",
      color: "#F5AC37",
      isVerified: true,
      isDefault: true,
    },
    {
      address: "0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB",
      chainId: ChainId.avalanche,
      decimals: 18,
      symbol: "WETH.e",
      name: "Wrapped Ether",
      color: "#627EEA",
      isVerified: true,
      isDefault: true,
    },
    {
      address: "0x50b7545627a5162F82A992c33b87aDc75187B218",
      chainId: ChainId.avalanche,
      decimals: 8,
      symbol: "WBTC.e",
      name: "Wrapped BTC",
      color: "#F7931A",
      isVerified: true,
      isDefault: true,
    },
    {
      address: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
      chainId: ChainId.avalanche,
      decimals: 18,
      symbol: "WAVAX",
      name: "Wrapped AVAX",
      color: "#E84142",
      isVerified: true,
      isDefault: true,
    },
  ],

  // Zora
  [ChainId.zora]: [
    {
      address: "0x4200000000000000000000000000000000000006",
      chainId: ChainId.zora,
      decimals: 18,
      symbol: "WETH",
      name: "Wrapped Ether",
      color: "#627EEA",
      isVerified: true,
      isDefault: true,
    },
  ],

  // Testnets
  [ChainId.goerli]: [],
  [ChainId.sepolia]: [
    {
      address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
      chainId: ChainId.sepolia,
      decimals: 6,
      symbol: "USDC",
      name: "USD Coin (Test)",
      color: "#2775CA",
      isVerified: true,
      isDefault: true,
    },
  ],

  // Plasma Testnet
  [ChainId.plasmaTestnet]: [
    {
      address: "0x502012b361AebCE43b26Ec812B74D9a51dB4D412",
      chainId: ChainId.plasmaTestnet,
      decimals: 6,
      symbol: "USDT0",
      name: "USDT0",
      color: "#26A17B",
      isVerified: true,
      isDefault: true,
    },
  ],

  // Chiliz Spicy Testnet - No default tokens yet
  [ChainId.chilizSpicy]: [],
};

/**
 * Get unique token key for storage
 */
export function getTokenKey(address: string, chainId: ChainId): string {
  return `${address.toLowerCase()}_${chainId}`;
}

/**
 * Get all default tokens for a specific chain
 */
export function getDefaultTokensForChain(chainId: ChainId): TokenInfo[] {
  return DEFAULT_TOKENS[chainId] || [];
}

/**
 * Get all default tokens across all chains
 */
export function getAllDefaultTokens(): TokenInfo[] {
  return Object.values(DEFAULT_TOKENS).flat();
}

/**
 * Find a token by address and chain in default tokens
 */
export function findDefaultToken(
  address: string,
  chainId: ChainId,
): TokenInfo | undefined {
  const tokens = DEFAULT_TOKENS[chainId] || [];
  return tokens.find((t) => t.address.toLowerCase() === address.toLowerCase());
}
