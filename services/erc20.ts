import { ChainId, EthersClient } from "@/app/profiles/client";
import { useWalletStore } from "@/store/wallet";
import { WalletService } from "./wallet";

/**
 * Standard ERC20 ABI for token operations
 */
export const ERC20_ABI = [
  // Read functions
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  // Write functions
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  // Events
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
];

/**
 * Maximum uint256 value for unlimited approvals
 */
export const MAX_UINT256 = BigInt(
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
);

/**
 * Common approval amounts
 */
export const APPROVAL_AMOUNTS = {
  UNLIMITED: MAX_UINT256,
  ZERO: 0n,
};

/**
 * Approval status for a token/spender pair
 */
export interface ApprovalStatus {
  hasApproval: boolean;
  allowance: bigint;
  allowanceFormatted: string;
  isUnlimited: boolean;
}

/**
 * Result type for approval operations
 */
export interface ApprovalResult {
  success: boolean;
  hash?: string;
  error?: string;
}

/**
 * Token metadata result
 */
export interface TokenMetadata {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply?: bigint;
}

/**
 * ERC20Service - Comprehensive ERC20 token operations
 * Handles approvals, transfers, allowance checks, and token metadata
 */
export class ERC20Service {
  // ===================
  // TOKEN METADATA
  // ===================

  /**
   * Fetch complete token metadata from chain
   */
  static async getTokenMetadata(
    tokenAddress: string,
    chainId: ChainId,
  ): Promise<TokenMetadata | null> {
    try {
      const [name, symbol, decimals] = await Promise.all([
        EthersClient.getERC20Name(tokenAddress, chainId),
        EthersClient.getERC20Symbol(tokenAddress, chainId),
        EthersClient.getERC20Decimals(tokenAddress, chainId),
      ]);

      if (!name || !symbol || decimals === null) {
        console.warn("[ERC20Service]: Could not fetch complete token metadata");
        return null;
      }

      return { name, symbol, decimals };
    } catch (error) {
      console.error("[ERC20Service]: Failed to get token metadata", error);
      return null;
    }
  }

  /**
   * Get token total supply
   */
  static async getTotalSupply(
    tokenAddress: string,
    chainId: ChainId,
  ): Promise<bigint | null> {
    try {
      const contract = EthersClient.getContract(
        tokenAddress,
        ["function totalSupply() view returns (uint256)"],
        undefined,
        chainId,
      );
      return await contract.totalSupply();
    } catch (error) {
      console.error("[ERC20Service]: Failed to get total supply", error);
      return null;
    }
  }

  // ===================
  // BALANCE OPERATIONS
  // ===================

  /**
   * Get token balance for an address
   */
  static async getBalance(
    tokenAddress: string,
    walletAddress: string,
    chainId: ChainId,
  ): Promise<bigint> {
    return EthersClient.getERC20Balance(tokenAddress, walletAddress, chainId);
  }

  /**
   * Get formatted token balance with decimals
   */
  static async getFormattedBalance(
    tokenAddress: string,
    walletAddress: string,
    decimals: number,
    chainId: ChainId,
  ): Promise<string> {
    const balance = await this.getBalance(tokenAddress, walletAddress, chainId);
    return EthersClient.formatUnits(balance, decimals);
  }

  // ===================
  // ALLOWANCE OPERATIONS
  // ===================

  /**
   * Get current allowance for a spender
   */
  static async getAllowance(
    tokenAddress: string,
    ownerAddress: string,
    spenderAddress: string,
    chainId: ChainId,
  ): Promise<bigint> {
    return EthersClient.getERC20Allowance(
      tokenAddress,
      ownerAddress,
      spenderAddress,
      chainId,
    );
  }

  /**
   * Check approval status for a token/spender pair
   * Returns detailed status including if approval is unlimited
   */
  static async checkApprovalStatus(
    tokenAddress: string,
    ownerAddress: string,
    spenderAddress: string,
    requiredAmount: bigint,
    decimals: number,
    chainId: ChainId,
  ): Promise<ApprovalStatus> {
    const allowance = await this.getAllowance(
      tokenAddress,
      ownerAddress,
      spenderAddress,
      chainId,
    );

    // Consider unlimited if allowance is greater than half of max uint256
    const unlimitedThreshold = MAX_UINT256 / 2n;
    const isUnlimited = allowance >= unlimitedThreshold;

    return {
      hasApproval: allowance >= requiredAmount,
      allowance,
      allowanceFormatted: EthersClient.formatUnits(allowance, decimals),
      isUnlimited,
    };
  }

