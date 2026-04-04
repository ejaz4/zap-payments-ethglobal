import {
  AbstractSigner,
  Block,
  Contract,
  JsonRpcProvider,
  Provider,
  Signer,
  TransactionRequest,
  TransactionResponse,
  TypedDataDomain,
  TypedDataField,
  Wallet,
  formatEther,
  formatUnits,
  getAddress,
  isAddress,
  isHexString,
  parseEther,
  parseUnits,
  toBeHex,
} from "ethers";

/**
 * Chain ID enum for supported networks
 * Based on Rainbow's ChainId pattern
 */
export enum ChainId {
  mainnet = 1,
  goerli = 5,
  sepolia = 11155111,
  optimism = 10,
  arbitrum = 42161,
  polygon = 137,
  base = 8453,
  zora = 7777777,
  avalanche = 43114,
  bsc = 56,
  plasmaTestnet = 9746,
  chilizSpicy = 88882,
}

/**
 * Network configuration type
 */
export interface NetworkConfig {
  chainId: ChainId;
  name: string;
  rpcUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  blockExplorerUrl?: string;
}

/**
 * Default network configurations
 * In production, replace RPC URLs with your own endpoints
 */
export const DEFAULT_NETWORKS: Record<ChainId, NetworkConfig> = {
  [ChainId.mainnet]: {
    chainId: ChainId.mainnet,
    name: "Ethereum",
    rpcUrl: "https://eth.llamarpc.com",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    blockExplorerUrl: "https://etherscan.io",
  },
  [ChainId.goerli]: {
    chainId: ChainId.goerli,
    name: "Goerli",
    rpcUrl: "https://rpc.ankr.com/eth_goerli",
    nativeCurrency: { name: "Goerli Ether", symbol: "ETH", decimals: 18 },
    blockExplorerUrl: "https://goerli.etherscan.io",
  },
  [ChainId.sepolia]: {
    chainId: ChainId.sepolia,
    name: "Sepolia",
    rpcUrl: "https://rpc.sepolia.org",
    nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
    blockExplorerUrl: "https://sepolia.etherscan.io",
  },
  [ChainId.optimism]: {
    chainId: ChainId.optimism,
    name: "Optimism",
    rpcUrl: "https://mainnet.optimism.io",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    blockExplorerUrl: "https://optimistic.etherscan.io",
  },
  [ChainId.arbitrum]: {
    chainId: ChainId.arbitrum,
    name: "Arbitrum One",
    rpcUrl: "https://arb1.arbitrum.io/rpc",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    blockExplorerUrl: "https://arbiscan.io",
  },
  [ChainId.polygon]: {
    chainId: ChainId.polygon,
    name: "Polygon",
    rpcUrl: "https://polygon-rpc.com",
    nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 },
    blockExplorerUrl: "https://polygonscan.com",
  },
  [ChainId.base]: {
    chainId: ChainId.base,
    name: "Base",
    rpcUrl: "https://mainnet.base.org",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    blockExplorerUrl: "https://basescan.org",
  },
  [ChainId.zora]: {
    chainId: ChainId.zora,
    name: "Zora",
    rpcUrl: "https://rpc.zora.energy",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    blockExplorerUrl: "https://explorer.zora.energy",
  },
  [ChainId.avalanche]: {
    chainId: ChainId.avalanche,
    name: "Avalanche",
    rpcUrl: "https://api.avax.network/ext/bc/C/rpc",
    nativeCurrency: { name: "AVAX", symbol: "AVAX", decimals: 18 },
    blockExplorerUrl: "https://snowtrace.io",
  },
  [ChainId.bsc]: {
    chainId: ChainId.bsc,
    name: "BNB Smart Chain",
    rpcUrl: "https://bsc-dataseed.binance.org",
    nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
    blockExplorerUrl: "https://bscscan.com",
  },
  [ChainId.plasmaTestnet]: {
    chainId: ChainId.plasmaTestnet,
    name: "Plasma Testnet",
    rpcUrl: "https://testnet-rpc.plasma.to",
    nativeCurrency: { name: "XPL", symbol: "XPL", decimals: 18 },
    blockExplorerUrl: "https://testnet.plasmascan.to",
  },
  [ChainId.chilizSpicy]: {
    chainId: ChainId.chilizSpicy,
    name: "Chiliz Spicy Testnet",
    rpcUrl: "https://spicy-rpc.chiliz.com",
    nativeCurrency: { name: "Chiliz", symbol: "CHZ", decimals: 18 },
    blockExplorerUrl: "https://testnet.chiliscan.com",
  },
};

