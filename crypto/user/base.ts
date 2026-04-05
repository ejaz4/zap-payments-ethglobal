/**
 * CryptoUser — abstract base class representing a wallet identity and signer.
 *
 * Concrete implementations:
 *  - EvmUser      — signs with a raw private key via ethers.js
 *  - ENSUser      — extends EvmUser, adds ENS name resolution
 *  - PrivyUser    — delegates signing to Privy embedded wallet
 *  - LedgerUser   — delegates signing to Ledger hardware wallet
 *
 * Providers accept any CryptoUser so features like ENS, Privy, and Ledger are
 * plug-and-play without changing provider code.
 */
export abstract class CryptoUser {
  /** Identifies the user type (e.g. "evm", "ens", "privy", "ledger"). */
  abstract readonly type: string;

  /** Returns the user's on-chain address. */
  abstract getAddress(): Promise<string>;

  /**
   * Sign an unsigned transaction payload and return the signed hex string.
   *
   * @param unsignedTx - Opaque string produced by CryptoProvider.buildTransfer().
   *   EvmProvider serialises a JSON TransactionRequest; ApiProvider may use a
   *   different format. Users must handle the format their provider produces.
   * @param networkId  - Canonical network identifier (e.g. "eth-mainnet").
   */
  abstract signTransaction(
    unsignedTx: string,
    networkId: string,
  ): Promise<string>;

  /**
   * Sign a raw message (personal_sign style).
   */
  abstract signMessage(message: string): Promise<string>;

  /**
   * Optionally expose the private key to the provider for server-side signing
   * (e.g. ApiProvider trust-line / check calls).
   *
   * Return undefined if private key exposure is not supported (Ledger, Privy).
   */
  exposePrivateKey?(): string | undefined;
}
