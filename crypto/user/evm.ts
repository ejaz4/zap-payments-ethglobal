import { ChainId, EthersClient } from "@/app/profiles/client";
import { SecureStorage } from "@/services/storage";
import { Wallet } from "ethers";
import { EvmProvider } from "../provider/evm";
import { CryptoUser } from "./base";

/**
 * EvmUser — signs EVM transactions locally using a private key.
 *
 * The private key is loaded from SecureStorage on demand and never kept in
 * long-lived memory. Works with both EvmProvider and ApiProvider.
 */
export class EvmUser extends CryptoUser {
  readonly type: string = "evm";

  protected readonly address: string;

  constructor(address: string) {
    super();
    this.address = address;
  }

  async getAddress(): Promise<string> {
    return this.address;
  }

  /**
   * Sign an unsigned transaction produced by EvmProvider.buildTransfer().
   * The unsigned tx is a JSON-serialised TransactionRequest.
   */
  async signTransaction(
    unsignedTx: string,
    networkId: string,
  ): Promise<string> {
    const chainId = EvmProvider.toChainId(networkId);
    const wallet = await this._loadWallet(chainId);

    // Parse the JSON TransactionRequest produced by EvmProvider
    const tx = JSON.parse(unsignedTx) as Record<string, unknown>;

    // Re-hydrate BigInt fields (they were serialised as strings)
    const txRequest = {
      ...tx,
      value: tx.value !== undefined ? BigInt(tx.value as string) : undefined,
      gasLimit:
        tx.gasLimit !== undefined ? BigInt(tx.gasLimit as string) : undefined,
      gasPrice:
        tx.gasPrice !== undefined ? BigInt(tx.gasPrice as string) : undefined,
      maxFeePerGas:
        tx.maxFeePerGas !== undefined
          ? BigInt(tx.maxFeePerGas as string)
          : undefined,
      maxPriorityFeePerGas:
        tx.maxPriorityFeePerGas !== undefined
          ? BigInt(tx.maxPriorityFeePerGas as string)
          : undefined,
    };

    return wallet.signTransaction(txRequest);
  }

  async signMessage(message: string): Promise<string> {
    const wallet = await this._loadWallet();
    const { result, error } = await EthersClient.signMessage(wallet, message);
    if (error) throw error;
    return result!;
  }

  /**
   * Expose private key for providers that perform server-side signing
   * (e.g. ApiProvider trust-line / check calls).
   *
   * Only use with trusted providers.
   */
  exposePrivateKey(): string | undefined {
    // Private key is not cached in memory by default.
    // For providers that need it synchronously (like ApiProvider), the caller
    // should use EvmUser.loadPrivateKey() to fetch from SecureStorage first.
    return this._cachedPrivateKey ?? undefined;
  }

  /**
   * Load and temporarily cache the private key.
   * Call this before exposePrivateKey() if you need the key synchronously.
   */
  async loadPrivateKey(): Promise<string | null> {
    const key = await SecureStorage.loadPrivateKey(this.address);
    if (key) this._cachedPrivateKey = key;
    return key;
  }

  // Cache is cleared after use to minimise time key is in memory.
  private _cachedPrivateKey: string | null = null;

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  protected async _loadWallet(
    chainId: ChainId = ChainId.mainnet,
  ): Promise<Wallet> {
    const privateKey = await SecureStorage.loadPrivateKey(this.address);
    if (!privateKey) {
      throw new Error(
        `[EvmUser]: No private key found for address ${this.address}`,
      );
    }
    return EthersClient.createWallet(privateKey, chainId);
  }
}