  /**
   * Check if an amount needs approval before transfer
   */
  static async needsApproval(
    tokenAddress: string,
    ownerAddress: string,
    spenderAddress: string,
    amount: bigint,
    chainId: ChainId,
  ): Promise<boolean> {
    const allowance = await this.getAllowance(
      tokenAddress,
      ownerAddress,
      spenderAddress,
      chainId,
    );
    return allowance < amount;
  }

  // ===================
  // APPROVAL OPERATIONS
  // ===================

  /**
   * Approve a spender to use tokens
   * @param amount - Amount to approve (use APPROVAL_AMOUNTS.UNLIMITED for unlimited)
   */
  static async approve(
    ownerAddress: string,
    tokenAddress: string,
    spenderAddress: string,
    amount: bigint,
    chainId: ChainId,
  ): Promise<ApprovalResult> {
    const store = useWalletStore.getState();

    try {
      store.setLoading(true);

      // Get signer
      const signer = await WalletService.getSigner(ownerAddress, chainId);
      if (!signer) {
        throw new Error("Could not load wallet");
      }

      // Build approval data
      const data = EthersClient.buildERC20ApproveData(spenderAddress, amount);

      // Get gas price
      const gasParams = await EthersClient.getGasPrice(chainId);

      // Build transaction
      const tx = {
        from: ownerAddress,
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

      // Wait for confirmation
      const confirmed = await EthersClient.waitForTransaction(
        result.hash,
        1,
        chainId,
      );

      if (!confirmed) {
        throw new Error("Approval transaction was not confirmed");
      }

      return { success: true, hash: result.hash };
    } catch (error) {
      console.error("[ERC20Service]: Approval failed", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Approval failed",
      };
    } finally {
      store.setLoading(false);
    }
  }

  /**
   * Approve unlimited amount
   */
  static async approveUnlimited(
    ownerAddress: string,
    tokenAddress: string,
    spenderAddress: string,
    chainId: ChainId,
  ): Promise<ApprovalResult> {
    return this.approve(
      ownerAddress,
      tokenAddress,
      spenderAddress,
      APPROVAL_AMOUNTS.UNLIMITED,
      chainId,
    );
  }

  /**
   * Approve exact amount needed for a transfer
   */
  static async approveExact(
    ownerAddress: string,
    tokenAddress: string,
    spenderAddress: string,
    amount: string,
    decimals: number,
    chainId: ChainId,
  ): Promise<ApprovalResult> {
    const amountWei = EthersClient.parseUnits(amount, decimals);
    return this.approve(
      ownerAddress,
      tokenAddress,
      spenderAddress,
      amountWei,
      chainId,
    );
  }

  /**
   * Revoke approval (set to zero)
   */
  static async revokeApproval(
    ownerAddress: string,
    tokenAddress: string,
    spenderAddress: string,
    chainId: ChainId,
  ): Promise<ApprovalResult> {
    return this.approve(
      ownerAddress,
      tokenAddress,
      spenderAddress,
      APPROVAL_AMOUNTS.ZERO,
      chainId,
    );
  }

  // ===================
  // TRANSFER OPERATIONS
  // ===================

  /**
   * Transfer tokens directly (standard transfer)
   */
  static async transfer(
    fromAddress: string,
    toAddress: string,
    tokenAddress: string,
    amount: string,
    decimals: number,
    chainId: ChainId,
  ): Promise<{ hash: string } | { error: string }> {
    const store = useWalletStore.getState();

    try {
      store.setLoading(true);

      // Get signer
      const signer = await WalletService.getSigner(fromAddress, chainId);
      if (!signer) {
        throw new Error("Could not load wallet");
      }

      // Build transfer data
      const amountWei = EthersClient.parseUnits(amount, decimals);
      const data = EthersClient.buildERC20TransferData(toAddress, amountWei);

      // Get gas price
      const gasParams = await EthersClient.getGasPrice(chainId);

      // Build transaction
      const tx = {
        from: fromAddress,
        to: tokenAddress,
        data,
        value: 0n,
        ...gasParams,
      };

      // Estimate gas
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

      return { hash: result.hash };
    } catch (error) {
      console.error("[ERC20Service]: Transfer failed", error);
      return {
        error: error instanceof Error ? error.message : "Transfer failed",
      };
    } finally {
      store.setLoading(false);
    }
  }

  /**
   * Build transfer data without sending
   * Useful for transaction simulation/preview
   */
  static buildTransferData(
    toAddress: string,
    amount: string,
    decimals: number,
  ): string {
    const amountWei = EthersClient.parseUnits(amount, decimals);
    return EthersClient.buildERC20TransferData(toAddress, amountWei);
  }

  /**
   * Build approval data without sending
   * Useful for transaction simulation/preview
   */
  static buildApprovalData(spenderAddress: string, amount: bigint): string {
    return EthersClient.buildERC20ApproveData(spenderAddress, amount);
  }

  // ===================
  // GAS ESTIMATION
  // ===================

  /**
   * Estimate gas for approval transaction
   */
  static async estimateApprovalGas(
    ownerAddress: string,
    tokenAddress: string,
    spenderAddress: string,
    amount: bigint,
    chainId: ChainId,
  ): Promise<bigint | null> {
    const data = EthersClient.buildERC20ApproveData(spenderAddress, amount);
    const tx = {
      from: ownerAddress,
      to: tokenAddress,
      data,
      value: 0n,
    };
    return EthersClient.estimateGasWithPadding(tx, chainId);
  }

  /**
   * Estimate gas for transfer transaction
   */
  static async estimateTransferGas(
    fromAddress: string,
    toAddress: string,
    tokenAddress: string,
    amount: string,
    decimals: number,
    chainId: ChainId,
  ): Promise<bigint | null> {
    const amountWei = EthersClient.parseUnits(amount, decimals);
    const data = EthersClient.buildERC20TransferData(toAddress, amountWei);
    const tx = {
      from: fromAddress,
      to: tokenAddress,
      data,
      value: 0n,
    };
    return EthersClient.estimateGasWithPadding(tx, chainId);
  }

  // ===================
  // VALIDATION
  // ===================

  /**
   * Validate if an address is a valid ERC20 token contract
   * Checks if required ERC20 functions exist
   */
  static async isValidERC20(
    tokenAddress: string,
    chainId: ChainId,
  ): Promise<boolean> {
    try {
      // Check if address has code (is a contract)
      const provider = EthersClient.getProvider(chainId);
      const code = await provider.getCode(tokenAddress);
      if (!code || code === "0x") {
        return false;
      }

      // Try to call required ERC20 functions
      const [symbol, decimals] = await Promise.all([
        EthersClient.getERC20Symbol(tokenAddress, chainId),
        EthersClient.getERC20Decimals(tokenAddress, chainId),
      ]);

      return symbol !== null && decimals !== null;
    } catch (error) {
      console.warn("[ERC20Service]: Token validation failed", error);
      return false;
    }
  }

  /**
   * Check if transfer will succeed
   * Validates balance and optionally allowance
   */
  static async validateTransfer(
    tokenAddress: string,
    fromAddress: string,
    toAddress: string,
    amount: string,
    decimals: number,
    chainId: ChainId,
    spenderAddress?: string, // For transferFrom operations
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      // Validate addresses
      if (!EthersClient.isValidAddress(toAddress)) {
        return { valid: false, error: "Invalid recipient address" };
      }

      // Check balance
      const balance = await this.getBalance(tokenAddress, fromAddress, chainId);
      const amountWei = EthersClient.parseUnits(amount, decimals);

      if (balance < amountWei) {
        return { valid: false, error: "Insufficient token balance" };
      }

      // Check allowance if spender is provided (transferFrom case)
      if (spenderAddress) {
        const allowance = await this.getAllowance(
          tokenAddress,
          fromAddress,
          spenderAddress,
          chainId,
        );
        if (allowance < amountWei) {
          return { valid: false, error: "Insufficient allowance" };
        }
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : "Validation failed",
      };
    }
  }
}

export default ERC20Service;
