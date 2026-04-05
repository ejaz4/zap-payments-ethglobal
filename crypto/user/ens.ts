import { EthersClient } from "@/app/profiles/client";
import type { NameProfile } from "../types";
import type { CryptoProvider } from "../provider/base";
import { EvmProvider } from "../provider/evm";
import { EvmUser } from "./evm";

/**
 * ENSUser — an EVM user with ENS name resolution capabilities.
 *
 * Extends EvmUser so it can still sign transactions normally.
 * Additionally exposes helpers for resolving ENS names and fetching profiles,
 * which are useful in the send-flow (resolve recipient name before building tx).
 *
 * Usage:
 *   const user = new ENSUser("0xMyAddress");
 *   const recipientAddress = await user.resolveName("vitalik.eth", provider);
 *   const result = await provider.send({ ...params, to: recipientAddress }, user);
 */
export class ENSUser extends EvmUser {
  readonly type = "ens";

  /**
   * Resolve an ENS name to an address using the given provider.
   * Falls back to returning the input as-is if it looks like a hex address.
   */
  async resolveName(
    name: string,
    provider: CryptoProvider,
    networkId: string = "eth-mainnet",
  ): Promise<string | null> {
    // If already a valid address, skip resolution
    if (EthersClient.isValidAddress(name)) {
      return EthersClient.toChecksumAddress(name);
    }

    if (provider.resolveName) {
      return provider.resolveName(networkId, name);
    }

    // Fallback: use ethers.js directly (mainnet only)
    const evmProvider = new EvmProvider();
    return evmProvider.resolveName(networkId, name);
  }

  /**
   * Reverse-lookup an address to its ENS name.
   */
  async lookupAddress(
    address: string,
    provider: CryptoProvider,
    networkId: string = "eth-mainnet",
  ): Promise<string | null> {
    if (provider.lookupAddress) {
      return provider.lookupAddress(networkId, address);
    }
    const evmProvider = new EvmProvider();
    return evmProvider.lookupAddress(networkId, address);
  }

  /**
   * Fetch the full ENS profile for a name (avatar, description, url, etc.).
   */
  async getProfile(
    name: string,
    provider: CryptoProvider,
    networkId: string = "eth-mainnet",
  ): Promise<NameProfile | null> {
    if (provider.getNameProfile) {
      return provider.getNameProfile(networkId, name);
    }
    const evmProvider = new EvmProvider();
    return evmProvider.getNameProfile(networkId, name);
  }
}
