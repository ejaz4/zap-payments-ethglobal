import type {
  ApiOkResponse,
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
  TxStatus,
  UnsignedTxResult,
} from "../types";
import type { CryptoUser } from "../user/base";
import { CryptoProvider } from "./base";

/**
 * ApiProvider — delegates all blockchain operations to an external REST API
 * that follows the Universal Multi-Chain Wallet API schema (see API.md).
 *
 * Set EXPO_PUBLIC_API_URL in your .env to point at your backend.
 *
 * This provider supports every chain the API supports, including EVM chains,
 * XRPL, and anything else the API backend implements.
 */
export class ApiProvider extends CryptoProvider {
  readonly type = "api";

  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    super();
    const url =
      baseUrl ??
      (process.env["EXPO_PUBLIC_API_URL"] as string | undefined) ??
      "";
    if (!url) {
      throw new Error(
        "[ApiProvider] No API base URL provided. Set one in Settings → API or via EXPO_PUBLIC_API_URL.",
      );
    }
    this.baseUrl = url.replace(/\/$/, ""); // strip trailing slash
  }

  // ---------------------------------------------------------------------------
  // HTTP helper
  // ---------------------------------------------------------------------------

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<T> {
    const url = `${this.baseUrl}/v1${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (idempotencyKey) {
      headers["Idempotency-Key"] = idempotencyKey;
    }

    const bodyStr = body !== undefined ? JSON.stringify(body) : undefined;

    console.log(`[ApiProvider] --> ${method} ${url}`);
    if (body !== undefined) {
      // Redact private keys from logs
      const safeBody = body && typeof body === "object"
        ? Object.fromEntries(
            Object.entries(body as Record<string, unknown>).map(([k, v]) =>
              k === "privateKey" ? [k, "<redacted>"] : [k, v],
            ),
          )
        : body;
      console.log(`[ApiProvider]     payload:`, JSON.stringify(safeBody, null, 2));
    }

    const res = await fetch(url, {
      method,
      headers,
      body: bodyStr,
    });

    const text = await res.text();
    console.log(`[ApiProvider] <-- ${res.status} ${url}`);
    console.log(`[ApiProvider]     response:`, text.slice(0, 2000));

    let json: ApiOkResponse<T> | { ok: false; error: { code: string; message: string } };
    try {
      json = JSON.parse(text) as ApiOkResponse<T> | { ok: false; error: { code: string; message: string } };
    } catch {
      throw new Error(`[ApiProvider] HTTP ${res.status}: ${text.slice(0, 300)}`);
    }

    if (!json.ok) {
      const err = (json as { ok: false; error: { code: string; message: string } }).error;
      throw new Error(`[ApiProvider] ${err?.code ?? res.status}: ${err?.message ?? text}`);
    }

    return (json as ApiOkResponse<T>).data;
  }

  private get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  private post<T>(path: string, body: unknown, idempotencyKey?: string): Promise<T> {
    return this.request<T>("POST", path, body, idempotencyKey);
  }

  // ---------------------------------------------------------------------------
  // Keypair generation
  // ---------------------------------------------------------------------------

  /**
   * Ask the API to generate a fresh keypair for the given network.
   * Returns the address, public key, and private key (hex / base58 depending on chain).
   * The caller is responsible for storing the private key securely.
   */
  async createKeypair(networkId: string, curve?: string): Promise<{
    address: string;
    publicKey: string;
    privateKey: string;
    mnemonic?: string;
    /** Dynamic wallet ID — required for signing in strict custody mode. */
    walletId?: string;
  }> {
    return this.post("/wallets:keypair", { networkId, curve: curve ?? null });
  }

  /**
   * Import a private key into Dynamic custody.
   * Returns the address, public key, and Dynamic wallet ID.
   */
  async importPrivateKey(networkId: string, privateKey: string): Promise<{
    address: string;
    publicKey: string;
    walletId?: string;
  }> {
    return this.post("/wallets:import-private-key", { networkId, privateKey });
  }

  // ---------------------------------------------------------------------------
  // Network discovery
  // ---------------------------------------------------------------------------

  async getNetworks(): Promise<NetworkInfo[]> {
    // API wraps the list: { networks: [...] }
    const data = await this.get<{ networks: NetworkInfo[] }>("/networks");
    return data.networks;
  }

  async getNetwork(networkId: string): Promise<NetworkInfo> {
    return this.get<NetworkInfo>(`/networks/${networkId}`);
  }

  // ---------------------------------------------------------------------------
  // Balances
  // ---------------------------------------------------------------------------

  async getNativeBalance(
    address: string,
    networkId: string,
  ): Promise<BalanceResult> {
    // API doesn't return assetId — construct it client-side
    const data = await this.get<Omit<BalanceResult, "assetId">>(
      `/balances/native?networkId=${networkId}&address=${address}`,
    );
    return { ...data, assetId: `native:${networkId}` };
  }

  async getTokenBalance(
    address: string,
    networkId: string,
    tokenRef: string,
  ): Promise<BalanceResult> {
    // API doesn't return assetId — construct it client-side
    const data = await this.get<Omit<BalanceResult, "assetId">>(
      `/balances/token?networkId=${networkId}&address=${address}&tokenRef=${tokenRef}`,
    );
    return { ...data, assetId: `token:${networkId}:${tokenRef}` };
  }

  async getTokenBalances(
    address: string,
    networkId: string,
  ): Promise<BalanceResult[]> {
    // API returns { networkId, address, tokenList, balances: [...] }
    // Each balance item is a token-level object, not a full BalanceResult
    const data = await this.get<{
      networkId: string;
      address: string;
      tokenList: string;
      balances: Array<{
        symbol: string;
        name: string;
        amount: string;
        amountAtomic: string;
        decimals: number;
        address: string;
        logoUrl: string | null;
        isStablecoin: boolean;
      }>;
    }>(`/balances/tokens?networkId=${networkId}&address=${address}`);
    return data.balances.map((b) => ({
      networkId,
      address,
      assetId: `token:${networkId}:${b.address}`,
      amount: b.amount,
      amountAtomic: b.amountAtomic,
      decimals: b.decimals,
      symbol: b.symbol,
    }));
  }

  // ---------------------------------------------------------------------------
  // Transfer lifecycle
  // ---------------------------------------------------------------------------

  async buildTransfer(params: TransferParams): Promise<UnsignedTxResult> {
    // TransferParams uses { from, to, asset: { tokenRef? } }
    // but the API expects { from_address, to_address, tokenRef }
    return this.post<UnsignedTxResult>("/transfers:build", {
      networkId: params.networkId,
      from_address: params.from,
      to_address: params.to,
      amount: params.amount,
      tokenRef: params.asset.tokenRef ?? null,
      memo: params.memo ?? null,
      feePreference: params.feePreference ?? "normal",
    });
  }

  /**
   * Sign an unsigned transaction via the API.
   * In Dynamic custody mode, the API signs using the feePayer/senderAddress
   * from the unsignedTx — the privateKey may be omitted for Dynamic-managed wallets.
   */
  async signTransfer(
    networkId: string,
    unsignedTx: string,
    privateKey?: string,
  ): Promise<{ signedTx: string }> {
    return this.post<{ signedTx: string }>("/transfers:sign", {
      networkId,
      unsignedTx,
      privateKey: privateKey ?? "",
    });
  }

  async broadcastTransfer(
    signedTx: string,
    networkId: string,
  ): Promise<BroadcastResult> {
    return this.post<BroadcastResult>(
      "/transfers:broadcast",
      { networkId, signedTx },
      `broadcast-${signedTx.slice(0, 16)}`,
    );
  }

  /**
   * One-shot build + sign + broadcast.
   * Calls buildTransfer, signs with the user, then broadcasts.
   */
  async send(
    params: TransferParams,
    user: CryptoUser,
  ): Promise<BroadcastResult> {
    const built = await this.buildTransfer(params);
    const signedTx = await user.signTransaction(built.unsignedTx, params.networkId);
    return this.broadcastTransfer(signedTx, params.networkId);
  }

  /**
   * One-shot build + sign + broadcast server-side.
   * For Dynamic-managed wallets in strict custody mode, privateKey can be
   * omitted — the API signs using the from_address's Dynamic custody context.
   */
  async sendWithKey(
    from: string,
    to: string,
    amount: string,
    networkId: string,
    privateKey?: string,
    tokenRef?: string,
    memo?: string,
  ): Promise<BroadcastResult> {
    return this.post<BroadcastResult>("/transfers:send", {
      networkId,
      from_address: from,
      to_address: to,
      amount,
      privateKey: privateKey ?? "",
      tokenRef: tokenRef ?? null,
      memo: memo ?? null,
    });
  }

  /**
   * Preferred split transfer flow for Dynamic-managed wallets:
   * build → sign (via Dynamic custody) → broadcast.
   * Falls back to sending privateKey if provided.
   */
  async sendSplit(
    from: string,
    to: string,
    amount: string,
    networkId: string,
    privateKey?: string,
    tokenRef?: string,
    memo?: string,
  ): Promise<BroadcastResult> {
    const built = await this.buildTransfer({
      networkId,
      from,
      to,
      asset: tokenRef ? { kind: "token", tokenRef } : { kind: "native" },
      amount,
      memo,
    });
    const { signedTx } = await this.signTransfer(
      networkId,
      built.unsignedTx,
      privateKey,
    );
    return this.broadcastTransfer(signedTx, networkId);
  }

  // ---------------------------------------------------------------------------
  // Transactions
  // ---------------------------------------------------------------------------

  async getTransaction(txHash: string, networkId: string): Promise<TxDetails> {
    return this.get<TxDetails>(`/transactions/${txHash}?networkId=${networkId}`);
  }

  async getHistory(
    address: string,
    networkId: string,
    cursor?: string,
    limit = 50,
  ): Promise<TxHistoryPage> {
    const params = new URLSearchParams({
      networkId,
      address,
      limit: String(limit),
    });
    if (cursor) params.set("cursor", cursor);
    // API returns { networkId, address, transactions: [...] }
    // Each item uses "amount" (not "value") and has tokenRef instead of asset
    const data = await this.get<{
      networkId: string;
      address: string;
      transactions: Array<{
        txHash: string;
        type: string;
        from: string;
        to: string;
        amount: string;
        symbol: string;
        timestamp: number;
        status: TxStatus;
        explorerUrl?: string;
        tokenRef?: string;
      }>;
    }>(`/transactions:history?${params}`);
    return {
      items: data.transactions.map((tx) => ({
        txHash: tx.txHash,
        networkId,
        status: tx.status,
        from: tx.from,
        to: tx.to,
        value: tx.amount,
        asset: tx.tokenRef
          ? { kind: "token" as const, tokenRef: tx.tokenRef }
          : { kind: "native" as const },
        timestamp: tx.timestamp,
        explorerUrl: tx.explorerUrl,
      })),
      nextCursor: undefined,
    };
  }

  // ---------------------------------------------------------------------------
  // Name service
  // ---------------------------------------------------------------------------

  async resolveName(networkId: string, name: string): Promise<string | null> {
    try {
      const data = await this.get<{ address: string }>(
        `/names:resolve?networkId=${networkId}&name=${encodeURIComponent(name)}`,
      );
      return data.address ?? null;
    } catch {
      return null;
    }
  }

  async lookupAddress(
    networkId: string,
    address: string,
  ): Promise<string | null> {
    try {
      const data = await this.get<{ name: string }>(
        `/names:lookup?networkId=${networkId}&address=${address}`,
      );
      return data.name ?? null;
    } catch {
      return null;
    }
  }

  async getNameProfile(
    networkId: string,
    name: string,
  ): Promise<NameProfile | null> {
    try {
      // API returns { name, resolvedAddress, profile: {...}, supported }
      // but NameProfile expects { name, address, avatar?, description? }
      const data = await this.get<{
        networkId: string;
        name: string;
        resolvedAddress: string | null;
        profile: {
          displayName: string;
          avatar: string | null;
          description: string | null;
          links: unknown[];
        };
        supported: boolean;
      }>(`/names:profile?networkId=${networkId}&name=${encodeURIComponent(name)}`);
      if (!data.supported || !data.resolvedAddress) return null;
      return {
        name: data.name,
        address: data.resolvedAddress,
        avatar: data.profile.avatar ?? undefined,
        description: data.profile.description ?? undefined,
      };
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Prices
  // ---------------------------------------------------------------------------

  async getPrices(symbols: string[], currency = "usd"): Promise<Record<string, number>> {
    const data = await this.get<{ prices: Record<string, number>; currency: string }>(
      `/prices?symbols=${symbols.join(",")}&currency=${currency}`,
    );
    return data.prices;
  }

  // ---------------------------------------------------------------------------
  // Trust lines
  // ---------------------------------------------------------------------------

  async getTrustLines(address: string, networkId: string): Promise<TrustLine[]> {
    // API wraps the list: { trustLines: [...], supported, reason }
    const data = await this.get<{
      trustLines: TrustLine[];
      supported: boolean;
      reason?: string;
    }>(`/trust-lines?networkId=${networkId}&address=${address}`);
    return data.trustLines ?? [];
  }

  async setTrustLine(
    params: SetTrustLineParams,
    user: CryptoUser,
  ): Promise<BroadcastResult> {
    const address = await user.getAddress();
    const privateKey = user.exposePrivateKey?.();
    const data = await this.post<{ supported: boolean; reason?: string } | BroadcastResult>(
      "/trust-lines:set",
      { ...params, address, privateKey },
      `trust-line-${params.networkId}-${params.currency}-${address}`,
    );
    if ("supported" in data && !data.supported) {
      throw new Error(`[ApiProvider] UNSUPPORTED: ${data.reason ?? "Trust lines not supported on this network"}`);
    }
    return data as BroadcastResult;
  }

  // ---------------------------------------------------------------------------
  // Checks
  // ---------------------------------------------------------------------------

  async createCheck(
    params: CreateCheckParams,
    user: CryptoUser,
  ): Promise<BroadcastResult> {
    const address = await user.getAddress();
    const privateKey = user.exposePrivateKey?.();
    const data = await this.post<{ supported: boolean; reason?: string } | BroadcastResult>(
      "/checks:create",
      { ...params, address, privateKey },
      `check-create-${params.networkId}-${address}-${Date.now()}`,
    );
    if ("supported" in data && !data.supported) {
      throw new Error(`[ApiProvider] UNSUPPORTED: ${data.reason ?? "Checks not supported on this network"}`);
    }
    return data as BroadcastResult;
  }

  async cashCheck(
    params: CashCheckParams,
    user: CryptoUser,
  ): Promise<BroadcastResult> {
    const address = await user.getAddress();
    const privateKey = user.exposePrivateKey?.();
    const data = await this.post<{ supported: boolean; reason?: string } | BroadcastResult>(
      "/checks:cash",
      { ...params, address, privateKey },
      `check-cash-${params.networkId}-${params.checkId}`,
    );
    if ("supported" in data && !data.supported) {
      throw new Error(`[ApiProvider] UNSUPPORTED: ${data.reason ?? "Checks not supported on this network"}`);
    }
    return data as BroadcastResult;
  }
}
