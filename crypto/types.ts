/**
 * Shared types for the crypto provider/user abstraction layer.
 * Aligned with the Universal Multi-Chain Wallet API schema (API.md).
 */

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

export interface NetworkCapabilities {
  createKeypair: boolean;
  importPrivateKey: boolean;
  importMnemonic: boolean;
  supportsNativeTransfers: boolean;
  supportsTokenTransfers: boolean;
  supportsContracts: boolean;
  supportsTransactionSimulation: boolean;
  supportsHistory: boolean;
  supportsNameService: boolean;
  supportsTrustLines: boolean;
  supportsChecks: boolean;
}

export interface NetworkRpc {
  publicRpcUrls: string[];
  explorerTxBaseUrl: string;
}

export interface NetworkInfo {
  networkId: string; // e.g. "eth-mainnet", "polygon-mainnet"
  family: "evm" | "xrpl" | string;
  chainId: string; // numeric string for EVM, name for others
  displayName: string;
  symbol: string;
  decimals: number;
  isTestnet: boolean;
  rpc: NetworkRpc;
  capabilities: NetworkCapabilities;
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

export type AssetKind = "native" | "token";

export interface AssetRef {
  kind: AssetKind;
  /** Required when kind = "token". Token contract address or identifier. */
  tokenRef?: string;
}

export interface BalanceResult {
  networkId: string;
  address: string;
  assetId: string; // "native:<networkId>" or "token:<networkId>:<tokenRef>"
  amount: string; // decimal string
  amountAtomic: string; // integer string (smallest unit)
  decimals: number;
  symbol: string;
}

// ---------------------------------------------------------------------------
// Transfers
// ---------------------------------------------------------------------------

export type FeePreference = "slow" | "normal" | "fast" | "custom";

export interface TransferParams {
  networkId: string;
  from: string;
  to: string;
  asset: AssetRef;
  amount: string;
  memo?: string;
  feePreference?: FeePreference;
}

/** Unsigned transaction returned by buildTransfer. Opaque to callers — pass it to CryptoUser.signTransaction. */
export interface UnsignedTxResult {
  networkId: string;
  /** JSON-serialised transaction data (provider-specific format). */
  unsignedTx: string;
  estimatedFeeAtomic?: string;
}

export type TxStatus =
  | "submitted"
  | "pending"
  | "confirmed"
  | "failed"
  | "dropped";

export interface BroadcastResult {
  txHash: string;
  status: TxStatus;
  explorerUrl?: string;
}

// ---------------------------------------------------------------------------
// Transaction details / history
// ---------------------------------------------------------------------------

export interface TxDetails {
  txHash: string;
  networkId: string;
  status: TxStatus;
  from?: string;
  to?: string;
  value?: string;
  fee?: string;
  blockNumber?: number;
  timestamp?: number;
  explorerUrl?: string;
}

export interface TxHistoryItem {
  txHash: string;
  networkId: string;
  status: TxStatus;
  from: string;
  to: string;
  value: string;
  asset: AssetRef;
  timestamp: number;
  explorerUrl?: string;
}

export interface TxHistoryPage {
  items: TxHistoryItem[];
  nextCursor?: string;
}

// ---------------------------------------------------------------------------
// Name service
// ---------------------------------------------------------------------------

export interface NameProfile {
  name: string;
  address: string;
  avatar?: string;
  description?: string;
  url?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Trust lines (XRPL-class)
// ---------------------------------------------------------------------------

export interface TrustLine {
  currency: string;
  issuer: string;
  limit: string;
  balance: string;
}

export interface SetTrustLineParams {
  networkId: string;
  currency: string;
  issuer: string;
  limit: string;
}

// ---------------------------------------------------------------------------
// Checks (XRPL-class)
// ---------------------------------------------------------------------------

export interface CreateCheckParams {
  networkId: string;
  destination: string;
  sendMax: { asset: AssetRef; amount: string };
  invoiceId?: string;
  expireAfterSeconds?: number;
}

export interface CashCheckParams {
  networkId: string;
  checkId: string;
  amount: { asset: AssetRef; amount: string };
}

// ---------------------------------------------------------------------------
// API response envelope (matches API.md)
// ---------------------------------------------------------------------------

export interface ApiMeta {
  requestId: string;
  timestamp: string;
}

export interface ApiOkResponse<T> {
  ok: true;
  data: T;
  meta: ApiMeta;
}

export interface ApiErrorResponse {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta: ApiMeta;
}

export type ApiResponse<T> = ApiOkResponse<T> | ApiErrorResponse;
