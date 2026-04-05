/**
 * DynamicProvider — CryptoProvider implementation backed by the Dynamic React
 * Native SDK for SVM (Solana).
 *
 * Uses dynamicClient.solana.getConnection() for on-chain reads (balances,
 * transactions) and dynamicClient.solana.getSigner() for signing.
 *
 * This provider runs fully parallel to EvmProvider and ApiProvider.
 */

import {
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { dynamicClient } from "../dynamic/client";
import type {
  BalanceResult,
  BroadcastResult,
  NetworkCapabilities,
  NetworkInfo,
  TransferParams,
  TxDetails,
  TxHistoryPage,
  UnsignedTxResult,
} from "../types";
import type { CryptoUser } from "../user/base";
import { CryptoProvider } from "./base";

// ---------------------------------------------------------------------------
// Solana network metadata
// ---------------------------------------------------------------------------

const SOLANA_NETWORKS: Record<string, NetworkInfo> = {
  "sol-mainnet": {
    networkId: "sol-mainnet",
    family: "svm",
    chainId: "solana-mainnet",
    displayName: "Solana",
    symbol: "SOL",
    decimals: 9,
    isTestnet: false,
    rpc: {
      publicRpcUrls: ["https://api.mainnet-beta.solana.com"],
      explorerTxBaseUrl: "https://explorer.solana.com/tx/",
    },
    capabilities: DYNAMIC_SVM_CAPABILITIES(),
  },
  "sol-devnet": {
    networkId: "sol-devnet",
    family: "svm",
    chainId: "solana-devnet",
    displayName: "Solana Devnet",
    symbol: "SOL",
    decimals: 9,
    isTestnet: true,
    rpc: {
      publicRpcUrls: ["https://api.devnet.solana.com"],
      explorerTxBaseUrl: "https://explorer.solana.com/tx/",
    },
    capabilities: DYNAMIC_SVM_CAPABILITIES(),
  },
};

function DYNAMIC_SVM_CAPABILITIES(): NetworkCapabilities {
  return {
    createKeypair: true,
    importPrivateKey: false,
    importMnemonic: false,
    supportsNativeTransfers: true,
    supportsTokenTransfers: true,
    supportsContracts: true,
    supportsTransactionSimulation: true,
    supportsHistory: false,
    supportsNameService: false,
    supportsTrustLines: false,
    supportsChecks: false,
  };
}

// ---------------------------------------------------------------------------
// DynamicProvider
// ---------------------------------------------------------------------------

export class DynamicProvider extends CryptoProvider {
  readonly type = "dynamic";

  // ---------------------------------------------------------------------------
  // Network discovery
  // ---------------------------------------------------------------------------

  async getNetworks(): Promise<NetworkInfo[]> {
    return Object.values(SOLANA_NETWORKS);
  }

  async getNetwork(networkId: string): Promise<NetworkInfo> {
    const net = SOLANA_NETWORKS[networkId];
    if (!net) {
      throw new Error(
        `[DynamicProvider] Unknown network: ${networkId}. ` +
          `Supported: ${Object.keys(SOLANA_NETWORKS).join(", ")}`,
      );
    }
    return net;
  }

  // ---------------------------------------------------------------------------
  // Balances
  // ---------------------------------------------------------------------------

  async getNativeBalance(
    address: string,
    networkId: string,
  ): Promise<BalanceResult> {
    const connection = this._getConnection(networkId);
    const pubkey = new PublicKey(address);
    const lamports = await connection.getBalance(pubkey);
    const amount = (lamports / LAMPORTS_PER_SOL).toString();

    return {
      networkId,
      address,
      assetId: `native:${networkId}`,
      amount,
      amountAtomic: lamports.toString(),
      decimals: 9,
      symbol: "SOL",
    };
  }

  async getTokenBalance(
    address: string,
    networkId: string,
    tokenRef: string,
  ): Promise<BalanceResult> {
    const connection = this._getConnection(networkId);
    const ownerPubkey = new PublicKey(address);
    const mintPubkey = new PublicKey(tokenRef);

    // Find associated token account
    const { value: accounts } =
      await connection.getTokenAccountsByOwner(ownerPubkey, {
        mint: mintPubkey,
      });

    let amountAtomic = "0";
    let decimals = 9;
    if (accounts.length > 0) {
      const parsed = await connection.getParsedAccountInfo(
        accounts[0].pubkey,
      );
      if (parsed.value?.data && "parsed" in parsed.value.data) {
        const info = parsed.value.data.parsed.info;
        amountAtomic = info.tokenAmount.amount;
        decimals = info.tokenAmount.decimals;
      }
    }

    const amount = (
      Number(amountAtomic) / Math.pow(10, decimals)
    ).toString();

    return {
      networkId,
      address,
      assetId: `token:${networkId}:${tokenRef}`,
      amount,
      amountAtomic,
      decimals,
      symbol: "",
    };
  }

  async getTokenBalances(
    address: string,
    networkId: string,
  ): Promise<BalanceResult[]> {
    const connection = this._getConnection(networkId);
    const ownerPubkey = new PublicKey(address);

    const { value: tokenAccounts } =
      await connection.getParsedTokenAccountsByOwner(ownerPubkey, {
        programId: new PublicKey(
          "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
        ),
      });

    return tokenAccounts
      .map((ta) => {
        const info = ta.account.data.parsed.info;
        const amt = info.tokenAmount;
        if (Number(amt.amount) === 0) return null;
        return {
          networkId,
          address,
          assetId: `token:${networkId}:${info.mint}`,
          amount: amt.uiAmountString ?? "0",
          amountAtomic: amt.amount,
          decimals: amt.decimals,
          symbol: "",
        } satisfies BalanceResult;
      })
      .filter(Boolean) as BalanceResult[];
  }

  // ---------------------------------------------------------------------------
  // Transfer lifecycle
  // ---------------------------------------------------------------------------

  async buildTransfer(params: TransferParams): Promise<UnsignedTxResult> {
    const connection = this._getConnection(params.networkId);
    const fromKey = new PublicKey(params.from);
    const toKey = new PublicKey(params.to);

    if (params.asset.kind !== "native") {
      throw new Error(
        "[DynamicProvider] SPL token transfers via buildTransfer are not yet supported. " +
          "Use send() for native SOL transfers.",
      );
    }

    const lamports = Math.round(parseFloat(params.amount) * LAMPORTS_PER_SOL);
    const { blockhash } = await connection.getLatestBlockhash();

    const instructions = [
      SystemProgram.transfer({
        fromPubkey: fromKey,
        lamports,
        toPubkey: toKey,
      }),
    ];

    const messageV0 = new TransactionMessage({
      instructions,
      payerKey: fromKey,
      recentBlockhash: blockhash,
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);
    const serialised = Buffer.from(transaction.serialize()).toString("base64");

    return {
      networkId: params.networkId,
      unsignedTx: serialised,
      estimatedFeeAtomic: "5000", // ~5000 lamports base fee
    };
  }

  async broadcastTransfer(
    signedTx: string,
    networkId: string,
  ): Promise<BroadcastResult> {
    const connection = this._getConnection(networkId);
    const txBytes = Buffer.from(signedTx, "base64");
    const tx = VersionedTransaction.deserialize(txBytes);
    const signature = await connection.sendTransaction(tx);
    const net = SOLANA_NETWORKS[networkId];
    const explorerUrl = net
      ? `${net.rpc.explorerTxBaseUrl}${signature}${net.isTestnet ? "?cluster=devnet" : ""}`
      : undefined;

    return {
      txHash: signature,
      status: "submitted",
      explorerUrl,
    };
  }

  /**
   * One-shot send using the Dynamic embedded wallet signer.
   * This is the primary transfer method — it builds, signs via Dynamic's MPC
   * signer, and broadcasts in one step.
   */
  async send(
    params: TransferParams,
    _user: CryptoUser,
  ): Promise<BroadcastResult> {
    const wallet = this._getPrimaryWallet();
    if (!wallet) {
      throw new Error(
        "[DynamicProvider] No Dynamic wallet connected. Complete Dynamic onboarding first.",
      );
    }

    const connection = this._getConnection(params.networkId);
    const signer = dynamicClient.solana.getSigner({ wallet });
    const fromKey = new PublicKey(params.from);
    const toKey = new PublicKey(params.to);

    if (params.asset.kind !== "native") {
      throw new Error(
        "[DynamicProvider] SPL token transfers are not yet supported via Dynamic send().",
      );
    }

    const lamports = Math.round(parseFloat(params.amount) * LAMPORTS_PER_SOL);
    const { blockhash } = await connection.getLatestBlockhash();

    const instructions = [
      SystemProgram.transfer({
        fromPubkey: fromKey,
        lamports,
        toPubkey: toKey,
      }),
    ];

    const messageV0 = new TransactionMessage({
      instructions,
      payerKey: fromKey,
      recentBlockhash: blockhash,
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);
    const { signature } = await signer.signAndSendTransaction(transaction);

    const net = SOLANA_NETWORKS[params.networkId];
    const explorerUrl = net
      ? `${net.rpc.explorerTxBaseUrl}${signature}${net.isTestnet ? "?cluster=devnet" : ""}`
      : undefined;

    return {
      txHash: signature,
      status: "submitted",
      explorerUrl,
    };
  }

  // ---------------------------------------------------------------------------
  // Transactions
  // ---------------------------------------------------------------------------

  async getTransaction(
    txHash: string,
    networkId: string,
  ): Promise<TxDetails> {
    const connection = this._getConnection(networkId);
    const tx = await connection.getTransaction(txHash, {
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      return { txHash, networkId, status: "pending" };
    }

    return {
      txHash,
      networkId,
      status: tx.meta?.err ? "failed" : "confirmed",
      fee: ((tx.meta?.fee ?? 0) / LAMPORTS_PER_SOL).toString(),
      blockNumber: tx.slot,
      timestamp: tx.blockTime ? tx.blockTime * 1000 : undefined,
    };
  }

  async getHistory(
    _address: string,
    _networkId: string,
  ): Promise<TxHistoryPage> {
    // Solana RPC doesn't provide a rich history endpoint;
    // return empty and rely on local transaction store.
    return { items: [] };
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /**
   * Get a Solana Connection from the Dynamic SDK.
   * The Dynamic SDK manages RPC endpoint configuration via the dashboard.
   */
  private _getConnection(networkId: string) {
    const isDevnet = networkId.includes("devnet") || networkId.includes("testnet");
    return dynamicClient.solana.getConnection({
      commitment: "confirmed",
      ...(isDevnet ? { cluster: "devnet" } : {}),
    });
  }

  /**
   * Get the primary Dynamic wallet (SVM).
   */
  private _getPrimaryWallet() {
    const wallets = dynamicClient.wallets.userWallets;
    // Prefer SVM wallets
    return (
      wallets.find((w: any) => w.chain === "SOL" || w.chain === "SVM") ??
      dynamicClient.wallets.primary ??
      null
    );
  }

  // ---------------------------------------------------------------------------
  // Static helpers
  // ---------------------------------------------------------------------------

  /** All supported Dynamic SVM network IDs. */
  static readonly NETWORK_IDS = Object.keys(SOLANA_NETWORKS);
}