/**
 * Gas parameters for EIP-1559 transactions
 */
export interface GasParams {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

/**
 * Legacy gas parameters
 */
export interface LegacyGasParams {
  gasPrice: bigint;
}

/**
 * Transaction details for building transactions
 * Based on Rainbow's TransactionDetailsReturned pattern
 */
export interface TransactionDetails {
  to?: string;
  from?: string;
  data?: string;
  value?: bigint;
  gasLimit?: bigint;
  nonce?: number;
  chainId?: number;
  gasPrice?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
}

/**
 * Result type for transaction operations
 */
export interface TransactionResult {
  result?: TransactionResponse;
  error?: Error;
}

/**
 * Result type for signing operations
 */
export interface SignResult {
  result?: string;
  error?: Error;
}

/**
 * Basic unit conversions following Rainbow's ethUnits pattern
 */
export const ethUnits = {
  basic_tx: 21000n,
  basic_transfer: 21000n,
  basic_approval: 55000n,
  basic_swap: 300000n,
};

/**
 * EthersClient - A wrapper around ethers.js v6 following Rainbow's patterns
 *
 * This class provides:
 * - Provider management with caching (similar to Rainbow's chainsProviders)
 * - Wallet operations (signing, transactions)
 * - Gas estimation with padding
 * - Utility functions for hex/address handling
 */
export class EthersClient {
  private static providersCache = new Map<ChainId, JsonRpcProvider>();
  private static networkConfigs: Record<number, NetworkConfig> = {
    ...DEFAULT_NETWORKS,
  };

  // ===================
  // PROVIDER MANAGEMENT
  // ===================

  /**
   * Configure custom network settings
   * Based on Rainbow's pattern of dynamic network configuration
   */
  static configureNetwork(config: NetworkConfig): void {
    this.networkConfigs[config.chainId] = config;
    // Clear cached provider to use new config
    this.providersCache.delete(config.chainId);
  }

  /**
   * Get a cached provider for a chain
   * Based on Rainbow's getProvider pattern
   */
  static getProvider(chainId: ChainId = ChainId.mainnet): JsonRpcProvider {
    const cachedProvider = this.providersCache.get(chainId);
    const config = this.networkConfigs[chainId];

    if (!config) {
      throw new Error(`No configuration found for chainId: ${chainId}`);
    }

    // Return cached provider if URL matches
    if (cachedProvider) {
      return cachedProvider;
    }

    // Create new provider
    // In ethers v6, JsonRpcProvider takes (url, network, options)
    const provider = new JsonRpcProvider(config.rpcUrl, chainId, {
      staticNetwork: true, // Similar to StaticJsonRpcProvider in v5
    });

    this.providersCache.set(chainId, provider);
    return provider;
  }

  /**
   * Get cached provider if available
   * Based on Rainbow's getCachedProviderForNetwork
   */
  static getCachedProvider(
    chainId: ChainId = ChainId.mainnet,
  ): JsonRpcProvider | undefined {
    return this.providersCache.get(chainId);
  }

  /**
   * Clear provider cache (useful for switching RPC endpoints)
   */
  static clearProviderCache(): void {
    this.providersCache.clear();
  }

  // ==================
  // WALLET OPERATIONS
  // ==================

  /**
   * Create a wallet from private key connected to a provider
   */
  static createWallet(
    privateKey: string,
    chainId: ChainId = ChainId.mainnet,
  ): Wallet {
    const provider = this.getProvider(chainId);
    return new Wallet(this.addHexPrefix(privateKey), provider);
  }

