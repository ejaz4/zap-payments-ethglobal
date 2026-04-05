/**
 * Crypto abstraction layer — providers and users.
 *
 * Quick-start:
 *
 *   import { createProvider, createUser } from "@/crypto";
 *
 *   // EVM chains, local signing
 *   const provider = createProvider("evm");
 *   const user     = createUser("evm", "0xYourAddress");
 *
 *   // External API, supports every chain the API backend implements
 *   const provider = createProvider("api");
 *   const user     = createUser("evm", "0xYourAddress");
 *
 *   // ENS-aware user (EVM + ENS resolution)
 *   const user = createUser("ens", "0xYourAddress");
 *   const to   = await (user as ENSUser).resolveName("vitalik.eth", provider);
 *
 * See crypto/provider/base.ts and crypto/user/base.ts for the full API.
 */

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export type { CryptoProvider } from "./provider/base";
export { ApiProvider } from "./provider/api";
export { EvmProvider } from "./provider/evm";

export type { CryptoUser } from "./user/base";
export { ENSUser } from "./user/ens";
export { EvmUser } from "./user/evm";
export { LedgerUser } from "./user/ledger";
export { PrivyUser } from "./user/privy";

export type {
  ApiErrorResponse,
  ApiMeta,
  ApiOkResponse,
  ApiResponse,
  AssetKind,
  AssetRef,
  BalanceResult,
  BroadcastResult,
  CashCheckParams,
  CreateCheckParams,
  FeePreference,
  NameProfile,
  NetworkCapabilities,
  NetworkInfo,
  NetworkRpc,
  SetTrustLineParams,
  TransferParams,
  TrustLine,
  TxDetails,
  TxHistoryItem,
  TxHistoryPage,
  TxStatus,
  UnsignedTxResult,
} from "./types";

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

import { ApiProvider } from "./provider/api";
import { CryptoProvider } from "./provider/base";
import { EvmProvider } from "./provider/evm";
import { CryptoUser } from "./user/base";
import { ENSUser } from "./user/ens";
import { EvmUser } from "./user/evm";
import { LedgerUser } from "./user/ledger";
import { PrivyUser } from "./user/privy";

export type ProviderType = "evm" | "api";
export type UserType = "evm" | "ens" | "privy" | "ledger";

/**
 * Create a CryptoProvider by type.
 *
 * @param type    - "evm" for local ethers.js, "api" for external REST API.
 * @param baseUrl - Optional base URL override for ApiProvider.
 */
export function createProvider(
  type: ProviderType,
  baseUrl?: string,
): CryptoProvider {
  switch (type) {
    case "evm":
      return new EvmProvider();
    case "api":
      return new ApiProvider(baseUrl);
    default:
      throw new Error(`[crypto] Unknown provider type: ${type}`);
  }
}

/**
 * Create a CryptoUser by type.
 *
 * @param type    - User type: "evm", "ens", "privy", or "ledger".
 * @param address - The wallet address.
 * @param opts    - Additional options (signer for Privy, transport for Ledger).
 */
export function createUser(
  type: UserType,
  address: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  opts?: { signer?: any; transport?: any; derivationPath?: string },
): CryptoUser {
  switch (type) {
    case "evm":
      return new EvmUser(address);
    case "ens":
      return new ENSUser(address);
    case "privy":
      return new PrivyUser(address, opts?.signer ?? null);
    case "ledger":
      return new LedgerUser(
        address,
        opts?.transport ?? null,
        opts?.derivationPath,
      );
    default:
      throw new Error(`[crypto] Unknown user type: ${type}`);
  }
}
