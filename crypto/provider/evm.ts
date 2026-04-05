import {
  ChainId,
  DEFAULT_NETWORKS,
  EthersClient,
} from "@/app/profiles/client";
import { useTokenStore } from "@/store/tokens";
import { Transaction, useWalletStore } from "@/store/wallet";
import type {
  BalanceResult,
  BroadcastResult,
  NameProfile,
  NetworkCapabilities,
  NetworkInfo,
  TransferParams,
  TrustLine,
  TxDetails,
  TxHistoryPage,
  UnsignedTxResult,
} from "../types";
import type { CryptoUser } from "../user/base";
import { CryptoProvider } from "./base";

// ---------------------------------------------------------------------------
// networkId ↔ ChainId mapping
// ---------------------------------------------------------------------------

const NETWORK_ID_TO_CHAIN_ID: Record<string, ChainId> = {
  "eth-mainnet": ChainId.mainnet,
  "eth-goerli": ChainId.goerli,
  "eth-sepolia": ChainId.sepolia,
  "opt-mainnet": ChainId.optimism,
  "arb-mainnet": ChainId.arbitrum,
  "polygon-mainnet": ChainId.polygon,
  "base-mainnet": ChainId.base,
  "zora-mainnet": ChainId.zora,
  "avax-mainnet": ChainId.avalanche,
  "bsc-mainnet": ChainId.bsc,
  "plasma-testnet": ChainId.plasmaTestnet,
  "chiliz-spicy": ChainId.chilizSpicy,
};

const CHAIN_ID_TO_NETWORK_ID: Record<number, string> = Object.fromEntries(
  Object.entries(NETWORK_ID_TO_CHAIN_ID).map(([nid, cid]) => [cid, nid]),
);

/** Convert a canonical networkId to an ethers ChainId. Throws if unknown. */
function toChainId(networkId: string): ChainId {
  const chainId = NETWORK_ID_TO_CHAIN_ID[networkId];
  if (chainId === undefined) {
    throw new Error(`UNSUPPORTED_NETWORK: "${networkId}" is not an EVM network`);
  }
  return chainId;
}

/** Convert an ethers ChainId to a canonical networkId. */
function toNetworkId(chainId: ChainId): string {
  return CHAIN_ID_TO_NETWORK_ID[chainId] ?? `evm-${chainId}`;
}

// ---------------------------------------------------------------------------
// Static EVM capabilities
// ---------------------------------------------------------------------------

const EVM_CAPABILITIES: NetworkCapabilities = {
  createKeypair: true,
  importPrivateKey: true,
  importMnemonic: true,
  supportsNativeTransfers: true,
  supportsTokenTransfers: true,
  supportsContracts: true,
  supportsTransactionSimulation: true,
  supportsHistory: true,
  supportsNameService: false, // overridden for mainnet in buildNetworkInfo()
  supportsTrustLines: false,
  supportsChecks: false,
};

function buildNetworkInfo(chainId: ChainId): NetworkInfo {
  const config = DEFAULT_NETWORKS[chainId];
  if (!config) {
    throw new Error(`UNSUPPORTED_NETWORK: chainId ${chainId}`);
  }
  const networkId = toNetworkId(chainId);
  const explorerBase = config.blockExplorerUrl
    ? `${config.blockExplorerUrl}/tx/`
    : "";

  return {
    networkId,
    family: "evm",
    chainId: String(chainId),
    displayName: config.name,
    symbol: config.nativeCurrency.symbol,
    decimals: config.nativeCurrency.decimals,
    isTestnet: EthersClient.isTestnetChain(chainId),
    rpc: {
      publicRpcUrls: [config.rpcUrl],
      explorerTxBaseUrl: explorerBase,
    },
    capabilities: {
      ...EVM_CAPABILITIES,
      // ENS is only on Ethereum mainnet
      supportsNameService: chainId === ChainId.mainnet,
    },
  };
}

// ---------------------------------------------------------------------------
// EvmProvider
// ---------------------------------------------------------------------------

/**
 * EvmProvider — uses ethers.js locally for all EVM chains.
 *
 * All blockchain calls stay on-device; no external API is required.
 * Compatible with existing EthersClient infrastructure.
 */
export class EvmProvider extends CryptoProvider {
  readonly type = "evm";

  // ---------------------------------------------------------------------------
  // Network discovery
  // ---------------------------------------------------------------------------

  async getNetworks(): Promise<NetworkInfo[]> {
    return Object.values(NETWORK_ID_TO_CHAIN_ID).map(buildNetworkInfo);
  }

  async getNetwork(networkId: string): Promise<NetworkInfo> {
    const chainId = toChainId(networkId);
    return buildNetworkInfo(chainId);
  }

  // ---------------------------------------------------------------------------
  // Balances
  // ---------------------------------------------------------------------------

