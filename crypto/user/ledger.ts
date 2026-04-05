import { CryptoUser } from "./base";

/**
 * LedgerUser — delegates signing to a Ledger hardware wallet.
 *
 * This is a stub. Wire up the Ledger SDK by implementing the abstract methods:
 *  - React Native: @ledgerhq/react-native-hw-transport-ble (BLE)
 *  - Web: @ledgerhq/hw-transport-webusb or hw-transport-webhid
 *  - App: @ledgerhq/hw-app-eth for EVM signing
 *
 * Private keys never leave the device — exposePrivateKey() always returns
 * undefined. Providers that require a private key (e.g. ApiProvider trust-line
 * calls) are not compatible with Ledger unless the API supports hardware signing.
 *
 * Usage:
 *   const transport = await TransportBLE.open(device);
 *   const user = new LedgerUser("0xWalletAddress", transport, "m/44'/60'/0'/0/0");
 *   const result = await provider.send(params, user);
 */
export class LedgerUser extends CryptoUser {
  readonly type = "ledger";

  /**
   * @param address        - The wallet address on the Ledger.
   * @param transport      - An open Ledger transport (BLE, USB, etc.).
   *                         Pass `null` until connected — calls will throw.
   * @param derivationPath - BIP44 derivation path (default: ETH account 0).
   */
  constructor(
    private readonly address: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly transport: any | null = null,
    readonly derivationPath: string = "m/44'/60'/0'/0/0",
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
    if (!this.transport) {
      throw new Error(
        "[LedgerUser]: Ledger transport not connected. Open a transport first.",
      );
    }
    // TODO: wire up @ledgerhq/hw-app-eth:
    //
    //   import AppEth from "@ledgerhq/hw-app-eth";
    //   const eth = new AppEth(this.transport);
    //   const tx = JSON.parse(_unsignedTx);
    //   const { v, r, s } = await eth.signTransaction(this.derivationPath, serialisedTx, null);
    //   return Transaction.from({ ...tx, v, r, s }).serialized;
    throw new Error(
      "[LedgerUser]: signTransaction not yet implemented. Wire up @ledgerhq/hw-app-eth here.",
    );
  }

  async signMessage(_message: string): Promise<string> {
    if (!this.transport) {
      throw new Error("[LedgerUser]: Ledger transport not connected.");
    }
    // TODO: wire up @ledgerhq/hw-app-eth:
    //
    //   import AppEth from "@ledgerhq/hw-app-eth";
    //   const eth = new AppEth(this.transport);
    //   const { v, r, s } = await eth.signPersonalMessage(this.derivationPath, Buffer.from(_message).toString("hex"));
    //   return "0x" + r + s + v.toString(16);
    throw new Error(
      "[LedgerUser]: signMessage not yet implemented. Wire up @ledgerhq/hw-app-eth here.",
    );
  }

  // Private key never leaves the Ledger device.
  exposePrivateKey(): undefined {
    return undefined;
  }
}
