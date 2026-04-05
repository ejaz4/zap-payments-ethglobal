import type {
  BalanceResult,
  BroadcastResult,
  CashCheckParams,
  CreateCheckParams,
  NameProfile,
  NetworkInfo,
  SetTrustLineParams,
  TransferParams,
  TrustLine,
  TxDetails,
  TxHistoryPage,
  UnsignedTxResult,
} from "../types";
import type { CryptoUser } from "../user/base";

/**
 * CryptoProvider — abstract base class for all blockchain providers.
 *
 * Two concrete implementations ship out of the box:
 *  - EvmProvider  — local ethers.js, EVM chains only
 *  - ApiProvider  — external REST API (Universal Multi-Chain Wallet API, API.md)
 *
 * Add more providers (e.g. SolanaProvider, XrplProvider) by extending this class.
 */
export abstract class CryptoProvider {
  abstract readonly type: string;

  // ---------------------------------------------------------------------------
  // Network discovery
  // ---------------------------------------------------------------------------

  /** List all networks this provider supports. */
  abstract getNetworks(): Promise<NetworkInfo[]>;

  /** Get metadata for a single network. */
  abstract getNetwork(networkId: string): Promise<NetworkInfo>;

  // ---------------------------------------------------------------------------
  // Balances
  // ---------------------------------------------------------------------------

  abstract getNativeBalance(
    address: string,
    networkId: string,
  ): Promise<BalanceResult>;

  abstract getTokenBalance(
    address: string,
    networkId: string,
    tokenRef: string,
  ): Promise<BalanceResult>;

  /** All tracked token balances for an address. */
  abstract getTokenBalances(
    address: string,
    networkId: string,
  ): Promise<BalanceResult[]>;

  // ---------------------------------------------------------------------------
  // Transfer lifecycle
  // ---------------------------------------------------------------------------

  /** Build an unsigned transaction. Pass the result to CryptoUser.signTransaction. */
  abstract buildTransfer(params: TransferParams): Promise<UnsignedTxResult>;

  /** Broadcast a signed transaction returned by CryptoUser.signTransaction. */
  abstract broadcastTransfer(
    signedTx: string,
    networkId: string,
  ): Promise<BroadcastResult>;

  /**
   * One-shot build + sign + broadcast.
   * The provider calls user.signTransaction internally.
   */
  abstract send(
    params: TransferParams,
    user: CryptoUser,
  ): Promise<BroadcastResult>;

  // ---------------------------------------------------------------------------
  // Transactions
  // ---------------------------------------------------------------------------

  abstract getTransaction(
    txHash: string,
    networkId: string,
  ): Promise<TxDetails>;

  abstract getHistory(
    address: string,
    networkId: string,
    cursor?: string,
    limit?: number,
  ): Promise<TxHistoryPage>;

  // ---------------------------------------------------------------------------
  // Name service (optional — capability-gated)
  // ---------------------------------------------------------------------------

  resolveName?(networkId: string, name: string): Promise<string | null>;
  lookupAddress?(networkId: string, address: string): Promise<string | null>;
  getNameProfile?(networkId: string, name: string): Promise<NameProfile | null>;

  // ---------------------------------------------------------------------------
  // Trust lines (optional — XRPL-class, capability-gated)
  // ---------------------------------------------------------------------------

  getTrustLines?(address: string, networkId: string): Promise<TrustLine[]>;
  setTrustLine?(
    params: SetTrustLineParams,
    user: CryptoUser,
  ): Promise<BroadcastResult>;

  // ---------------------------------------------------------------------------
  // Checks (optional — XRPL-class, capability-gated)
  // ---------------------------------------------------------------------------

  createCheck?(
    params: CreateCheckParams,
    user: CryptoUser,
  ): Promise<BroadcastResult>;
  cashCheck?(
    params: CashCheckParams,
    user: CryptoUser,
  ): Promise<BroadcastResult>;

  // ---------------------------------------------------------------------------
  // Capability helpers
  // ---------------------------------------------------------------------------

  async supportsCapability(
    networkId: string,
    capability: keyof NetworkInfo["capabilities"],
  ): Promise<boolean> {
    const network = await this.getNetwork(networkId);
    return Boolean(network.capabilities[capability]);
  }

  protected assertCapability(
    network: NetworkInfo,
    capability: keyof NetworkInfo["capabilities"],
  ): void {
    if (!network.capabilities[capability]) {
      throw new Error(
        `UNSUPPORTED_OPERATION: ${capability} is not supported on ${network.networkId}`,
      );
    }
  }
}
