/**
 * PaymentRequestService - Ethers.js based service for Payment Terminal contract
 * Uses EthersClient for provider management by ChainId
 */

import { ChainId, EthersClient } from "@/app/profiles/client";
import { globalContractABI } from "@/config/abi";
import { SecureStorage } from "@/services/storage";
import { Contract, formatUnits, parseUnits } from "ethers";

/**
 * Active transaction data from smart contract
 */
export interface ContractTransaction {
  id: bigint;
  amount: bigint;
  payer: string;
  paid: boolean;
  description: string;
  merchantName: string;
  cancelled: boolean;
  merchantLocation: string;
  itemizedList: string;
  timestamp: bigint;
  requestedTokenContract: string;
}

/**
 * Service for interacting with Payment Terminal smart contract
 * Refactored to use ethers.js instead of viem
 */
export class PaymentRequestService {
  private contractAddress: string;
  private chainId: ChainId;

  constructor(contractAddress: string, chainId: ChainId) {
    this.contractAddress = contractAddress;
    this.chainId = chainId;

    // Validate that we have a config for this chain
    const networkConfig = EthersClient.getNetworkConfig(chainId);
    if (!networkConfig?.rpcUrl) {
      throw new Error(`No RPC URL for chain ${chainId}`);
    }
  }

  /**
   * Get a read-only contract instance using ethers provider
   */
  private getReadOnlyContract(): Contract {
    const provider = EthersClient.getProvider(this.chainId);
    return new Contract(this.contractAddress, globalContractABI, provider);
  }

  /**
   * Get a writable contract instance with wallet signer
   */
  private async getWritableContract(walletAddress: string): Promise<Contract> {
    const privateKey = await SecureStorage.loadPrivateKey(walletAddress);
    if (!privateKey) {
      throw new Error("Private key not found");
    }

    const wallet = EthersClient.createWallet(privateKey, this.chainId);
    return new Contract(this.contractAddress, globalContractABI, wallet);
  }

  /**
   * Get the current active transaction from contract
   */
  async getActiveTransaction(): Promise<ContractTransaction | null> {
    try {
      const contract = this.getReadOnlyContract();
      const result = await contract.getActiveTransactionFields();

      // Result is a tuple from ethers
      const [
        id,
        amount,
        payer,
        paid,
        timestamp,
        description,
        cancelled,
        merchantName,
        merchantLocation,
        itemizedList,
        requestedTokenContract,
      ] = result;

      // No active transaction if id is 0
      if (id === 0n) {
        return null;
      }

      return {
        id,
        amount,
        payer,
        paid,
        description,
        merchantName,
        cancelled,
        merchantLocation,
        itemizedList,
        timestamp,
        requestedTokenContract,
      };
    } catch (err) {
      console.error("[PaymentRequestService] getActiveTransaction error:", err);
      throw err;
    }
  }

  /**
   * Check if we are the owner of the contract
   */
  async isOwner(walletAddress: string): Promise<boolean> {
    try {
      const contract = this.getReadOnlyContract();
      const owner = await contract.owner();
      return owner.toLowerCase() === walletAddress.toLowerCase();
    } catch (err) {
      console.error("[PaymentRequestService] isOwner error:", err);
      return false;
    }
  }

  /**
   * Create a new payment request (setActiveTransaction)
   */
  async createPaymentRequest(
    walletAddress: string,
    amount: string,
    decimals: number,
    description: string,
    merchantName: string,
    merchantLocation: string,
    itemizedListJson: string,
    tokenContractAddress: string,
  ): Promise<{ hash: string }> {
    try {
      const contract = await this.getWritableContract(walletAddress);

      // Parse amount to wei
      const amountWei = parseUnits(amount, decimals);

      console.log("[PaymentRequestService] Creating payment request:", {
        amount,
        amountWei: amountWei.toString(),
        description,
        merchantName,
        merchantLocation,
        tokenContractAddress,
      });

      // Execute the transaction
      const tx = await contract.setActiveTransaction(
        amountWei,
        description,
        merchantName,
        merchantLocation,
        itemizedListJson,
        tokenContractAddress,
      );

      console.log("[PaymentRequestService] Transaction submitted:", tx.hash);

      // Wait for confirmation
      const receipt = await tx.wait();

      if (receipt.status === 0) {
        throw new Error("Transaction reverted");
      }

      console.log(
        "[PaymentRequestService] Transaction confirmed:",
        receipt.hash,
      );

      return { hash: tx.hash };
    } catch (err: any) {
      console.error("[PaymentRequestService] createPaymentRequest error:", err);
      throw new Error(
        err?.shortMessage || err?.message || "Failed to create payment request",
      );
    }
  }

  /**
   * Cancel the active payment request
   */
  async cancelPaymentRequest(walletAddress: string): Promise<{ hash: string }> {
    try {
      const contract = await this.getWritableContract(walletAddress);

      console.log("[PaymentRequestService] Cancelling payment request...");

      const tx = await contract.cancelActiveTransaction();

      console.log(
        "[PaymentRequestService] Cancel transaction submitted:",
        tx.hash,
      );

      // Wait for confirmation
      const receipt = await tx.wait();

      if (receipt.status === 0) {
        throw new Error("Cancel transaction reverted");
      }

      console.log("[PaymentRequestService] Cancel confirmed:", receipt.hash);

      return { hash: tx.hash };
    } catch (err: any) {
      console.error("[PaymentRequestService] cancelPaymentRequest error:", err);
      throw new Error(
        err?.shortMessage || err?.message || "Failed to cancel payment request",
      );
    }
  }

  /**
   * Clear the active transaction (after it's been paid/cancelled)
   */
  async clearActiveTransaction(
    walletAddress: string,
  ): Promise<{ hash: string }> {
    try {
      const contract = await this.getWritableContract(walletAddress);

      console.log("[PaymentRequestService] Clearing active transaction...");

      const tx = await contract.clearActiveTransaction();

      const receipt = await tx.wait();

      if (receipt.status === 0) {
        throw new Error("Clear transaction reverted");
      }

      return { hash: tx.hash };
    } catch (err: any) {
      console.error(
        "[PaymentRequestService] clearActiveTransaction error:",
        err,
      );
      throw new Error(
        err?.shortMessage || err?.message || "Failed to clear transaction",
      );
    }
  }

  /**
   * Format amount from wei to display value
   */
  static formatAmount(amountWei: bigint, decimals: number = 18): string {
    return formatUnits(amountWei, decimals);
  }
}
