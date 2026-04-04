/**
 * PaymentTerminalService - Ethers.js based service for PaymentTerminalERC20 contract
 * Replaces all viem-based contract interactions with ethers.js
 * Uses EthersClient for provider management by ChainId
 */

import { ChainId, EthersClient } from "@/app/profiles/client";
import { globalContractABI } from "@/config/abi";
import { ERC20_STANDARD_ABI } from "@/config/erc20Abi";
import { SecureStorage } from "@/services/storage";
import { Contract, formatUnits, parseUnits, Wallet } from "ethers";

/** Null address for native token payments */
const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * Active transaction data from smart contract
 * Matches the return type of getActiveTransactionFields()
 */
export interface ActiveTransaction {
  id: bigint;
  amount: bigint;
  payer: string;
  paid: boolean;
  timestamp: bigint;
  description: string;
  cancelled: boolean;
  merchantName: string;
  merchantLocation: string;
  itemizedList: string;
  requestedTokenContract: string;
}

/**
 * Check if the requested token is the native token (null address)
 */
export function isNativeToken(tokenContract: string): boolean {
  return (
    !tokenContract || tokenContract === NULL_ADDRESS || tokenContract === "0x"
  );
}

/**
 * Service for interacting with PaymentTerminalERC20 smart contract
 * Uses ethers.js exclusively with EthersClient provider management
 */
export class PaymentTerminalService {
  private contractAddress: string;
  private chainId: ChainId;

  constructor(contractAddress: string, chainId: ChainId) {
    this.contractAddress = contractAddress;
    this.chainId = chainId;
  }

  /**
   * Get a read-only contract instance
   */
  private getReadOnlyContract(): Contract {
    const provider = EthersClient.getProvider(this.chainId);
    return new Contract(this.contractAddress, globalContractABI, provider);
  }

  /**
   * Get a writable contract instance with a wallet
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
   * Get wallet instance for direct transactions
   */
  private async getWallet(walletAddress: string): Promise<Wallet> {
    const privateKey = await SecureStorage.loadPrivateKey(walletAddress);
    if (!privateKey) {
      throw new Error("Private key not found");
    }
    return EthersClient.createWallet(privateKey, this.chainId);
  }

