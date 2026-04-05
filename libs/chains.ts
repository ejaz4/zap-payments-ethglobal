import { defineChain } from "viem";

export const circleLayerTestnet = {
  id: 28525,
  name: "Circle Layer Testnet",
  nativeCurrency: {
    decimals: 18,
    name: "CLAYER",
    symbol: "CLAYER",
  },
  rpcUrls: {
    default: {
      http: ["https://testnet-rpc.circlelayer.com/"],
    },
  },
  blockExplorers: {
    default: {
      name: "Circle Layer Explorer",
      url: "https://explorer-testnet.circlelayer.com/",
    },
  },
  testnet: true,
};

export const chilizSpicy = defineChain({
  id: 88882,
  name: "Chiliz Spicy Testnet",
  nativeCurrency: {
    decimals: 18,
    name: "Chiliz",
    symbol: "CHZ",
  },
  rpcUrls: {
    default: {
      http: ["https://spicy-rpc.chiliz.com"],
      webSocket: ["wss://spicy-rpc-ws.chiliz.com/"],
    },
  },
  blockExplorers: {
    default: {
      name: "Chiliz Spicy Explorer",
      url: "https://testnet.chiliscan.com",
    },
  },
  testnet: true,
});

export const plasmaTestnet = defineChain({
  id: 9746,
  name: "Plasma Testnet",
  nativeCurrency: {
    decimals: 18,
    name: "XPL",
    symbol: "XPL",
  },
  rpcUrls: {
    default: {
      http: ["https://testnet-rpc.plasma.to"],
    },
  },
  blockExplorers: {
    default: {
      name: "Plasma Testnet Explorer",
      url: "https://testnet.plasmascan.to",
    },
  },
  testnet: true,
});

export const unichain = defineChain({
  id: 130,
  name: "Unichain",
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH",
  },
  rpcUrls: {
    default: {
      http: ["https://mainnet.unichain.org"],
    },
  },
  blockExplorers: {
    default: {
      name: "Uniscan",
      url: "https://uniscan.xyz",
    },
  },
});

export const unichainSepolia = defineChain({
  id: 1301,
  name: "Unichain Sepolia",
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH",
  },
  rpcUrls: {
    default: {
      http: ["https://sepolia.unichain.org"],
      webSocket: ["wss://unichain-sepolia-rpc.publicnode.com"],
    },
  },
  blockExplorers: {
    default: {
      name: "Uniscan",
      url: "https://sepolia.uniscan.xyz",
    },
  },
  testnet: true,
});

export const apiStitch = (url: string) =>
  `${process.env["EXPO_PUBLIC_API_URL"]}${url}`;
