/**
 * DynamicUser — CryptoUser that signs via the Dynamic embedded wallet.
 *
 * Unlike EvmUser (which loads a raw private key), DynamicUser delegates
 * all signing to the Dynamic SDK's MPC signer. The private key never
 * leaves Dynamic's secure infrastructure.
 */

import { VersionedTransaction } from "@solana/web3.js";
import { dynamicClient } from "../dynamic/client";
import { CryptoUser } from "./base";

export class DynamicUser extends CryptoUser {
  readonly type: string = "dynamic";

  private readonly address: string;

  constructor(address: string) {
    super();
    this.address = address;
  }

  async getAddress(): Promise<string> {
    return this.address;
  }

  /**
   * Sign a Solana transaction via the Dynamic MPC signer.
   *
   * @param unsignedTx - Base64-serialised VersionedTransaction (from DynamicProvider.buildTransfer)
   * @param _networkId - Not used for Dynamic signing (SDK handles routing)
   */
  async signTransaction(
    unsignedTx: string,
    _networkId: string,
  ): Promise<string> {
    const wallet = this._getWallet();
    if (!wallet) {
      throw new Error(
        "[DynamicUser] No Dynamic wallet found. Complete Dynamic onboarding first.",
      );
    }

    const signer = dynamicClient.solana.getSigner({ wallet });
    const txBytes = Buffer.from(unsignedTx, "base64");
    const transaction = VersionedTransaction.deserialize(txBytes);

    const signed = await signer.signTransaction(transaction);
    return Buffer.from(signed.serialize()).toString("base64");
  }

  /**
   * Sign a raw message via the Dynamic wallet.
   */
  async signMessage(message: string): Promise<string> {
    const wallet = this._getWallet();
    if (!wallet) {
      throw new Error(
        "[DynamicUser] No Dynamic wallet found. Complete Dynamic onboarding first.",
      );
    }

    const signer = dynamicClient.solana.getSigner({ wallet });
    const encoded = new TextEncoder().encode(message);
    const result = await signer.signMessage(encoded);
    // signature may be a Uint8Array or string depending on Dynamic SDK version
    if (typeof result.signature === "string") return result.signature;
    return Buffer.from(result.signature as Uint8Array).toString("hex");
  }

  /**
   * Dynamic wallets are MPC-secured — private keys are never exposed.
   */
  exposePrivateKey(): string | undefined {
    return undefined;
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private _getWallet() {
    const wallets = dynamicClient.wallets.userWallets;
    // Match by address first, then fall back to any SVM wallet
    return (
      wallets.find((w: any) => w.address === this.address) ??
      wallets.find((w: any) => w.chain === "SOL" || w.chain === "SVM") ??
      null
    );
  }
}
