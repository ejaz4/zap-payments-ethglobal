import { CryptoUser } from "./base";

/**
 * PrivyUser — delegates signing to a Privy embedded wallet.
 *
 * This is a stub. Wire up the Privy SDK by implementing the abstract methods:
 *  - https://docs.privy.io/
 *
 * Privy wallets live in a secure iframe/enclave, so private keys are never
 * exposed to the app — exposePrivateKey() always returns undefined here.
 *
 * Usage:
 *   const user = new PrivyUser(privyClient, "0xWalletAddress");
 *   const result = await provider.send(params, user);
 */
export class PrivyUser extends CryptoUser {
  readonly type = "privy";

  /**
   * @param address - The wallet address managed by Privy.
   * @param signer  - The Privy signer object (type depends on Privy SDK version).
   *                  Pass `null` until you connect Privy — calls will throw.
   */
  constructor(
    private readonly address: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly signer: any | null = null,
  ) {
    super();
  }

  async getAddress(): Promise<string> {
    return this.address;
  }

  async signTransaction(
    _unsignedTx: string,
    _networkId: string,
  ): Promise<string> {
    if (!this.signer) {
      throw new Error(
        "[PrivyUser]: Privy signer not connected. Pass the signer to the constructor.",
      );
    }
    // TODO: call the Privy signer to sign the transaction.
    // The exact API depends on which Privy SDK you're using:
    //   @privy-io/react-auth: signer.signTransaction(tx)
    //   @privy-io/server-auth: different interface
    throw new Error(
      "[PrivyUser]: signTransaction not yet implemented. Wire up your Privy SDK here.",
    );
  }

  async signMessage(_message: string): Promise<string> {
    if (!this.signer) {
      throw new Error("[PrivyUser]: Privy signer not connected.");
    }
    // TODO: call the Privy signer to sign the message.
    throw new Error(
      "[PrivyUser]: signMessage not yet implemented. Wire up your Privy SDK here.",
    );
  }

  // Private key is never exposed for Privy wallets.
  exposePrivateKey(): undefined {
    return undefined;
  }
}