  /**
   * Create a random wallet
   */
  static createRandomWallet(chainId: ChainId = ChainId.mainnet): Wallet {
    const provider = this.getProvider(chainId);
    const hdWallet = Wallet.createRandom();
    return new Wallet(hdWallet.privateKey, provider);
  }

  /**
   * Create wallet from mnemonic
   */
  static createWalletFromMnemonic(
    mnemonic: string,
    path: string = "m/44'/60'/0'/0/0",
    chainId: ChainId = ChainId.mainnet,
  ): Wallet {
    const provider = this.getProvider(chainId);
    const hdWallet = Wallet.fromPhrase(mnemonic);
    // For custom derivation path, use HDNodeWallet
    if (path !== "m/44'/60'/0'/0/0") {
      const derivedWallet = hdWallet.derivePath(path);
      return new Wallet(derivedWallet.privateKey, provider);
    }
    return new Wallet(hdWallet.privateKey, provider);
  }

  // ====================
  // TRANSACTION METHODS
  // ====================

  /**
   * Send a transaction
   * Based on Rainbow's sendTransaction pattern from model/wallet.ts
   */
  static async sendTransaction(
    wallet: Signer,
    transaction: TransactionRequest,
  ): Promise<TransactionResult> {
    try {
      const result = await wallet.sendTransaction(transaction);
      return { result };
    } catch (error) {
      console.error("[EthersClient]: Failed to send transaction", error);
      return {
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Sign a transaction without broadcasting
   * Based on Rainbow's signTransaction pattern
   */
  static async signTransaction(
    wallet: Wallet,
    transaction: TransactionRequest,
  ): Promise<SignResult> {
    try {
      const result = await wallet.signTransaction(transaction);
      return { result };
    } catch (error) {
      console.error("[EthersClient]: Failed to sign transaction", error);
      return {
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Sign a personal message
   * Based on Rainbow's signPersonalMessage pattern
   */
  static async signMessage(
    wallet: Signer,
    message: string | Uint8Array,
  ): Promise<SignResult> {
    try {
      const messageToSign =
        typeof message === "string" &&
        this.isHexString(this.addHexPrefix(message))
          ? Buffer.from(message.replace("0x", ""), "hex")
          : message;
      const result = await wallet.signMessage(messageToSign);
      return { result };
    } catch (error) {
      console.error("[EthersClient]: Failed to sign message", error);
      return {
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Sign typed data (EIP-712)
   * Based on Rainbow's signTypedDataMessage pattern
   */
  static async signTypedData(
    wallet: Signer,
    domain: TypedDataDomain,
    types: Record<string, TypedDataField[]>,
    value: Record<string, unknown>,
  ): Promise<SignResult> {
    try {
      // In ethers v6, signTypedData is directly on the Signer
      const result = await (wallet as AbstractSigner).signTypedData(
        domain,
        types,
        value,
      );
      return { result };
    } catch (error) {
      console.error("[EthersClient]: Failed to sign typed data", error);
      return {
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  // =================
  // GAS ESTIMATION
  // =================

  /**
   * Estimate gas for a transaction
   * Based on Rainbow's estimateGas pattern
   */
  static async estimateGas(
    transaction: TransactionRequest,
    chainId: ChainId = ChainId.mainnet,
  ): Promise<bigint | null> {
    try {
      const provider = this.getProvider(chainId);
      const gasLimit = await provider.estimateGas(transaction);
      return gasLimit;
    } catch (error) {
      console.error("[EthersClient]: Gas estimation failed", error);
      return null;
    }
  }

  /**
   * Estimate gas with padding
   * Based on Rainbow's estimateGasWithPadding pattern
   */
  static async estimateGasWithPadding(
    transaction: TransactionRequest,
    chainId: ChainId = ChainId.mainnet,
    paddingFactor: number = 1.1,
  ): Promise<bigint | null> {
    try {
      const provider = this.getProvider(chainId);

      // Get current block gas limit
      const block = await provider.getBlock("latest");
      if (!block) {
        throw new Error("Could not fetch latest block");
      }
      const blockGasLimit = block.gasLimit;

      // Check if recipient is a contract
      const { to, data } = transaction;
      const code = to ? await provider.getCode(to) : undefined;

      // If not a contract and no data, use basic tx gas
      if (to && !data && (!code || code === "0x")) {
        return ethUnits.basic_tx;
      }

      // Calculate safer gas limit (95% of block gas limit)
      const saferGasLimit = (blockGasLimit * 19n) / 20n;

      // Create clean transaction for estimation (remove gas-related fields)
      const cleanTx: TransactionRequest = {
        from: transaction.from,
        to: transaction.to,
        data: transaction.data,
        value: transaction.value,
      };

      const estimatedGas = await provider.estimateGas(cleanTx);

      // Apply padding
      const paddedGas = BigInt(Math.ceil(Number(estimatedGas) * paddingFactor));

      // Calculate last block gas limit with buffer (90%)
      const lastBlockGasLimit = (blockGasLimit * 9n) / 10n;

      // If estimation is above last block limit, return original
      if (estimatedGas > lastBlockGasLimit) {
        return estimatedGas;
      }

      // If padded gas is within limits, use it
      if (lastBlockGasLimit > paddedGas) {
        return paddedGas;
      }

      // Otherwise use the safe block gas limit
      return lastBlockGasLimit;
    } catch (error) {
      console.warn(
        "[EthersClient]: Error calculating gas limit with padding",
        error,
      );
      return null;
    }
  }

  /**
   * Get current gas prices
   * Returns EIP-1559 gas params when supported, otherwise legacy gasPrice
   */
  static async getGasPrice(
    chainId: ChainId = ChainId.mainnet,
  ): Promise<GasParams | LegacyGasParams> {
    const provider = this.getProvider(chainId);
    const feeData = await provider.getFeeData();

    if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
      return {
        maxFeePerGas: feeData.maxFeePerGas,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
      };
    }

    return {
      gasPrice: feeData.gasPrice ?? 0n,
    };
  }

  // =====================
  // TRANSACTION BUILDING
  // =====================

  /**
   * Build transaction details
   * Based on Rainbow's getTxDetails pattern
   */
  static async buildTransactionDetails(params: {
    from: string;
    to: string;
    amount?: string;
    data?: string;
    gasLimit?: bigint;
    nonce?: number;
    chainId?: ChainId;
    gasParams?: GasParams | LegacyGasParams;
  }): Promise<TransactionDetails> {
    const {
      from,
      to,
      amount,
      data = "0x",
      gasLimit,
      nonce,
      chainId,
      gasParams,
    } = params;

    const value = amount ? parseEther(amount) : 0n;

    const baseTx: TransactionDetails = {
      from,
      to,
      data,
      value,
      gasLimit,
      nonce,
      chainId,
    };

    if (gasParams) {
      if ("maxFeePerGas" in gasParams) {
        baseTx.maxFeePerGas = gasParams.maxFeePerGas;
        baseTx.maxPriorityFeePerGas = gasParams.maxPriorityFeePerGas;
      } else {
        baseTx.gasPrice = gasParams.gasPrice;
      }
    }

    return baseTx;
  }

  /**
   * Build ERC20 transfer data
   * Based on Rainbow's getDataForTokenTransfer
   */
  static buildERC20TransferData(to: string, amount: bigint): string {
    // ERC20 transfer function signature
    const transferSelector = "0xa9059cbb";
    const paddedTo = to.replace("0x", "").padStart(64, "0");
    const paddedAmount = amount.toString(16).padStart(64, "0");
    return `${transferSelector}${paddedTo}${paddedAmount}`;
  }

  /**
   * Build ERC20 approve data
   */
  static buildERC20ApproveData(spender: string, amount: bigint): string {
    // ERC20 approve function signature
    const approveSelector = "0x095ea7b3";
    const paddedSpender = spender.replace("0x", "").padStart(64, "0");
    const paddedAmount = amount.toString(16).padStart(64, "0");
    return `${approveSelector}${paddedSpender}${paddedAmount}`;
  }

  /**
   * Build ERC20 transferFrom data
   * Used when a spender moves tokens on behalf of the owner
   */
  static buildERC20TransferFromData(
    from: string,
    to: string,
    amount: bigint,
  ): string {
    // ERC20 transferFrom function signature
    const transferFromSelector = "0x23b872dd";
    const paddedFrom = from.replace("0x", "").padStart(64, "0");
    const paddedTo = to.replace("0x", "").padStart(64, "0");
    const paddedAmount = amount.toString(16).padStart(64, "0");
    return `${transferFromSelector}${paddedFrom}${paddedTo}${paddedAmount}`;
  }

  /**
   * Build ERC20 increaseAllowance data
   * Safer alternative to approve - adds to existing allowance
   */
  static buildERC20IncreaseAllowanceData(
    spender: string,
    addedValue: bigint,
  ): string {
    // increaseAllowance function signature
    const selector = "0x39509351";
    const paddedSpender = spender.replace("0x", "").padStart(64, "0");
    const paddedAmount = addedValue.toString(16).padStart(64, "0");
    return `${selector}${paddedSpender}${paddedAmount}`;
  }

  /**
   * Build ERC20 decreaseAllowance data
   * Safer alternative to approve - subtracts from existing allowance
   */
  static buildERC20DecreaseAllowanceData(
    spender: string,
    subtractedValue: bigint,
  ): string {
    // decreaseAllowance function signature
    const selector = "0xa457c2d7";
    const paddedSpender = spender.replace("0x", "").padStart(64, "0");
    const paddedAmount = subtractedValue.toString(16).padStart(64, "0");
    return `${selector}${paddedSpender}${paddedAmount}`;
  }

  // ================
  // UTILITY METHODS
  // ================

  /**
   * Check if string is hex
   * Based on Rainbow's isHexString
   */
  static isHexString(value: string): boolean {
    return isHexString(value);
  }

  /**
   * Check if string is hex, ignoring prefix
   * Based on Rainbow's isHexStringIgnorePrefix
   */
  static isHexStringIgnorePrefix(value: string): boolean {
    if (!value) return false;
    const trimmedValue = value.trim();
    const updatedValue = this.addHexPrefix(trimmedValue);
    return isHexString(updatedValue);
  }

  /**
   * Add 0x prefix to string
   * Based on Rainbow's addHexPrefix
   */
  static addHexPrefix(value: string): string {
    return value.startsWith("0x") ? value : `0x${value}`;
  }

  /**
   * Remove 0x prefix from string
   */
  static removeHexPrefix(value: string): string {
    return value.startsWith("0x") ? value.slice(2) : value;
  }

  /**
   * Convert number to hex string
   * Based on Rainbow's toHex
   */
  static toHex(value: bigint | number): string {
    return toBeHex(value);
  }

  /**
   * Convert number to hex without leading zeros
   * Based on Rainbow's toHexNoLeadingZeros
   */
  static toHexNoLeadingZeros(value: bigint | number): string {
    return toBeHex(value).replace(/^0x0*/, "0x") || "0x0";
  }

  /**
   * Convert to checksum address
   * Based on Rainbow's toChecksumAddress
   */
  static toChecksumAddress(address: string): string | null {
    try {
      return getAddress(address);
    } catch {
      return null;
    }
  }

  /**
   * Validate Ethereum address
   */
  static isValidAddress(address: string): boolean {
    return isAddress(address);
  }

  /**
   * Convert wei to ether
   */
  static fromWei(wei: bigint | string): string {
    return formatEther(typeof wei === "string" ? BigInt(wei) : wei);
  }

  /**
   * Convert ether to wei
   * Based on Rainbow's toWei
   */
  static toWei(ether: string): bigint {
    return parseEther(ether);
  }

  /**
   * Parse units with custom decimals
   */
  static parseUnits(value: string, decimals: number = 18): bigint {
    return parseUnits(value, decimals);
  }

  /**
   * Format units with custom decimals
   */
  static formatUnits(value: bigint, decimals: number = 18): string {
    return formatUnits(value, decimals);
  }

  // ===============
  // CHAIN UTILITIES
  // ===============

  /**
   * Check if chain is L2
   * Based on Rainbow's isL2Chain
   */
  static isL2Chain(chainId: ChainId): boolean {
    const l2Chains: ChainId[] = [
      ChainId.optimism,
      ChainId.arbitrum,
      ChainId.polygon,
      ChainId.base,
      ChainId.zora,
    ];
    return l2Chains.includes(chainId);
  }

  /**
   * Check if chain is testnet
   * Based on Rainbow's isTestnetChain
   */
  static isTestnetChain(chainId: ChainId): boolean {
    const testnets: ChainId[] = [ChainId.goerli, ChainId.sepolia];
    return testnets.includes(chainId);
  }

  /**
   * Get network config for chain
   */
  static getNetworkConfig(chainId: ChainId): NetworkConfig | undefined {
    return this.networkConfigs[chainId];
  }

  /**
   * Get block explorer URL for transaction
   */
  static getExplorerTxUrl(
    txHash: string,
    chainId: ChainId = ChainId.mainnet,
  ): string | null {
    const config = this.networkConfigs[chainId];
    if (!config?.blockExplorerUrl) return null;
    return `${config.blockExplorerUrl}/tx/${txHash}`;
  }

  /**
   * Get block explorer URL for address
   */
  static getExplorerAddressUrl(
    address: string,
    chainId: ChainId = ChainId.mainnet,
  ): string | null {
    const config = this.networkConfigs[chainId];
    if (!config?.blockExplorerUrl) return null;
    return `${config.blockExplorerUrl}/address/${address}`;
  }

  // =================
  // CONTRACT HELPERS
  // =================

  /**
   * Create a contract instance
   */
  static getContract(
    address: string,
    abi: string[],
    signerOrProvider?: Signer | Provider,
    chainId: ChainId = ChainId.mainnet,
  ): Contract {
    const runner = signerOrProvider ?? this.getProvider(chainId);
    return new Contract(address, abi, runner);
  }

  /**
   * Get native token balance
   */
  static async getNativeBalance(
    address: string,
    chainId: ChainId = ChainId.mainnet,
  ): Promise<bigint> {
    const provider = this.getProvider(chainId);
    return provider.getBalance(address);
  }

  /**
   * Get ERC20 token balance
   */
  static async getERC20Balance(
    tokenAddress: string,
    walletAddress: string,
    chainId: ChainId = ChainId.mainnet,
  ): Promise<bigint> {
    const erc20Abi = ["function balanceOf(address) view returns (uint256)"];
    const contract = this.getContract(
      tokenAddress,
      erc20Abi,
      undefined,
      chainId,
    );
    return contract.balanceOf(walletAddress);
  }

  /**
   * Helper to decode bytes32 to string (for older ERC20 tokens like MKR)
   */
  private static bytes32ToString(bytes32: string): string {
    // Remove 0x prefix and convert hex pairs to characters
    const hex = bytes32.slice(2);
    let str = "";
    for (let i = 0; i < hex.length; i += 2) {
      const charCode = parseInt(hex.substring(i, i + 2), 16);
      if (charCode === 0) break; // Stop at null byte
      str += String.fromCharCode(charCode);
    }
    return str;
  }

  /**
   * Get ERC20 token name
   * Handles both string and bytes32 return types (some older tokens use bytes32)
   */
  static async getERC20Name(
    tokenAddress: string,
    chainId: ChainId = ChainId.mainnet,
  ): Promise<string | null> {
    try {
      // Try standard string return first
      const erc20Abi = ["function name() view returns (string)"];
      const contract = this.getContract(
        tokenAddress,
        erc20Abi,
        undefined,
        chainId,
      );
      const result = await contract.name();
      return result;
    } catch (err) {
      // Try bytes32 return (older tokens like MKR)
      try {
        const bytes32Abi = ["function name() view returns (bytes32)"];
        const contract = this.getContract(
          tokenAddress,
          bytes32Abi,
          undefined,
          chainId,
        );
        const result = await contract.name();
        return this.bytes32ToString(result) || null;
      } catch {
        console.warn("[EthersClient] Failed to get token name:", err);
        return null;
      }
    }
  }

  /**
   * Get ERC20 token symbol
   * Handles both string and bytes32 return types
   */
  static async getERC20Symbol(
    tokenAddress: string,
    chainId: ChainId = ChainId.mainnet,
  ): Promise<string | null> {
    try {
      const erc20Abi = ["function symbol() view returns (string)"];
      const contract = this.getContract(
        tokenAddress,
        erc20Abi,
        undefined,
        chainId,
      );
      const result = await contract.symbol();
      return result;
    } catch (err) {
      // Try bytes32 return (older tokens like MKR)
      try {
        const bytes32Abi = ["function symbol() view returns (bytes32)"];
        const contract = this.getContract(
          tokenAddress,
          bytes32Abi,
          undefined,
          chainId,
        );
        const result = await contract.symbol();
        return this.bytes32ToString(result) || null;
      } catch {
        console.warn("[EthersClient] Failed to get token symbol:", err);
        return null;
      }
    }
  }

  /**
   * Get ERC20 token decimals
   */
  static async getERC20Decimals(
    tokenAddress: string,
    chainId: ChainId = ChainId.mainnet,
  ): Promise<number | null> {
    try {
      const erc20Abi = ["function decimals() view returns (uint8)"];
      const contract = this.getContract(
        tokenAddress,
        erc20Abi,
        undefined,
        chainId,
      );
      const decimals = await contract.decimals();
      return Number(decimals);
    } catch (err) {
      console.warn("[EthersClient] Failed to get token decimals:", err);
      return null;
    }
  }

  /**
   * Get ERC20 token allowance
   */
  static async getERC20Allowance(
    tokenAddress: string,
    ownerAddress: string,
    spenderAddress: string,
    chainId: ChainId = ChainId.mainnet,
  ): Promise<bigint> {
    const erc20Abi = [
      "function allowance(address,address) view returns (uint256)",
    ];
    const contract = this.getContract(
      tokenAddress,
      erc20Abi,
      undefined,
      chainId,
    );
    return contract.allowance(ownerAddress, spenderAddress);
  }

  /**
   * Resolve ENS name to address
   */
  static async resolveENS(
    nameOrAddress: string,
    chainId: ChainId = ChainId.mainnet,
  ): Promise<string | null> {
    if (this.isHexString(nameOrAddress) && this.isValidAddress(nameOrAddress)) {
      return nameOrAddress;
    }

    try {
      const provider = this.getProvider(chainId);
      return await provider.resolveName(nameOrAddress);
    } catch {
      return null;
    }
  }

  /**
   * Lookup address to ENS name
   */
  static async lookupENS(
    address: string,
    chainId: ChainId = ChainId.mainnet,
  ): Promise<string | null> {
    try {
      const provider = this.getProvider(chainId);
      return await provider.lookupAddress(address);
    } catch {
      return null;
    }
  }

  /**
   * Get current block number
   */
  static async getBlockNumber(
    chainId: ChainId = ChainId.mainnet,
  ): Promise<number> {
    const provider = this.getProvider(chainId);
    return provider.getBlockNumber();
  }

  /**
   * Get block by number or tag
   */
  static async getBlock(
    blockHashOrBlockTag: string | number = "latest",
    chainId: ChainId = ChainId.mainnet,
  ): Promise<Block | null> {
    const provider = this.getProvider(chainId);
    return provider.getBlock(blockHashOrBlockTag);
  }

  /**
   * Wait for transaction confirmation
   */
  static async waitForTransaction(
    txHash: string,
    confirmations: number = 1,
    chainId: ChainId = ChainId.mainnet,
  ): Promise<boolean> {
    const provider = this.getProvider(chainId);
    const receipt = await provider.waitForTransaction(txHash, confirmations);
    return receipt?.status === 1;
  }

  // ===================
  // MULTICALL3 SUPPORT
  // ===================

  /**
   * Multicall3 contract address - same on most EVM chains
   * https://www.multicall3.com/
   */
  private static readonly MULTICALL3_ADDRESS =
    "0xcA11bde05977b3631167028862bE2a173976CA11";

  private static readonly MULTICALL3_ABI = [
    "function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) view returns (tuple(bool success, bytes returnData)[])",
  ];

  private static readonly ERC20_BALANCE_SELECTOR = "0x70a08231"; // balanceOf(address)

  /**
   * Batch fetch multiple ERC20 balances in a single RPC call using Multicall3
   * This dramatically reduces RPC requests and avoids rate limiting
   */
  static async batchGetERC20Balances(
    tokenAddresses: string[],
    walletAddress: string,
    chainId: ChainId = ChainId.mainnet,
  ): Promise<Map<string, bigint>> {
    const results = new Map<string, bigint>();

    if (tokenAddresses.length === 0) {
      return results;
    }

    try {
      const provider = this.getProvider(chainId);
      const multicall = new Contract(
        this.MULTICALL3_ADDRESS,
        this.MULTICALL3_ABI,
        provider,
      );

      // Build calldata for each balanceOf call
      // balanceOf(address) = 0x70a08231 + padded address
      const paddedWallet = walletAddress
        .toLowerCase()
        .slice(2)
        .padStart(64, "0");
      const callData = this.ERC20_BALANCE_SELECTOR + paddedWallet;

      const calls = tokenAddresses.map((tokenAddress) => ({
        target: tokenAddress,
        allowFailure: true, // Don't revert if one token fails
        callData,
      }));

      const response = await multicall.aggregate3(calls);

      // Parse results
      for (let i = 0; i < tokenAddresses.length; i++) {
        const { success, returnData } = response[i];
        if (success && returnData && returnData !== "0x") {
          try {
            const balance = BigInt(returnData);
            results.set(tokenAddresses[i].toLowerCase(), balance);
          } catch {
            results.set(tokenAddresses[i].toLowerCase(), 0n);
          }
        } else {
          results.set(tokenAddresses[i].toLowerCase(), 0n);
        }
      }
    } catch (error) {
      console.warn(
        "[EthersClient]: Multicall failed, falling back to individual calls",
        error,
      );
      // Fallback: fetch individually (slower but more reliable)
      for (const tokenAddress of tokenAddresses) {
        try {
          const balance = await this.getERC20Balance(
            tokenAddress,
            walletAddress,
            chainId,
          );
          results.set(tokenAddress.toLowerCase(), balance);
        } catch {
          results.set(tokenAddress.toLowerCase(), 0n);
        }
      }
    }

    return results;
  }

  /**
   * Batch fetch native + all ERC20 balances in minimal RPC calls
   * Returns: { native: bigint, tokens: Map<address, bigint> }
   */
  static async batchGetAllBalances(
    tokenAddresses: string[],
    walletAddress: string,
    chainId: ChainId = ChainId.mainnet,
  ): Promise<{ native: bigint; tokens: Map<string, bigint> }> {
    // Fetch native balance and token balances in parallel
    const [native, tokens] = await Promise.all([
      this.getNativeBalance(walletAddress, chainId),
      this.batchGetERC20Balances(tokenAddresses, walletAddress, chainId),
    ]);

    return { native, tokens };
  }
}

// Export commonly used types from ethers for convenience
export {
  Contract,
  JsonRpcProvider,
  Provider,
  Signer,
  TransactionRequest,
  TransactionResponse,
  Wallet
};

// Export utility functions directly for convenience
export const {
  getProvider,
  createWallet,
  sendTransaction,
  signTransaction,
  signMessage,
  estimateGas,
  estimateGasWithPadding,
  toWei,
  fromWei,
  toHex,
  addHexPrefix,
  removeHexPrefix,
  toChecksumAddress,
  isValidAddress,
  isL2Chain,
  isTestnetChain,
} = EthersClient;