  /**
   * Get the current active transaction from contract
   */
  async getActiveTransaction(): Promise<ActiveTransaction | null> {
    try {
      const contract = this.getReadOnlyContract();
      const result = await contract.getActiveTransactionFields();

      // Result is a tuple: [id, amount, payer, paid, timestamp, description, cancelled, merchantName, merchantLocation, itemizedList, requestedTokenContract]
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
        timestamp,
        description,
        cancelled,
        merchantName,
        merchantLocation,
        itemizedList,
        requestedTokenContract,
      };
    } catch (err) {
      console.error(
        "[PaymentTerminalService] getActiveTransaction error:",
        err,
      );
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
      console.error("[PaymentTerminalService] isOwner error:", err);
      return false;
    }
  }

  /**
   * Pay the active transaction
   * Automatically handles native tokens vs ERC20 based on requestedTokenContract
   * Returns immediately after tx submission (does not wait for confirmation)
   */
  async payActiveTransaction(
    walletAddress: string,
    amount: bigint,
    requestedTokenContract: string,
  ): Promise<{ hash: string }> {
    try {
      const isNative = isNativeToken(requestedTokenContract);

      console.log("[PaymentTerminalService] Paying active transaction...");
      console.log("[PaymentTerminalService] Amount:", amount.toString());
      console.log(
        "[PaymentTerminalService] Token:",
        isNative ? "NATIVE" : requestedTokenContract,
      );

      if (isNative) {
        // Native token payment (XPL, CHZ, ETH, etc.)
        return await this.payWithNativeToken(walletAddress, amount);
      } else {
        // ERC20 token payment - need to approve then pay
        return await this.payWithERC20(
          walletAddress,
          amount,
          requestedTokenContract,
        );
      }
    } catch (err: any) {
      console.error(
        "[PaymentTerminalService] payActiveTransaction error:",
        err,
      );
      throw new Error(
        err?.shortMessage || err?.message || "Failed to pay transaction",
      );
    }
  }

  /**
   * Pay with native token (no approval needed)
   */
  private async payWithNativeToken(
    walletAddress: string,
    amount: bigint,
  ): Promise<{ hash: string }> {
    const contract = await this.getWritableContract(walletAddress);

    console.log("[PaymentTerminalService] Paying with native token...");

    // Call payActiveTransaction with value (native token)
    const tx = await contract.payActiveTransaction({ value: amount });
    console.log("[PaymentTerminalService] Transaction submitted:", tx.hash);

    // Don't wait for confirmation - let the UI handle watching
    return { hash: tx.hash };
  }

  /**
   * Pay with ERC20 token (requires approval first)
   */
  private async payWithERC20(
    walletAddress: string,
    amount: bigint,
    tokenContract: string,
  ): Promise<{ hash: string }> {
    const wallet = await this.getWallet(walletAddress);

    console.log(
      "[PaymentTerminalService] Paying with ERC20 token:",
      tokenContract,
    );

    // Create ERC20 contract instance
    const erc20 = new Contract(tokenContract, ERC20_STANDARD_ABI, wallet);

    // Check current allowance
    const currentAllowance = await erc20.allowance(
      walletAddress,
      this.contractAddress,
    );
    console.log(
      "[PaymentTerminalService] Current allowance:",
      currentAllowance.toString(),
    );

    // If allowance is insufficient, approve first
    if (currentAllowance < amount) {
      console.log("[PaymentTerminalService] Approving token spend...");
      const approveTx = await erc20.approve(this.contractAddress, amount);
      console.log("[PaymentTerminalService] Approval tx:", approveTx.hash);

      // Wait for approval to be confirmed before paying
      await approveTx.wait();
      console.log("[PaymentTerminalService] Approval confirmed");
    }

    // Now pay (no msg.value for ERC20)
    const contract = await this.getWritableContract(walletAddress);
    const tx = await contract.payActiveTransaction();
    console.log("[PaymentTerminalService] Payment tx submitted:", tx.hash);

    // Don't wait for confirmation - let the UI handle watching
    return { hash: tx.hash };
  }

  /**
   * Check ERC20 token balance
   */
  async getERC20Balance(
    walletAddress: string,
    tokenContract: string,
  ): Promise<bigint> {
    const provider = EthersClient.getProvider(this.chainId);
    const erc20 = new Contract(tokenContract, ERC20_STANDARD_ABI, provider);
    return await erc20.balanceOf(walletAddress);
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
      const amountWei = parseUnits(amount, decimals);

      console.log("[PaymentTerminalService] Creating payment request:", {
        amount,
        amountWei: amountWei.toString(),
        description,
        merchantName,
        merchantLocation,
        tokenContractAddress,
      });

      const tx = await contract.setActiveTransaction(
        amountWei,
        description,
        merchantName,
        merchantLocation,
        itemizedListJson,
        tokenContractAddress,
      );

      console.log("[PaymentTerminalService] Transaction submitted:", tx.hash);

      const receipt = await tx.wait();

      if (receipt.status === 0) {
        throw new Error("Transaction reverted");
      }

      console.log(
        "[PaymentTerminalService] Transaction confirmed:",
        receipt.hash,
      );
      return { hash: tx.hash };
    } catch (err: any) {
      console.error(
        "[PaymentTerminalService] createPaymentRequest error:",
        err,
      );
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

      console.log("[PaymentTerminalService] Cancelling payment request...");

      const tx = await contract.cancelActiveTransaction();
      console.log(
        "[PaymentTerminalService] Cancel transaction submitted:",
        tx.hash,
      );

      const receipt = await tx.wait();

      if (receipt.status === 0) {
        throw new Error("Cancel transaction reverted");
      }

      console.log("[PaymentTerminalService] Cancel confirmed:", receipt.hash);
      return { hash: tx.hash };
    } catch (err: any) {
      console.error(
        "[PaymentTerminalService] cancelPaymentRequest error:",
        err,
      );
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

      console.log("[PaymentTerminalService] Clearing active transaction...");

      const tx = await contract.clearActiveTransaction();

      const receipt = await tx.wait();

      if (receipt.status === 0) {
        throw new Error("Clear transaction reverted");
      }

      return { hash: tx.hash };
    } catch (err: any) {
      console.error(
        "[PaymentTerminalService] clearActiveTransaction error:",
        err,
      );
      throw new Error(
        err?.shortMessage || err?.message || "Failed to clear transaction",
      );
    }
  }

  /**
   * Get payment status
   */
  async getPaymentStatus(): Promise<{
    paid: boolean;
    payer: string;
    cancelled: boolean;
    requestedTokenContract: string;
  }> {
    try {
      const contract = this.getReadOnlyContract();
      const [paid, payer, cancelled, requestedTokenContract] =
        await contract.getPaymentStatus();
      return { paid, payer, cancelled, requestedTokenContract };
    } catch (err) {
      console.error("[PaymentTerminalService] getPaymentStatus error:", err);
      throw err;
    }
  }

  /**
   * Get contract balance
   */
  async getContractBalance(
    tokenContractAddress: string = "0x0000000000000000000000000000000000000000",
  ): Promise<bigint> {
    try {
      const contract = this.getReadOnlyContract();
      return await contract.getContractBalance(tokenContractAddress);
    } catch (err) {
      console.error("[PaymentTerminalService] getContractBalance error:", err);
      throw err;
    }
  }

  /**
   * Withdraw funds from contract
   */
  async withdraw(
    walletAddress: string,
    toAddress: string,
    tokenContractAddress: string = "0x0000000000000000000000000000000000000000",
  ): Promise<{ hash: string }> {
    try {
      const contract = await this.getWritableContract(walletAddress);

      console.log("[PaymentTerminalService] Withdrawing funds...");

      const tx = await contract.withdraw(toAddress, tokenContractAddress);

      const receipt = await tx.wait();

      if (receipt.status === 0) {
        throw new Error("Withdraw transaction reverted");
      }

      return { hash: tx.hash };
    } catch (err: any) {
      console.error("[PaymentTerminalService] withdraw error:", err);
      throw new Error(
        err?.shortMessage || err?.message || "Failed to withdraw",
      );
    }
  }

  /**
   * Format amount from wei to display value
   */
  static formatAmount(amountWei: bigint, decimals: number = 18): string {
    return formatUnits(amountWei, decimals);
  }

  /**
   * Get native token balance for an address
   */
  async getNativeBalance(address: string): Promise<bigint> {
    const provider = EthersClient.getProvider(this.chainId);
    return await provider.getBalance(address);
  }
}
