import { createPublicClient, createWalletClient, http } from "viem";
import { avalancheFuji, bsc } from "viem/chains";
import { chilizSpicy, circleLayerTestnet, plasmaTestnet } from "./chains";

export const chilizPublicClient = createPublicClient({
  chain: chilizSpicy,
  transport: http(),
});

export const chilizWalletClient = createWalletClient({
  chain: chilizSpicy,
  transport: http(),
});

export const bscPublicClient = createPublicClient({
  chain: bsc,
  transport: http(),
});

export const bscWalletClient = createWalletClient({
  chain: bsc,
  transport: http(),
});

export const circlePublicClient = createPublicClient({
  chain: circleLayerTestnet,
  transport: http(),
});

export const circleWalletClient = createWalletClient({
  chain: circleLayerTestnet,
  transport: http(),
});

export const avalancheFujiPublicClient = createPublicClient({
  chain: avalancheFuji,
  transport: http(),
});

export const avalancheFujiWalletClient = createWalletClient({
  chain: avalancheFuji,
  transport: http(),
});

export const plasmaPublicClient = createPublicClient({
  chain: plasmaTestnet,
  transport: http(),
});

export const plasmaWalletClient = createWalletClient({
  chain: plasmaTestnet,
  transport: http(),
});
