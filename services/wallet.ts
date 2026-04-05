import { ChainId, EthersClient } from "@/app/profiles/client";
import { ApiProvider } from "@/crypto/provider/api";
import { useTokenStore } from "@/store/tokens";
import { useProviderStore } from "@/store/provider";
import {
  SOLANA_NETWORK_IDS,
  TokenBalance,
  Transaction,
  getSolanaChainKey,
  useWalletStore,
} from "@/store/wallet";
import { HDNodeWallet, Mnemonic, Wallet } from "ethers";
import * as ExpoCrypto from "expo-crypto";
import { SecureStorage } from "./storage";

/**
 * Default HD derivation path for Ethereum
 */
const DEFAULT_HD_PATH = "m/44'/60'/0'/0";

/**
 * WalletService - Core wallet functionality
 * Based on Rainbow's wallet model patterns
 */
export class WalletService {
  /**
   * Generate a new mnemonic phrase using expo-crypto
   * This bypasses ethers' crypto requirement
   */
  static generateMnemonic(): string {
    // Generate 16 bytes (128 bits) of entropy for 12-word mnemonic
    const entropy = ExpoCrypto.getRandomBytes(16);
    const mnemonic = Mnemonic.fromEntropy(entropy);
    return mnemonic.phrase;
  }

  /**
   * Validate a mnemonic phrase
   */
  static isValidMnemonic(mnemonic: string): boolean {
    try {
      Mnemonic.fromPhrase(mnemonic);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate a private key
   */
  static isValidPrivateKey(privateKey: string): boolean {
    try {
      const key = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
      new Wallet(key);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a new wallet from mnemonic
   * Based on Rainbow's deriveAccountFromMnemonic
   */
  static async createWallet(
    mnemonic: string,
    index: number = 0,
  ): Promise<{ wallet: HDNodeWallet; address: string } | null> {
    try {
      const hdWallet = HDNodeWallet.fromPhrase(
        mnemonic,
        undefined,
        `${DEFAULT_HD_PATH}/${index}`,
      );
      return {
        wallet: hdWallet,
        address: hdWallet.address,
      };
    } catch (error) {
      console.error("[WalletService]: Failed to create wallet", error);
      return null;
    }
  }

  /**
   * Import wallet from private key
   * Based on Rainbow's deriveAccountFromPrivateKey
   */
  static async importFromPrivateKey(
    privateKey: string,
  ): Promise<{ wallet: Wallet; address: string } | null> {
    try {
      const key = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
      const wallet = new Wallet(key);
      return {
        wallet,
        address: wallet.address,
      };
    } catch (error) {
      console.error("[WalletService]: Failed to import wallet", error);
      return null;
    }
  }

  /**
   * Initialize wallet - creates new or loads existing
   */
  static async initializeWallet(): Promise<boolean> {
    const store = useWalletStore.getState();

    try {
      store.setLoading(true);
      store.setError(null);

      // Check if wallet exists
      const isInitialized = await SecureStorage.isWalletInitialized();

      if (isInitialized) {
        // Load existing wallet
        const mnemonic = await SecureStorage.loadMnemonic();
        if (mnemonic && store.accounts.length === 0) {
          // Derive first account
          const result = await this.createWallet(mnemonic, 0);
          if (result) {
            store.addAccount({
              address: result.address,
              name: "Wallet 1",
              index: 0,
              isImported: false,
            });
          }
        }
        store.setStatus("unlocked");
      } else {
        store.setStatus("uninitialized");
      }

      return true;
    } catch (error) {
      console.error("[WalletService]: Initialization failed", error);
      store.setError("Failed to initialize wallet");
      return false;
    } finally {
      store.setLoading(false);
    }
  }

  /**
   * Create new wallet with mnemonic
   */
  static async createNewWallet(): Promise<{
    mnemonic: string;
    address: string;
  } | null> {
    const store = useWalletStore.getState();

    try {
      store.setLoading(true);
      store.setError(null);

      // Generate mnemonic
      const mnemonic = this.generateMnemonic();

      // Create first account
      const result = await this.createWallet(mnemonic, 0);
      if (!result) {
        throw new Error("Failed to derive account");
      }

      // Save securely
      await SecureStorage.saveMnemonic(mnemonic);
      await SecureStorage.savePrivateKey(
        result.address,
        result.wallet.privateKey,
      );
      await SecureStorage.setWalletInitialized(true);

      // Update store
      store.clearAccounts();
      store.addAccount({
        address: result.address,
        name: "Wallet 1",
        index: 0,
        isImported: false,
      });
      store.setStatus("unlocked");

      return { mnemonic, address: result.address };
    } catch (error) {
      console.error("[WalletService]: Failed to create wallet", error);
      store.setError("Failed to create wallet");
      return null;
    } finally {
      store.setLoading(false);
    }
  }

  /**
   * Import wallet from mnemonic
   */
  static async importFromMnemonic(mnemonic: string): Promise<string | null> {
    const store = useWalletStore.getState();

    try {
      store.setLoading(true);
      store.setError(null);

      if (!this.isValidMnemonic(mnemonic)) {
        throw new Error("Invalid mnemonic phrase");
      }

      // Create first account
      const result = await this.createWallet(mnemonic, 0);
      if (!result) {
        throw new Error("Failed to derive account");
      }

      // Save securely
      await SecureStorage.saveMnemonic(mnemonic);
      await SecureStorage.savePrivateKey(
        result.address,
        result.wallet.privateKey,
      );
      await SecureStorage.setWalletInitialized(true);

      // Update store
      store.clearAccounts();
      store.addAccount({
        address: result.address,
        name: "Wallet 1",
        index: 0,
        isImported: false,
      });
      store.setStatus("unlocked");
      store.setHasBackedUp(true); // Imported = already backed up

      return result.address;
    } catch (error) {
      console.error("[WalletService]: Failed to import wallet", error);
      store.setError(
        error instanceof Error ? error.message : "Failed to import wallet",
      );
      return null;
    } finally {
      store.setLoading(false);
    }
  }

  /**
   * Import account from private key
   */
  static async importAccountFromPrivateKey(
    privateKey: string,
    name?: string,
  ): Promise<string | null> {
    const store = useWalletStore.getState();

    try {
      store.setLoading(true);
      store.setError(null);

      if (!this.isValidPrivateKey(privateKey)) {
        throw new Error("Invalid private key");
      }

      const result = await this.importFromPrivateKey(privateKey);
      if (!result) {
        throw new Error("Failed to import account");
      }

      // Check if already exists
      if (
        store.accounts.some(
          (a) => a.address.toLowerCase() === result.address.toLowerCase(),
        )
      ) {
        throw new Error("Account already exists");
      }

      // Save private key
      await SecureStorage.savePrivateKey(
        result.address,
        result.wallet.privateKey,
      );

      // If this is the first account, mark as initialized
      if (store.accounts.length === 0) {
        await SecureStorage.setWalletInitialized(true);
      }

      // Update store
      store.addAccount({
        address: result.address,
        name: name || `Account ${store.accounts.length + 1}`,
        index: store.accounts.length,
        isImported: true,
      });
      store.setStatus("unlocked");

      return result.address;
    } catch (error) {
      console.error("[WalletService]: Failed to import account", error);
      store.setError(
        error instanceof Error ? error.message : "Failed to import account",
      );
      return null;
    } finally {
      store.setLoading(false);
    }
  }

  /**
   * Add new account from mnemonic
   */
  static async addAccount(name?: string): Promise<string | null> {
    const store = useWalletStore.getState();

    try {
      store.setLoading(true);
      store.setError(null);

      const mnemonic = await SecureStorage.loadMnemonic();
      if (!mnemonic) {
        throw new Error("No mnemonic found");
      }

      // Find next HD index (only count non-imported accounts)
      const hdAccounts = store.accounts.filter((a) => !a.isImported);
      const nextIndex = hdAccounts.length;

      const result = await this.createWallet(mnemonic, nextIndex);
      if (!result) {
        throw new Error("Failed to derive account");
      }

      // Save private key
      await SecureStorage.savePrivateKey(
        result.address,
        result.wallet.privateKey,
      );

      // Update store
      store.addAccount({
        address: result.address,
        name: name || `Wallet ${nextIndex + 1}`,
        index: nextIndex,
        isImported: false,
      });

      return result.address;
    } catch (error) {
      console.error("[WalletService]: Failed to add account", error);
      store.setError(
        error instanceof Error ? error.message : "Failed to add account",
      );
      return null;
    } finally {
      store.setLoading(false);
    }
  }

  /**
   * Create a new independent account with a fresh random private key
   * This creates a standalone account not derived from any mnemonic
   */
  static async createNewAccount(name?: string): Promise<string | null> {
    const store = useWalletStore.getState();

    try {
      store.setLoading(true);
      store.setError(null);

      // Generate a new random wallet using expo-crypto to avoid
      // ethers' internal globalThis.crypto check failing on Android
      const privateKeyBytes = ExpoCrypto.getRandomBytes(32);
      const privateKeyHex =
        "0x" +
        Array.from(privateKeyBytes)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      const wallet = new Wallet(privateKeyHex);

      // Check if already exists
      if (
        store.accounts.some(
          (a) => a.address.toLowerCase() === wallet.address.toLowerCase(),
        )
      ) {
        throw new Error("Account already exists");
      }

      // Save private key
      await SecureStorage.savePrivateKey(wallet.address, wallet.privateKey);

      // Update store - mark as imported since it's not from the HD wallet
      store.addAccount({
        address: wallet.address,
        name: name || `Account ${store.accounts.length + 1}`,
        index: store.accounts.length,
        isImported: true, // Independent accounts are treated as imported
      });

      return wallet.address;
    } catch (error) {
      console.error("[WalletService]: Failed to create new account", error);
      store.setError(
        error instanceof Error ? error.message : "Failed to create account",
      );
      return null;
    } finally {
      store.setLoading(false);
    }
  }

  /**
   * Create a new Solana account via the configured API.
   * The API generates the ed25519 keypair; we store the returned private key
   * in SecureStore and record the address in the wallet store.
   */
  static async createSolanaAccount(name?: string): Promise<string | null> {
    const store = useWalletStore.getState();

    try {
      store.setLoading(true);
      store.setError(null);

      const apiBaseUrl = useProviderStore.getState().getApiBaseUrl();
      if (!apiBaseUrl) {
        throw new Error(
          "No API URL configured. Set one in Settings → API before creating a Solana account.",
        );
      }

      const networkId = useProviderStore.getState().selectedApiNetworkId ?? "dynamic-mainnet";
      const provider = new ApiProvider(apiBaseUrl);
      const keypair = await provider.createKeypair(networkId, "ed25519");
      const { privateKey, walletId, publicKey } = keypair;

      // The API returns a 0x EVM-style address even for ed25519 keys — derive
      // the real Solana address (base58 of the 32-byte public key) client-side.
      let address = keypair.address;
      if (publicKey && publicKey.length === 64 && !keypair.address.match(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)) {
        const bytes = new Uint8Array(32);
        for (let i = 0; i < 32; i++) {
          bytes[i] = parseInt(publicKey.slice(i * 2, i * 2 + 2), 16);
        }
        // Base58 encode (Bitcoin/Solana alphabet)
        const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
        let num = BigInt("0x" + publicKey);
        let encoded = "";
        while (num > 0n) {
          encoded = ALPHABET[Number(num % 58n)] + encoded;
          num = num / 58n;
        }
        for (const b of bytes) {
          if (b === 0) encoded = "1" + encoded; else break;
        }
        address = encoded;
      }

      if (store.accounts.some((a) => a.address === address)) {
        throw new Error("Account already exists");
      }

      // privateKey may be empty in strict Dynamic custody mode — only store if present
      if (privateKey) {
        await SecureStorage.savePrivateKey(address, privateKey);
      }

      const solanaCount = store.accounts.filter(
        (a) => a.accountType === "solana",
      ).length;

      store.addAccount({
        address,
        name: name ?? `Solana ${solanaCount + 1}`,
        index: store.accounts.length,
        isImported: true,
        accountType: "solana",
        dynamicWalletId: walletId,
        networkId,
      });

      return address;
    } catch (error) {
      console.error("[WalletService]: Failed to create Solana account", error);
      store.setError(
        error instanceof Error ? error.message : "Failed to create Solana account",
      );
      return null;
    } finally {
      store.setLoading(false);
    }
  }

  /**
   * Export the locally-stored private key for a non-Dynamic wallet.
   * Returns null if the account is Dynamic-managed (no local key) or the key isn't found.
   */
  static async exportPrivateKey(address: string): Promise<string | null> {
    const store = useWalletStore.getState();
    const account = store.accounts.find(
      (a) => a.address.toLowerCase() === address.toLowerCase(),
    );

    // Solana wallets are Dynamic-managed — local private key may not exist
    if (account?.accountType === "solana") {
      const pk = await SecureStorage.loadPrivateKey(address);
      // In strict Dynamic custody mode the key is empty/null
      if (!pk) return null;
      return pk;
    }

    return SecureStorage.loadPrivateKey(address);
  }

  /**
   * Get signer for an address
   */
  static async getSigner(
    address: string,
    chainId: ChainId = ChainId.mainnet,
  ): Promise<Wallet | null> {
    try {
      const privateKey = await SecureStorage.loadPrivateKey(address);
      if (!privateKey) {
        console.error("[WalletService]: No private key found for address");
        return null;
      }

      return EthersClient.createWallet(privateKey, chainId);
    } catch (error) {
      console.error("[WalletService]: Failed to get signer", error);
      return null;
    }
  }

  /**
   * Get mnemonic (for backup)
   */
  static async getMnemonic(): Promise<string | null> {
    return SecureStorage.loadMnemonic();
  }

  /**
   * Reset wallet (delete all data)
   */
  static async resetWallet(): Promise<boolean> {
    const store = useWalletStore.getState();

    try {
      // Delete all private keys
      for (const account of store.accounts) {
        await SecureStorage.deletePrivateKey(account.address);
      }

      // Clear secure storage
      await SecureStorage.clearAll();

      // Reset store
      store.reset();

      return true;
    } catch (error) {
      console.error("[WalletService]: Failed to reset wallet", error);
      return false;
    }
  }
}

/**
 * BalanceService - Fetch and manage balances
 * Uses Multicall3 for batched requests to avoid RPC rate limiting
 */
export class BalanceService {
  // Throttle: prevent refreshing more than once every 10 seconds
  private static lastRefreshTime: number = 0;
  private static readonly REFRESH_COOLDOWN_MS = 10000; // 10 seconds
  private static isRefreshing: boolean = false;

  /**
   * Fetch native balance for an address
   */
  static async fetchNativeBalance(
    address: string,
    chainId: ChainId,
  ): Promise<string> {
    try {
      const balance = await EthersClient.getNativeBalance(address, chainId);
      return EthersClient.fromWei(balance);
    } catch (error) {
      console.error("[BalanceService]: Failed to fetch native balance", error);
      return "0";
    }
  }

  /**
   * Fetch all token balances using Multicall3 (single RPC call)
   * Uses tokens from the token store (default + custom, excluding hidden)
   */
  static async fetchTokenBalances(
    address: string,
    chainId: ChainId,
  ): Promise<TokenBalance[]> {
    // Get tokens from token store (handles default + custom, excludes hidden)
    const tokenStore = useTokenStore.getState();
    const tokens = tokenStore.getTokensForChain(chainId);

    if (tokens.length === 0) {
      return [];
    }

    const balances: TokenBalance[] = [];

    try {
      // Use multicall to fetch all balances in one RPC call
      const tokenAddresses = tokens.map((t) => t.address);
      const balanceMap = await EthersClient.batchGetERC20Balances(
        tokenAddresses,
        address,
        chainId,
      );

      // Convert to TokenBalance array
      for (const token of tokens) {
        const balance = balanceMap.get(token.address.toLowerCase()) ?? 0n;
        const formatted = EthersClient.formatUnits(balance, token.decimals);

        if (parseFloat(formatted) > 0) {
          balances.push({
            address: token.address,
            symbol: token.symbol,
            name: token.name,
            decimals: token.decimals,
            balance: balance.toString(),
            balanceFormatted: formatted,
            chainId,
          });
        }
      }
    } catch (error) {
      console.error("[BalanceService]: Failed to fetch token balances", error);
    }

    return balances;
  }

  /**
   * Refresh all balances for current account
   * Throttled to prevent API spam - max once every 10 seconds
   * Handles both EVM and Solana accounts.
   */
  static async refreshBalances(force: boolean = false): Promise<void> {
    const now = Date.now();

    // Check throttle (skip if force refresh requested)
    if (!force && now - this.lastRefreshTime < this.REFRESH_COOLDOWN_MS) {
      console.log("[BalanceService]: Skipping refresh - throttled");
      return;
    }

    // Prevent concurrent refreshes
    if (this.isRefreshing) {
      console.log("[BalanceService]: Skipping refresh - already in progress");
      return;
    }

    const store = useWalletStore.getState();
    const account = store.accounts[store.selectedAccountIndex];

    if (!account) return;

    try {
      this.isRefreshing = true;
      this.lastRefreshTime = now;

      if (account.accountType === "solana") {
        await this.refreshSolanaBalances(account.address);
      } else {
        await this.refreshEvmBalances(account.address, store.selectedChainId);
      }
    } catch (error) {
      console.error("[BalanceService]: Failed to refresh balances", error);
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Refresh EVM balances for the given address and chain.
   */
  private static async refreshEvmBalances(
    address: string,
    chainId: ChainId,
  ): Promise<void> {
    const store = useWalletStore.getState();
    const tokenStore = useTokenStore.getState();
    const tokens = tokenStore.getTokensForChain(chainId);
    const tokenAddresses = tokens.map((t) => t.address);

    const { native, tokens: tokenBalanceMap } =
      await EthersClient.batchGetAllBalances(tokenAddresses, address, chainId);

    const nativeFormatted = EthersClient.fromWei(native);
    store.setNativeBalance(address, chainId, nativeFormatted);

    const tokenBalances: TokenBalance[] = [];
    for (const token of tokens) {
      const balance = tokenBalanceMap.get(token.address.toLowerCase()) ?? 0n;
      const formatted = EthersClient.formatUnits(balance, token.decimals);

      if (parseFloat(formatted) > 0) {
        tokenBalances.push({
          address: token.address,
          symbol: token.symbol,
          name: token.name,
          decimals: token.decimals,
          balance: balance.toString(),
          balanceFormatted: formatted,
          chainId,
        });
      }
    }

    store.setTokenBalances(address, chainId, tokenBalances);
  }

  /**
   * Refresh Solana native + token balances across all Solana networks via the API.
   */
  private static async refreshSolanaBalances(address: string): Promise<void> {
    const store = useWalletStore.getState();
    const apiBaseUrl = useProviderStore.getState().getApiBaseUrl();
    if (!apiBaseUrl) return;

    const provider = new ApiProvider(apiBaseUrl);

    await Promise.allSettled(
      SOLANA_NETWORK_IDS.map(async (networkId) => {
        const chainKey = getSolanaChainKey(networkId);
        const [nativeResult, tokenResult] = await Promise.allSettled([
          provider.getNativeBalance(address, networkId),
          provider.getTokenBalances(address, networkId),
        ]);

        if (nativeResult.status === "fulfilled") {
          store.setNativeBalance(address, chainKey, nativeResult.value.amount);
        }

        if (tokenResult.status === "fulfilled") {
          const solTokens: TokenBalance[] = tokenResult.value.map((b) => ({
            address: b.assetId.replace(`token:${networkId}:`, ""),
            symbol: b.symbol,
            name: b.symbol,
            decimals: b.decimals,
            balance: b.amountAtomic,
            balanceFormatted: b.amount,
            chainId: chainKey,
          }));
          store.setTokenBalances(address, chainKey, solTokens);
        }
      }),
    );
  }

  /**
   * Force refresh bypassing throttle (for pull-to-refresh)
   */
  static async forceRefreshBalances(): Promise<void> {
    return this.refreshBalances(true);
  }
}

/**
 * TransactionService - Send and track transactions
 */
export class TransactionService {
  /**
   * Send native token (ETH, MATIC, etc.)
   */
  static async sendNative(
    from: string,
    to: string,
    amount: string,
    chainId: ChainId,
  ): Promise<{ hash: string } | { error: string }> {
    const store = useWalletStore.getState();

    try {
      store.setLoading(true);

      // Get signer
      const signer = await WalletService.getSigner(from, chainId);
      if (!signer) {
        throw new Error("Could not load wallet");
      }

      // Get gas price
      const gasParams = await EthersClient.getGasPrice(chainId);

      // Estimate gas
      const tx = {
        from,
        to,
        value: EthersClient.toWei(amount),
        ...gasParams,
      };

      const gasLimit = await EthersClient.estimateGasWithPadding(tx, chainId);
      if (!gasLimit) {
        throw new Error("Could not estimate gas");
      }

      // Send transaction
      const { result, error } = await EthersClient.sendTransaction(signer, {
        ...tx,
        gasLimit,
      });

      if (error || !result) {
        throw error || new Error("Transaction failed");
      }

      // Add to pending with full details
      const networkConfig = EthersClient.getNetworkConfig(chainId);
      const pendingTx: Transaction = {
        hash: result.hash,
        from,
        to,
        value: amount,
        chainId,
        timestamp: Date.now(),
        status: "pending",
        type: "send",
        tokenSymbol: networkConfig?.nativeCurrency.symbol || "ETH",
        paymentMethod: "manual-transfer",
        gasLimit: gasLimit.toString(),
        gasPrice:
          "gasPrice" in gasParams ? gasParams.gasPrice?.toString() : undefined,
        maxFeePerGas:
          "maxFeePerGas" in gasParams
            ? gasParams.maxFeePerGas?.toString()
            : undefined,
        maxPriorityFeePerGas:
          "maxPriorityFeePerGas" in gasParams
            ? gasParams.maxPriorityFeePerGas?.toString()
            : undefined,
        nonce: result.nonce,
      };

      store.addPendingTransaction(pendingTx);
      store.addTransaction(from, pendingTx);

      // Watch for confirmation
      this.watchTransaction(result.hash, chainId);

      return { hash: result.hash };
    } catch (error) {
      console.error("[TransactionService]: Send failed", error);
      return {
        error: error instanceof Error ? error.message : "Transaction failed",
      };
    } finally {
      store.setLoading(false);
    }
  }

  /**
   * Send ERC20 token
   */
  static async sendToken(
    from: string,
    to: string,
    tokenAddress: string,
    amount: string,
    decimals: number,
    chainId: ChainId,
    tokenSymbol?: string,
  ): Promise<{ hash: string } | { error: string }> {
    const store = useWalletStore.getState();

    try {
      store.setLoading(true);

      // Get signer
      const signer = await WalletService.getSigner(from, chainId);
      if (!signer) {
        throw new Error("Could not load wallet");
      }

      // Build transfer data
      const amountWei = EthersClient.parseUnits(amount, decimals);
      const data = EthersClient.buildERC20TransferData(to, amountWei);

      // Get gas price
      const gasParams = await EthersClient.getGasPrice(chainId);

      // Estimate gas
      const tx = {
        from,
        to: tokenAddress,
        data,
        value: 0n,
        ...gasParams,
      };

      const gasLimit = await EthersClient.estimateGasWithPadding(tx, chainId);
      if (!gasLimit) {
        throw new Error("Could not estimate gas");
      }

      // Send transaction
      const { result, error } = await EthersClient.sendTransaction(signer, {
        ...tx,
        gasLimit,
      });

      if (error || !result) {
        throw error || new Error("Transaction failed");
      }

      // Add to pending with full details
      const pendingTx: Transaction = {
        hash: result.hash,
        from,
        to,
        value: amount,
        chainId,
        timestamp: Date.now(),
        status: "pending",
        type: "send",
        tokenAddress,
        tokenSymbol,
        tokenDecimals: decimals,
        paymentMethod: "manual-transfer",
        gasLimit: gasLimit.toString(),
        gasPrice:
          "gasPrice" in gasParams ? gasParams.gasPrice?.toString() : undefined,
        maxFeePerGas:
          "maxFeePerGas" in gasParams
            ? gasParams.maxFeePerGas?.toString()
            : undefined,
        maxPriorityFeePerGas:
          "maxPriorityFeePerGas" in gasParams
            ? gasParams.maxPriorityFeePerGas?.toString()
            : undefined,
        nonce: result.nonce,
        data,
      };

      store.addPendingTransaction(pendingTx);
      store.addTransaction(from, pendingTx);

      // Watch for confirmation
      this.watchTransaction(result.hash, chainId);

      return { hash: result.hash };
    } catch (error) {
      console.error("[TransactionService]: Token send failed", error);
      return {
        error: error instanceof Error ? error.message : "Transaction failed",
      };
    } finally {
      store.setLoading(false);
    }
  }

  /**
   * Approve ERC20 token spending
   * Returns the approval transaction hash on success
   */
  static async approveToken(
    from: string,
    tokenAddress: string,
    spenderAddress: string,
    amount: string | bigint,
    decimals: number,
    chainId: ChainId,
  ): Promise<{ hash: string } | { error: string }> {
    const store = useWalletStore.getState();

    try {
      store.setLoading(true);

      // Get signer
      const signer = await WalletService.getSigner(from, chainId);
      if (!signer) {
        throw new Error("Could not load wallet");
      }

      // Parse amount if string
      const amountWei =
        typeof amount === "string"
          ? EthersClient.parseUnits(amount, decimals)
          : amount;

      // Build approval data
      const data = EthersClient.buildERC20ApproveData(
        spenderAddress,
        amountWei,
      );

      // Get gas price
      const gasParams = await EthersClient.getGasPrice(chainId);

      // Build transaction
      const tx = {
        to: tokenAddress,
        data,
        value: 0n,
        ...gasParams,
      };

      // Estimate gas
      const gasLimit = await EthersClient.estimateGasWithPadding(tx, chainId);
      if (!gasLimit) {
        throw new Error("Could not estimate gas for approval");
      }

      // Send transaction
      const { result, error } = await EthersClient.sendTransaction(signer, {
        ...tx,
        gasLimit,
      });

      if (error || !result) {
        throw error || new Error("Approval transaction failed");
      }

      // Add to pending with full details
      const pendingTx: Transaction = {
        hash: result.hash,
        from,
        to: tokenAddress,
        value: "0",
        chainId,
        timestamp: Date.now(),
        status: "pending",
        type: "approve",
        tokenAddress,
        tokenDecimals: decimals,
        gasLimit: gasLimit.toString(),
        gasPrice:
          "gasPrice" in gasParams ? gasParams.gasPrice?.toString() : undefined,
        maxFeePerGas:
          "maxFeePerGas" in gasParams
            ? gasParams.maxFeePerGas?.toString()
            : undefined,
        maxPriorityFeePerGas:
          "maxPriorityFeePerGas" in gasParams
            ? gasParams.maxPriorityFeePerGas?.toString()
            : undefined,
        nonce: result.nonce,
        data,
      };

      store.addPendingTransaction(pendingTx);
      store.addTransaction(from, pendingTx);

      // Watch for confirmation
      this.watchTransaction(result.hash, chainId);

      return { hash: result.hash };
    } catch (error) {
      console.error("[TransactionService]: Approval failed", error);
      return {
        error: error instanceof Error ? error.message : "Approval failed",
      };
    } finally {
      store.setLoading(false);
    }
  }

  /**
   * Check if token approval is needed
   */
  static async checkTokenApproval(
    tokenAddress: string,
    ownerAddress: string,
    spenderAddress: string,
    amount: string,
    decimals: number,
    chainId: ChainId,
  ): Promise<{
    needsApproval: boolean;
    currentAllowance: string;
    requiredAmount: string;
  }> {
    try {
      const allowance = await EthersClient.getERC20Allowance(
        tokenAddress,
        ownerAddress,
        spenderAddress,
        chainId,
      );

      const requiredWei = EthersClient.parseUnits(amount, decimals);
      const needsApproval = allowance < requiredWei;

      return {
        needsApproval,
        currentAllowance: EthersClient.formatUnits(allowance, decimals),
        requiredAmount: amount,
      };
    } catch (error) {
      console.error("[TransactionService]: Failed to check approval", error);
      return {
        needsApproval: true,
        currentAllowance: "0",
        requiredAmount: amount,
      };
    }
  }

  /**
   * Revoke token approval (set allowance to zero)
   */
  static async revokeTokenApproval(
    from: string,
    tokenAddress: string,
    spenderAddress: string,
    chainId: ChainId,
  ): Promise<{ hash: string } | { error: string }> {
    return this.approveToken(
      from,
      tokenAddress,
      spenderAddress,
      0n,
      0,
      chainId,
    );
  }

  /**
   * Send ERC20 token with automatic approval check
   * If approval is needed, returns an error indicating approval is required
   */
  static async sendTokenWithApprovalCheck(
    from: string,
    to: string,
    tokenAddress: string,
    spenderAddress: string,
    amount: string,
    decimals: number,
    chainId: ChainId,
  ): Promise<{ hash: string } | { error: string; needsApproval?: boolean }> {
    // Check if approval is needed
    const approvalCheck = await this.checkTokenApproval(
      tokenAddress,
      from,
      spenderAddress,
      amount,
      decimals,
      chainId,
    );

    if (approvalCheck.needsApproval) {
      return {
        error: `Insufficient allowance. Current: ${approvalCheck.currentAllowance}, Required: ${amount}`,
        needsApproval: true,
      };
    }

    // Proceed with transfer
    return this.sendToken(from, to, tokenAddress, amount, decimals, chainId);
  }

  /**
   * Watch transaction for confirmation
   */
  static async watchTransaction(hash: string, chainId: ChainId): Promise<void> {
    const store = useWalletStore.getState();

    try {
      const confirmed = await EthersClient.waitForTransaction(hash, 1, chainId);

      if (confirmed) {
        // Get full receipt details
        const receipt = await this.getTransactionReceipt(hash, chainId);
        if (receipt) {
          store.updateTransaction(hash, {
            status: "confirmed",
            gasUsed: receipt.gasUsed?.toString(),
            blockNumber: receipt.blockNumber,
            blockHash: receipt.blockHash,
            confirmedAt: Date.now(),
          });
        } else {
          store.updateTransactionStatus(hash, "confirmed");
        }
      } else {
        store.updateTransactionStatus(hash, "failed");
      }

      store.removePendingTransaction(hash);

      // Refresh balances after transaction
      await BalanceService.refreshBalances();
    } catch (error) {
      console.error("[TransactionService]: Failed to watch transaction", error);
      store.updateTransactionStatus(hash, "failed");
      store.removePendingTransaction(hash);
    }
  }

  /**
   * Get transaction receipt
   */
  static async getTransactionReceipt(hash: string, chainId: ChainId) {
    try {
      const provider = EthersClient.getProvider(chainId);
      return await provider.getTransactionReceipt(hash);
    } catch (error) {
      console.error("[TransactionService]: Failed to get receipt", error);
      return null;
    }
  }
}