  async getNativeBalance(
    address: string,
    networkId: string,
  ): Promise<BalanceResult> {
    const chainId = toChainId(networkId);
    const raw = await EthersClient.getNativeBalance(address, chainId);
    const config = DEFAULT_NETWORKS[chainId];
    const { decimals, symbol } = config.nativeCurrency;

    return {
      networkId,
      address,
      assetId: `native:${networkId}`,
      amount: EthersClient.formatUnits(raw, decimals),
      amountAtomic: raw.toString(),
      decimals,
      symbol,
    };
  }

  async getTokenBalance(
    address: string,
    networkId: string,
    tokenRef: string,
  ): Promise<BalanceResult> {
    const chainId = toChainId(networkId);
    const balanceMap = await EthersClient.batchGetERC20Balances(
      [tokenRef],
      address,
      chainId,
    );
    const raw = balanceMap.get(tokenRef.toLowerCase()) ?? 0n;

    // Best-effort decimals/symbol from token store
    const tokenStore = useTokenStore.getState();
    const tokens = tokenStore.getTokensForChain(chainId);
    const meta = tokens.find(
      (t) => t.address.toLowerCase() === tokenRef.toLowerCase(),
    );
    const decimals = meta?.decimals ?? 18;
    const symbol = meta?.symbol ?? "";

    return {
      networkId,
      address,
      assetId: `token:${networkId}:${tokenRef}`,
      amount: EthersClient.formatUnits(raw, decimals),
      amountAtomic: raw.toString(),
      decimals,
      symbol,
    };
  }

  async getTokenBalances(
    address: string,
    networkId: string,
  ): Promise<BalanceResult[]> {
    const chainId = toChainId(networkId);
    const tokenStore = useTokenStore.getState();
    const tokens = tokenStore.getTokensForChain(chainId);
    if (tokens.length === 0) return [];

    const balanceMap = await EthersClient.batchGetERC20Balances(
      tokens.map((t) => t.address),
      address,
      chainId,
    );

    return tokens
      .map((token) => {
        const raw = balanceMap.get(token.address.toLowerCase()) ?? 0n;
        if (raw === 0n) return null;
        return {
          networkId,
          address,
          assetId: `token:${networkId}:${token.address}`,
          amount: EthersClient.formatUnits(raw, token.decimals),
          amountAtomic: raw.toString(),
          decimals: token.decimals,
          symbol: token.symbol,
        } satisfies BalanceResult;
      })
      .filter(Boolean) as BalanceResult[];
  }

  // ---------------------------------------------------------------------------
  // Transfer lifecycle
  // ---------------------------------------------------------------------------

  async buildTransfer(params: TransferParams): Promise<UnsignedTxResult> {
    const chainId = toChainId(params.networkId);
    const gasParams = await EthersClient.getGasPrice(chainId);
    const provider = EthersClient.getProvider(chainId);
    const nonce = await provider.getTransactionCount(params.from, "latest");

    let to: string;
    let value: bigint;
    let data: string;

    if (params.asset.kind === "native") {
      to = params.to;
      value = EthersClient.toWei(params.amount);
      data = "0x";
    } else {
      const tokenRef = params.asset.tokenRef!;
      const tokenStore = useTokenStore.getState();
      const tokens = tokenStore.getTokensForChain(chainId);
      const meta = tokens.find(
        (t) => t.address.toLowerCase() === tokenRef.toLowerCase(),
      );
      const decimals = meta?.decimals ?? 18;
      const amountWei = EthersClient.parseUnits(params.amount, decimals);

      to = tokenRef;
      value = 0n;
      data = EthersClient.buildERC20TransferData(params.to, amountWei);
    }

    const txRequest = { from: params.from, to, value, data, ...gasParams };
    const gasLimit =
      (await EthersClient.estimateGasWithPadding(txRequest, chainId)) ??
      21000n;

    const unsignedTx = {
      from: params.from,
      to,
      value: value.toString(),
      data,
      nonce,
      chainId,
      gasLimit: gasLimit.toString(),
      ...Object.fromEntries(
        Object.entries(gasParams).map(([k, v]) => [k, (v as bigint).toString()]),
      ),
    };

    return {
      networkId: params.networkId,
      unsignedTx: JSON.stringify(unsignedTx),
      estimatedFeeAtomic: (
        gasLimit *
        ("gasPrice" in gasParams ? gasParams.gasPrice : gasParams.maxFeePerGas)
      ).toString(),
    };
  }

  async broadcastTransfer(
    signedTx: string,
    networkId: string,
  ): Promise<BroadcastResult> {
    const chainId = toChainId(networkId);
    const provider = EthersClient.getProvider(chainId);
    const response = await provider.broadcastTransaction(signedTx);
    const explorerUrl =
      EthersClient.getExplorerTxUrl(response.hash, chainId) ?? undefined;

    return {
      txHash: response.hash,
      status: "submitted",
      explorerUrl,
    };
  }

