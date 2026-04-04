import {
    avalancheFujiPublicClient,
    avalancheFujiWalletClient,
    bscPublicClient,
    bscWalletClient,
    chilizPublicClient,
    chilizWalletClient,
    circlePublicClient,
    circleWalletClient,
    plasmaPublicClient,
    plasmaWalletClient,
} from "./client";

export const selectChain = (chain: string) => {
  let publicClient:
    | typeof chilizPublicClient
    | typeof bscPublicClient
    | typeof circlePublicClient
    | typeof avalancheFujiPublicClient = chilizPublicClient;
  let walletClient:
    | typeof chilizWalletClient
    | typeof bscWalletClient
    | typeof circleWalletClient
    | typeof avalancheFujiWalletClient = chilizWalletClient;

  if (chain === "chiliz") {
    publicClient = chilizPublicClient;
    walletClient = chilizWalletClient;
  }

  if (chain === "bsc") {
    publicClient = bscPublicClient;
    walletClient = bscWalletClient;
  }

  if (chain == "circleWallet") {
    publicClient = circlePublicClient;
    walletClient = circleWalletClient;
  }

  if (chain == "avalancheFuji") {
    publicClient = avalancheFujiPublicClient;
    walletClient = avalancheFujiWalletClient;
  }

  if (chain === "plasma") {
    publicClient = plasmaPublicClient;
    walletClient = plasmaWalletClient;
  }

  return [publicClient, walletClient] as const;
};