  async send(
    params: TransferParams,
    user: CryptoUser,
  ): Promise<BroadcastResult> {
    const built = await this.buildTransfer(params);
    const signedTx = await user.signTransaction(built.unsignedTx, params.networkId);
    const result = await this.broadcastTransfer(signedTx, params.networkId);

    // Record in wallet store and watch for confirmation
    this._recordAndWatch(params, result);

    return result;
  }

  // ---------------------------------------------------------------------------
  // Transactions
  // ---------------------------------------------------------------------------

  async getTransaction(txHash: string, networkId: string): Promise<TxDetails> {
    const chainId = toChainId(networkId);
    const provider = EthersClient.getProvider(chainId);
    const receipt = await provider.getTransactionReceipt(txHash);
    const explorerUrl =
      EthersClient.getExplorerTxUrl(txHash, chainId) ?? undefined;

    if (!receipt) {
      return { txHash, networkId, status: "pending", explorerUrl };
    }

    return {
      txHash,
      networkId,
      status: receipt.status === 1 ? "confirmed" : "failed",
      from: receipt.from,
      to: receipt.to ?? undefined,
      fee: EthersClient.formatUnits(
        receipt.gasUsed * receipt.gasPrice,
        18,
      ),
      blockNumber: receipt.blockNumber,
      explorerUrl,
    };
  }

  async getHistory(
    address: string,
    networkId: string,
  ): Promise<TxHistoryPage> {
    // ethers.js JsonRpcProvider does not expose a history endpoint natively.
    // Return locally-stored transactions from the wallet store as a fallback.
    const store = useWalletStore.getState();
    const chainId = toChainId(networkId);
    const txs = (store.transactions[address] ?? []).filter(
      (t) => t.chainId === chainId,
    );
    const explorerBase =
      DEFAULT_NETWORKS[chainId]?.blockExplorerUrl ?? "";

    return {
      items: txs.map((t) => ({
        txHash: t.hash,
        networkId,
        status: t.status as "confirmed" | "pending" | "failed",
        from: t.from,
        to: t.to,
        value: t.value,
        asset: t.tokenAddress
          ? { kind: "token", tokenRef: t.tokenAddress }
          : { kind: "native" },
        timestamp: t.timestamp,
        explorerUrl: explorerBase ? `${explorerBase}/tx/${t.hash}` : undefined,
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // Name service — ENS (mainnet only)
  // ---------------------------------------------------------------------------

  async resolveName(networkId: string, name: string): Promise<string | null> {
    const chainId = toChainId(networkId);
    const provider = EthersClient.getProvider(chainId);
    return provider.resolveName(name);
  }

  async lookupAddress(
    networkId: string,
    address: string,
  ): Promise<string | null> {
    const chainId = toChainId(networkId);
    const provider = EthersClient.getProvider(chainId);
    return provider.lookupAddress(address);
  }

  async getNameProfile(
    networkId: string,
    name: string,
  ): Promise<NameProfile | null> {
    const address = await this.resolveName(networkId, name);
    if (!address) return null;
    return { name, address };
  }

  // ---------------------------------------------------------------------------
  // Trust lines / Checks — not supported on EVM
  // ---------------------------------------------------------------------------

  async getTrustLines(_address: string, networkId: string): Promise<TrustLine[]> {
    throw new Error(
      `UNSUPPORTED_OPERATION: trust lines are not supported on ${networkId}`,
    );
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private _recordAndWatch(
    params: TransferParams,
    result: BroadcastResult,
  ): void {
    const store = useWalletStore.getState();
    const chainId = toChainId(params.networkId);

    const pendingTx: Transaction = {
      hash: result.txHash,
      from: params.from,
      to: params.to,
      value: params.amount,
      chainId,
      timestamp: Date.now(),
      status: "pending",
      type: "send",
      tokenAddress:
        params.asset.kind === "token" ? params.asset.tokenRef : undefined,
      paymentMethod: "manual-transfer",
    };

    store.addPendingTransaction(pendingTx);
    store.addTransaction(params.from, pendingTx);

    // Fire-and-forget confirmation watcher
    EthersClient.waitForTransaction(result.txHash, 1, chainId)
      .then((confirmed) => {
        store.updateTransactionStatus(
          result.txHash,
          confirmed ? "confirmed" : "failed",
        );
        store.removePendingTransaction(result.txHash);
      })
      .catch(() => {
        store.updateTransactionStatus(result.txHash, "failed");
        store.removePendingTransaction(result.txHash);
      });
  }

  // ---------------------------------------------------------------------------
  // Public helpers
  // ---------------------------------------------------------------------------

  /** Resolve a networkId string to a numeric ChainId (useful for legacy code). */
  static toChainId(networkId: string): ChainId {
    return toChainId(networkId);
  }

  /** Convert a numeric ChainId back to a canonical networkId string. */
  static toNetworkId(chainId: ChainId): string {
    return toNetworkId(chainId);
  }
}
